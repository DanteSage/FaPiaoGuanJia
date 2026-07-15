from __future__ import annotations

from typing import Any

RPC_CODE_SUCCESS = 0
RPC_CODE_BUSINESS_ERROR = 1
RPC_CODE_SYSTEM_ERROR = 2


class BusinessError(Exception):
    pass


class SystemError_(Exception):
    pass


def ok(**data: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": True, "code": RPC_CODE_SUCCESS}
    payload.update(data)
    return payload


def fail(message: str, code: int = RPC_CODE_BUSINESS_ERROR, **data: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": False, "code": code, "error": message}
    payload.update(data)
    return payload
