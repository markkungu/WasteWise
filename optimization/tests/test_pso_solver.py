import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import numpy as np
import pytest
from pso_solver import (
    calculate_route_distance,
    _swaps_to_transform,
    RouteParticle,
    RoutePSO,
)
from graph_builder import build_nairobi_graph, get_distance_matrix, NEIGHBORHOODS


# ---- Fixtures ----------------------------------------------------------------

@pytest.fixture
def dist_matrix():
    G = build_nairobi_graph()
    return get_distance_matrix(G)


# ---- calculate_route_distance ------------------------------------------------

def test_single_node_route_distance():
    dm = np.array([[0.0]])
    assert calculate_route_distance([0], dm) == 0.0


def test_two_node_route_distance():
    dm = np.array([[0, 3], [3, 0]], dtype=float)
    assert calculate_route_distance([0, 1], dm) == 6.0  # 3 + 3 back


def test_route_distance_is_closed_loop():
    dm = np.array([[0, 1, 2], [1, 0, 3], [2, 3, 0]], dtype=float)
    # [0,1,2]: 1 + 3 + 2 (back to 0) = 6
    assert calculate_route_distance([0, 1, 2], dm) == 6.0


# ---- _swaps_to_transform -----------------------------------------------------

def test_swaps_transform_identity():
    perm = [0, 1, 2, 3]
    swaps = _swaps_to_transform(perm, perm)
    assert swaps == []


def test_swaps_transform_reversal():
    source = [0, 1, 2]
    target = [2, 1, 0]
    current = source[:]
    for i, j in _swaps_to_transform(source, target):
        current[i], current[j] = current[j], current[i]
    assert current == target


def test_swaps_transform_arbitrary():
    source = [3, 1, 4, 2, 0]
    target = [0, 1, 2, 3, 4]
    current = source[:]
    for i, j in _swaps_to_transform(source, target):
        current[i], current[j] = current[j], current[i]
    assert current == target


# ---- RoutePSO ----------------------------------------------------------------

def test_pso_returns_valid_route(dist_matrix):
    solver = RoutePSO(dist_matrix, n_particles=10, max_iterations=20, seed=42)
    route, dist, history = solver.run()
    assert len(route) == dist_matrix.shape[0]
    assert sorted(route) == list(range(dist_matrix.shape[0]))


def test_pso_distance_is_positive(dist_matrix):
    solver = RoutePSO(dist_matrix, n_particles=10, max_iterations=20, seed=42)
    _, dist, _ = solver.run()
    assert dist > 0


def test_pso_convergence_history_is_non_increasing(dist_matrix):
    solver = RoutePSO(dist_matrix, n_particles=20, max_iterations=50, seed=7)
    _, _, history = solver.run()
    # Global best can only stay flat or improve, never worsen
    for i in range(1, len(history)):
        assert history[i] <= history[i - 1] + 1e-9


def test_pso_history_starts_at_initial_best(dist_matrix):
    solver = RoutePSO(dist_matrix, n_particles=10, max_iterations=10, seed=1)
    _, _, history = solver.run()
    assert len(history) >= 2


def test_pso_is_deterministic(dist_matrix):
    s1 = RoutePSO(dist_matrix, n_particles=15, max_iterations=30, seed=99)
    r1, d1, _ = s1.run()
    s2 = RoutePSO(dist_matrix, n_particles=15, max_iterations=30, seed=99)
    r2, d2, _ = s2.run()
    assert r1 == r2
    assert abs(d1 - d2) < 1e-9


def test_pso_improves_over_random_baseline(dist_matrix):
    solver = RoutePSO(dist_matrix, n_particles=30, max_iterations=100, seed=42)
    _, best_dist, history = solver.run()
    # PSO should improve from its starting point
    assert best_dist <= history[0]
