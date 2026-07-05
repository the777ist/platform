from polyfactory.factories.pydantic_factory import ModelFactory

from template_api.schemas.item import ItemCreate
from template_api.schemas.push import PushTokenCreate


class ItemCreateFactory(ModelFactory[ItemCreate]):
    __model__ = ItemCreate


class PushTokenCreateFactory(ModelFactory[PushTokenCreate]):
    __model__ = PushTokenCreate
