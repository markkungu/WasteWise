import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import numpy as np
import networkx as nx
import pytest
from graph_builder import (
    build_nairobi_graph,
    get_distance_matrix,
    NEIGHBORHOODS,
    KNOWN_DISTANCES,
)


def test_graph_has_correct_node_count():
    G = build_nairobi_graph()
    assert G.number_of_nodes() == 10


def test_graph_contains_all_neighborhoods():
    G = build_nairobi_graph()
    for name in NEIGHBORHOODS:
        assert name in G.nodes


def test_graph_is_complete():
    G = build_nairobi_graph()
    n = len(NEIGHBORHOODS)
    assert G.number_of_edges() == n * (n - 1) // 2


def test_all_edge_weights_are_positive():
    G = build_nairobi_graph()
    for _, _, data in G.edges(data=True):
        assert data["weight"] > 0


def test_known_distances_are_preserved():
    G = build_nairobi_graph()
    for pair, expected in KNOWN_DISTANCES.items():
        u, v = list(pair)
        assert G[u][v]["weight"] == expected


def test_distance_matrix_shape():
    G = build_nairobi_graph()
    dm = get_distance_matrix(G)
    assert dm.shape == (10, 10)


def test_distance_matrix_diagonal_is_zero():
    G = build_nairobi_graph()
    dm = get_distance_matrix(G)
    assert np.all(np.diag(dm) == 0)


def test_distance_matrix_is_symmetric():
    G = build_nairobi_graph()
    dm = get_distance_matrix(G)
    np.testing.assert_array_equal(dm, dm.T)


def test_distance_matrix_matches_known_distance():
    G = build_nairobi_graph()
    dm = get_distance_matrix(G)
    i = NEIGHBORHOODS.index("Westlands")
    j = NEIGHBORHOODS.index("Kibera")
    assert dm[i, j] == 5.0


def test_graph_is_deterministic():
    G1 = build_nairobi_graph()
    G2 = build_nairobi_graph()
    for u, v in G1.edges():
        assert G1[u][v]["weight"] == G2[u][v]["weight"]
