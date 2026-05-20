import React from "react";
import { View, Text, StyleSheet } from "react-native";

// ── Status badge config ───────────────────────────────────────────────────────
const STATUS_CONFIG = {
  APPROVED: {
    bg: "#dcfce7",
    border: "#86efac",
    text: "#15803d",
    label: "Approved",
  },
  PENDING: {
    bg: "#fef9c3",
    border: "#fde047",
    text: "#854d0e",
    label: "Pending",
  },
  REJECTED_SPOOF: {
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    label: "Rejected: Spoof",
  },
  REJECTED_INVALID_MATERIAL: {
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    label: "Rejected: Invalid",
  },
  REJECTED_LOW_QUALITY: {
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#b91c1c",
    label: "Rejected: Quality",
  },
};

const DEFAULT_STATUS = {
  bg: "#f3f4f6",
  border: "#d1d5db",
  text: "#374151",
  label: "Unknown",
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || DEFAULT_STATUS;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.border },
      ]}
    >
      <Text style={[styles.badgeText, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

/**
 * SubmissionCard
 *
 * Props:
 *   submission — a row from GET /submissions or GET /submissions/:id
 *     - id, created_at, waste_type, reported_weight_kg
 *     - verification_status
 *     - token_amount (optional, from join with rewards)
 *     - confidence_score (optional)
 */
export default function SubmissionCard({ submission }) {
  const {
    created_at,
    waste_type,
    reported_weight_kg,
    verification_status,
    token_amount,
    confidence_score,
  } = submission;

  const date = new Date(created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const weight = reported_weight_kg
    ? `${parseFloat(reported_weight_kg).toFixed(2)} kg`
    : "Weight not recorded";

  const typeLabel = waste_type || "Plastic waste";

  return (
    <View style={styles.card}>
      {/* Top row: type + status badge */}
      <View style={styles.topRow}>
        <Text style={styles.typeText} numberOfLines={1}>
          {typeLabel}
        </Text>
        <StatusBadge status={verification_status} />
      </View>

      {/* Middle row: date + weight */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{date}</Text>
        <Text style={styles.separator}> · </Text>
        <Text style={styles.metaText}>{weight}</Text>
        {confidence_score != null && (
          <>
            <Text style={styles.separator}> · </Text>
            <Text style={styles.metaText}>
              {(confidence_score * 100).toFixed(0)}% confidence
            </Text>
          </>
        )}
      </View>

      {/* Token reward (shown only when APPROVED + reward available) */}
      {verification_status === "APPROVED" && token_amount != null && (
        <View style={styles.rewardRow}>
          <Text style={styles.rewardText}>
            +{parseFloat(token_amount).toFixed(2)} WWT
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  typeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center" },
  metaText: { fontSize: 12, color: "#6b7280" },
  separator: { fontSize: 12, color: "#9ca3af" },
  rewardRow: {
    marginTop: 8,
    backgroundColor: "#dcfce7",
    borderRadius: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rewardText: { fontSize: 13, fontWeight: "700", color: "#15803d" },
});
