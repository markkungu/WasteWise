import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { submitWaste } from "../services/api";

// ── Rejection reason labels ────────────────────────────────────────────────────
const REJECTION_LABELS = {
  REJECTED_SPOOF:
    "This image appears to be a duplicate or digitally manipulated. Please take a fresh photo.",
  REJECTED_INVALID_MATERIAL:
    "Our AI did not detect recyclable plastic in this image. Ensure plastic waste is clearly visible.",
  REJECTED_LOW_QUALITY:
    "The image quality is too low for verification. Take the photo in good lighting.",
};

const DEFAULT_REJECTION_LABEL =
  "Your submission could not be verified. Please try again with a clear photo of plastic waste.";

export default function SubmitScreen() {
  const router = useRouter();

  const [imageUri, setImageUri] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [result, setResult] = useState(null); // submission result from API
  const [error, setError] = useState("");

  // ── Image picker ─────────────────────────────────────────────────────────────
  const handlePickImage = async () => {
    setError("");
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Allow access to your photo library to upload a waste photo."
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!pickerResult.canceled && pickerResult.assets?.length > 0) {
      setImageUri(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const handleTakePhoto = async () => {
    setError("");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Allow camera access to take a waste photo."
      );
      return;
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!cameraResult.canceled && cameraResult.assets?.length > 0) {
      setImageUri(cameraResult.assets[0].uri);
      setResult(null);
    }
  };

  // ── Location ──────────────────────────────────────────────────────────────────
  const handleGetLocation = async () => {
    setError("");
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied. Please enter coordinates manually.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      setLocationLabel(
        `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
      );
    } catch {
      setError("Could not get location. Check that GPS is enabled.");
    } finally {
      setLocationLoading(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    setResult(null);

    if (!imageUri) {
      setError("Please take or select a photo first.");
      return;
    }
    if (latitude == null || longitude == null) {
      setError("Please capture your current location before submitting.");
      return;
    }

    const weight = weightKg ? parseFloat(weightKg) : null;
    if (weightKg && (isNaN(weight) || weight <= 0)) {
      setError("Enter a valid weight in kg (e.g. 0.5).");
      return;
    }

    setLoading(true);
    try {
      const response = await submitWaste(imageUri, latitude, longitude, weight);
      setResult(response);
    } catch (err) {
      if (err.response?.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        err.response?.data?.error ||
          "Submission failed. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImageUri(null);
    setLatitude(null);
    setLongitude(null);
    setLocationLabel("");
    setWeightKg("");
    setResult(null);
    setError("");
  };

  // ── Result views ──────────────────────────────────────────────────────────────
  if (result) {
    const isApproved = result.verification_result === "APPROVED";
    const isPending = result.status === "PENDING";

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.resultContent}
      >
        <View style={[styles.resultCard, isApproved ? styles.approved : isPending ? styles.pending : styles.rejected]}>
          <Text style={styles.resultIcon}>
            {isApproved ? "✓" : isPending ? "~" : "✗"}
          </Text>
          <Text style={styles.resultTitle}>
            {isApproved
              ? "Submission Approved!"
              : isPending
              ? "Verification Pending"
              : "Submission Rejected"}
          </Text>

          {isApproved && result.reward && (
            <View style={styles.rewardBox}>
              <Text style={styles.rewardLabel}>Tokens Earned</Text>
              <Text style={styles.rewardAmount}>
                {result.reward.token_amount} WWT
              </Text>
              <Text style={styles.rewardNote}>
                30% held in escrow until collection is confirmed by the
                recycling centre.
              </Text>
            </View>
          )}

          {!isApproved && !isPending && (
            <Text style={styles.rejectionReason}>
              {REJECTION_LABELS[result.verification_result] ||
                DEFAULT_REJECTION_LABEL}
            </Text>
          )}

          {isPending && (
            <Text style={styles.pendingReason}>
              The verification service is temporarily unavailable. Your
              submission has been saved and will be reviewed shortly.
            </Text>
          )}

          <View style={styles.resultMeta}>
            {result.primary_category && (
              <Text style={styles.metaText}>
                Type: {result.primary_category}
              </Text>
            )}
            {result.confidence_score != null && (
              <Text style={styles.metaText}>
                Confidence: {(result.confidence_score * 100).toFixed(1)}%
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>Submit Another</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/home")}
        >
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>Submit Waste</Text>
      <Text style={styles.screenSubtitle}>
        Take a clear photo of plastic waste and let our AI verify it to earn
        WWT tokens.
      </Text>

      {/* Photo */}
      <Text style={styles.label}>1. Photo of Plastic Waste</Text>
      {imageUri ? (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />
          <TouchableOpacity
            style={styles.changePhotoButton}
            onPress={handlePickImage}
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <TouchableOpacity
            style={[styles.photoButton, styles.photoButtonPrimary]}
            onPress={handleTakePhoto}
          >
            <Text style={styles.photoButtonTextPrimary}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoButton, styles.photoButtonSecondary]}
            onPress={handlePickImage}
          >
            <Text style={styles.photoButtonTextSecondary}>
              Choose from Library
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Location */}
      <Text style={[styles.label, { marginTop: 20 }]}>2. Location</Text>
      <TouchableOpacity
        style={[styles.locationButton, latitude != null && styles.locationSet]}
        onPress={handleGetLocation}
        disabled={locationLoading}
      >
        {locationLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.locationButtonText}>
            {latitude != null
              ? `Location set: ${locationLabel}`
              : "Use Current Location"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Weight */}
      <Text style={[styles.label, { marginTop: 20 }]}>
        3. Estimated Weight{" "}
        <Text style={styles.optional}>(optional, in kg)</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 0.5"
        placeholderTextColor="#9ca3af"
        keyboardType="decimal-pad"
        value={weightKg}
        onChangeText={(v) => { setWeightKg(v); setError(""); }}
        editable={!loading}
      />

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={[styles.submitButtonText, { marginLeft: 10 }]}>
              Verifying with AI...
            </Text>
          </View>
        ) : (
          <Text style={styles.submitButtonText}>Submit for Verification</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  content: { padding: 20, paddingBottom: 48 },
  screenTitle: { fontSize: 24, fontWeight: "800", color: "#111827", marginBottom: 6 },
  screenSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 10 },
  optional: { fontWeight: "400", color: "#9ca3af" },

  // Photo
  photoButtons: { flexDirection: "row", gap: 10 },
  photoButton: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  photoButtonPrimary: { backgroundColor: "#16a34a" },
  photoButtonSecondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db" },
  photoButtonTextPrimary: { color: "#fff", fontWeight: "600" },
  photoButtonTextSecondary: { color: "#374151", fontWeight: "600" },
  imagePreviewContainer: { alignItems: "center" },
  imagePreview: { width: "100%", height: 200, borderRadius: 12, resizeMode: "cover" },
  changePhotoButton: { marginTop: 8 },
  changePhotoText: { color: "#16a34a", fontWeight: "600" },

  // Location
  locationButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  locationSet: { backgroundColor: "#15803d" },
  locationButtonText: { color: "#fff", fontWeight: "600" },

  // Weight
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },

  // Error
  errorBox: {
    backgroundColor: "#fef2f2",
    borderLeftWidth: 4,
    borderLeftColor: "#ef4444",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  errorText: { color: "#b91c1c", fontSize: 14 },

  // Submit button
  submitButton: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center" },

  // Result screen
  resultContent: { padding: 24, paddingBottom: 48 },
  resultCard: { borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24 },
  approved: { backgroundColor: "#dcfce7" },
  rejected: { backgroundColor: "#fef2f2" },
  pending: { backgroundColor: "#fef9c3" },
  resultIcon: { fontSize: 48, marginBottom: 12 },
  resultTitle: { fontSize: 22, fontWeight: "700", color: "#111827", textAlign: "center" },
  rewardBox: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    width: "100%",
  },
  rewardLabel: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  rewardAmount: { fontSize: 36, fontWeight: "800", color: "#16a34a" },
  rewardNote: { fontSize: 12, color: "#6b7280", textAlign: "center", marginTop: 8 },
  rejectionReason: {
    fontSize: 14,
    color: "#b91c1c",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
  },
  pendingReason: {
    fontSize: 14,
    color: "#854d0e",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
  },
  resultMeta: { marginTop: 16 },
  metaText: { fontSize: 13, color: "#6b7280", textAlign: "center" },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  secondaryButtonText: { color: "#374151", fontSize: 16, fontWeight: "600" },
});
