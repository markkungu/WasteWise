"""
comparison.py
-------------
Runs PSO and QAOA on the same Nairobi waste-collection graph and produces
side-by-side metrics and publication-quality comparison charts.

Usage (standalone):
    python comparison.py

This generates:
  - output/comparison_results.png  – 2 × 2 chart grid
  - Console table with all metrics
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field

import matplotlib
matplotlib.use("Agg")          # non-interactive backend for headless servers
import matplotlib.pyplot as plt
import networkx as nx

from graph_builder import build_nairobi_graph, get_distance_matrix, NEIGHBORHOODS
from pso_solver import RoutePSO
from qaoa_solver import get_solver, solve_exact_tsp


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

@dataclass
class ComparisonResult:
    # PSO
    pso_route: list[int] = field(default_factory=list)
    pso_distance: float = 0.0
    pso_runtime_s: float = 0.0
    pso_convergence: list[float] = field(default_factory=list)
    pso_iterations: int = 0

    # QAOA
    qaoa_route: list[int] = field(default_factory=list)
    qaoa_distance: float = 0.0
    qaoa_runtime_s: float = 0.0
    qaoa_reps: int = 2

    # Exact / optimal
    exact_route: list[int] = field(default_factory=list)
    exact_distance: float = 0.0

    # Derived
    @property
    def pso_quality_pct(self) -> float:
        """How close PSO is to optimal (100 % = optimal)."""
        if self.exact_distance == 0:
            return 0.0
        return (self.exact_distance / self.pso_distance) * 100.0

    @property
    def qaoa_quality_pct(self) -> float:
        """How close QAOA is to optimal (100 % = optimal)."""
        if self.exact_distance == 0:
            return 0.0
        return (self.exact_distance / self.qaoa_distance) * 100.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_route(route: list[int], neighborhoods: list[str]) -> str:
    """Return a human-readable arrow-separated route string."""
    return " → ".join(neighborhoods[i] for i in route)


# ---------------------------------------------------------------------------
# Core comparison runner
# ---------------------------------------------------------------------------

def run_comparison(graph: nx.Graph) -> ComparisonResult:
    """
    Run PSO, QAOA, and exact TSP on *graph* and return a ComparisonResult.

    Parameters
    ----------
    graph : nx.Graph
        Weighted Nairobi neighbourhood graph from graph_builder.

    Returns
    -------
    ComparisonResult with all timing, distance, and route fields filled.
    """
    result = ComparisonResult()
    dist_matrix = get_distance_matrix(graph)

    # ---- 1. Exact brute-force TSP (ground truth) -------------------------
    print("  [1/3] Running exact brute-force TSP …", flush=True)
    t0 = time.time()
    result.exact_route, result.exact_distance = solve_exact_tsp(dist_matrix)
    print(f"        Optimal distance : {result.exact_distance:.2f} km  "
          f"({time.time() - t0:.2f} s)")

    # ---- 2. PSO ----------------------------------------------------------
    print("  [2/3] Running PSO (n_particles=40, max_iter=100) …", flush=True)
    pso = RoutePSO(dist_matrix, n_particles=40, max_iterations=100, seed=42)
    t0 = time.time()
    result.pso_route, result.pso_distance, result.pso_convergence = pso.run()
    result.pso_runtime_s = time.time() - t0
    result.pso_iterations = len(result.pso_convergence)
    print(f"        PSO distance     : {result.pso_distance:.2f} km  "
          f"({result.pso_runtime_s:.2f} s)")

    # ---- 3. QAOA ---------------------------------------------------------
    print("  [3/3] Running QAOA (reps=2) …", flush=True)
    solver = get_solver(graph, reps=2)
    qaoa_out = solver.solve()
    result.qaoa_route = qaoa_out["qaoa_route"]
    result.qaoa_distance = qaoa_out["qaoa_distance"]
    result.qaoa_runtime_s = qaoa_out["qaoa_runtime_s"]
    result.qaoa_reps = qaoa_out["reps"]
    print(f"        QAOA distance    : {result.qaoa_distance:.2f} km  "
          f"({result.qaoa_runtime_s:.2f} s)")

    return result


# ---------------------------------------------------------------------------
# Chart generation
# ---------------------------------------------------------------------------

def generate_comparison_charts(
    result: ComparisonResult,
    _neighborhoods: list[str],
    output_dir: str = "output",
) -> str:
    """
    Save a 2×2 matplotlib figure to output_dir/comparison_results.png.

    Layout
    ------
    Top-left    : Bar chart — best distances (PSO, QAOA, Optimal)
    Top-right   : PSO convergence curve
    Bottom-left : Runtime comparison (PSO vs QAOA)
    Bottom-right: Solution quality % of optimal
    """
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "comparison_results.png")

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(
        "WasteWise – PSO vs QAOA Route Optimisation\nNairobi Waste Collection",
        fontsize=14,
        fontweight="bold",
        y=1.01,
    )

    # Color palette
    PSO_COLOR  = "#2196F3"   # blue
    QAOA_COLOR = "#9C27B0"   # purple
    OPT_COLOR  = "#4CAF50"   # green

    # ---- Top-left: Distance comparison -----------------------------------
    ax = axes[0, 0]
    bars = ax.bar(
        ["PSO\n(Classical)", "QAOA\n(Quantum)", "Optimal\n(Exact)"],
        [result.pso_distance, result.qaoa_distance, result.exact_distance],
        color=[PSO_COLOR, QAOA_COLOR, OPT_COLOR],
        edgecolor="white",
        linewidth=1.2,
        width=0.5,
    )
    for bar, val in zip(bars, [result.pso_distance, result.qaoa_distance, result.exact_distance]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.5,
            f"{val:.1f} km",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )
    ax.set_title("Best Route Distance (km)", fontweight="bold")
    ax.set_ylabel("Total distance (km)")
    ax.set_ylim(0, max(result.pso_distance, result.qaoa_distance, result.exact_distance) * 1.2)
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # ---- Top-right: PSO convergence --------------------------------------
    ax = axes[0, 1]
    iterations = list(range(len(result.pso_convergence)))
    ax.plot(
        iterations,
        result.pso_convergence,
        color=PSO_COLOR,
        linewidth=2,
        label="PSO global best",
    )
    ax.axhline(
        result.exact_distance,
        color=OPT_COLOR,
        linestyle="--",
        linewidth=1.5,
        label=f"Optimal ({result.exact_distance:.1f} km)",
    )
    ax.set_title("PSO Convergence Curve", fontweight="bold")
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Best route distance (km)")
    ax.legend(fontsize=9)
    ax.grid(alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # ---- Bottom-left: Runtime comparison ---------------------------------
    ax = axes[1, 0]
    bars = ax.bar(
        ["PSO\n(Classical)", "QAOA\n(Quantum)"],
        [result.pso_runtime_s, result.qaoa_runtime_s],
        color=[PSO_COLOR, QAOA_COLOR],
        edgecolor="white",
        linewidth=1.2,
        width=0.4,
    )
    for bar, val in zip(bars, [result.pso_runtime_s, result.qaoa_runtime_s]):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.01,
            f"{val:.2f} s",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )
    ax.set_title("Runtime Comparison (seconds)", fontweight="bold")
    ax.set_ylabel("Wall-clock time (s)")
    ax.set_ylim(0, max(result.pso_runtime_s, result.qaoa_runtime_s) * 1.3)
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    note = (
        "* QAOA runs on a classical simulator.\n"
        "  Quantum advantage expected at 50+ nodes\n"
        "  on real quantum hardware."
    )
    ax.text(
        0.98, 0.97, note,
        transform=ax.transAxes,
        fontsize=7,
        color="gray",
        va="top",
        ha="right",
        style="italic",
    )

    # ---- Bottom-right: Solution quality % of optimal ---------------------
    ax = axes[1, 1]
    qualities = [result.pso_quality_pct, result.qaoa_quality_pct]
    bars = ax.bar(
        ["PSO\n(Classical)", "QAOA\n(Quantum)"],
        qualities,
        color=[PSO_COLOR, QAOA_COLOR],
        edgecolor="white",
        linewidth=1.2,
        width=0.4,
    )
    for bar, val in zip(bars, qualities):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.3,
            f"{val:.1f}%",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )
    ax.axhline(100, color=OPT_COLOR, linestyle="--", linewidth=1.5, label="Optimal (100%)")
    ax.set_title("Solution Quality (% of Optimal)", fontweight="bold")
    ax.set_ylabel("Quality (%)")
    ax.set_ylim(0, 115)
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Chart saved → {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Console table
# ---------------------------------------------------------------------------

def print_comparison_table(result: ComparisonResult) -> None:
    """Print a Unicode box-drawing comparison table to stdout."""
    pso_dist  = f"{result.pso_distance:.1f}"
    qaoa_dist = f"{result.qaoa_distance:.1f}"
    pso_rt    = f"{result.pso_runtime_s:.2f}"
    qaoa_rt   = f"{result.qaoa_runtime_s:.2f}"
    pso_q     = f"{result.pso_quality_pct:.1f}%"
    qaoa_q    = f"{result.qaoa_quality_pct:.1f}%"
    pso_iter  = str(result.pso_iterations)

    print()
    print("┌─────────────────────────────────┬─────────────────┬────────────────┐")
    print("│ Metric                          │ PSO (Classical) │ QAOA (Quantum) │")
    print("├─────────────────────────────────┼─────────────────┼────────────────┤")
    print(f"│ Best route distance (km)        │ {pso_dist:<15} │ {qaoa_dist:<14} │")
    print(f"│ Runtime (seconds)               │ {pso_rt:<15} │ {qaoa_rt:<14} │")
    print(f"│ Solution quality (% of optimal) │ {pso_q:<15} │ {qaoa_q:<14} │")
    print(f"│ Convergence iterations          │ {pso_iter:<15} │ {'N/A':<14} │")
    print("└─────────────────────────────────┴─────────────────┴────────────────┘")
    print()
    print(f"  Optimal (exact brute-force) : {result.exact_distance:.1f} km")
    print(f"  PSO  route : {format_route(result.pso_route,  NEIGHBORHOODS)}")
    print(f"  QAOA route : {format_route(result.qaoa_route, NEIGHBORHOODS)}")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  WasteWise – Route Optimisation Comparison")
    print("  PSO (Classical)  vs  QAOA (Quantum)")
    print("=" * 60)
    print()

    print("Building Nairobi neighbourhood graph …")
    G = build_nairobi_graph()
    print(f"  {G.number_of_nodes()} nodes, {G.number_of_edges()} edges\n")

    print("Running solvers …")
    result = run_comparison(G)

    print_comparison_table(result)

    print("Generating comparison charts …")
    generate_comparison_charts(result, NEIGHBORHOODS, output_dir="output")

    print()
    print("Done.  Check output/comparison_results.png for charts.")
