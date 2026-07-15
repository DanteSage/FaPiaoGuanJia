from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


PROJECT_DIR = Path.cwd()
SRC_DIR = PROJECT_DIR / "src"

verify_hiddenimports = collect_submodules("core.verify")
hiddenimports = [
    "core",
    "core.ocr",
    "core.ocr.fields",
    "core.ocr.image",
    "core.ocr.ofd",
    "core.ocr.pdf",
    "core.ocr.xml",
    "core.pdf",
    "core.pdf.merge",
    "core.pdf.render",
    "core.printer",
    "core.printer.printer",
    "core.verify",
    "core.verify.captcha_solver",
    "core.verify.rpa_verify",
    "core.verify.zbj_api",
    "core.verify._browser_pool",
    "core.verify._browser_runtime",
    "core.verify._common",
    "core.verify._human_sim",
    "core.verify._parser",
    "core.verify._rpa_component",
    "core.verify._stealth",
    "engines",
    "engines.ocr_engine",
    "rpc",
    "rpc.archive_handlers",
    "rpc.dispatch",
    "rpc.file_handlers",
    "rpc.handlers",
    "rpc.history_handlers",
    "rpc.reimbursement_handlers",
    "rpc.response",
    "rpc.service",
    "rpc.storage_handlers",
    "rpc.verify_handlers",
    "utils",
    "utils.common",
    "utils.logger",
    "storage",
    "storage.database",
    "storage.file_storage",
    "storage.config_migration",
    "storage.paths",
    "storage.protected_config",
    "storage.reimbursement_db",
    "storage.secret_fields",
    "win32api",
    "win32print",
    "pywintypes",
    "rapidocr_onnxruntime",
    "onnxruntime",
    "shapely",
    "pyclipper",
] + verify_hiddenimports


import onnxruntime
import os
onnx_capi_path = os.path.join(os.path.dirname(onnxruntime.__file__), "capi")
onnx_binaries = []
if os.path.exists(onnx_capi_path):
    for f in os.listdir(onnx_capi_path):
        if f.endswith(".dll") or f.endswith(".pyd"):
            onnx_binaries.append((os.path.join(onnx_capi_path, f), "onnxruntime/capi"))

ocr_datas = collect_data_files("rapidocr_onnxruntime")


a = Analysis(
    ["service.py"],
    pathex=[str(PROJECT_DIR), str(SRC_DIR)],
    binaries=onnx_binaries,
    datas=ocr_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "scipy",
        "PIL.AvifImagePlugin",
        "pillow_avif",
        "matplotlib",
        "tkinter",
        "unittest",
        "test",
        "playwright",
        "playwright.sync_api",
        "playwright.async_api",
        "pyee",
        "greenlet",
    ],
    noarchive=False,
    optimize=0,
)

# Exclude VC++ redistributable DLLs to prevent PyInstaller from packaging old/corrupt versions
# and force Windows to load them from System32.
excluded_binaries = {
    "msvcp140.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "msvcp140_1.dll",
}
a.binaries = [x for x in a.binaries if os.path.basename(x[0]).lower() not in excluded_binaries]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="service",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="service",
)
