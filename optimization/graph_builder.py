"""
graph_builder.py
----------------
Builds a weighted graph of 10 Nairobi neighborhoods to model the
waste-collection routing problem for WasteWise.

Each node represents a neighborhood; each edge weight is the approximate
road distance in kilometres between the two locations.
"""

import numpy as np
import networkx as nx

# ---------------------------------------------------------------------------
# Neighbourhood list (fixed order – used as node indices throughout)
# ---------------------------------------------------------------------------
NEIGHBORHOODS = [
    "Westlands",
    "Kibera",
    "Eastleigh",
    "Karen",
    "Mathare",
    "Kasarani",
    "Embakasi",
    "Langata",
    "Ruaraka",
    "Dagoretti",
]

# ---------------------------------------------------------------------------
# Known approximate road distances (km) for well-connected pairs.
# Keys are frozensets so order does not matter.
# ---------------------------------------------------------------------------
KNOWN_DISTANCES: dict[frozenset, float] = {
    frozenset({"Westlands", "Kibera"}):    5.0,
    frozenset({"Kibera", "Langata"}):      6.0,
    frozenset({"Westlands", "Kasarani"}): 12.0,
    frozenset({"Karen", "Langata"}):       4.0,
    frozenset({"Eastleigh", "Mathare"}):   3.0,
    frozenset({"Kasarani", "Ruaraka"}):    4.0,
    frozenset({"Embakasi", "Eastleigh"}):  7.0,
    # Additional plausible Nairobi distances
    frozenset({"Westlands", "Eastleigh"}):  8.0,
    frozenset({"Westlands", "Dagoretti"}):  7.0,
    frozenset({"Kibera", "Karen"}):         8.0,
    frozenset({"Kibera", "Dagoretti"}):     6.0,
    frozenset({"Eastleigh", "Kasarani"}):   9.0,
    frozenset({"Eastleigh", "Embakasi"}):   7.0,
    frozenset({"Karen", "Dagoretti"}):      7.0,
    frozenset({"Karen", "Langata"}):        4.0,
    frozenset({"Mathare", "Kasarani"}):     6.0,
    frozenset({"Mathare", "Ruaraka"}):      5.0,
    frozenset({"Kasarani", "Embakasi"}):   11.0,
    frozenset({"Embakasi", "Ruaraka"}):     6.0,
    frozenset({"Langata", "Dagoretti"}):    5.0,
}


def build_nairobi_graph() -> nx.Graph:
    """
    Returns a complete weighted NetworkX graph of the 10 Nairobi
    neighbourhoods.  Edge attribute ``weight`` is the distance in km.
    """
    rng = np.random.default_rng(42)

    G = nx.Graph()
    G.add_nodes_from(NEIGHBORHOODS)

    n = len(NEIGHBORHOODS)
    for i in range(n):
        for j in range(i + 1, n):
            u = NEIGHBORHOODS[i]
            v = NEIGHBORHOODS[j]
            key = frozenset({u, v})
            if key in KNOWN_DISTANCES:
                dist = KNOWN_DISTANCES[key]
            else:
                dist = float(rng.integers(3, 26))   # 3 … 25 km inclusive
            G.add_edge(u, v, weight=dist)

    return G


def get_distance_matrix(G: nx.Graph) -> np.ndarray:
    """
    Returns an (n x n) numpy array where entry [i, j] is the edge weight
    between NEIGHBORHOODS[i] and NEIGHBORHOODS[j].  Diagonal is 0.
    """
    n = len(NEIGHBORHOODS)
    matrix = np.zeros((n, n))
    for i, u in enumerate(NEIGHBORHOODS):
        for j, v in enumerate(NEIGHBORHOODS):
            if i != j:
                matrix[i, j] = G[u][v]["weight"]
    return matrix


def print_graph_summary(G: nx.Graph) -> None:
    """Prints a human-readable summary of the graph."""
    weights = [d["weight"] for _, _, d in G.edges(data=True)]
    print("=" * 50)
    print("  Nairobi Waste-Collection Graph Summary")
    print("=" * 50)
    print(f"  Nodes  : {G.number_of_nodes()}")
    print(f"  Edges  : {G.number_of_edges()}")
    print(f"  Min edge weight : {min(weights):.1f} km")
    print(f"  Max edge weight : {max(weights):.1f} km")
    print(f"  Avg edge weight : {np.mean(weights):.1f} km")
    print()
    print("  Neighbourhoods:")
    for i, n in enumerate(NEIGHBORHOODS, 1):
        print(f"    {i:2d}. {n}")
    print()
    print("  Notable connections:")
    notable = sorted(
        [(u, v, d["weight"]) for u, v, d in G.edges(data=True)],
        key=lambda x: x[2],
    )[:8]
    for u, v, w in notable:
        print(f"    {u} ↔ {v}: {w:.1f} km")
    print("=" * 50)


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    G = build_nairobi_graph()
    print_graph_summary(G)
    dm = get_distance_matrix(G)
    print(f"\nDistance matrix shape: {dm.shape}")
    print("First row (Westlands → others):", dm[0].astype(int))
