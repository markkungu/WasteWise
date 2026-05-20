from pydantic import BaseModel, Field
from typing import Literal

VERIFICATION_RESULT_TYPE = Literal[
    "APPROVED",
    "REJECTED_SPOOF",
    "REJECTED_INVALID_MATERIAL",
    "REJECTED_LOW_QUALITY",
]


class VerificationRequest(BaseModel):
    submission_id: str
    image_url: str
    center_id: int
    latitude: float
    longitude: float
    timestamp: str


class VerificationResponse(BaseModel):
    submission_id: str
    verification_result: VERIFICATION_RESULT_TYPE
    primary_category: str
    detected_items_count: int
    confidence_score: float = Field(ge=0.0, le=1.0)
    authenticity_verified: bool
    fraud_flags: list[str]
    model_version: str


class HealthResponse(BaseModel):
    status: str
    service: str
    model_loaded: bool
