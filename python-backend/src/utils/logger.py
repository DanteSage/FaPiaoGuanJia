import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler

from storage.paths import get_logs_dir

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_loggers: dict[str, logging.Logger] = {}
_initialized = False


def _is_production() -> bool:
    return bool(getattr(sys, "frozen", False))


def _resolve_log_level() -> int:
    env_level = (os.environ.get("FAPIAO_LOG_LEVEL") or "").strip().upper()
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARN": logging.WARN,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
    }
    if env_level in level_map:
        return level_map[env_level]
    if _is_production():
        return logging.INFO
    return logging.DEBUG


def _ensure_initialized() -> None:
    global _initialized
    if _initialized:
        return
    _initialized = True

    log_level = _resolve_log_level()
    logs_dir = get_logs_dir()
    os.makedirs(logs_dir, exist_ok=True)

    root = logging.getLogger("fapiao")
    root.setLevel(logging.DEBUG)
    root.handlers.clear()

    file_handler = TimedRotatingFileHandler(
        os.path.join(logs_dir, "app.log"),
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
    root.addHandler(file_handler)

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setLevel(logging.WARNING)
    stderr_handler.setFormatter(logging.Formatter(LOG_FORMAT, LOG_DATE_FORMAT))
    root.addHandler(stderr_handler)

    root.debug("日志系统初始化完成 level=%s", logging.getLevelName(log_level))


def get_logger(name: str) -> logging.Logger:
    _ensure_initialized()
    if name not in _loggers:
        logger = logging.getLogger(f"fapiao.{name}")
        _loggers[name] = logger
    return _loggers[name]
