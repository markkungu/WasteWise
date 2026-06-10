"""
WasteWise AI Verification Service
----------------------------------
FastAPI service that accepts plastic waste submission payloads, downloads
the submitted image, runs anti-spoofing checks, and classifies the plastic
type using a YOLOv8 model.
"""

import io
import logging
import os
from contextlib import asynccontextmanager

import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from PIL import Image

from inference.predictor import CONFIDENCE_THRESHOLD, MODEL_VERSION, PLASTIC_CLASSES, PlasticPredictor
from inference.schema import (
    VERIFICATION_RESULT_TYPE,
    HealthResponse,
    VerificationRequest,
    VerificationResponse,
)
from inference.spoof_detector import SpoofDetector

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("wastewise.ai")

# ---------------------------------------------------------------------------
# Global service objects (initialised at startup)
# ---------------------------------------------------------------------------
_predictor: PlasticPredictor | None = None
_spoof_detector: SpoofDetector | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _predictor, _spoof_detector
    model_path = os.getenv("MODEL_PATH", "./models/plastic-yolo-v1.2.pt")
    confidence_threshold_env = os.getenv("CONFIDENCE_THRESHOLD")
    if confidence_threshold_env:
        try:
            threshold = float(confidence_threshold_env)
            logger.info("Using confidence threshold from env: %.2f", threshold)
        except ValueError:
            logger.warning("Invalid CONFIDENCE_THRESHOLD env var, using default.")

    logger.info("Loading PlasticPredictor from %s ...", model_path)
    predictor = PlasticPredictor(model_path=model_path)
    _predictor = predictor
    moire_threshold = float(os.getenv("MOIRE_THRESHOLD", "0.15"))
    blur_threshold  = float(os.getenv("BLUR_THRESHOLD",  "100.0"))
    _spoof_detector = SpoofDetector(blur_threshold=blur_threshold, moire_threshold=moire_threshold)
    logger.info("SpoofDetector ready. blur_threshold=%.1f moire_threshold=%.2f", blur_threshold, moire_threshold)
    logger.info(
        "Service ready. Model loaded=%s, stub_mode=%s",
        predictor.model_loaded,
        predictor._stub_mode,
    )
    yield
    logger.info("Shutting down AI verification service.")


app = FastAPI(
    title="WasteWise AI Verification Service",
    version="1.0.0",
    description="Plastic waste image verification using YOLOv8 and anti-spoofing checks.",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_image(image_url: str) -> np.ndarray:
    """Download an image from a URL and return it as a BGR numpy array."""
    try:
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Failed to download image from {image_url}: {exc}") from exc

    try:
        pil_image = Image.open(io.BytesIO(response.content)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Could not decode image data: {exc}") from exc

    # Convert RGB → BGR for OpenCV / YOLO compatibility
    bgr = np.array(pil_image)[:, :, ::-1].copy()
    return bgr


def _make_error_response(
    submission_id: str,
    result: VERIFICATION_RESULT_TYPE,
    flags: list[str],
    reason: str,
) -> VerificationResponse:
    logger.warning("Submission %s rejected: %s | flags=%s", submission_id, reason, flags)
    return VerificationResponse(
        submission_id=submission_id,
        verification_result=result,
        primary_category="UNKNOWN",
        detected_items_count=0,
        confidence_score=0.0,
        authenticity_verified=False,
        fraud_flags=flags if flags else ["NONE"],
        model_version=MODEL_VERSION,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Liveness/readiness probe."""
    return HealthResponse(
        status="ok",
        service="wastewise-ai-verification",
        model_loaded=_predictor.model_loaded if _predictor else False,
    )


@app.get("/model/info", tags=["System"])
async def model_info():
    """Return metadata about the loaded model."""
    return {
        "version": MODEL_VERSION,
        "classes": PLASTIC_CLASSES,
        "threshold": CONFIDENCE_THRESHOLD,
        "stub_mode": _predictor._stub_mode if _predictor else True,
    }


@app.post("/predict", response_model=VerificationResponse, tags=["Inference"])
async def predict(request: VerificationRequest):
    """
    Verify a plastic waste submission.

    Pipeline:
    1. Download image from image_url.
    2. Run SpoofDetector (blur + moiré).
    3. Run PlasticPredictor (YOLOv8).
    4. Apply confidence threshold.
    5. Return VerificationResponse.
    """
    if _predictor is None or _spoof_detector is None:
        raise HTTPException(status_code=503, detail="Service not initialised yet.")

    # ---- Step 1: Download image ----
    try:
        image = _download_image(request.image_url)
    except ValueError as exc:
        return _make_error_response(
            request.submission_id,
            "REJECTED_LOW_QUALITY",
            ["IMAGE_DOWNLOAD_FAILED"],
            str(exc),
        )

    # ---- Step 2: Anti-spoofing ----
    try:
        spoof_result = _spoof_detector.check(image)
    except Exception as exc:
        logger.error("Spoof detector error for %s: %s", request.submission_id, exc)
        return _make_error_response(
            request.submission_id,
            "REJECTED_LOW_QUALITY",
            ["SPOOF_CHECK_ERROR"],
            str(exc),
        )

    if not spoof_result["passed"]:
        return VerificationResponse(
            submission_id=request.submission_id,
            verification_result="REJECTED_SPOOF",
            primary_category="UNKNOWN",
            detected_items_count=0,
            confidence_score=0.0,
            authenticity_verified=False,
            fraud_flags=spoof_result["flags"],
            model_version=MODEL_VERSION,
        )

    # ---- Step 3: Plastic classification ----
    try:
        prediction = _predictor.predict(image)
    except Exception as exc:
        logger.error("Predictor error for %s: %s", request.submission_id, exc)
        return _make_error_response(
            request.submission_id,
            "REJECTED_INVALID_MATERIAL",
            ["MODEL_INFERENCE_ERROR"],
            str(exc),
        )

    confidence = prediction["confidence_score"]
    category = prediction["primary_category"]
    item_count = prediction["detected_items_count"]

    # ---- Step 4: Threshold check ----
    if confidence < CONFIDENCE_THRESHOLD or category == "UNKNOWN":
        return VerificationResponse(
            submission_id=request.submission_id,
            verification_result="REJECTED_INVALID_MATERIAL",
            primary_category=category,
            detected_items_count=item_count,
            confidence_score=confidence,
            authenticity_verified=True,
            fraud_flags=["LOW_CONFIDENCE"],
            model_version=MODEL_VERSION,
        )

    # ---- Step 5: Approved ----
    logger.info(
        "Submission %s APPROVED | category=%s | confidence=%.3f | items=%d",
        request.submission_id,
        category,
        confidence,
        item_count,
    )
    return VerificationResponse(
        submission_id=request.submission_id,
        verification_result="APPROVED",
        primary_category=category,
        detected_items_count=item_count,
        confidence_score=confidence,
        authenticity_verified=True,
        fraud_flags=["NONE"],
        model_version=MODEL_VERSION,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8001))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
