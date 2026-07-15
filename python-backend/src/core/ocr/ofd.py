import atexit

import json

import os

from pathlib import Path

import sys

import subprocess

import time

import threading

from collections import deque

from queue import Queue, Empty as QueueEmpty

from typing import Any, Dict, List, Optional


from utils import get_base_path, ensure_outputs_dir, stat_fingerprint


from .pdf import ocr_pdf


SUBPROCESS_FLAGS = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0


class JavaServiceManager:

    STARTUP_TIMEOUT = 30

    REQUEST_TIMEOUT = 120

    def __init__(self):

        self._process: Optional[subprocess.Popen] = None

        self._lock = threading.Lock()

        self._request_id = 0

        self._ready = False

        self._stderr_tail: deque[str] = deque(maxlen=50)

        self._stdout_queue: Queue[Optional[bytes]] = Queue()

        atexit.register(self._cleanup)

    def _cleanup(self):

        proc = self._process

        self._process = None

        self._ready = False

        self._stderr_tail.clear()

        while not self._stdout_queue.empty():
            try:
                self._stdout_queue.get_nowait()
            except QueueEmpty:
                break

        if proc is not None:

            try:

                proc.stdin.close()

            except Exception:

                pass

            try:

                proc.terminate()

                proc.wait(timeout=2)

            except Exception:

                try:

                    proc.kill()

                    proc.wait(timeout=1)

                except Exception:

                    pass

    def _start_stderr_drain(self, proc: subprocess.Popen) -> None:

        def drain_stderr():

            try:

                if not proc.stderr:

                    return

                while True:

                    line = proc.stderr.readline()

                    if not line:

                        break

                    text = line.decode("utf-8", errors="replace").strip()

                    if text:

                        self._stderr_tail.append(text)

            except Exception:

                pass

        threading.Thread(target=drain_stderr, daemon=True).start()

    def _start_stdout_reader(self, proc: subprocess.Popen) -> None:

        stdout_queue = self._stdout_queue

        def read_stdout():

            try:

                if not proc.stdout:
                    stdout_queue.put(None)
                    return

                while True:

                    line = proc.stdout.readline()

                    if not line:
                        stdout_queue.put(None)
                        break

                    stdout_queue.put(line)

            except Exception:

                stdout_queue.put(None)

        threading.Thread(target=read_stdout, daemon=True).start()

    def _build_process_error(self, proc: Optional[subprocess.Popen], default_message: str) -> str:

        parts: List[str] = [default_message]

        if proc is not None:

            return_code = proc.poll()

            if return_code is not None:

                parts.append(f"exit={return_code}")

        if self._stderr_tail:

            parts.append("stderr=" + " | ".join(self._stderr_tail))

        return "；".join(parts)

    def _ensure_started(self) -> subprocess.Popen:

        if self._process is not None and self._process.poll() is None:

            return self._process

        self._cleanup()

        jar = _get_ofdrw_cli_jar()

        java_cmd = _get_java_cmd()

        cmd = [
            java_cmd,
            "-Xms128m",
            "-Xmx1024m",
            "-XX:MaxMetaspaceSize=128m",
            "-XX:+UseSerialGC",
            "-jar",
            jar,
            "--stdio",
        ]

        self._process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=SUBPROCESS_FLAGS,
        )

        proc = self._process

        self._start_stderr_drain(proc)

        self._start_stdout_reader(proc)

        try:

            ready_line = self._stdout_queue.get(timeout=self.STARTUP_TIMEOUT)

        except QueueEmpty:

            ready_line = None

        if not ready_line:

            error_message = self._build_process_error(proc, "Java 服务启动超时或失败")

            self._cleanup()

            raise RuntimeError(error_message)

        try:

            msg = json.loads(ready_line.decode("utf-8").strip())

            if msg.get("type") == "ready":

                self._ready = True

        except Exception:

            pass

        if not self._ready:

            error_message = self._build_process_error(proc, "Java 服务启动失败")

            self._cleanup()

            raise RuntimeError(error_message)

        return self._process

    def _read_response_with_timeout(
        self, proc: subprocess.Popen, timeout: float
    ) -> Optional[bytes]:

        try:
            line = self._stdout_queue.get(timeout=timeout)
            return line
        except QueueEmpty:
            return None

    def call(self, method: str, params: Dict[str, Any]) -> Any:

        with self._lock:

            proc = self._ensure_started()

            self._request_id += 1

            req = {"id": str(self._request_id), "method": method, "params": params}

            req_line = json.dumps(req, ensure_ascii=False) + "\n"

            if not proc.stdin:

                raise RuntimeError("Java 服务输入流不可用")

            proc.stdin.write(req_line.encode("utf-8"))

            proc.stdin.flush()

            resp_line = self._read_response_with_timeout(proc, self.REQUEST_TIMEOUT)

            if not resp_line:

                error_message = self._build_process_error(
                    proc, f"Java 服务无响应或超时（{self.REQUEST_TIMEOUT}秒）"
                )

                self._cleanup()

                raise RuntimeError(error_message)

            resp = json.loads(resp_line.decode("utf-8").strip())

            if not resp.get("ok"):

                raise RuntimeError(resp.get("error", "Java 服务错误"))

            return resp.get("result")


_java_service: Optional[JavaServiceManager] = None

_java_service_lock = threading.Lock()


_java_warmup_started = False

_java_warmup_lock = threading.Lock()


def _get_java_service() -> JavaServiceManager:

    global _java_service

    if _java_service is None:

        with _java_service_lock:

            if _java_service is None:

                _java_service = JavaServiceManager()

    return _java_service


def _warmup_java_service():

    try:

        service = _get_java_service()

        service._ensure_started()

    except Exception as e:

        print(f"[OFD] Java 服务预热失败: {e}", file=sys.stderr)


def start_java_warmup():

    global _java_warmup_started

    if _java_warmup_started:

        return

    with _java_warmup_lock:

        if _java_warmup_started:

            return

        _java_warmup_started = True

        threading.Thread(target=_warmup_java_service, daemon=True).start()


def _get_ofdrw_cli_jar() -> str:

    env_path = os.environ.get("OFDRW_CLI_JAR", "").strip()

    if env_path:

        jar = os.path.abspath(env_path)

        if os.path.exists(jar):

            return jar

        raise RuntimeError("OFDRW_CLI_JAR 指向的文件不存在")

    base_path = Path(get_base_path()).resolve()

    candidate_dirs = [
        base_path.parent / "java" / "target",
        base_path.parent.parent / "java" / "target",
        base_path.parent / "java",
        base_path.parent.parent / "java",
    ]

    for directory in candidate_dirs:

        if not directory.exists():

            continue

        jars = sorted(directory.glob("ofdrw-cli-*.jar"))

        if jars:

            return str(jars[-1])

    raise RuntimeError("未找到 ofdrw-cli JAR：请先执行 mvn -f java/pom.xml package")


def _get_java_cmd() -> str:

    base = get_base_path()
    java_executable = "java.exe" if os.name == "nt" else "java"
    platform_dir = "win32" if os.name == "nt" else sys.platform

    bundled_candidates = [
        os.path.abspath(
            os.path.join(base, "..", "..", "jre", platform_dir, "bin", java_executable)
        ),
        os.path.abspath(os.path.join(base, "..", "..", "jre", "bin", java_executable)),
        os.path.abspath(
            os.path.join(base, "..", "..", "jre-min", platform_dir, "bin", java_executable)
        ),
        os.path.abspath(os.path.join(base, "..", "..", "jre-min", "bin", java_executable)),
        os.path.abspath(os.path.join(base, "..", "jre-min", platform_dir, "bin", java_executable)),
        os.path.abspath(os.path.join(base, "..", "jre-min", "bin", java_executable)),
        os.path.abspath(os.path.join(base, "..", "jre", "bin", java_executable)),
    ]

    if getattr(sys, "frozen", False):

        for candidate in bundled_candidates:

            if os.path.exists(candidate):

                return candidate

    java_home = os.environ.get("JAVA_HOME", "").strip()

    if java_home:

        candidate = os.path.join(java_home, "bin", java_executable)

        if os.path.exists(candidate):

            return candidate

    if os.name == "nt":

        roots: List[str] = []

        pf = os.environ.get("ProgramFiles", "").strip()

        pf86 = os.environ.get("ProgramFiles(x86)", "").strip()

        if pf:

            roots.extend([os.path.join(pf, "Java"), os.path.join(pf, "Eclipse Adoptium")])

        if pf86:

            roots.append(os.path.join(pf86, "Java"))

        for root in roots:

            if not os.path.isdir(root):

                continue

            try:

                subdirs = sorted(
                    [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))],
                    reverse=True,
                )

            except Exception:

                subdirs = []

            for sd in subdirs:

                candidate = os.path.join(root, sd, "bin", java_executable)

                if os.path.exists(candidate):

                    return candidate

    for candidate in bundled_candidates:

        if os.path.exists(candidate):

            return candidate

    return "java"


def ofd_to_pdf(ofd_path: str, pdf_path: str) -> None:

    service = _get_java_service()

    service.call(
        "ofd_to_pdf", {"input": os.path.abspath(ofd_path), "output": os.path.abspath(pdf_path)}
    )


_evict_call_counts: Dict[str, int] = {}
_evict_lock = threading.Lock()
_EVICT_GRACE_SECONDS = 2


def _evict_render_cache(cache_dir: str, max_files: int = 100) -> None:
    _evict_call_counts[cache_dir] = _evict_call_counts.get(cache_dir, 0) + 1
    if _evict_call_counts[cache_dir] % 10 != 0:
        return
    acquired = _evict_lock.acquire(blocking=False)
    if not acquired:
        return
    try:
        now = time.time()
        entries = []
        for name in os.listdir(cache_dir):
            file_path = os.path.join(cache_dir, name)
            if not os.path.isfile(file_path):
                continue
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext not in ("png", "pdf"):
                continue
            mtime = os.path.getmtime(file_path)
            if now - mtime < _EVICT_GRACE_SECONDS:
                continue
            entries.append((mtime, file_path))
        if len(entries) <= max_files:
            return
        entries.sort()
        remove_count = len(entries) - max_files
        for _, file_path in entries[:remove_count]:
            try:
                os.remove(file_path)
            except OSError:
                pass
    except OSError:
        pass
    finally:
        _evict_lock.release()


def ofd_render_page_png(ofd_path: str, page_index: int, ppm: float) -> str:

    start_time = time.time()

    out_dir = ensure_outputs_dir()

    cache_dir = os.path.join(out_dir, "ofd_render_cache")

    os.makedirs(cache_dir, exist_ok=True)

    key = stat_fingerprint(ofd_path)

    safe_ppm = max(5.0, min(80.0, float(ppm)))

    out_png = os.path.join(cache_dir, f"{key}_p{int(page_index)}_ppm{int(safe_ppm)}.png")

    if os.path.exists(out_png):

        elapsed = time.time() - start_time

        print(
            f"[ofd_render_page_png] 缓存命中: {os.path.basename(out_png)} (耗时: {elapsed:.2f}s)",
            file=sys.stderr,
        )

        return out_png

    prefix = f"{key}_p{int(page_index)}_ppm"

    requested_ppm = int(safe_ppm)

    reused_png: Optional[str] = None

    reused_ppm: Optional[int] = None

    try:

        for name in os.listdir(cache_dir):

            if not name.startswith(prefix) or not name.lower().endswith(".png"):

                continue

            ppm_text = name[len(prefix) : -4]

            if not ppm_text.isdigit():

                continue

            candidate_ppm = int(ppm_text)

            if candidate_ppm < requested_ppm:

                continue

            candidate_path = os.path.join(cache_dir, name)

            if not os.path.exists(candidate_path):

                continue

            if reused_ppm is None or candidate_ppm < reused_ppm:

                reused_ppm = candidate_ppm

                reused_png = candidate_path

    except OSError:

        reused_png = None

        reused_ppm = None

    if reused_png:

        elapsed = time.time() - start_time

        print(
            f"[ofd_render_page_png] 复用高精度缓存 {os.path.basename(reused_png)} for ppm={safe_ppm} (耗时: {elapsed:.2f}s)",
            file=sys.stderr,
        )

        try:
            import shutil
            shutil.copy2(reused_png, out_png)
            return out_png
        except OSError:
            return reused_png

    print(
        f"[ofd_render_page_png] 开始渲染: {os.path.basename(ofd_path)} page={page_index} ppm={safe_ppm}",
        file=sys.stderr,
    )

    service = _get_java_service()

    service.call(
        "render",
        {
            "input": os.path.abspath(ofd_path),
            "output": os.path.abspath(out_png),
            "pageIndex": int(page_index),
            "ppm": safe_ppm,
        },
    )

    elapsed = time.time() - start_time

    if not os.path.exists(out_png) or os.path.getsize(out_png) <= 0:

        raise RuntimeError("OFD渲染失败：未生成PNG")

    print(
        f"[ofd_render_page_png] 渲染完成: {os.path.basename(out_png)} (耗时: {elapsed:.2f}s)",
        file=sys.stderr,
    )

    _evict_render_cache(cache_dir)

    return out_png


_ofd_to_pdf_lock = threading.Lock()


def ensure_pdf_for_ofd(file_path: str) -> str:

    out_dir = ensure_outputs_dir()

    cache_dir = os.path.join(out_dir, "ofd_cache")

    os.makedirs(cache_dir, exist_ok=True)

    key = stat_fingerprint(file_path)

    out_pdf = os.path.join(cache_dir, f"{key}.pdf")

    if os.path.exists(out_pdf) and os.path.getsize(out_pdf) > 0:

        return out_pdf

    with _ofd_to_pdf_lock:
        if os.path.exists(out_pdf) and os.path.getsize(out_pdf) > 0:
            return out_pdf
        ofd_to_pdf(os.path.abspath(file_path), os.path.abspath(out_pdf))

    _evict_render_cache(cache_dir)

    return out_pdf


_FIELD_NAME_MAP = {
    "invoiceCode": "invoice_code",
    "invoiceNumber": "invoice_number",
    "invoiceDate": "date",
    "invoiceType": "invoice_type",
    "totalAmount": "total_amount",
    "amount": "amount",
    "taxAmount": "tax",
    "taxRate": "tax_rate",
    "sellerName": "seller_name",
    "buyerName": "buyer_name",
    "buyerTaxId": "buyer_tax_id",
    "passengerName": "passenger_name",
    "idNumber": "id_number",
    "trainNumber": "train_no",
    "departureStation": "from_station",
    "destinationStation": "to_station",
    "departureTime": "depart",
    "travelDate": "travel_date",
    "seatLevel": "seat_level",
    "carriage": "carriage",
    "seat": "seat",
}

_FIELD_LABEL_MAP = {
    "invoice_code": "发票代码",
    "invoice_number": "发票号码",
    "date": "开票日期",
    "invoice_type": "发票类型",
    "total_amount": "价税合计",
    "amount": "金额",
    "tax": "税额",
    "tax_rate": "税率",
    "seller_name": "销售方名称",
    "buyer_name": "购买方名称",
    "buyer_tax_id": "购买方税号",
    "passenger_name": "乘客姓名",
    "id_number": "证件号码",
    "train_no": "车次",
    "from_station": "出发站",
    "to_station": "到达站",
    "depart": "发车时间",
    "travel_date": "乘车日期",
    "seat_level": "座位等级",
    "carriage": "车厢",
    "seat": "座位号",
    "flight_no": "航班号",
    "airline": "承运人",
    "cabin_class": "座位等级",
    "ticket_number": "电子客票号码",
    "fare": "票价",
    "fuel_surcharge": "燃油附加费",
    "caac_fund": "民航发展基金",
    "other_tax": "其他税费",
    "insurance": "保险费",
    "departure_airport": "起飞机场",
    "arrival_airport": "到达机场",
    "departure_time": "起飞时间",
}


def _normalize_field_names(data: Dict[str, Any]) -> Dict[str, str]:

    result = {}

    for java_key, value in data.items():

        python_key = _FIELD_NAME_MAP.get(java_key, java_key)

        if value is not None and str(value).strip():

            result[python_key] = str(value).strip()

    return result


def _is_train_ticket_from_fields(fields: Dict[str, str]) -> bool:
    """基于已归一化的 OFD 字段判断是否为火车票/高铁票"""
    if any(
        fields.get(key)
        for key in ("train_no", "from_station", "to_station", "seat_level", "seat")
    ):
        return True
    invoice_type = fields.get("invoice_type", "")
    return any(keyword in invoice_type for keyword in ("铁路", "火车", "高铁"))


def _apply_train_ticket_defaults(fields: Dict[str, str]) -> Dict[str, str]:
    """火车票/高铁票字段补全：与 OCR 路径保持一致

    1. 销方为空时默认"中国铁路"
    2. 标准税率 9%（铁路旅客运输服务）；若税额未识别或为 0，按 9% 反推 amount/tax
    """
    if not _is_train_ticket_from_fields(fields):
        return fields

    print(f"[OFD DEBUG] is_train=True, fields keys={list(fields.keys())}, tax_rate={fields.get('tax_rate', '<MISSING>')}", file=sys.stderr)

    if not fields.get("seller_name"):
        fields["seller_name"] = "中国铁路"

    raw_rate = fields.get("tax_rate", "")
    if not raw_rate or raw_rate == "0":
        fields["tax_rate"] = "9%"
    elif "%" not in raw_rate:
        try:
            val = float(raw_rate)
            if val < 1:
                fields["tax_rate"] = f"{round(val * 100)}%"
            else:
                fields["tax_rate"] = f"{round(val)}%"
        except (ValueError, TypeError):
            fields["tax_rate"] = "9%"

    total_str = fields.get("total_amount") or ""
    try:
        current_tax_val = float(fields.get("tax", "") or 0)
    except ValueError:
        current_tax_val = 0.0
    if total_str and current_tax_val == 0.0:
        try:
            total = float(total_str)
            if total > 0:
                amount_val = round(total / 1.09, 2)
                tax_val = round(total - amount_val, 2)
                fields["amount"] = f"{amount_val:.2f}"
                fields["tax"] = f"{tax_val:.2f}"
        except (ValueError, TypeError):
            pass

    return fields


def _apply_general_defaults(fields: Dict[str, str]) -> Dict[str, str]:
    """通用字段推导：用已有字段补全缺失的 amount/tax/tax_rate"""
    if "tax" not in fields and "total_amount" in fields and "amount" in fields:
        try:
            total = float(fields["total_amount"])
            amount = float(fields["amount"])
            if total > amount:
                fields["tax"] = f"{total - amount:.2f}"
        except (ValueError, TypeError):
            pass

    if "amount" not in fields and "total_amount" in fields and "tax" in fields:
        try:
            total = float(fields["total_amount"])
            tax = float(fields["tax"])
            if total > tax:
                fields["amount"] = f"{total - tax:.2f}"
        except (ValueError, TypeError):
            pass

    if "tax_rate" not in fields and "amount" in fields and "tax" in fields:
        try:
            amount = float(fields["amount"])
            tax = float(fields["tax"])
            if amount > 0:
                rate = tax / amount
                pct = round(rate * 100)
                if pct in (1, 3, 5, 6, 9, 10, 13):
                    fields["tax_rate"] = f"{pct}%"
        except (ValueError, TypeError):
            pass

    return fields


def extract_ofd_invoice_data(file_path: str) -> Optional[Dict[str, str]]:

    try:

        service = _get_java_service()

        result = service.call("extract", {"input": os.path.abspath(file_path)})

        if result and result.get("success") and result.get("data"):
            fields = _normalize_field_names(result.get("data"))
            fields = _apply_train_ticket_defaults(fields)
            fields = _apply_general_defaults(fields)

            print(f"[OFD DEBUG] after java+defaults: tax={fields.get('tax','<NONE>')}, amount={fields.get('amount','<NONE>')}, total={fields.get('total_amount','<NONE>')}", file=sys.stderr)
            if "tax" not in fields:
                try:
                    pdf_path = ensure_pdf_for_ofd(file_path)
                    ocr_result = ocr_pdf(pdf_path)
                    ocr_fields = ocr_result.get("fields", {})
                    print(f"[OFD DEBUG] ocr_fields keys={list(ocr_fields.keys())}, amount={ocr_fields.get('amount','<NONE>')}, tax={ocr_fields.get('tax','<NONE>')}", file=sys.stderr)
                    for key in ("amount", "tax", "tax_rate"):
                        if key in ocr_fields and (key not in fields or key == "amount"):
                            fields[key] = ocr_fields[key]
                    fields = _apply_general_defaults(fields)
                except Exception as ocr_err:
                    print(f"[OFD] OCR 补充字段失败: {ocr_err}", file=sys.stderr)

            print(f"[OFD DEBUG] final: tax={fields.get('tax','<NONE>')}, tax_rate={fields.get('tax_rate','<NONE>')}, amount={fields.get('amount','<NONE>')}", file=sys.stderr)
            return fields

    except Exception as e:

        print(f"[OFD] extract_ofd_invoice_data 失败: {file_path} - {e}", file=sys.stderr)

    return None


def _generate_labeled_fields(fields: Dict[str, str]) -> Dict[str, str]:

    result = {}

    for key, value in fields.items():

        label = _FIELD_LABEL_MAP.get(key, key)

        if value:

            result[label] = value

    return result


def ocr_ofd_fallback(file_path: str) -> Dict[str, Any]:

    try:

        pdf_path = ensure_pdf_for_ofd(file_path)

        result = ocr_pdf(pdf_path)

        result["source"] = "ocr"

        raw_fields = result.get("fields", {})
        if raw_fields:
            raw_fields = _apply_general_defaults(raw_fields)
            result["fields"] = raw_fields
            result["labeledFields"] = _generate_labeled_fields(raw_fields)

        return result

    except Exception as e:

        return {"text": "", "fields": {}, "labeledFields": {}, "blocks": [], "source": "ocr", "error": str(e)}


def _generate_text_from_fields(fields: Dict[str, str]) -> str:

    parts = []

    if "invoice_code" in fields:
        parts.append(f"发票代码:{fields['invoice_code']}")
    if "invoice_number" in fields:
        parts.append(f"发票号码:{fields['invoice_number']}")
    if "date" in fields:
        parts.append(f"开票日期:{fields['date']}")
    if "invoice_type" in fields:
        parts.append(f"发票类型:{fields['invoice_type']}")
    if "total_amount" in fields:
        parts.append(f"价税合计:{fields['total_amount']}")
    if "amount" in fields:
        parts.append(f"金额:{fields['amount']}")
    if "tax" in fields:
        parts.append(f"税额:{fields['tax']}")
    if "tax_rate" in fields:
        parts.append(f"税率:{fields['tax_rate']}")
    if "seller_name" in fields:
        parts.append(f"销售方:{fields['seller_name']}")
    if "buyer_name" in fields:
        parts.append(f"购买方:{fields['buyer_name']}")
    if "buyer_tax_id" in fields:
        parts.append(f"购买方税号:{fields['buyer_tax_id']}")
    if "passenger_name" in fields:
        parts.append(f"乘客姓名:{fields['passenger_name']}")
    if "id_number" in fields:
        parts.append(f"证件号码:{fields['id_number']}")
    if "train_no" in fields:
        parts.append(f"车次:{fields['train_no']}")
    if "from_station" in fields:
        parts.append(f"出发站:{fields['from_station']}")
    if "to_station" in fields:
        parts.append(f"到达站:{fields['to_station']}")
    if "depart" in fields:
        parts.append(f"发车时间:{fields['depart']}")
    if "travel_date" in fields:
        parts.append(f"乘车日期:{fields['travel_date']}")
    if "seat_level" in fields:
        parts.append(f"座位等级:{fields['seat_level']}")
    if "carriage" in fields:
        parts.append(f"车厢:{fields['carriage']}")
    if "seat" in fields:
        parts.append(f"座位号:{fields['seat']}")

    return " ".join(parts)


def ocr_ofd(file_path: str) -> Dict[str, Any]:

    extracted = extract_ofd_invoice_data(file_path)

    if extracted:

        text = _generate_text_from_fields(extracted)

        labeled = _generate_labeled_fields(extracted)

        return {"text": text, "fields": extracted, "labeledFields": labeled, "blocks": [], "source": "ofd_extract"}

    return ocr_ofd_fallback(file_path)
