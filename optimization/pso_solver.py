"""
pso_solver.py
-------------
Particle Swarm Optimisation (PSO) adapted for the Travelling Salesman
Problem (TSP) / route optimisation on the Nairobi waste-collection graph.

Background
~~~~~~~~~~
Classic PSO (see assignment2_pso.py) works in continuous space and uses
real-valued velocity to update particle positions.  TSP requires a
*discrete permutation* space, so we use the "swap-based" PSO variant:

  - A particle's **position** is a permutation of node indices (a route).
  - The **velocity** is an ordered list of (i, j) swap operations.
  - Applying velocity: execute each swap sequentially on the position vector.
  - Personal best (pbest) and global best (gbest) are stored as permutations.
  - Velocity update: with probability w keep part of current velocity;
    with probability c1 add swaps that transform position → pbest;
    with probability c2 add swaps that transform position → gbest.

Reference: Clerc, M. (2004). "Discrete Particle Swarm Optimization."
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def calculate_route_distance(route: list[int], dist_matrix: np.ndarray) -> float:
    """
    Total distance of a closed TSP route.

    Parameters
    ----------
    route       : list of node indices, e.g. [0, 3, 7, 2, …]
    dist_matrix : square numpy array of inter-node distances

    Returns
    -------
    Total km including the return leg from the last node back to the first.
    """
    total = 0.0
    n = len(route)
    for k in range(n):
        u = route[k]
        v = route[(k + 1) % n]
        total += dist_matrix[u, v]
    return total


def _swaps_to_transform(source: list[int], target: list[int]) -> list[tuple[int, int]]:
    """
    Return a list of (i, j) index-swap operations that transform *source*
    into *target* (both are permutations of the same integers).
    Uses a simple selection-sort–style approach.
    """
    current = source[:]
    swaps: list[tuple[int, int]] = []
    for idx in range(len(target)):
        if current[idx] != target[idx]:
            j = current.index(target[idx], idx)
            current[idx], current[j] = current[j], current[idx]
            swaps.append((idx, j))
    return swaps


# ---------------------------------------------------------------------------
# Particle
# ---------------------------------------------------------------------------

@dataclass
class RouteParticle:
    """A single PSO particle representing one candidate TSP route."""

    position: list[int]                   # current permutation
    velocity: list[tuple[int, int]]       # list of pending swap operations
    pbest: list[int]                      # personal best permutation
    pbest_fitness: float = field(default=float("inf"))

    # ------------------------------------------------------------------
    def evaluate(self, dist_matrix: np.ndarray) -> float:
        """Return the total route distance for the current position."""
        return calculate_route_distance(self.position, dist_matrix)

    # ------------------------------------------------------------------
    def update_velocity(
        self,
        gbest: list[int],
        w: float,
        c1: float,
        c2: float,
    ) -> None:
        """
        Build a new velocity (swap list) from:
          w  – inertia   : keep a random fraction of the current swaps
          c1 – cognitive : swaps toward personal best
          c2 – social    : swaps toward global best
        """
        new_velocity: list[tuple[int, int]] = []

        # Inertia: keep each existing swap with probability w
        for swap in self.velocity:
            if random.random() < w:
                new_velocity.append(swap)

        # Cognitive: move toward pbest
        toward_pbest = _swaps_to_transform(self.position, self.pbest)
        for swap in toward_pbest:
            if random.random() < c1 / (c1 + c2 + 1e-9):
                new_velocity.append(swap)

        # Social: move toward gbest
        toward_gbest = _swaps_to_transform(self.position, gbest)
        for swap in toward_gbest:
            if random.random() < c2 / (c1 + c2 + 1e-9):
                new_velocity.append(swap)

        self.velocity = new_velocity

    # ------------------------------------------------------------------
    def apply_swaps(self) -> None:
        """Apply the velocity (swap list) to the current position in-place."""
        for i, j in self.velocity:
            if 0 <= i < len(self.position) and 0 <= j < len(self.position):
                self.position[i], self.position[j] = (
                    self.position[j],
                    self.position[i],
                )


# ---------------------------------------------------------------------------
# Swarm
# ---------------------------------------------------------------------------

class RoutePSO:
    """
    Swap-based PSO for TSP route optimisation.

    Parameters
    ----------
    dist_matrix    : (n x n) numpy array of pairwise distances
    n_particles    : swarm size (default 40)
    max_iterations : stopping criterion (default 100)
    w              : inertia weight (default 0.7)
    c1             : cognitive coefficient (default 1.5)
    c2             : social coefficient (default 1.5)
    seed           : random seed for reproducibility
    """

    def __init__(
        self,
        dist_matrix: np.ndarray,
        n_particles: int = 40,
        max_iterations: int = 100,
        w: float = 0.7,
        c1: float = 1.5,
        c2: float = 1.5,
        seed: Optional[int] = 42,
    ) -> None:
        self.dist_matrix = dist_matrix
        self.n_nodes = dist_matrix.shape[0]
        self.n_particles = n_particles
        self.max_iterations = max_iterations
        self.w = w
        self.c1 = c1
        self.c2 = c2

        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        self.swarm: list[RouteParticle] = []
        self.gbest: list[int] = []
        self.gbest_fitness: float = float("inf")

    # ------------------------------------------------------------------
    def _initialise_swarm(self) -> None:
        base = list(range(self.n_nodes))
        self.swarm = []
        for _ in range(self.n_particles):
            perm = base[:]
            random.shuffle(perm)
            particle = RouteParticle(
                position=perm[:],
                velocity=[],
                pbest=perm[:],
                pbest_fitness=float("inf"),
            )
            fitness = particle.evaluate(self.dist_matrix)
            particle.pbest_fitness = fitness
            if fitness < self.gbest_fitness:
                self.gbest_fitness = fitness
                self.gbest = perm[:]
            self.swarm.append(particle)

    # ------------------------------------------------------------------
    def run(self) -> tuple[list[int], float, list[float]]:
        """
        Execute the PSO loop.

        Returns
        -------
        best_route          : list[int] – node indices in visit order
        best_distance       : float – total km of best route (closed loop)
        convergence_history : list[float] – global best distance per iteration
        """
        self._initialise_swarm()
        convergence_history: list[float] = [self.gbest_fitness]

        for _ in range(self.max_iterations):
            for particle in self.swarm:
                # 1. Update velocity
                particle.update_velocity(self.gbest, self.w, self.c1, self.c2)

                # 2. Apply velocity to get new position
                particle.apply_swaps()

                # 3. Evaluate new position
                fitness = particle.evaluate(self.dist_matrix)

                # 4. Update personal best
                if fitness < particle.pbest_fitness:
                    particle.pbest_fitness = fitness
                    particle.pbest = particle.position[:]

                # 5. Update global best
                if fitness < self.gbest_fitness:
                    self.gbest_fitness = fitness
                    self.gbest = particle.position[:]

            convergence_history.append(self.gbest_fitness)

            # Optional early stopping: no improvement for 20 iterations
            if len(convergence_history) > 20:
                recent = convergence_history[-20:]
                if max(recent) - min(recent) < 0.01:
                    break

        return self.gbest[:], self.gbest_fitness, convergence_history


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from graph_builder import build_nairobi_graph, get_distance_matrix, NEIGHBORHOODS

    G = build_nairobi_graph()
    dm = get_distance_matrix(G)

    solver = RoutePSO(dm, n_particles=40, max_iterations=100)
    t0 = time.time()
    best_route, best_dist, history = solver.run()
    elapsed = time.time() - t0

    route_names = [NEIGHBORHOODS[i] for i in best_route]
    print(f"Best route distance : {best_dist:.2f} km")
    print(f"Runtime             : {elapsed:.2f} s")
    print(f"Iterations          : {len(history)}")
    print("Route:", " → ".join(route_names))
