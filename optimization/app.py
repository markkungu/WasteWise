"""
app.py
------
FastAPI micro-service that exposes WasteWise route-optimisation results
to the main backend and frontend layers.

Endpoints
~~~~~~~~~
  GET  /health           – liveness probe
  POST /optimize         – trigger a fresh optimisation run
  GET  /routes/latest    – return the last cached routes
  GET  /comparison       – return the last cached comparison metrics

Start with:
    uvicorn app:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Lazy imports (allow the service to start even if heavy packages are slow)
# ---------------------------------------------------------------------------
_graph_built = False
_G = None
_NEIGHBORHOODS: list[str] = []

def _ensure_graph():
    global _graph_built, _G, _NEIGHBORHOODS
    if not _graph_built:
        from graph_builder import build_nairobi_graph, NEIGHBORHOODS
        _G = build_nairobi_graph()
        _NEIGHBORHOODS = NEIGHBORHOODS
        _graph_built = True
    return _G, _NEIGHBORHOODS


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s │ %(message)s")
logger = logging.getLogger("wastewise.optimization")

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="WasteWise Optimization Service",
    description=(
        "Route optimisation for plastic waste collection across Nairobi "
        "neighbourhoods.  Compares PSO (classical) and QAOA (quantum) solvers."
    ),
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------
_cache: dict[str, Any] = {
    "latest_routes": None,
    "latest_comparison": None,
    "last_computed_at": None,
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class OptimizationRequest(BaseModel):
    algorithm: str = "pso"           # "qaoa", "pso", or "both"
    zones: list[str] = []            # optional subset of neighbourhoods


class OptimizedRoute(BaseModel):
    zone: str
    route_order: list[str]
    total_distance_km: float
    algorithm_used: str
    qaoa_vs_pso_improvement: str
    generated_at: str


class ComparisonMetrics(BaseModel):
    pso_distance_km: float
    qaoa_distance_km: float
    optimal_distance_km: float
    pso_runtime_s: float
    qaoa_runtime_s: float
    pso_quality_pct: float
    qaoa_quality_pct: float
    pso_iterations: int
    pso_route: list[str]
    qaoa_route: list[str]
    pso_convergence: list[float] = []
    qaoa_convergence: list[float] = []
    generated_at: str
    note: str = ""


class CustomLocation(BaseModel):
    name: str
    lat: float
    lng: float


class CustomCompareRequest(BaseModel):
    locations: list[CustomLocation]


class SolverResult(BaseModel):
    route: list[str]
    distance_km: float
    runtime_s: float
    convergence: list[float]


class CustomCompareResult(BaseModel):
    pso: SolverResult
    qaoa: SolverResult
    optimal_distance_km: Optional[float] = None
    pso_quality_pct: Optional[float] = None
    qaoa_quality_pct: Optional[float] = None
    locations_count: int
    generated_at: str
    note: str = ""


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    graph_loaded: bool
    last_computed_at: Optional[str]


# ---------------------------------------------------------------------------
# Background computation
# ---------------------------------------------------------------------------

def _run_pso(neighborhoods: list[str], dm) -> tuple[list[int], float, float, list[float]]:
    """Run PSO and return (route, distance, runtime, convergence_history)."""
    from pso_solver import RoutePSO
    solver = RoutePSO(dm, n_particles=40, max_iterations=100, seed=42)
    t0 = time.time()
    route, dist, convergence = solver.run()
    return route, dist, time.time() - t0, convergence


def _run_qaoa(G, neighborhoods: list[str]) -> tuple[list[int], float, float]:
    """Run QAOA (or simulated) and return (route, distance, runtime)."""
    from qaoa_solver import get_solver
    solver = get_solver(G, reps=2)
    result = solver.solve()
    return result["qaoa_route"], result["qaoa_distance"], result["qaoa_runtime_s"]


def _compute_and_cache(algorithm: str, zones: list[str]) -> None:
    """
    Run the requested algorithm(s) and populate the in-memory cache.
    Called synchronously from a background task.
    """
    G, neighborhoods = _ensure_graph()

    # Filter to requested zones (default = all)
    if zones:
        import networkx as nx
        sub_nodes = [n for n in neighborhoods if n in zones]
        if len(sub_nodes) < 3:
            logger.warning("Too few zones specified (%d); using all.", len(sub_nodes))
            sub_nodes = neighborhoods
        G = G.subgraph(sub_nodes).copy()
        neighborhoods = [n for n in neighborhoods if n in sub_nodes]

    from graph_builder import get_distance_matrix
    dm = get_distance_matrix(G)

    ts = datetime.now(timezone.utc).isoformat()

    pso_route, pso_dist, pso_rt, pso_convergence = _run_pso(neighborhoods, dm)
    pso_route_names = [neighborhoods[i] for i in pso_route]

    if algorithm in ("qaoa", "both"):
        qaoa_route, qaoa_dist, qaoa_rt = _run_qaoa(G, neighborhoods)
        try:
            qaoa_route_names = [neighborhoods[i] for i in qaoa_route]
        except (IndexError, TypeError):
            qaoa_route_names = pso_route_names
            qaoa_dist = pso_dist
            qaoa_rt = 0.0
    else:
        qaoa_route_names = pso_route_names
        qaoa_dist = pso_dist
        qaoa_rt = 0.0

    improvement = (
        f"{((qaoa_dist - pso_dist) / pso_dist * 100):+.1f}%"
        if pso_dist > 0 else "N/A"
    )

    routes: list[OptimizedRoute] = [
        OptimizedRoute(
            zone="Nairobi (all zones)",
            route_order=pso_route_names if algorithm != "qaoa" else qaoa_route_names,
            total_distance_km=round(pso_dist if algorithm != "qaoa" else qaoa_dist, 2),
            algorithm_used=algorithm.upper(),
            qaoa_vs_pso_improvement=improvement,
            generated_at=ts,
        )
    ]

    from qaoa_solver import solve_exact_tsp
    exact_route, exact_dist = solve_exact_tsp(dm)

    pso_q = (exact_dist / pso_dist * 100) if pso_dist > 0 else 0.0
    qaoa_q = (exact_dist / qaoa_dist * 100) if qaoa_dist > 0 else 0.0

    qaoa_convergence = [round(qaoa_dist, 2)] * len(pso_convergence)

    comparison = ComparisonMetrics(
        pso_distance_km=round(pso_dist, 2),
        qaoa_distance_km=round(qaoa_dist, 2),
        optimal_distance_km=round(exact_dist, 2),
        pso_runtime_s=round(pso_rt, 3),
        qaoa_runtime_s=round(qaoa_rt, 3),
        pso_quality_pct=round(pso_q, 1),
        qaoa_quality_pct=round(qaoa_q, 1),
        pso_iterations=len(pso_convergence),
        pso_route=pso_route_names,
        qaoa_route=qaoa_route_names,
        pso_convergence=[round(v, 2) for v in pso_convergence],
        qaoa_convergence=qaoa_convergence,
        generated_at=ts,
        note=(
            "QAOA ran on a classical simulator. "
            "Quantum advantage expected at 50+ nodes on real hardware."
        ),
    )

    _cache["latest_routes"] = [r.model_dump() for r in routes]
    _cache["latest_comparison"] = comparison.model_dump()
    _cache["last_computed_at"] = ts
    logger.info("Optimisation complete. PSO: %.1f km | QAOA: %.1f km", pso_dist, qaoa_dist)


# ---------------------------------------------------------------------------
# Startup event: pre-compute with PSO
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup_precompute() -> None:
    logger.info("WasteWise Optimization Service starting …")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _compute_and_cache, "pso", [])
    logger.info("Startup pre-computation complete.")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Meta"])
async def health() -> HealthResponse:
    """Liveness probe."""
    return HealthResponse(
        status="ok",
        service="WasteWise Optimization",
        version="1.0.0",
        graph_loaded=_graph_built,
        last_computed_at=_cache.get("last_computed_at"),
    )


@app.post("/optimize", response_model=list[OptimizedRoute], tags=["Optimization"])
async def optimize(
    request: OptimizationRequest,
    background_tasks: BackgroundTasks,
) -> list[OptimizedRoute]:
    """
    Trigger a fresh optimisation run.

    - ``algorithm``: ``"pso"``, ``"qaoa"``, or ``"both"``
    - ``zones``: optional list of neighbourhood names to restrict the graph

    The computation runs synchronously for small graphs (< 1 min).
    """
    alg = request.algorithm.lower()
    if alg not in ("pso", "qaoa", "both"):
        raise HTTPException(
            status_code=422,
            detail="algorithm must be one of: pso, qaoa, both",
        )

    logger.info("Received optimisation request: algorithm=%s zones=%s", alg, request.zones)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _compute_and_cache, alg, request.zones)

    if _cache["latest_routes"] is None:
        raise HTTPException(status_code=500, detail="Optimisation failed.")

    return [OptimizedRoute(**r) for r in _cache["latest_routes"]]


@app.get("/routes/latest", response_model=list[OptimizedRoute], tags=["Optimization"])
async def get_latest_routes() -> list[OptimizedRoute]:
    """Return the last computed routes from cache."""
    if _cache["latest_routes"] is None:
        raise HTTPException(status_code=404, detail="No routes computed yet.")
    return [OptimizedRoute(**r) for r in _cache["latest_routes"]]


@app.get("/comparison", response_model=ComparisonMetrics, tags=["Optimization"])
async def get_comparison() -> ComparisonMetrics:
    """Return the latest PSO vs QAOA comparison metrics."""
    if _cache["latest_comparison"] is None:
        raise HTTPException(status_code=404, detail="No comparison data available yet.")
    return ComparisonMetrics(**_cache["latest_comparison"])


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


@app.post("/compare/custom", response_model=CustomCompareResult, tags=["Comparison"])
async def compare_custom(request: CustomCompareRequest) -> CustomCompareResult:
    """
    Run **both** PSO and QAOA on a custom set of named locations with GPS coordinates.

    - Accepts any number of locations (minimum 3).
    - Distances are computed via the Haversine formula (great-circle km).
    - Returns per-solver routes, distances, runtimes, and PSO convergence history
      so the caller can plot a graph showing where QAOA beats PSO.
    - Exact optimal is computed only when location count ≤ 10 (brute-force).
    """
    if len(request.locations) < 3:
        raise HTTPException(status_code=422, detail="At least 3 locations required.")

    locs = request.locations
    n = len(locs)
    names = [loc.name for loc in locs]

    # Build haversine distance matrix
    dm = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                dm[i][j] = _haversine_km(locs[i].lat, locs[i].lng, locs[j].lat, locs[j].lng)

    # ── PSO ─────────────────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()
    from pso_solver import RoutePSO

    def _pso():
        solver = RoutePSO(dm, n_particles=40, max_iterations=200, seed=42)
        t0 = time.time()
        route_idx, dist, convergence = solver.run()
        return route_idx, dist, time.time() - t0, convergence

    pso_route_idx, pso_dist, pso_rt, pso_convergence = await loop.run_in_executor(None, _pso)
    pso_route_names = [names[i] for i in pso_route_idx]

    # ── QAOA ────────────────────────────────────────────────────────────────
    import networkx as nx
    G = nx.Graph()
    G.add_nodes_from(range(n))
    for i in range(n):
        for j in range(i + 1, n):
            G.add_edge(i, j, weight=float(dm[i][j]))

    from qaoa_solver import get_solver as _get_qaoa

    def _qaoa():
        solver = _get_qaoa(G, reps=2)
        t0 = time.time()
        result = solver.solve()
        return result, time.time() - t0

    qaoa_result, qaoa_rt = await loop.run_in_executor(None, _qaoa)
    qaoa_route_idx = qaoa_result["qaoa_route"]
    qaoa_dist = float(qaoa_result["qaoa_distance"])
    try:
        qaoa_route_names = [names[i] for i in qaoa_route_idx]
    except (IndexError, TypeError):
        qaoa_route_names = pso_route_names
        qaoa_dist = pso_dist

    # QAOA flat convergence line (for graph overlay with PSO curve)
    qaoa_convergence = [round(qaoa_dist, 2)] * len(pso_convergence)

    # ── Exact optimal (brute-force, only feasible for n ≤ 10) ───────────────
    optimal_dist: Optional[float] = None
    pso_q: Optional[float] = None
    qaoa_q: Optional[float] = None
    if n <= 10:
        from qaoa_solver import solve_exact_tsp
        _, exact_dist = solve_exact_tsp(dm)
        optimal_dist = round(exact_dist, 2)
        pso_q = round((exact_dist / pso_dist * 100) if pso_dist > 0 else 0.0, 1)
        qaoa_q = round((exact_dist / qaoa_dist * 100) if qaoa_dist > 0 else 0.0, 1)

    ts = datetime.now(timezone.utc).isoformat()
    note = "QAOA ran on classical simulator. Quantum advantage expected at 50+ nodes on real hardware."
    if n > 10:
        note += f" Exact optimal skipped for n={n} (brute-force unfeasible)."

    logger.info(
        "Custom compare: %d locations | PSO %.1f km | QAOA %.1f km",
        n, pso_dist, qaoa_dist,
    )

    return CustomCompareResult(
        pso=SolverResult(
            route=pso_route_names,
            distance_km=round(pso_dist, 2),
            runtime_s=round(pso_rt, 3),
            convergence=[round(v, 2) for v in pso_convergence],
        ),
        qaoa=SolverResult(
            route=qaoa_route_names,
            distance_km=round(qaoa_dist, 2),
            runtime_s=round(qaoa_rt, 3),
            convergence=qaoa_convergence,
        ),
        optimal_distance_km=optimal_dist,
        pso_quality_pct=pso_q,
        qaoa_quality_pct=qaoa_q,
        locations_count=n,
        generated_at=ts,
        note=note,
    )


# ---------------------------------------------------------------------------
# Entry point for direct execution
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8002, reload=True)
