from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from .comment import AnnotationData


class PlaneReviewCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    timecode_start: float | None = Field(default=None, ge=0)
    timecode_end: float | None = Field(default=None, ge=0)
    annotation: AnnotationData | None = None

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("comment body cannot be empty")
        return normalized

    @model_validator(mode="after")
    def validate_timecode_range(self):
        if (
            self.timecode_start is not None
            and self.timecode_end is not None
            and self.timecode_end < self.timecode_start
        ):
            raise ValueError("timecode_end must be greater than or equal to timecode_start")
        return self
