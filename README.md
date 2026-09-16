# 口播场记

本机短视频口播：录音 / 贴文 → 转写 → AI 改稿 → 配音或提词器重录 → 导出 MP4。不自动发布。

演示效果：[Bilibili 视频](https://www.bilibili.com/video/BV1Sdes66Ez9/)

## 环境要求

- Python 3.10+（建议 3.11 / 3.12）
- Node.js 18+
- ffmpeg 已加入 PATH
- 若要用**手机当摄像头**（提词器出镜等），本机需安装 [Iriun Webcam](https://iriun.com/)，手机装配套 App，连上后在系统摄像头列表里选 Iriun

## 第一次安装

在项目根目录执行：

```bash
copy .env.example .env
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
cd web && npm install
cd ../remotion && npm install
```

## 启动

```bash
cd web
npm run electron:dev
```

会先起后端（`8777`），再起前端 Vite（`5288`），然后打开桌面窗口。若后端已在跑，会直接复用。

安装包双击启动也是同一顺序：先拉起本地后端，就绪后再打开界面（前端由后端托管）。

只用浏览器时：另开终端先 `python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8777`，再在 `web/` 执行 `npm run dev`，打开 http://127.0.0.1:5288 。

## 第一次使用

1. 打开应用后进 **齿轮配置**，添加大模型（DeepSeek / 通义等）；不配也能跑，改稿会走规则兜底。
2. 同一页进 **本地组件**，下载转写模型（Whisper）。需要声音克隆再下 Spark-TTS。
3. 顶栏进 **制作**：录音 / 上传 / 贴文 → 确认原文 → 改稿 → 成片（AI 配音或提词器）→ 导出 MP4。

发布页只做核对清单，需自己发到抖音等平台。
