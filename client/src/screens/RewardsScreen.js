import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { getRewards, clearToken } from "../services/api";
import TokenBalance from "../components/TokenBalance";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PARTIAL: { bg: "#fef9c3", text: "#854d0e", label: "30% Pending" },
    COMPLETED: { bg: "#dcfce7", text: "#15803d", label: "Complete" },
    FAILED: { bg: "#fef2f2", text: "#b91c1c", label: "Failed" },
  };
  const style = map[status] || { bg: "#f3f4f6", text: "#374151", label: status };
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

// ── Single reward row ─────────────────────────────────────────────────────────
function RewardRow({ reward }) {
  const date = new Date(reward.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const type = reward.waste_type || "Plastic waste";
  const weight = reward.reported_weight_kg
    ? `${parseFloat(reward.reported_weight_kg).toFixed(2)} kg`
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowType}>{type}</Text>
        <Text style={styles.rowDate}>
          {date}
          {weight ? ` · ${weight}` : ""}
        </Text>
        <StatusBadge status={reward.status} />
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>
          +{parseFloat(reward.immediate_amount).toFixed(2)}
        </Text>
        <Text style={styles.rowSymbol}>WWT</Text>
        {reward.status === "PARTIAL" && (
          <Text style={styles.rowPending}>
            +{parseFloat(reward.pending_amount).toFixed(2)} pending
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const router = useRouter();

  const [rewards, setRewards] = useState([]);
  const [totals, setTotals] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadRewards = useCallback(async (page = 1, append = false) => {
    setError("");
    try {
      const data = await getRewards(page, 20);
      if (append) {
        setRewards((prev) => [...prev, ...(data.rewards || [])]);
      } else {
        setRewards(data.rewards || []);
      }
      setTotals(data.totals);
      setPagination(data.pagination);
    } catch (err) {
      if (err.response?.status === 401) {
        await clearToken();
        router.replace("/login");
        return;
      }
      setError("Failed to load rewards. Pull to refresh.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadRewards(1, false);
  }, [loadRewards]);

  const onRefresh = () => {
    setRefreshing(true);
    loadRewards(1, false);
  };

  const onLoadMore = () => {
    if (loadingMore || pagination.page >= pagination.total_pages) return;
    setLoadingMore(true);
    loadRewards(pagination.page + 1, true);
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Rewards</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Summary */}
      {totals && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <TokenBalance amount={parseFloat(totals.total_received || 0)} />
            <Text style={styles.summaryLabel}>Received</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {parseFloat(totals.total_pending || 0).toFixed(2)}
            </Text>
            <Text style={[styles.summaryLabel, { color: "#854d0e" }]}>
              Pending
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {parseFloat(totals.total_earned || 0).toFixed(2)}
            </Text>
            <Text style={styles.summaryLabel}>Total Earned</Text>
          </View>
        </View>
      )}

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* List */}
      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RewardRow reward={item} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color="#16a34a"
              style={{ marginVertical: 16 }}
            />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No rewards yet</Text>
            <Text style={styles.emptyBody}>
              Submit verified plastic waste to earn WWT tokens.
            </Text>
          </View>
        }
        contentContainerStyle={
          rewards.length === 0 ? styles.emptyContainer : styles.listContent
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 52,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: { width: 50 },
  backText: { color: "#16a34a", fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 20, fontWeight: "800", color: "#111827" },
  summaryLabel: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  divider: { width: 1, backgroundColor: "#e5e7eb" },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    margin: 16,
  },
  errorText: { color: "#b91c1c", fontSize: 14, textAlign: "center" },
  listContent: { padding: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  row: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  rowLeft: { flex: 1 },
  rowType: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 4 },
  rowDate: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
  badge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  rowRight: { alignItems: "flex-end", marginLeft: 12 },
  rowAmount: { fontSize: 20, fontWeight: "800", color: "#16a34a" },
  rowSymbol: { fontSize: 11, color: "#6b7280" },
  rowPending: { fontSize: 11, color: "#854d0e", marginTop: 2 },
  emptyState: { alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 6 },
  emptyBody: { fontSize: 14, color: "#6b7280", textAlign: "center" },
});
