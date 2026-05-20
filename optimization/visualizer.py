"""
visualizer.py
-------------
Map-like visualisations of the Nairobi neighbourhood graph and optimised
waste-collection routes for the WasteWise project.

Nodes are placed at their real-world latitude / longitude coordinates so
the diagram resembles an actual city map.  Edge thickness encodes proximity
(thicker = shorter distance) and nodes are colour-coded by urban zone.
"""

from __future__ import annotations

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches  # noqa: F401 – used by callers via star-import
import networkx as nx

# ---------------------------------------------------------------------------
# Geographic coordinates (real Nairobi lat/lon)
# ---------------------------------------------------------------------------

NAIROBI_COORDS: dict[str, tuple[float, float]] = {
    "Westlands":  (-1.2676, 36.8108),
    "Kibera":     (-1.3133, 36.7892),
    "Eastleigh":  (-1.2667, 36.8500),
    "Karen":      (-1.3178, 36.7167),
    "Mathare":    (-1.2567, 36.8583),
    "Kasarani":   (-1.2167, 36.8917),
    "Embakasi":   (-1.3167, 36.9000),
    "Langata":    (-1.3333, 36.7500),
    "Ruaraka":    (-1.2500, 36.8750),
    "Dagoretti":  (-1.2833, 36.7500),
}

# ---------------------------------------------------------------------------
# Zone colouring (groups of geographically close neighbourhoods)
# ---------------------------------------------------------------------------

ZONE_COLORS: dict[str, str] = {
    "Central":  "#FF7043",   # orange-red
    "South":    "#66BB6A",   # green
    "North":    "#42A5F5",   # blue
    "East":     "#AB47BC",   # purple
}

NEIGHBORHOOD_ZONES: dict[str, str] = {
    "Westlands":  "Central",
    "Dagoretti":  "Central",
    "Kibera":     "South",
    "Karen":      "South",
    "Langata":    "South",
    "Eastleigh":  "East",
    "Mathare":    "East",
    "Embakasi":   "East",
    "Kasarani":   "North",
    "Ruaraka":    "North",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _pos_dict(G: nx.Graph) -> dict[str, tuple[float, float]]:
    """
    Build the NetworkX position dict from real coordinates.
    We flip lat sign so north is "up" on the plot.
    x = longitude, y = -latitude
    """
    pos = {}
    for node in G.nodes():
        lat, lon = NAIROBI_COORDS.get(node, (0.0, 0.0))
        pos[node] = (lon, -lat)
    return pos


def _node_colors(G: nx.Graph) -> list[str]:
    return [ZONE_COLORS.get(NEIGHBORHOOD_ZONES.get(n, "Central"), "#BDBDBD")
            for n in G.nodes()]


def _edge_widths(G: nx.Graph, scale: float = 8.0) -> list[float]:
    """Thicker edge = shorter distance (more important connection)."""
    weights = [d.get("weight", 1.0) for _, _, d in G.edges(data=True)]
    max_w = max(weights) if weights else 1.0
    return [scale * (1.0 - w / max_w) + 0.5 for w in weights]


def _edge_alphas(G: nx.Graph) -> list[float]:
    """Slightly transparent edges; closer pairs more opaque."""
    weights = [d.get("weight", 1.0) for _, _, d in G.edges(data=True)]
    max_w = max(weights) if weights else 1.0
    return [0.25 + 0.55 * (1.0 - w / max_w) for w in weights]


def _zone_legend() -> list[mpatches.Patch]:
    return [
        mpatches.Patch(color=color, label=zone)
        for zone, color in ZONE_COLORS.items()
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def plot_graph(
    G: nx.Graph,
    title: str = "Nairobi Waste-Collection Network",
    output_path: str = "output/nairobi_graph.png",
) -> None:
    """
    Draw the full neighbourhood graph with real map coordinates.

    - Nodes coloured by urban zone
    - Edge thickness ∝ 1/distance (thicker = closer)
    - Distance labels on the 10 shortest edges
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    pos = _pos_dict(G)
    node_colors = _node_colors(G)
    edge_widths = _edge_widths(G)
    edge_alphas = _edge_alphas(G)

    fig, ax = plt.subplots(figsize=(12, 10))
    ax.set_facecolor("#F5F5F0")
    fig.patch.set_facecolor("#FAFAFA")

    # Draw edges one-by-one to support per-edge alpha
    edges = list(G.edges(data=True))
    for (u, v, d), width, alpha in zip(edges, edge_widths, edge_alphas):
        ax.plot(
            [pos[u][0], pos[v][0]],
            [pos[u][1], pos[v][1]],
            color="#607D8B",
            linewidth=width,
            alpha=alpha,
            zorder=1,
        )

    # Label the 10 shortest edges
    sorted_edges = sorted(edges, key=lambda e: e[2].get("weight", 99))
    for u, v, d in sorted_edges[:10]:
        mx = (pos[u][0] + pos[v][0]) / 2
        my = (pos[u][1] + pos[v][1]) / 2
        ax.text(
            mx, my,
            f"{d['weight']:.0f}km",
            fontsize=7,
            color="#455A64",
            ha="center",
            va="center",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.7),
            zorder=3,
        )

    # Draw nodes
    node_collection = nx.draw_networkx_nodes(
        G, pos,
        node_color=node_colors,
        node_size=700,
        ax=ax,
        edgecolors="white",
        linewidths=2,
    )
    if node_collection is not None:
        node_collection.set_zorder(4)

    # Node labels
    nx.draw_networkx_labels(
        G, pos,
        font_size=8,
        font_weight="bold",
        font_color="white",
        ax=ax,
        bbox=dict(boxstyle="round,pad=0.3", fc="none", ec="none"),
    )

    # Outside-node name labels
    label_pos = {n: (x, y - 0.006) for n, (x, y) in pos.items()}
    nx.draw_networkx_labels(
        G, label_pos,
        font_size=7.5,
        font_color="#212121",
        ax=ax,
    )

    ax.legend(
        handles=_zone_legend(),
        title="Urban Zone",
        loc="lower left",
        fontsize=9,
        title_fontsize=9,
        framealpha=0.9,
    )

    ax.set_title(title, fontsize=14, fontweight="bold", pad=12)
    ax.set_xlabel("Longitude →", fontsize=9, color="gray")
    ax.set_ylabel("Latitude →", fontsize=9, color="gray")
    ax.tick_params(labelsize=7, colors="gray")
    for spine in ax.spines.values():
        spine.set_edgecolor("#E0E0E0")

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph saved → {output_path}")


def plot_route(
    G: nx.Graph,
    route: list[int],
    neighborhoods: list[str],
    title: str = "Optimised Collection Route",
    output_path: str = "output/route.png",
) -> None:
    """
    Draw the full graph with the optimised route highlighted.

    - Background edges: faint grey
    - Route edges: bold red with direction arrows
    - Nodes numbered in visit order
    - Title includes total route distance
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    pos = _pos_dict(G)
    node_colors = _node_colors(G)

    # Compute route distance
    total_dist = 0.0
    for k in range(len(route)):
        u_name = neighborhoods[route[k]]
        v_name = neighborhoods[route[(k + 1) % len(route)]]
        if G.has_edge(u_name, v_name):
            total_dist += G[u_name][v_name].get("weight", 0.0)

    fig, ax = plt.subplots(figsize=(12, 10))
    ax.set_facecolor("#F5F5F0")
    fig.patch.set_facecolor("#FAFAFA")

    # Faint background edges
    for u, v in G.edges():
        ax.plot(
            [pos[u][0], pos[v][0]],
            [pos[u][1], pos[v][1]],
            color="#B0BEC5",
            linewidth=0.8,
            alpha=0.4,
            zorder=1,
        )

    # Highlighted route edges with arrows
    route_names = [neighborhoods[i] for i in route]
    for k in range(len(route_names)):
        u = route_names[k]
        v = route_names[(k + 1) % len(route_names)]
        x0, y0 = pos[u]
        x1, y1 = pos[v]
        ax.annotate(
            "",
            xy=(x1, y1),
            xytext=(x0, y0),
            arrowprops=dict(
                arrowstyle="-|>",
                color="#E53935",
                lw=2.5,
                mutation_scale=18,
                connectionstyle="arc3,rad=0.08",
            ),
            zorder=5,
        )

    # Nodes
    node_collection2 = nx.draw_networkx_nodes(
        G, pos,
        node_color=node_colors,
        node_size=750,
        ax=ax,
        edgecolors="white",
        linewidths=2,
    )
    if node_collection2 is not None:
        node_collection2.set_zorder(6)

    # Order numbers on nodes
    order_labels = {neighborhoods[node_idx]: str(order + 1)
                    for order, node_idx in enumerate(route)}
    nx.draw_networkx_labels(G, pos, labels=order_labels,
                            font_size=9, font_weight="bold",
                            font_color="white", ax=ax)

    # Neighbourhood name labels below nodes
    label_pos = {n: (x, y - 0.006) for n, (x, y) in pos.items()}
    nx.draw_networkx_labels(G, label_pos, font_size=7.5,
                            font_color="#212121", ax=ax)

    ax.legend(handles=_zone_legend(), title="Urban Zone",
              loc="lower left", fontsize=9, title_fontsize=9, framealpha=0.9)

    full_title = f"{title}\nTotal distance: {total_dist:.1f} km"
    ax.set_title(full_title, fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Longitude →", fontsize=9, color="gray")
    ax.set_ylabel("Latitude →", fontsize=9, color="gray")
    ax.tick_params(labelsize=7, colors="gray")

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Route map saved → {output_path}")


def plot_all_routes(
    pso_route: list[int],
    qaoa_route: list[int],
    neighborhoods: list[str],
    G: nx.Graph,
    output_dir: str = "output",
) -> str:
    """
    Side-by-side map: PSO route (left) vs QAOA route (right).

    Returns the path to the saved PNG.
    """
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "route_comparison.png")

    pos = _pos_dict(G)
    node_colors = _node_colors(G)

    def _draw_panel(ax: plt.Axes, route: list[int], label: str, color: str) -> None:
        ax.set_facecolor("#F5F5F0")

        # Background edges
        for u, v in G.edges():
            ax.plot(
                [pos[u][0], pos[v][0]],
                [pos[u][1], pos[v][1]],
                color="#CFD8DC",
                linewidth=0.7,
                alpha=0.5,
                zorder=1,
            )

        # Route arrows
        route_names = [neighborhoods[i] for i in route]
        total_dist = 0.0
        for k in range(len(route_names)):
            u = route_names[k]
            v = route_names[(k + 1) % len(route_names)]
            if G.has_edge(u, v):
                total_dist += G[u][v].get("weight", 0.0)
            ax.annotate(
                "",
                xy=(pos[v][0], pos[v][1]),
                xytext=(pos[u][0], pos[u][1]),
                arrowprops=dict(
                    arrowstyle="-|>",
                    color=color,
                    lw=2.2,
                    mutation_scale=16,
                    connectionstyle="arc3,rad=0.08",
                ),
                zorder=5,
            )

        # Nodes
        nc = nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=600,
                                    ax=ax, edgecolors="white", linewidths=1.5)
        if nc is not None:
            nc.set_zorder(6)

        # Order numbers
        order_labels = {neighborhoods[node_idx]: str(order + 1)
                        for order, node_idx in enumerate(route)}
        nx.draw_networkx_labels(G, pos, labels=order_labels,
                                font_size=8, font_weight="bold",
                                font_color="white", ax=ax)

        label_pos = {n: (x, y - 0.006) for n, (x, y) in pos.items()}
        nx.draw_networkx_labels(G, label_pos, font_size=7,
                                font_color="#212121", ax=ax)

        ax.set_title(f"{label}\nTotal: {total_dist:.1f} km",
                     fontsize=11, fontweight="bold")
        ax.set_xlabel("Longitude →", fontsize=8, color="gray")
        ax.tick_params(labelsize=7, colors="gray")

    fig, (ax_pso, ax_qaoa) = plt.subplots(1, 2, figsize=(20, 9))
    fig.suptitle(
        "WasteWise – Route Comparison: PSO vs QAOA",
        fontsize=14, fontweight="bold",
    )

    _draw_panel(ax_pso,  pso_route,  "PSO Route (Classical)",  "#1565C0")
    _draw_panel(ax_qaoa, qaoa_route, "QAOA Route (Quantum)",   "#6A1B9A")

    # Shared zone legend
    for ax in (ax_pso, ax_qaoa):
        ax.legend(handles=_zone_legend(), title="Urban Zone",
                  loc="lower left", fontsize=8, title_fontsize=8, framealpha=0.9)

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Route comparison saved → {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from graph_builder import build_nairobi_graph, NEIGHBORHOODS

    G = build_nairobi_graph()
    os.makedirs("output", exist_ok=True)

    print("Plotting full graph …")
    plot_graph(G, output_path="output/nairobi_graph.png")

    # Dummy routes for visual test
    import random
    random.seed(7)
    route_a = list(range(len(NEIGHBORHOODS)))
    route_b = list(range(len(NEIGHBORHOODS)))
    random.shuffle(route_b)

    print("Plotting PSO sample route …")
    plot_route(G, route_a, NEIGHBORHOODS, title="PSO Route (Demo)",
               output_path="output/pso_route.png")

    print("Plotting side-by-side comparison …")
    plot_all_routes(route_a, route_b, NEIGHBORHOODS, G, output_dir="output")

    print("Done.")
