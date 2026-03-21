from abc import ABC, abstractmethod
from typing import Any


class BaseCollector(ABC):
    """Base class for data collectors.
    Implement this to add new data sources to Molt."""

    @abstractmethod
    def collect(self, **filters) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def source_name(self) -> str:
        ...
