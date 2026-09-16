# 模型权重（不入库）

本目录在本地存放转写 / 克隆配音权重，**不要提交到 Git**。仓库只保留本说明。

| 目录 | 用途 | 大约体积 | 是否必须 |
| --- | --- | --- | --- |
| `faster-whisper-base/` | 语音转写 | ~140 MB | 转写需要 |
| `Spark-TTS-0.5B/` | 声音克隆配音 | ~3 GB | 可选；不用克隆可用 Edge-TTS |

## 推荐：应用内下载

启动后打开 **齿轮配置 → 本地组件（模型商店）**，按提示下载。国内默认走 `hf-mirror.com`；若自建 CDN，在 `.env` 设置 `KOUBO_CDN`。

## 开发机手动放置

Whisper（Hugging Face：`Systran/faster-whisper-base`）：

```text
pretrained_models/faster-whisper-base/model.bin
```

Spark-TTS（Hugging Face：`SparkAudio/Spark-TTS-0.5B`）：

```text
pretrained_models/Spark-TTS-0.5B/
  config.yaml
  LLM/
  BiCodec/
  wav2vec2-large-xlsr-53/
```

克隆配音还需：

```bash
pip install -r requirements-spark.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --extra-index-url https://mirrors.aliyun.com/pytorch-wheels/cpu
```
