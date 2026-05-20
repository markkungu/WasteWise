import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useRouter } from "expo-router";
import { getRoutes, clearToken } from "../services/api";

// ── Nairobi default centre ────────────────────────────────────────────────────
const DEFAULT_REGION = {
  latitude: -1.2921,
  longitude: 36.8219,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

// ── Simple deterministic colour per route index ────────────────────────────────
const ROUTE_COLOURS = [
  "#16a34a", "#2563eb", "#dc2626", "#9333ea",
  "#ea580c", "#0891b2", "#ca8a04", "#db2777",
];

/**
 * Parse a route_order entry.
 * Each stop can be:
 *   - A [lat, lng] array
 *   - A neighbourhood name string (we try to look up in the neighborhood map)
 *   - An object with lat/lng keys
 */
function extractCoords(stop) {
  if (Array.isArray(stop) && stop.length >= 2) {
    const [a, b] = stop;
    if (typeof a === "number" && typeof b === "number") return { lat: a, lng: b };
  }
  if (stop && typeof stop === "object") {
    const lat = stop.lat ?? stop.latitude;
    const lng = stop.lng ?? stop.longitude;
    if (lat != null && lng != null) return { lat, lng };
  }
  return null;
}

export default function MapScreen() {
  const router = useRouter();

  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRoutes = useCallback(async () => {
    setError("");
    try {
      const data = await getRoutes();
      setRoutes(data.routes || []);
    } catch (err) {
      if (err.response?.status === 401) {
        await clearToken();
        router.replace("/login");
        return;
      }
      setError(
        err.response?.status === 404
          ? "No routes have been computed yet."
          : "Failed to load collection routes."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  // ── Build polyline coordinates + markers from route_order ────────────────────
  const buildPolyline = (routeOrder) => {
    if (!Array.isArray(routeOrder)) return [];
    return routeOrder.reduce((acc, stop) => {
      const coords = extractCoords(stop);
      if (coords) acc.push({ latitude: coords.lat, longitude: coords.lng });
      return acc;
    }, []);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Collection Routes</Text>
        <TouchableOpacity onPress={loadRoutes} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>Loading routes...</Text>
        </View>
      ) : (
        <>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <MapView
            style={styles.map}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            initialRegion={DEFAULT_REGION}
            showsUserLocation
            showsMyLocationButton
          >
            {routes.map((route, routeIdx) => {
              const polylineCoords = buildPolyline(route.route_order);
              const colour = ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length];

              return (
                <React.Fragment key={route.id ?? routeIdx}>
                  {/* Route polyline */}
                  {polylineCoords.length >= 2 && (
                    <Polyline
                      coordinates={polylineCoords}
                      strokeColor={colour}
                      strokeWidth={3}
                    />
                  )}

                  {/* Markers for each stop */}
                  {polylineCoords.map((coord, stopIdx) => (
                    <Marker
                      key={`${route.id ?? routeIdx}-${stopIdx}`}
                      coordinate={coord}
                      pinColor={colour}
                      title={
                        typeof route.route_order[stopIdx] === "string"
                          ? route.route_order[stopIdx]
                          : `Stop ${stopIdx + 1}`
                      }
                      description={
                        stopIdx === 0
                          ? "Start"
                          : stopIdx === polylineCoords.length - 1
                          ? "End"
                          : route.zone || undefined
                      }
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </MapView>

          {/* Legend */}
          {routes.length > 0 && (
            <View style={styles.legend}>
              <Text style={styles.legendTitle}>Routes</Text>
              {routes.slice(0, 4).map((route, idx) => (
                <View key={route.id ?? idx} style={styles.legendRow}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: ROUTE_COLOURS[idx % ROUTE_COLOURS.length] },
                    ]}
                  />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {route.zone || `Route ${idx + 1}`}
                    {route.total_distance_km
                      ? ` (${parseFloat(route.total_distance_km).toFixed(1)} km)`
                      : ""}
                  </Text>
                </View>
              ))}
              {routes.length > 4 && (
                <Text style={styles.legendMore}>+{routes.length - 4} more</Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: { width: 50 },
  backText: { color: "#16a34a", fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  refreshButton: { width: 60, alignItems: "flex-end" },
  refreshText: { color: "#16a34a", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#6b7280", fontSize: 14 },
  errorBanner: {
    backgroundColor: "#fef2f2",
    padding: 12,
    margin: 16,
    borderRadius: 10,
  },
  errorText: { color: "#b91c1c", textAlign: "center", fontSize: 14 },
  map: { flex: 1 },
  legend: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    padding: 14,
    paddingBottom: 28,
  },
  legendTitle: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3, marginRight: 8 },
  legendLabel: { fontSize: 13, color: "#374151", flex: 1 },
  legendMore: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
});
