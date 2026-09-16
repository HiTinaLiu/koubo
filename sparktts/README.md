# Spark-TTS

官方 [SparkAudio/Spark-TTS](https://github.com/SparkAudio/Spark-TTS) 的 Python 推理包，供本仓库 `import sparktts` 使用。

## 权重不在本目录

源码不等于能发音。请把官方权重放到项目根下：

```text
pretrained_models/Spark-TTS-0.5B/
  config.yaml
  LLM/
  BiCodec/
  wav2vec2-large-xlsr-53/
```

推荐：应用内 **齿轮配置 → 本地组件** 下载。说明见 [pretrained_models/README.md](../pretrained_models/README.md)。

本机没有 NVIDIA GPU 时走 CPU，合成会比较慢，但流程完整。
