from __future__ import annotations

from typing import Any, Callable, Dict

Handler = Callable[[Dict[str, Any]], Any]

_HANDLERS: dict[str, Handler] = {}


def register(method: str) -> Callable[[Handler], Handler]:
    def decorator(func: Handler) -> Handler:
        _HANDLERS[method] = func
        return func

    return decorator


def get_handler(method: str) -> Handler | None:
    return _HANDLERS.get(method)


def list_methods() -> list[str]:
    return sorted(_HANDLERS.keys())
