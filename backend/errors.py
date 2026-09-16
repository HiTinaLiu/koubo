from __future__ import annotations


def explain_error(exc: BaseException, *, where: str = "") -> str:
    text = str(exc).strip() or exc.__class__.__name__
    if text.startswith(("试听失败", "Spark 模型加载失败", "成片失败", "配音失败", "Spark-TTS 加载失败", "渲染失败")):
        return text
    low = text.lower()
    if "numpy.core.multiarray" in low or ("numpy" in low and "import" in low):
        detail = (
            "Spark-TTS 加载失败：NumPy 与 SciPy/transformers 版本不匹配。"
            "请在本项目环境执行 pip install -r requirements.txt（已锁定 numpy<2）。"
        )
    elif "未安装克隆配音" in text or ("未找到" in text and "权重" in text):
        detail = "还没安装克隆配音组件。打开齿轮配置 → 本地组件，下载后再用内置声或克隆。"
    elif "参考" in text or "prompt_speech" in low:
        detail = f"缺少可用的参考音频：{text}"
    elif "ffmpeg" in low or "ffprobe" in low:
        detail = f"处理音频失败，请到齿轮配置 → 本地组件安装 ffmpeg：{text}"
    elif "whisper" in low:
        detail = f"转写模型缺失，请到齿轮配置 → 本地组件下载转写模型：{text}"
    elif "remotion" in low or "未找到 node" in low:
        detail = f"成片组件缺失，请到齿轮配置 → 本地组件安装 Node / Remotion：{text}"
    elif "no audio was received" in low or "没有返回音频" in text:
        detail = (
            "微软在线配音没有返回音频。该音色可能已下线，或当前网络访问 Microsoft TTS 不稳定。"
            "请换晓晓、云希等仍可用的音色后重试；如长期失败，可设置环境变量 EDGE_TTS_PROXY。"
        )
    elif "timed out" in low and ("headless browser" in low or "delayrender" in low or "setting up" in low):
        detail = (
            "渲染超时：成片浏览器启动超过等待时间。"
            "请再生成一次；若仍失败，关掉占用的 Chrome 后重试。"
        )
    elif (
        "no frame found" in low
        or "compositor error" in low
        or "could not extract frame" in low
        or "rendering frame" in low
    ):
        detail = (
            "渲染失败：背景视频比口播短，或素材帧率不稳，取不到对应画面。"
            "请重新生成成片（背景会循环铺满）。若仍失败，换更长的视频或改用图片背景。"
        )
    else:
        detail = f"处理失败：{text}"
    if where and not detail.startswith(where):
        return f"{where}：{detail}"
    return detail
