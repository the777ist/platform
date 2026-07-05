from fastapi import APIRouter

from ..schemas.common import StrictDTO

router = APIRouter(prefix="/v1", tags=["hello"])


class Hello(StrictDTO):
    message: str


@router.get("/hello", response_model=Hello)
def hello() -> Hello:
    return Hello(message="hello from template_api")
