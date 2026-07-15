import threading

from dataclasses import dataclass

from typing import List, Optional, Tuple


import fitz


try:

    import numpy as np

except Exception:

    np = None


try:
    from rapidocr_onnxruntime import RapidOCR
except Exception:
    RapidOCR = None


try:

    from winrt.windows.media.ocr import OcrEngine

    from winrt.windows.graphics.imaging import BitmapDecoder

    from winrt.windows.storage import StorageFile, FileAccessMode

except Exception:

    OcrEngine = None

    BitmapDecoder = None

    StorageFile = None

    FileAccessMode = None


@dataclass
class OcrBlock:

    text: str

    confidence: Optional[float]


_ocr_engine = None

_ocr_engine_lock = threading.Lock()


def _get_ocr_engine():

    global _ocr_engine

    if _ocr_engine is None and RapidOCR is not None:

        with _ocr_engine_lock:

            if _ocr_engine is None:

                _ocr_engine = RapidOCR()

    return _ocr_engine


def _warmup_ocr():

    try:

        _get_ocr_engine()

    except Exception:

        pass


threading.Thread(target=_warmup_ocr, daemon=True).start()


def pixmap_file_to_numpy(file_path: str):

    if np is None:

        raise RuntimeError("缺少numpy，无法进行OCR")

    pix = fitz.Pixmap(file_path)

    arr = np.frombuffer(pix.samples, dtype=np.uint8)

    if pix.n == 1:

        arr = arr.reshape(pix.height, pix.width, 1)

        arr = np.repeat(arr, 3, axis=2)

        return arr

    arr = arr.reshape(pix.height, pix.width, pix.n)

    if pix.alpha and pix.n >= 4:

        arr = arr[:, :, :3]

    return arr


def pixmap_to_numpy(pix: fitz.Pixmap):

    if np is None:

        raise RuntimeError("缺少numpy，无法进行OCR")

    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)

    if pix.alpha and pix.n >= 4:

        arr = arr[:, :, :3]

    return arr


def run_ocr_rapidocr(img) -> Tuple[str, List[OcrBlock]]:

    engine = _get_ocr_engine()

    if engine is None:

        raise RuntimeError("OCR 引擎未安装：请使用 Python 3.13 并安装 requirements/ocr.txt")

    result, _ = engine(img)

    blocks: List[OcrBlock] = []

    lines: List[str] = []

    if not result:

        return "", []

    for item in result:

        txt = item[1]

        score = float(item[2]) if len(item) >= 3 and item[2] is not None else None

        blocks.append(OcrBlock(text=str(txt), confidence=score))

        lines.append(str(txt))

    return "\n".join(lines), blocks


def run_ocr_winrt(file_path: str) -> Tuple[str, List[OcrBlock]]:

    if OcrEngine is None or BitmapDecoder is None or StorageFile is None or FileAccessMode is None:

        raise RuntimeError("缺少WinRT OCR依赖")

    storage_file = StorageFile.get_file_from_path_async(file_path).get()

    stream = storage_file.open_async(FileAccessMode.READ).get()

    decoder = BitmapDecoder.create_async(stream).get()

    bmp = decoder.get_software_bitmap_async().get()

    engine = OcrEngine.try_create_from_user_profile_languages()

    result = engine.recognize_async(bmp).get()

    lines: List[str] = []

    blocks: List[OcrBlock] = []

    for line in result.lines:

        text = line.text

        lines.append(text)

        blocks.append(OcrBlock(text=text, confidence=None))

    return "\n".join(lines), blocks


def is_rapidocr_available() -> bool:

    return RapidOCR is not None and np is not None


def is_winrt_available() -> bool:

    return OcrEngine is not None
