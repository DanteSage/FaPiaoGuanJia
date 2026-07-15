"""SQLite数据库存储 - 支持10万+数据"""

import json
import os
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple

from .paths import get_db_path as _default_db_path, get_images_dir as _get_images_dir

# 数据库路径
_DB_PATH: Optional[str] = None
_DB_LOCK = threading.Lock()

# 连接池（每线程一个连接）
_thread_local = threading.local()

# Verify screenshot whitelist base directory（含 images/with_url 子目录）
_VERIFY_SCREENSHOT_BASE = os.path.normcase(os.path.realpath(_get_images_dir()))


def _is_path_within_base(path: str, base: str) -> bool:
    """Check whether a path is inside a base directory."""
    try:
        normalized_path = os.path.normcase(os.path.realpath(path))
        normalized_base = os.path.normcase(os.path.realpath(base))
        return os.path.commonpath([normalized_path, normalized_base]) == normalized_base
    except (ValueError, OSError):
        return False


def _safe_delete_verify_screenshot(screenshot_path: Optional[str]) -> bool:
    """Safely delete screenshot files inside images directory only."""
    if not screenshot_path or not isinstance(screenshot_path, str):
        return False
    if not _is_path_within_base(screenshot_path, _VERIFY_SCREENSHOT_BASE):
        return False
    try:
        if os.path.exists(screenshot_path):
            os.remove(screenshot_path)
            return True
    except OSError:
        return False
    return False


def _get_db_path() -> str:
    """获取数据库路径"""
    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = _default_db_path()
    return _DB_PATH


def set_db_path(path: str) -> None:
    """设置数据库路径"""
    global _DB_PATH
    _DB_PATH = path


def _get_connection() -> sqlite3.Connection:
    """获取当前线程的数据库连接"""
    if not hasattr(_thread_local, "conn") or _thread_local.conn is None:
        conn = sqlite3.connect(_get_db_path(), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # 性能优化：适合10万+数据
        conn.execute("PRAGMA journal_mode=WAL")  # WAL模式，并发读写
        conn.execute("PRAGMA synchronous=NORMAL")  # 平衡性能和安全
        conn.execute("PRAGMA cache_size=-16000")  # 16MB缓存
        conn.execute("PRAGMA temp_store=MEMORY")  # 临时表存内存
        conn.execute("PRAGMA mmap_size=67108864")  # 64MB内存映射
        _thread_local.conn = conn
    return _thread_local.conn


@contextmanager
def _transaction():
    """事务上下文管理器"""
    conn = _get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


_COLUMN_LINE_RE = re.compile(
    r"^\s*(\w+)\s+(TEXT|INTEGER|REAL|BLOB)\s*([^,\n]*?)\s*,?\s*(?:--.*)?\s*$",
    re.IGNORECASE,
)

_SAFE_COL_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
_SAFE_COL_DEF_RE = re.compile(r"^(TEXT|INTEGER|REAL|BLOB)(\s+(UNIQUE|NOT\s+NULL|DEFAULT\s+\S+))*$")

_INVOICES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE,
    invoice_code TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    amount REAL,
    tax_amount REAL,
    total_amount REAL,
    buyer_name TEXT,
    buyer_tax_id TEXT,
    seller_name TEXT,
    seller_tax_id TEXT,
    invoice_type TEXT,
    category TEXT,
    file_path TEXT,
    file_name TEXT,
    file_type TEXT,
    file_ext TEXT,
    file_size INTEGER,
    file_hash TEXT,
    folder_id TEXT,
    tag_ids TEXT,
    is_verified INTEGER DEFAULT 0,
    is_reimbursed INTEGER DEFAULT 0,
    is_expired INTEGER DEFAULT 0,
    ocr_result TEXT,
    notes TEXT,
    extra_data TEXT,
    status INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);
"""

_VERIFY_HISTORY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS verify_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    fpdm TEXT,
    fphm TEXT NOT NULL,
    kprq TEXT NOT NULL,
    check_code TEXT,
    amount TEXT,
    success INTEGER NOT NULL,
    error_message TEXT,
    result_data TEXT,
    invoice_uid TEXT,
    verify_mode TEXT DEFAULT 'api',
    screenshot_path TEXT,
    created_at INTEGER NOT NULL
);
"""


def _parse_table_columns(create_table_sql: str) -> Dict[str, str]:
    cols: Dict[str, str] = {}
    for line in create_table_sql.strip().splitlines():
        line = line.strip().rstrip(",")
        match = _COLUMN_LINE_RE.match(line)
        if not match:
            continue
        col_name = match.group(1).lower()
        if col_name in ("id",):
            continue
        col_type = match.group(2).upper()
        col_extra = (match.group(3) or "").strip()
        parts = [col_type]
        if col_extra:
            parts.append(col_extra)
        cols[col_name] = " ".join(parts)
    return cols


def _get_invoices_column_defs() -> Dict[str, str]:
    return _parse_table_columns(_INVOICES_TABLE_SQL)


def _get_verify_history_column_defs() -> Dict[str, str]:
    return _parse_table_columns(_VERIFY_HISTORY_TABLE_SQL)


def _is_safe_column_identifier(name: str, definition: str) -> bool:
    if not _SAFE_COL_NAME_RE.match(name):
        return False
    if not _SAFE_COL_DEF_RE.match(definition):
        return False
    return True


def _migrate_db(conn: sqlite3.Connection) -> None:
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'")
    if not cursor.fetchone():
        return

    cursor = conn.execute("PRAGMA table_info(invoices)")
    existing_cols = {row[1] for row in cursor.fetchall()}

    column_defs = _get_invoices_column_defs()
    for col_name, col_def in column_defs.items():
        if col_name not in existing_cols:
            if not _is_safe_column_identifier(col_name, col_def):
                continue
            try:
                conn.execute(f"ALTER TABLE invoices ADD COLUMN {col_name} {col_def}")
            except sqlite3.OperationalError:
                pass

    conn.commit()


def _migrate_verify_history(conn: sqlite3.Connection) -> None:
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='verify_history'"
    )
    if not cursor.fetchone():
        return

    cursor = conn.execute("PRAGMA table_info(verify_history)")
    existing_cols = {row[1] for row in cursor.fetchall()}

    column_defs = _get_verify_history_column_defs()
    for col_name, col_def in column_defs.items():
        if col_name not in existing_cols:
            if not _is_safe_column_identifier(col_name, col_def):
                continue
            try:
                conn.execute(f"ALTER TABLE verify_history ADD COLUMN {col_name} {col_def}")
            except sqlite3.OperationalError:
                pass

    conn.commit()


def _migrate_unique_index(conn: sqlite3.Connection) -> None:
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_code_number_unique'"
    )
    if cursor.fetchone():
        return

    # 清洗历史重复数据，只保留id最小的
    conn.execute(
        """
        DELETE FROM invoices
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM invoices
            GROUP BY invoice_code, invoice_number
        )
        AND invoice_code IS NOT NULL AND invoice_code != ''
        AND invoice_number IS NOT NULL AND invoice_number != ''
        """
    )

    # 建立唯一索引
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_code_number_unique 
        ON invoices(invoice_code, invoice_number)
        WHERE invoice_code IS NOT NULL AND invoice_code != '' 
          AND invoice_number IS NOT NULL AND invoice_number != ''
        """
    )
    conn.commit()


def init_db() -> None:
    """初始化数据库表结构"""
    conn = _get_connection()

    # 先执行迁移（添加缺失的列）
    _migrate_db(conn)
    _migrate_verify_history(conn)
    _migrate_unique_index(conn)

    conn.executescript(
        """
        -- 发票主表
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE,             -- 前端使用的唯一ID
            invoice_code TEXT,           -- 发票代码
            invoice_number TEXT,         -- 发票号码
            invoice_date TEXT,           -- 开票日期
            amount REAL,                 -- 金额（不含税）
            tax_amount REAL,             -- 税额
            total_amount REAL,           -- 价税合计
            buyer_name TEXT,             -- 购买方名称
            buyer_tax_id TEXT,           -- 购买方税号
            seller_name TEXT,            -- 销售方名称
            seller_tax_id TEXT,          -- 销售方税号
            invoice_type TEXT,           -- 发票类型
            category TEXT,               -- 发票分类
            file_path TEXT,              -- 文件路径
            file_name TEXT,              -- 文件名
            file_type TEXT,              -- 文件类型 (pdf/ofd/image/xml)
            file_ext TEXT,               -- 文件扩展名
            file_size INTEGER,           -- 文件大小
            file_hash TEXT,              -- 文件哈希（去重用）
            folder_id TEXT,              -- 所属文件夹ID
            tag_ids TEXT,                -- 标签ID列表（JSON数组）
            is_verified INTEGER DEFAULT 0,   -- 是否已验真
            is_reimbursed INTEGER DEFAULT 0, -- 是否已报销
            is_expired INTEGER DEFAULT 0,    -- 是否过期
            ocr_result TEXT,             -- OCR识别结果（JSON）
            notes TEXT,                  -- 备注
            extra_data TEXT,             -- 扩展数据（JSON）
            status INTEGER DEFAULT 0,    -- 状态：0=正常 1=已报销 2=已作废
            created_at INTEGER,          -- 创建时间（时间戳）
            updated_at INTEGER           -- 更新时间（时间戳）
        );

        -- 查验记录表
        CREATE TABLE IF NOT EXISTS verify_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,    -- 前端使用的唯一ID
            fpdm TEXT,                   -- 发票代码（全电发票可为空）
            fphm TEXT NOT NULL,          -- 发票号码
            kprq TEXT NOT NULL,          -- 开票日期
            check_code TEXT,             -- 校验码
            amount TEXT,                 -- 金额
            success INTEGER NOT NULL,     -- 查验是否成功
            error_message TEXT,          -- 错误信息（如失败）
            result_data TEXT,            -- 查验结果详情（JSON）
            invoice_uid TEXT,            -- 关联的发票UID（如有）
            verify_mode TEXT DEFAULT 'api',  -- 验真方式：api / rpa
            screenshot_path TEXT,        -- RPA 查验结果截图路径
            created_at INTEGER NOT NULL  -- 查验时间
        );

        -- 查验记录索引
        CREATE INDEX IF NOT EXISTS idx_verify_history_fphm ON verify_history(fphm);
        CREATE INDEX IF NOT EXISTS idx_verify_history_created ON verify_history(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_verify_history_mode ON verify_history(verify_mode);
        
        -- 文件夹表
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,    -- 前端使用的唯一ID
            name TEXT NOT NULL,          -- 文件夹名称
            parent_id TEXT,              -- 父文件夹ID
            icon TEXT,                   -- 图标
            color TEXT,                  -- 颜色
            created_at INTEGER,          -- 创建时间
            updated_at INTEGER           -- 更新时间
        );
        
        -- 标签表
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,    -- 前端使用的唯一ID
            name TEXT NOT NULL,          -- 标签名称
            color TEXT                   -- 颜色
        );
        
        -- 索引：按发票号码查询（最常用）
        CREATE INDEX IF NOT EXISTS idx_invoice_number ON invoices(invoice_number);
        
        -- 索引：按发票代码+号码联合查询
        CREATE INDEX IF NOT EXISTS idx_code_number ON invoices(invoice_code, invoice_number);
        
        -- 索引：按日期范围查询
        CREATE INDEX IF NOT EXISTS idx_invoice_date ON invoices(invoice_date);
        
        -- 索引：按购买方查询
        CREATE INDEX IF NOT EXISTS idx_buyer_name ON invoices(buyer_name);
        
        -- 索引：按销售方查询
        CREATE INDEX IF NOT EXISTS idx_seller_name ON invoices(seller_name);
        
        -- 索引：按文件哈希去重
        CREATE UNIQUE INDEX IF NOT EXISTS idx_file_hash ON invoices(file_hash) WHERE file_hash IS NOT NULL;
        
        -- 索引：按状态筛选
        CREATE INDEX IF NOT EXISTS idx_status ON invoices(status);
        
        -- 索引：按金额范围查询
        CREATE INDEX IF NOT EXISTS idx_total_amount ON invoices(total_amount);
        
        -- 索引：按UID查询
        CREATE INDEX IF NOT EXISTS idx_invoice_uid ON invoices(uid);
        
        -- 索引：按文件夹ID查询
        CREATE INDEX IF NOT EXISTS idx_folder_id ON invoices(folder_id);
        
        -- 索引：按分类查询
        CREATE INDEX IF NOT EXISTS idx_category ON invoices(category);
        
        -- 索引：文件夹UID
        CREATE INDEX IF NOT EXISTS idx_folder_uid ON folders(uid);
        
        -- 索引：标签UID
        CREATE INDEX IF NOT EXISTS idx_tag_uid ON tags(uid);
    """
    )
    conn.commit()


def close_db() -> None:
    """关闭当前线程的数据库连接"""
    if hasattr(_thread_local, "conn") and _thread_local.conn is not None:
        _thread_local.conn.close()
        _thread_local.conn = None


def insert_invoice(data: Dict[str, Any]) -> int:
    """插入单条发票记录，返回ID"""
    now = int(time.time() * 1000)
    extra = data.get("extra_data")
    if extra and isinstance(extra, dict):
        extra = json.dumps(extra, ensure_ascii=False)

    with _transaction() as conn:
        cursor = conn.execute(
            """
            INSERT INTO invoices (
                invoice_code, invoice_number, invoice_date,
                amount, tax_amount, total_amount,
                buyer_name, buyer_tax_id, seller_name, seller_tax_id,
                invoice_type, file_path, file_hash, ocr_result, extra_data,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                data.get("invoice_code"),
                data.get("invoice_number"),
                data.get("invoice_date"),
                data.get("amount"),
                data.get("tax_amount"),
                data.get("total_amount"),
                data.get("buyer_name"),
                data.get("buyer_tax_id"),
                data.get("seller_name"),
                data.get("seller_tax_id"),
                data.get("invoice_type"),
                data.get("file_path"),
                data.get("file_hash"),
                data.get("ocr_result"),
                extra,
                data.get("status", 0),
                now,
                now,
            ),
        )
        return cursor.lastrowid


def batch_insert_invoices(data_list: List[Dict[str, Any]], batch_size: int = 1000) -> int:
    """批量插入发票记录（优化10万+数据插入）

    Args:
        data_list: 发票数据列表
        batch_size: 每批插入数量，默认1000条

    Returns:
        插入成功的总数量
    """
    if not data_list:
        return 0

    now = int(time.time() * 1000)
    total_inserted = 0

    conn = _get_connection()

    for i in range(0, len(data_list), batch_size):
        batch = data_list[i : i + batch_size]
        rows = []
        for data in batch:
            extra = data.get("extra_data")
            if extra and isinstance(extra, dict):
                extra = json.dumps(extra, ensure_ascii=False)
            rows.append(
                (
                    data.get("invoice_code"),
                    data.get("invoice_number"),
                    data.get("invoice_date"),
                    data.get("amount"),
                    data.get("tax_amount"),
                    data.get("total_amount"),
                    data.get("buyer_name"),
                    data.get("buyer_tax_id"),
                    data.get("seller_name"),
                    data.get("seller_tax_id"),
                    data.get("invoice_type"),
                    data.get("file_path"),
                    data.get("file_hash"),
                    data.get("ocr_result"),
                    extra,
                    data.get("status", 0),
                    now,
                    now,
                )
            )

        with _transaction() as txn_conn:
            txn_conn.executemany(
                """
                INSERT OR IGNORE INTO invoices (
                    invoice_code, invoice_number, invoice_date,
                    amount, tax_amount, total_amount,
                    buyer_name, buyer_tax_id, seller_name, seller_tax_id,
                    invoice_type, file_path, file_hash, ocr_result, extra_data,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                rows,
            )
        total_inserted += len(batch)

    return total_inserted


def get_invoice(invoice_id: int) -> Optional[Dict[str, Any]]:
    """根据ID获取发票"""
    conn = _get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
    return _row_to_dict(row) if row else None


def get_invoices(
    offset: int = 0,
    limit: int = 100,
    status: Optional[int] = None,
    order_by: str = "id",
    desc: bool = True,
) -> Tuple[List[Dict[str, Any]], int]:
    """分页获取发票列表

    Returns:
        (发票列表, 总数量)
    """
    conn = _get_connection()

    # 构建查询条件
    where_clause = ""
    params: List[Any] = []
    if status is not None:
        where_clause = "WHERE status = ?"
        params.append(status)

    # 查询总数
    count_sql = f"SELECT COUNT(*) FROM invoices {where_clause}"
    total = conn.execute(count_sql, params).fetchone()[0]

    # 查询数据
    order = "DESC" if desc else "ASC"
    allowed_order_cols = {"id", "invoice_date", "total_amount", "created_at", "invoice_number"}
    if order_by not in allowed_order_cols:
        order_by = "id"

    data_sql = f"""
        SELECT * FROM invoices {where_clause}
        ORDER BY {order_by} {order}
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    rows = conn.execute(data_sql, params).fetchall()

    return [_row_to_dict(row) for row in rows], total


def search_invoices(
    keyword: Optional[str] = None,
    invoice_code: Optional[str] = None,
    invoice_number: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    buyer_name: Optional[str] = None,
    seller_name: Optional[str] = None,
    status: Optional[int] = None,
    offset: int = 0,
    limit: int = 100,
) -> Tuple[List[Dict[str, Any]], int]:
    """搜索发票（支持多条件组合）"""
    conn = _get_connection()

    conditions = []
    params: List[Any] = []

    if keyword:
        conditions.append(
            """
            (invoice_number LIKE ? OR buyer_name LIKE ? OR seller_name LIKE ? OR ocr_result LIKE ?)
        """
        )
        kw = f"%{keyword}%"
        params.extend([kw, kw, kw, kw])

    if invoice_code:
        conditions.append("invoice_code = ?")
        params.append(invoice_code)

    if invoice_number:
        conditions.append("invoice_number LIKE ?")
        params.append(f"%{invoice_number}%")

    if date_from:
        conditions.append("invoice_date >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("invoice_date <= ?")
        params.append(date_to)

    if amount_min is not None:
        conditions.append("total_amount >= ?")
        params.append(amount_min)

    if amount_max is not None:
        conditions.append("total_amount <= ?")
        params.append(amount_max)

    if buyer_name:
        conditions.append("buyer_name LIKE ?")
        params.append(f"%{buyer_name}%")

    if seller_name:
        conditions.append("seller_name LIKE ?")
        params.append(f"%{seller_name}%")

    if status is not None:
        conditions.append("status = ?")
        params.append(status)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    # 查询总数
    count_sql = f"SELECT COUNT(*) FROM invoices {where_clause}"
    total = conn.execute(count_sql, params).fetchone()[0]

    # 查询数据
    data_sql = f"""
        SELECT * FROM invoices {where_clause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    rows = conn.execute(data_sql, params).fetchall()

    return [_row_to_dict(row) for row in rows], total


def update_invoice(invoice_id: int, data: Dict[str, Any]) -> bool:
    """更新发票记录"""
    allowed_fields = {
        "invoice_code",
        "invoice_number",
        "invoice_date",
        "amount",
        "tax_amount",
        "total_amount",
        "buyer_name",
        "buyer_tax_id",
        "seller_name",
        "seller_tax_id",
        "invoice_type",
        "file_path",
        "file_hash",
        "ocr_result",
        "extra_data",
        "status",
    }

    updates = []
    params = []
    for key, value in data.items():
        if key in allowed_fields:
            if key == "extra_data" and isinstance(value, dict):
                value = json.dumps(value, ensure_ascii=False)
            updates.append(f"{key} = ?")
            params.append(value)

    if not updates:
        return False

    updates.append("updated_at = ?")
    params.append(int(time.time() * 1000))
    params.append(invoice_id)

    with _transaction() as conn:
        cursor = conn.execute(f"UPDATE invoices SET {', '.join(updates)} WHERE id = ?", params)
        return cursor.rowcount > 0


def delete_invoice(invoice_id: int) -> bool:
    """删除发票记录"""
    with _transaction() as conn:
        cursor = conn.execute("DELETE FROM invoices WHERE id = ?", (invoice_id,))
        return cursor.rowcount > 0


def get_invoice_count(status: Optional[int] = None) -> int:
    """获取发票总数"""
    conn = _get_connection()
    if status is not None:
        return conn.execute("SELECT COUNT(*) FROM invoices WHERE status = ?", (status,)).fetchone()[
            0
        ]
    return conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    """将sqlite3.Row转换为字典"""
    d = dict(row)
    # 解析extra_data JSON
    if d.get("extra_data"):
        try:
            d["extra_data"] = json.loads(d["extra_data"])
        except (json.JSONDecodeError, TypeError):
            pass
    # 解析ocr_result JSON
    if d.get("ocr_result"):
        try:
            d["ocr_result"] = json.loads(d["ocr_result"])
        except (json.JSONDecodeError, TypeError):
            pass
    # 解析tag_ids JSON
    if d.get("tag_ids"):
        try:
            d["tag_ids"] = json.loads(d["tag_ids"])
        except (json.JSONDecodeError, TypeError):
            d["tag_ids"] = []
    else:
        d["tag_ids"] = []
    return d


def _invoice_row_to_archived(row: sqlite3.Row) -> Dict[str, Any]:
    """将发票行转换为前端 ArchivedInvoice 格式"""
    d = _row_to_dict(row)
    return {
        "id": d.get("uid") or str(d.get("id")),
        "filePath": d.get("file_path", ""),
        "fileName": d.get("file_name", ""),
        "fileType": d.get("file_type", "unknown"),
        "fileExt": d.get("file_ext", ""),
        "fileSize": d.get("file_size"),
        "invoiceCode": d.get("invoice_code"),
        "invoiceNumber": d.get("invoice_number"),
        "invoiceDate": d.get("invoice_date"),
        "amount": d.get("amount"),
        "taxAmount": d.get("tax_amount"),
        "totalAmount": d.get("total_amount"),
        "sellerName": d.get("seller_name"),
        "buyerName": d.get("buyer_name"),
        "category": d.get("category", "other"),
        "folderId": d.get("folder_id"),
        "tagIds": d.get("tag_ids", []),
        "isVerified": bool(d.get("is_verified")),
        "isReimbursed": bool(d.get("is_reimbursed")),
        "isExpired": bool(d.get("is_expired")),
        "ocrResult": d.get("ocr_result"),
        "notes": d.get("notes"),
        "createdAt": d.get("created_at", 0),
        "updatedAt": d.get("updated_at", 0),
    }


# ============= 归档发票完整 CRUD =============


def insert_archived_invoice(data: Dict[str, Any]) -> str:
    """插入归档发票，返回UID"""
    now = int(time.time() * 1000)
    uid = data.get("id") or f"{now}_{os.urandom(4).hex()}"

    ocr_result = data.get("ocrResult")
    if ocr_result and isinstance(ocr_result, dict):
        ocr_result = json.dumps(ocr_result, ensure_ascii=False)

    tag_ids = data.get("tagIds", [])
    if isinstance(tag_ids, list):
        tag_ids = json.dumps(tag_ids, ensure_ascii=False)

    with _transaction() as conn:
        conn.execute(
            """
            INSERT INTO invoices (
                uid, invoice_code, invoice_number, invoice_date,
                amount, tax_amount, total_amount,
                buyer_name, seller_name, category,
                file_path, file_name, file_type, file_ext, file_size, file_hash,
                folder_id, tag_ids, is_verified, is_reimbursed, is_expired,
                ocr_result, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                uid,
                data.get("invoiceCode"),
                data.get("invoiceNumber"),
                data.get("invoiceDate"),
                data.get("amount"),
                data.get("taxAmount"),
                data.get("totalAmount"),
                data.get("buyerName"),
                data.get("sellerName"),
                data.get("category", "other"),
                data.get("filePath"),
                data.get("fileName"),
                data.get("fileType"),
                data.get("fileExt"),
                data.get("fileSize"),
                data.get("fileHash"),
                data.get("folderId"),
                tag_ids,
                1 if data.get("isVerified") else 0,
                1 if data.get("isReimbursed") else 0,
                1 if data.get("isExpired") else 0,
                ocr_result,
                data.get("notes"),
                data.get("createdAt", now),
                data.get("updatedAt", now),
            ),
        )
    return uid


def get_archived_invoice(uid: str) -> Optional[Dict[str, Any]]:
    """根据UID获取归档发票"""
    conn = _get_connection()
    row = conn.execute("SELECT * FROM invoices WHERE uid = ?", (uid,)).fetchone()
    return _invoice_row_to_archived(row) if row else None


def get_all_archived_invoices() -> List[Dict[str, Any]]:
    """获取所有归档发票"""
    conn = _get_connection()
    rows = conn.execute("SELECT * FROM invoices ORDER BY created_at DESC").fetchall()
    return [_invoice_row_to_archived(row) for row in rows]


def update_archived_invoice(uid: str, data: Dict[str, Any]) -> bool:
    """更新归档发票"""
    now = int(time.time() * 1000)

    # 可更新的字段映射
    field_map = {
        "invoiceCode": "invoice_code",
        "invoiceNumber": "invoice_number",
        "invoiceDate": "invoice_date",
        "amount": "amount",
        "taxAmount": "tax_amount",
        "totalAmount": "total_amount",
        "buyerName": "buyer_name",
        "sellerName": "seller_name",
        "category": "category",
        "filePath": "file_path",
        "fileName": "file_name",
        "fileType": "file_type",
        "fileExt": "file_ext",
        "fileSize": "file_size",
        "folderId": "folder_id",
        "isVerified": "is_verified",
        "isReimbursed": "is_reimbursed",
        "isExpired": "is_expired",
        "notes": "notes",
    }

    updates = []
    params = []

    for js_key, db_key in field_map.items():
        if js_key in data:
            value = data[js_key]
            if js_key in ("isVerified", "isReimbursed", "isExpired"):
                value = 1 if value else 0
            updates.append(f"{db_key} = ?")
            params.append(value)

    # 特殊处理 tagIds
    if "tagIds" in data:
        tag_ids = data["tagIds"]
        if isinstance(tag_ids, list):
            tag_ids = json.dumps(tag_ids, ensure_ascii=False)
        updates.append("tag_ids = ?")
        params.append(tag_ids)

    # 特殊处理 ocrResult
    if "ocrResult" in data:
        ocr_result = data["ocrResult"]
        if isinstance(ocr_result, dict):
            ocr_result = json.dumps(ocr_result, ensure_ascii=False)
        updates.append("ocr_result = ?")
        params.append(ocr_result)

    if not updates:
        return False

    updates.append("updated_at = ?")
    params.append(now)
    params.append(uid)

    with _transaction() as conn:
        cursor = conn.execute(f"UPDATE invoices SET {', '.join(updates)} WHERE uid = ?", params)
        return cursor.rowcount > 0


def delete_archived_invoice(uid: str) -> bool:
    """删除归档发票"""
    with _transaction() as conn:
        cursor = conn.execute("DELETE FROM invoices WHERE uid = ?", (uid,))
        return cursor.rowcount > 0


def batch_delete_archived_invoices(uids: List[str]) -> int:
    """批量删除归档发票"""
    if not uids:
        return 0
    placeholders = ",".join("?" * len(uids))
    with _transaction() as conn:
        cursor = conn.execute(f"DELETE FROM invoices WHERE uid IN ({placeholders})", uids)
        return cursor.rowcount


def check_invoice_duplicate(
    file_path: Optional[str] = None,
    invoice_code: Optional[str] = None,
    invoice_number: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """检查发票是否重复"""
    conn = _get_connection()

    # 按发票代码+号码检查
    if invoice_code and invoice_number:
        row = conn.execute(
            "SELECT * FROM invoices WHERE invoice_code = ? AND invoice_number = ?",
            (invoice_code, invoice_number),
        ).fetchone()
        if row:
            return _invoice_row_to_archived(row)

    # 按文件路径检查
    if file_path:
        row = conn.execute("SELECT * FROM invoices WHERE file_path = ?", (file_path,)).fetchone()
        if row:
            return _invoice_row_to_archived(row)

    return None


# ============= 文件夹 CRUD =============


def insert_folder(data: Dict[str, Any]) -> str:
    """插入文件夹，返回UID"""
    now = int(time.time() * 1000)
    uid = data.get("id") or f"f_{now}_{os.urandom(4).hex()}"

    with _transaction() as conn:
        conn.execute(
            """
            INSERT INTO folders (uid, name, parent_id, icon, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                uid,
                data.get("name", "新建文件夹"),
                data.get("parentId"),
                data.get("icon"),
                data.get("color"),
                data.get("createdAt", now),
                data.get("updatedAt", now),
            ),
        )
    return uid


def get_all_folders() -> List[Dict[str, Any]]:
    """获取所有文件夹"""
    conn = _get_connection()
    rows = conn.execute("SELECT * FROM folders ORDER BY created_at ASC").fetchall()
    return [
        {
            "id": row["uid"],
            "name": row["name"],
            "parentId": row["parent_id"],
            "icon": row["icon"],
            "color": row["color"],
            "createdAt": row["created_at"] or 0,
            "updatedAt": row["updated_at"] or 0,
        }
        for row in rows
    ]


def update_folder(uid: str, data: Dict[str, Any]) -> bool:
    """更新文件夹"""
    now = int(time.time() * 1000)
    updates = []
    params = []

    if "name" in data:
        updates.append("name = ?")
        params.append(data["name"])
    if "parentId" in data:
        updates.append("parent_id = ?")
        params.append(data["parentId"])
    if "icon" in data:
        updates.append("icon = ?")
        params.append(data["icon"])
    if "color" in data:
        updates.append("color = ?")
        params.append(data["color"])

    if not updates:
        return False

    updates.append("updated_at = ?")
    params.append(now)
    params.append(uid)

    with _transaction() as conn:
        cursor = conn.execute(f"UPDATE folders SET {', '.join(updates)} WHERE uid = ?", params)
        return cursor.rowcount > 0


def delete_folder(uid: str) -> bool:
    """删除文件夹（同时清空该文件夹下发票的folder_id）"""
    with _transaction() as conn:
        # 将该文件夹下的发票移到未分类
        conn.execute("UPDATE invoices SET folder_id = NULL WHERE folder_id = ?", (uid,))
        cursor = conn.execute("DELETE FROM folders WHERE uid = ?", (uid,))
        return cursor.rowcount > 0


# ============= 标签 CRUD =============


def insert_tag(data: Dict[str, Any]) -> str:
    """插入标签，返回UID"""
    now = int(time.time() * 1000)
    uid = data.get("id") or f"t_{now}_{os.urandom(4).hex()}"

    with _transaction() as conn:
        conn.execute(
            """
            INSERT INTO tags (uid, name, color)
            VALUES (?, ?, ?)
        """,
            (
                uid,
                data.get("name", "新标签"),
                data.get("color", "#6aa6ff"),
            ),
        )
    return uid


def get_all_tags() -> List[Dict[str, Any]]:
    """获取所有标签"""
    conn = _get_connection()
    rows = conn.execute("SELECT * FROM tags ORDER BY id ASC").fetchall()
    return [
        {
            "id": row["uid"],
            "name": row["name"],
            "color": row["color"],
        }
        for row in rows
    ]


def update_tag(uid: str, data: Dict[str, Any]) -> bool:
    """更新标签"""
    updates = []
    params = []

    if "name" in data:
        updates.append("name = ?")
        params.append(data["name"])
    if "color" in data:
        updates.append("color = ?")
        params.append(data["color"])

    if not updates:
        return False

    params.append(uid)

    with _transaction() as conn:
        cursor = conn.execute(f"UPDATE tags SET {', '.join(updates)} WHERE uid = ?", params)
        return cursor.rowcount > 0


def delete_tag(uid: str) -> bool:
    """删除标签（同时从所有发票的tag_ids中移除）"""
    conn = _get_connection()

    # 获取所有包含该标签的发票
    rows = conn.execute(
        "SELECT uid, tag_ids FROM invoices WHERE tag_ids LIKE ?", (f'%"{uid}"%',)
    ).fetchall()

    with _transaction() as conn:
        # 从每个发票的tag_ids中移除该标签
        for row in rows:
            try:
                tag_ids = json.loads(row["tag_ids"] or "[]")
                if uid in tag_ids:
                    tag_ids.remove(uid)
                    conn.execute(
                        "UPDATE invoices SET tag_ids = ? WHERE uid = ?",
                        (json.dumps(tag_ids), row["uid"]),
                    )
            except (json.JSONDecodeError, TypeError):
                pass

        cursor = conn.execute("DELETE FROM tags WHERE uid = ?", (uid,))
        return cursor.rowcount > 0


# ============= 批量操作 =============


def move_invoices_to_folder(invoice_uids: List[str], folder_id: Optional[str]) -> int:
    """将多个发票移动到指定文件夹"""
    if not invoice_uids:
        return 0
    now = int(time.time() * 1000)
    placeholders = ",".join("?" * len(invoice_uids))
    with _transaction() as conn:
        cursor = conn.execute(
            f"UPDATE invoices SET folder_id = ?, updated_at = ? WHERE uid IN ({placeholders})",
            [folder_id, now] + invoice_uids,
        )
        return cursor.rowcount


def add_tags_to_invoices(invoice_uids: List[str], tag_ids: List[str]) -> int:
    """为多个发票添加标签"""
    if not invoice_uids or not tag_ids:
        return 0

    now = int(time.time() * 1000)
    updated = 0

    with _transaction() as conn:
        for uid in invoice_uids:
            row = conn.execute("SELECT tag_ids FROM invoices WHERE uid = ?", (uid,)).fetchone()
            if row:
                try:
                    current_tags = json.loads(row["tag_ids"] or "[]")
                except (json.JSONDecodeError, TypeError):
                    current_tags = []

                # 合并标签（去重）
                new_tags = list(set(current_tags + tag_ids))
                conn.execute(
                    "UPDATE invoices SET tag_ids = ?, updated_at = ? WHERE uid = ?",
                    (json.dumps(new_tags), now, uid),
                )
                updated += 1

    return updated


def remove_tags_from_invoices(invoice_uids: List[str], tag_ids: List[str]) -> int:
    """从多个发票移除标签"""
    if not invoice_uids or not tag_ids:
        return 0

    now = int(time.time() * 1000)
    updated = 0

    with _transaction() as conn:
        for uid in invoice_uids:
            row = conn.execute("SELECT tag_ids FROM invoices WHERE uid = ?", (uid,)).fetchone()
            if row:
                try:
                    current_tags = json.loads(row["tag_ids"] or "[]")
                except (json.JSONDecodeError, TypeError):
                    current_tags = []

                # 移除指定标签
                new_tags = [t for t in current_tags if t not in tag_ids]
                conn.execute(
                    "UPDATE invoices SET tag_ids = ?, updated_at = ? WHERE uid = ?",
                    (json.dumps(new_tags), now, uid),
                )
                updated += 1

    return updated


def get_archive_statistics() -> Dict[str, Any]:
    """获取归档统计信息"""
    conn = _get_connection()

    # 总数
    total = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]

    # 总金额
    total_amount = conn.execute("SELECT COALESCE(SUM(total_amount), 0) FROM invoices").fetchone()[0]

    # 已验真数量
    verified_count = conn.execute("SELECT COUNT(*) FROM invoices WHERE is_verified = 1").fetchone()[
        0
    ]

    # 已报销数量
    reimbursed_count = conn.execute(
        "SELECT COUNT(*) FROM invoices WHERE is_reimbursed = 1"
    ).fetchone()[0]

    # 按分类统计
    rows = conn.execute(
        "SELECT category, COUNT(*) as cnt FROM invoices GROUP BY category"
    ).fetchall()
    category_stats = {row["category"]: row["cnt"] for row in rows}

    return {
        "total": total,
        "totalAmount": total_amount,
        "verifiedCount": verified_count,
        "reimbursedCount": reimbursed_count,
        "categoryStats": category_stats,
    }


# ============= 查验记录 CRUD =============


def insert_verify_history(data: Dict[str, Any]) -> str:
    """插入查验记录，返回UID"""
    now = int(time.time() * 1000)
    uid = data.get("id") or f"vh_{now}_{os.urandom(4).hex()}"

    result_data = data.get("resultData")
    if result_data and isinstance(result_data, dict):
        result_data = json.dumps(result_data, ensure_ascii=False)

    verify_mode = data.get("verifyMode", "api")
    if verify_mode not in ("api", "rpa"):
        verify_mode = "api"

    with _transaction() as conn:
        conn.execute(
            """
            INSERT INTO verify_history (
                uid, fpdm, fphm, kprq, check_code, amount,
                success, error_message, result_data, invoice_uid,
                verify_mode, screenshot_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                uid,
                data.get("fpdm"),
                data.get("fphm"),
                data.get("kprq"),
                data.get("checkCode"),
                data.get("amount"),
                1 if data.get("success") else 0,
                data.get("errorMessage"),
                result_data,
                data.get("invoiceUid"),
                verify_mode,
                data.get("screenshotPath"),
                data.get("createdAt", now),
            ),
        )
    return uid


def get_all_verify_history(
    limit: int = 100, offset: int = 0, verify_mode: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], int]:
    """获取查验记录（分页），可按验真方式过滤"""
    conn = _get_connection()

    where = ""
    params: list = []
    if verify_mode and verify_mode in ("api", "rpa"):
        where = " WHERE verify_mode = ?"
        params.append(verify_mode)

    # 查询总数
    total = conn.execute(f"SELECT COUNT(*) FROM verify_history{where}", params).fetchone()[0]

    # 查询数据
    rows = conn.execute(
        f"""
        SELECT * FROM verify_history{where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """,
        params + [limit, offset],
    ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        # snake_case -> camelCase
        record = {
            "uid": d["uid"],
            "fpdm": d.get("fpdm"),
            "fphm": d.get("fphm"),
            "kprq": d.get("kprq"),
            "checkCode": d.get("check_code"),
            "amount": d.get("amount"),
            "success": bool(d.get("success")),
            "errorMessage": d.get("error_message"),
            "invoiceUid": d.get("invoice_uid"),
            "verifyMode": d.get("verify_mode", "api"),
            "screenshotPath": d.get("screenshot_path"),
            "createdAt": d.get("created_at"),
        }
        raw = d.get("result_data")
        if raw:
            try:
                record["resultData"] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                record["resultData"] = None
        result.append(record)

    return result, total


def get_verify_history_by_id(uid: str) -> Optional[Dict[str, Any]]:
    """根据UID获取查验记录"""
    conn = _get_connection()
    row = conn.execute("SELECT * FROM verify_history WHERE uid = ?", (uid,)).fetchone()

    if not row:
        return None

    d = dict(row)
    if d.get("result_data"):
        try:
            d["resultData"] = json.loads(d["result_data"])
        except (json.JSONDecodeError, TypeError):
            d["resultData"] = None
    d.pop("result_data", None)
    d["success"] = bool(d["success"])
    return d


def delete_verify_history(uid: str) -> bool:
    """删除查验记录（包括截图文件）"""
    conn = _get_connection()
    # 获取截图路径
    row = conn.execute(
        "SELECT screenshot_path FROM verify_history WHERE uid = ?", (uid,)
    ).fetchone()
    screenshot_path = row[0] if row and row[0] else None

    with _transaction() as conn:
        cursor = conn.execute("DELETE FROM verify_history WHERE uid = ?", (uid,))
        success = cursor.rowcount > 0

    # 删除截图文件
    if success and screenshot_path:
        _safe_delete_verify_screenshot(screenshot_path)

    return success


def batch_delete_verify_history(uids: List[str]) -> int:
    """批量删除查验记录（包括截图文件）"""
    if not uids:
        return 0

    conn = _get_connection()
    # 获取所有截图路径
    placeholders = ",".join("?" * len(uids))
    rows = conn.execute(
        f"SELECT screenshot_path FROM verify_history WHERE uid IN ({placeholders}) AND screenshot_path IS NOT NULL",
        uids,
    ).fetchall()
    screenshot_paths = [row[0] for row in rows if row[0]]

    with _transaction() as conn:
        cursor = conn.execute(f"DELETE FROM verify_history WHERE uid IN ({placeholders})", uids)
        count = cursor.rowcount

    # 删除截图文件
    import sys

    for path in screenshot_paths:
        if _safe_delete_verify_screenshot(path):
            print(f"[delete screenshot] {path}", file=sys.stderr)

    return count


def clear_verify_history(verify_mode: Optional[str] = None) -> int:
    """清空查验记录（包括截图文件），可按验真方式清空"""
    conn = _get_connection()

    # 获取所有截图路径
    if verify_mode and verify_mode in ("api", "rpa"):
        rows = conn.execute(
            "SELECT screenshot_path FROM verify_history WHERE verify_mode = ? AND screenshot_path IS NOT NULL",
            (verify_mode,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT screenshot_path FROM verify_history WHERE screenshot_path IS NOT NULL"
        ).fetchall()
    screenshot_paths = [row[0] for row in rows if row[0]]

    with _transaction() as conn:
        if verify_mode and verify_mode in ("api", "rpa"):
            cursor = conn.execute(
                "DELETE FROM verify_history WHERE verify_mode = ?", (verify_mode,)
            )
        else:
            cursor = conn.execute("DELETE FROM verify_history")
        count = cursor.rowcount

    # 删除截图文件
    if screenshot_paths:
        for path in screenshot_paths:
            _safe_delete_verify_screenshot(path)

    return count
