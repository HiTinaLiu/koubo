from __future__ import annotations

from opencc import OpenCC

_cc = OpenCC("t2s")


def to_simplified(text: str) -> str:
    if not text:
        return text
    return _cc.convert(text)
