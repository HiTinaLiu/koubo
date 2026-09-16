from __future__ import annotations

import json
import shutil
from pathlib import Path

from backend.applog import get_logger
from backend.config import spark_model_dir

log = get_logger("spark_slim")

JUNK_DIRS = ("src",)
JUNK_FILES = ("README.md", ".msc", ".mv")


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size if path.is_file() else 0
    except OSError:
        return 0


def _dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return _file_size(path)
    return sum(_file_size(item) for item in path.rglob("*") if item.is_file())


def _strip_docs(root: Path) -> int:
    freed = 0
    for name in JUNK_DIRS:
        folder = root / name
        if folder.is_dir():
            size = _dir_size(folder)
            shutil.rmtree(folder, ignore_errors=True)
            if not folder.exists():
                freed += size
    for name in JUNK_FILES:
        path = root / name
        if path.is_file():
            size = _file_size(path)
            try:
                path.unlink()
                freed += size
            except OSError:
                pass
    return freed


def _halve_wav2vec(root: Path) -> int:
    folder = root / "wav2vec2-large-xlsr-53"
    bin_path = folder / "pytorch_model.bin"
    if not folder.is_dir() or not bin_path.exists():
        return 0
    st_path = folder / "model.safetensors"
    before = _file_size(bin_path)
    if st_path.exists() and _file_size(st_path) > 10 * 1024 * 1024:
        try:
            bin_path.unlink()
            return before
        except OSError:
            return 0
    try:
        import torch
        from safetensors.torch import save_file
    except Exception:
        return 0
    try:
        raw = torch.load(bin_path, map_location="cpu", weights_only=True)
    except TypeError:
        raw = torch.load(bin_path, map_location="cpu")
    if isinstance(raw, dict) and "state_dict" in raw and isinstance(raw["state_dict"], dict):
        raw = raw["state_dict"]
    if not isinstance(raw, dict):
        return 0
    tensors = {}
    for key, value in raw.items():
        if not hasattr(value, "dtype"):
            continue
        tensor = value.detach().contiguous()
        if tensor.is_floating_point() and tensor.dtype == torch.float32:
            tensor = tensor.half()
        tensors[str(key)] = tensor
    if not tensors:
        return 0
    tmp = folder / "model.fp16.safetensors"
    save_file(tensors, str(tmp))
    if _file_size(tmp) < 10 * 1024 * 1024:
        tmp.unlink(missing_ok=True)
        return 0
    tmp.replace(st_path)
    config_path = folder / "config.json"
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            data["torch_dtype"] = "float16"
            config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except (OSError, json.JSONDecodeError):
            pass
    after = _file_size(st_path)
    try:
        bin_path.unlink()
    except OSError:
        return max(0, before - after)
    return max(0, before - after)


def slim_spark_dir(root: Path | None = None) -> int:
    dest = Path(root) if root else spark_model_dir()
    if not dest.exists():
        return 0
    freed = _strip_docs(dest)
    try:
        freed += _halve_wav2vec(dest)
    except Exception:
        log.exception("Wav2Vec 半精度压缩失败")
    if freed:
        log.info("克隆组件已精简 bytes=%s dir=%s", freed, dest)
    return freed
