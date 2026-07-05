from pydantic import BaseModel, ConfigDict


class StrictDTO(BaseModel):
    # Pydantic strict mode (locked) + from_attributes so model_validate(orm_row) works.
    model_config = ConfigDict(strict=True, from_attributes=True)


class Problem(BaseModel):
    """RFC 9457 problem+json body — declared so it types into the OpenAPI schema."""

    model_config = ConfigDict(strict=True)

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
