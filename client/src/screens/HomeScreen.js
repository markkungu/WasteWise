import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { getSubmissions, getRewards, clearToken } from "../services/api";
import SubmissionCard from "../components/SubmissionCard";
import TokenBalance from "../components/TokenBalance";

export default function HomeScreen() {
  const router = useRouter();

  const [submissions, setSubmissions] = useState([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ── Data fetching ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setError("");
    try {
      const [submissionsData, rewardsData] = await Promise.all([
        getSubmissions(1, 5),
        getRewards(1, 1),
      ]);

      setSubmissions(submissionsData.submissions || []);
      setTotalSubmissions(submissionsData.pagination?.total || 0);
      setTotalTokens(
        parseFloat(rewardsData.totals?.total_received || 0)
      );
    } catch (err) {
      if (err.response?.status === 401) {
        await clearToken();
        router.replace("/login");
        return;
      }
      setError("Failed to load dashboard. Pull to refresh.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLogout = async () => {
    await clearToken();
    router.replace("/login");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.appName}>WasteWise</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <TokenBalance amount={totalTokens} />
          <Text style={styles.statLabel}>Tokens Earned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalSubmissions}</Text>
          <Text style={styles.statLabel}>Submissions</Text>
        </View>
      </View>

      {/* Quick action */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => router.push("/submit")}
      >
        <Text style={styles.ctaText}>+ Submit Waste</Text>
      </TouchableOpacity>

      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push("/rewards")}
        >
          <Text style={styles.navText}>My Rewards</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => router.push("/map")}
        >
          <Text style={styles.navText}>Collection Map</Text>
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Recent submissions */}
      <Text style={styles.sectionTitle}>Recent Submissions</Text>
      {submissions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No submissions yet</Text>
          <Text style={styles.emptyBody}>
            Tap "Submit Waste" to earn your first WWT tokens.
          </Text>
        </View>
      ) : (
        submissions.map((item) => (
          <SubmissionCard key={item.id} submission={item} />
        ))
      )}

      {totalSubmissions > 5 && (
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={() => router.push("/submissions")}
        >
          <Text style={styles.viewAllText}>
            View all {totalSubmissions} submissions
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  appName: { fontSize: 22, fontWeight: "800", color: "#16a34a" },
  logoutText: { fontSize: 14, color: "#6b7280" },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "800", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  ctaButton: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 14,
  },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  navRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  navButton: {
    flex: 1,
    backgroundColor: "#dcfce7",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  navText: { color: "#16a34a", fontWeight: "600", fontSize: 14 },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#b91c1c", fontSize: 14, textAlign: "center" },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  emptyBody: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 6,
  },
  viewAllButton: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  viewAllText: { color: "#16a34a", fontWeight: "600", fontSize: 14 },
});
