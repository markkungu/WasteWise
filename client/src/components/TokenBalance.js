import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * TokenBalance
 *
 * Displays a WWT token balance with:
 *   - large formatted number
 *   - "WWT" symbol/ticker
 *
 * Props:
 *   amount   {number}  — token balance (may be a float)
 *   size     {"sm" | "md" | "lg"}  — display size, default "md"
 *   showFull {boolean} — show full decimal precision (default false = 2dp)
 */
export default function TokenBalance({ amount = 0, size = "md", showFull = false }) {
  const formatted = showFull
    ? parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 6 })
    : parseFloat(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

  const sizeStyles = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <View style={styles.container}>
      <Text style={[styles.amount, sizeStyles.amount]}>{formatted}</Text>
      <Text style={[styles.symbol, sizeStyles.symbol]}>WWT</Text>
    </View>
  );
}

const SIZE_STYLES = {
  sm: {
    amount: { fontSize: 16, lineHeight: 20 },
    symbol: { fontSize: 10, marginTop: 2 },
  },
  md: {
    amount: { fontSize: 26, lineHeight: 30 },
    symbol: { fontSize: 12, marginTop: 4 },
  },
  lg: {
    amount: { fontSize: 36, lineHeight: 40 },
    symbol: { fontSize: 14, marginTop: 6 },
  },
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  amount: {
    fontWeight: "800",
    color: "#16a34a",
    letterSpacing: -0.5,
  },
  symbol: {
    fontWeight: "700",
    color: "#15803d",
    letterSpacing: 1,
  },
});
