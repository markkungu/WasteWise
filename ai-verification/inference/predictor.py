import hashlib
import logging
import os

import numpy as np

logger = logging.getLogger(__name__)

PLASTIC_CLASSES = ["PET", "HDPE", "LDPE", "PP", "PS"]
CONFIDENCE_THRESHOLD = 0.80
MODEL_VERSION = "plastic-yolo-v1.2"


class PlasticPredictor:
    """
    YOLOv8-based plastic waste classifier.

    When a trained model weight file is available at `model_path`, it loads
    the model and runs real inference. Otherwise it operates in stub mode,
    returning deterministic mock predictions derived from the image content —
    useful for development and integration testing before training is complete.
    """

    def __init__(self, model_path: str | None = None):
        self.model = None
        self.model_version = MODEL_VERSION
        self._stub_mode = True
        self._load_model(model_path)

    def _load_model(self, model_path: str | None):
        if not model_path or not os.path.exists(model_path):
            logger.warning(
                "Model path not provided or file not found (%s). "
                "Running in stub mode — predictions are mocked.",
                model_path,
            )
            self._stub_mode = True
            return

        try:
            import torch
            # PyTorch 2.x defaults to weights_only=True; YOLO .pt files need pickle
            _orig_load = torch.load
            torch.load = lambda *a, **kw: _orig_load(*a, **{**kw, "weights_only": False})

            from ultralytics import YOLO  # imported lazily so stub mode works without torch

            self.model = YOLO(model_path)
            torch.load = _orig_load  # restore
            self._stub_mode = False
            logger.info("YOLOv8 model loaded from %s", model_path)
        except Exception as exc:
            logger.error("Failed to load model from %s: %s. Falling back to stub mode.", model_path, exc)
            self.model = None
            self._stub_mode = True

    @property
    def model_loaded(self) -> bool:
        return not self._stub_mode and self.model is not None

    def predict(self, image: np.ndarray) -> dict:
        """
        Run plastic detection on a BGR image array.

        Returns:
            {
                "primary_category":    str,   # dominant plastic type or "UNKNOWN"
                "detected_items_count": int,
                "confidence_score":    float, # 0-1
                "all_detections":      list,  # [{class, confidence, bbox}, ...]
            }
        """
        if self._stub_mode:
            return self._predict_stub(image)
        return self._predict_model(image)

    def _predict_model(self, image: np.ndarray) -> dict:
        """Run real YOLOv8 inference."""
        if self.model is None:
            return self._predict_stub(image)
        results = self.model(image, verbose=False)
        detections = []
        class_confidences: dict[str, float] = {}

        for result in results:
            for box in result.boxes:
                class_idx = int(box.cls[0])
                confidence = float(box.conf[0])
                # Map COCO class indices to plastic categories.
                # When using a pretrained general model (yolov8n), any detected
                # object is treated as a plastic item and its class index is
                # wrapped into the plastic label list via modulo.
                label = PLASTIC_CLASSES[class_idx % len(PLASTIC_CLASSES)]
                detections.append(
                    {
                        "class": label,
                        "confidence": round(confidence, 4),
                        "bbox": box.xyxy[0].tolist(),
                    }
                )
                # Keep the highest confidence per class
                if label not in class_confidences or confidence > class_confidences[label]:
                    class_confidences[label] = confidence

        if not detections:
            return {
                "primary_category": "UNKNOWN",
                "detected_items_count": 0,
                "confidence_score": 0.0,
                "all_detections": [],
            }

        primary_category = max(class_confidences, key=lambda k: class_confidences[k])
        confidence_score = round(class_confidences[primary_category], 4)

        return {
            "primary_category": primary_category,
            "detected_items_count": len(detections),
            "confidence_score": confidence_score,
            "all_detections": detections,
        }

    def _predict_stub(self, image: np.ndarray) -> dict:
        """
        Return a deterministic stub prediction seeded by the image pixel hash.

        This ensures the same image always produces the same output during
        development and makes unit tests reproducible.
        """
        # Hash a downsampled version of the image to create a stable seed
        small = image[::8, ::8].tobytes()
        digest = hashlib.md5(small).hexdigest()
        seed = int(digest[:8], 16)
        rng = np.random.default_rng(seed)

        category = PLASTIC_CLASSES[int(rng.integers(0, len(PLASTIC_CLASSES)))]
        item_count = int(rng.integers(1, 8))
        # Stub confidence is always below threshold so the backend treats it as unverified
        confidence = round(float(rng.uniform(0.0, 0.5)), 4)

        detections = [
            {
                "class": category,
                "confidence": confidence,
                "bbox": [0.0, 0.0, 0.0, 0.0],
            }
        ] * item_count

        return {
            "primary_category": category,
            "detected_items_count": item_count,
            "confidence_score": confidence,
            "all_detections": detections,
        }
