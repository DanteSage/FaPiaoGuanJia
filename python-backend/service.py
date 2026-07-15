import os
from pathlib import Path
import sys

# Add onnxruntime DLL directory to Windows search path when running inside PyInstaller bundle
if sys.platform == "win32" and hasattr(sys, "_MEIPASS"):
    for sub in ["_internal", ""]:
        capi_dir = os.path.join(sys._MEIPASS, sub, "onnxruntime", "capi") if sub else os.path.join(sys._MEIPASS, "onnxruntime", "capi")
        if os.path.exists(capi_dir):
            try:
                os.add_dll_directory(capi_dir)
            except Exception as e:
                print(f"Failed to add DLL directory {capi_dir}: {e}", file=sys.stderr)



ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from rpc.service import handle, main


__all__ = ["handle", "main"]


if __name__ == "__main__":
    main()
