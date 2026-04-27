"""Central cache registry — clears all lru_caches on DB swap."""

import logging
from typing import Callable

from .database import db

logger = logging.getLogger(__name__)

_caches: list[Callable] = []


def register_cache(fn: Callable) -> None:
    """Register an lru_cache-decorated function for clearing on DB swap."""
    _caches.append(fn)


def clear_all_caches() -> None:
    for fn in _caches:
        fn.cache_clear()
    logger.info("Cleared %d caches after DB swap", len(_caches))


db.register_swap_callback(clear_all_caches)
