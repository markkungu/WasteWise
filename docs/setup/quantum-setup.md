# Quantum Optimization Service — Setup

**Role owner:** Allan Mutai
**Module location:** `optimization/`
**Port:** 8002

---

## What This Module Does

The optimization service solves a route planning problem: given 10 Nairobi neighbourhoods where plastic waste is collected, find the shortest tour that visits every neighbourhood exactly once (Traveling Salesman Problem). It implements and compares two algorithms:

### PSO — Particle Swarm Optimization (classical)

Implemented in `pso_solver.py`. Adapted from the project's `assignment2_pso.py` work. Uses a swap-based permutation encoding where each particle represents a route ordering and particles exchange position elements to explore better tours. Runs in approximately 2 seconds and typically reaches about 95% of the mathematically optimal solution.

### QAOA — Quantum Approximate Optimization Algorithm (quantum)

Implemented in `qaoa_solver.py`. Uses Qiskit and the Qiskit Optimization library to run a quantum circuit simulation on a classical computer — no real quantum hardware is required. The circuit is built from the TSP problem structure and executed on Qiskit's statevector simulator. Runs in approximately 45 seconds and typically reaches about 88% of optimal at 10 nodes.

QAOA is slower and less accurate than PSO at this scale. This is expected and documented. QAOA's theoretical advantage appears at 50+ node problems on actual quantum hardware, which does not yet exist reliably. Showing both algorithms and their tradeoffs is the academic contribution of this module.

### The 10 Nairobi Neighbourhoods

Westlands, Kibera, Eastleigh, Karen, Mathare, Kasarani, Embakasi, Langata, Ruaraka, Dagoretti

The distance graph between these neighbourhoods is built in `graph_builder.py` using NetworkX, with real approximate road distances in kilometres.

### Other files

- `comparison.py` — runs both solvers, prints a formatted comparison table, and saves a 2×2 PNG chart to `output/comparison_results.png`
- `visualizer.py` — generates map images of the neighbourhood graph and optimized routes
- `graph_builder.py` — builds the NetworkX distance graph
- `app.py` — FastAPI service exposing `POST /optimize` and `GET /routes/latest`

---

## Prerequisites

- Python 3.11 or newer
- pip 23 or newer
- Approximately 1 GB free disk space (Qiskit packages are large)
- 8 GB RAM minimum for running QAOA on 10 nodes in simulation

---

## Setup Steps

### 1. Navigate to the module

```bash
cd optimization
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

Windows:
```bash
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

Note: The Qiskit packages (`qiskit`, `qiskit-optimization`, `qiskit-algorithms`) total approximately 500 MB. This will take several minutes on the first install.

If you get a `qiskit_optimization not found` error after installing:
```bash
pip install qiskit-optimization qiskit-algorithms
```

---

## Running the Comparison (Supervisor Demo)

This is the main deliverable for the quantum module. Run it to generate the full PSO vs QAOA comparison:

```bash
python comparison.py
```

This produces two outputs:

**Terminal output — formatted comparison table:**

```
┌─────────────────────────────────┬─────────────────┬────────────────┐
│ Metric                          │ PSO (Classical) │ QAOA (Quantum) │
├─────────────────────────────────┼─────────────────┼────────────────┤
│ Best route distance (km)        │ ~85 km          │ ~92 km         │
│ Runtime (seconds)               │ ~2s             │ ~45s           │
│ Solution quality (% of optimal) │ ~95%            │ ~88%           │
└─────────────────────────────────┴─────────────────┴────────────────┘
```

Actual numbers will vary slightly between runs due to the stochastic nature of both algorithms.

**File output — `output/comparison_results.png`:** A 2×2 chart showing:
- Top-left: route distance bar chart (PSO vs QAOA vs exact optimal)
- Top-right: convergence curve (distance over iterations)
- Bottom-left: runtime bar chart
- Bottom-right: solution quality percentage

---

## Running the Visualizer

Generates PNG images of the neighbourhood graph and the optimized routes:

```bash
python visualizer.py
```

Images are saved to `output/`. Useful for presentations and the project report.

---

## Running the API Service

```bash
python app.py
```

Service starts on http://localhost:8002. The backend calls this service when an admin triggers route optimization.

### API endpoints

Get the most recently computed routes (no re-computation):
```bash
curl http://localhost:8002/routes/latest
```

Trigger a new optimization run:
```bash
# Run PSO only (fast, ~2 seconds)
curl -X POST http://localhost:8002/optimize \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "pso"}'

# Run both algorithms and compare
curl -X POST http://localhost:8002/optimize \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "both"}'
```

Get the comparison metrics from the last run:
```bash
curl http://localhost:8002/comparison
```

---

## Testing with a Smaller Graph

If QAOA is too slow on your machine, reduce the problem size to 5 nodes for testing. Open `graph_builder.py` and shorten the `NEIGHBORHOODS` list:

```python
# Change from 10 nodes:
NEIGHBORHOODS = [
    "Westlands", "Kibera", "Eastleigh", "Karen", "Mathare",
    "Kasarani", "Embakasi", "Langata", "Ruaraka", "Dagoretti"
]

# To 5 nodes for faster testing:
NEIGHBORHOODS = [
    "Westlands", "Kibera", "Eastleigh", "Karen", "Mathare"
]
```

5-node QAOA runs in under 5 seconds. Restore the full list before the supervisor demo.

---

## Expected Performance

| Metric | PSO | QAOA |
|--------|-----|------|
| Route distance | ~85 km | ~92 km |
| Runtime | ~2 seconds | ~45 seconds |
| Solution quality | ~95% of optimal | ~88% of optimal |
| Algorithm type | Classical heuristic | Quantum circuit simulation |

QAOA is slower and less accurate at 10 nodes — this is expected and is part of the research finding. The comparison demonstrates where classical methods currently outperform quantum simulation, and where quantum methods are projected to gain advantage (large-scale problems on real hardware).

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `app.py` | FastAPI service — `POST /optimize`, `GET /routes/latest`, `GET /comparison` |
| `pso_solver.py` | Particle Swarm Optimization TSP solver |
| `qaoa_solver.py` | QAOA TSP solver via Qiskit simulator |
| `comparison.py` | Runs both solvers, prints table, saves PNG chart |
| `visualizer.py` | Generates route map images |
| `graph_builder.py` | Builds NetworkX distance graph for the 10 neighbourhoods |
| `requirements.txt` | Python package dependencies |
| `output/` | Generated charts and map images (created on first run) |

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: qiskit_optimization` | Package not installed | `pip install qiskit-optimization qiskit-algorithms` |
| `ModuleNotFoundError: qiskit_algorithms` | Package not installed | `pip install qiskit-algorithms` |
| QAOA takes more than 10 minutes | 10-node simulation is heavy on slow machines | Reduce to 5 nodes in `graph_builder.py` (see Testing section above) |
| `MemoryError` during QAOA | 10-node TSP requires ~100 qubits in simulation; 8 GB RAM is tight | Reduce to 5 nodes, or close other applications to free RAM |
| `Port 8002 already in use` | Another process on that port | `PORT=8003 python app.py` |
| `output/` directory not found | First run, directory not created yet | `mkdir output` then re-run |
| Comparison chart is blank | Matplotlib backend issue on some Linux setups | `pip install matplotlib` and add `import matplotlib; matplotlib.use('Agg')` at the top of `comparison.py` |

---

## Integration with Backend

The backend calls this service from `POST /api/routes/optimize`. The request and response shapes are:

**Backend → optimization service:**
```json
{
  "algorithm": "pso",
  "zones": []
}
```

**Optimization service → backend:**
```json
[
  {
    "zone": "Nairobi (all zones)",
    "route_order": ["Westlands", "Kibera", "Mathare", "..."],
    "total_distance_km": 84.32,
    "algorithm_used": "PSO",
    "qaoa_vs_pso_improvement": "-2.1%",
    "generated_at": "2026-05-20T06:00:00+00:00"
  }
]
```

The backend stores results in the `optimized_routes` PostgreSQL table. The mobile app's MapScreen fetches them via `GET /api/routes/latest` and renders polylines with react-native-maps.

For full API documentation see [docs/api-schema.md](../api-schema.md).
