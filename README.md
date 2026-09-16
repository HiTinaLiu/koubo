# 口播场记

本机短视频口播生产线：录音或贴文 → 转写 → AI 改稿 → 配音或提词器重录 → Remotion 出 9:16 / 16:9 MP4。不自动发布。

License: [MIT](LICENSE)。接手整仓（架构、数据流、常见坑）：见 [HANDOVER.md](HANDOVER.md)。

> 模型权重（Whisper / Spark-TTS）体积很大，**不在本仓库内**。克隆后按下方安装说明，或进应用「齿轮配置 → 本地组件」下载。

## 框架

```
浏览器 / Electron 桌面端          FastAPI 后端                 本地能力
http://127.0.0.1:5288     →     http://127.0.0.1:8777
Vite + React                      uvicorn
  └ /api 代理到 8777              ├ faster-whisper 转写
                                  ├ OpenAI 兼容 LLM 改稿（配置页）
                                  ├ Edge-TTS / Spark-TTS 配音
                                  └ Remotion 渲染 MP4
```

| 目录 | 职责 |
| --- | --- |
| `backend/` | FastAPI：任务、转写、改稿、配音、成片、设置 |
| `web/` | Vite + React 界面；`web/electron/` 桌面壳 |
| `remotion/` | 成片合成（`TalkingVideo`） |
| `data/` | 任务、音色、素材、设置（本地数据，不入库） |
| `pretrained_models/` | 本地权重目录（**不入库**）；见该目录 [README](pretrained_models/README.md) |
| `sparktts/` | Spark-TTS 推理代码（不含权重） |
| `packaging/` | 桌面安装包引擎目录、模型清单 |

制作流程（界面上五步）：**输入 → 原文 → 口播稿 → 成片 → 发布核对**（发布只做检查清单，不代发）。

成片二选一：

1. **AI 配音**：Edge-TTS 或 Spark 克隆 + 主题 / 背景 / BGM
2. **提词器重录**：对着定稿口播出镜，成片叠步骤卡和 CTA，不再走 TTS

大模型 Key 只在页面 **齿轮配置** 里保存（可多套、切换当前使用的）。不配也能跑，改稿会走规则兜底。

## 环境

- Python 3.10+（建议 3.11 / 3.12），`pip install -r requirements.txt`
- Node.js 18+（前端、Electron、Remotion 都要）
- ffmpeg 在 PATH 里（转码、抽音）；安装包会带当前平台一份
- 转写需要 `pretrained_models/faster-whisper-base`（安装包会内置；开发机用模型商店或手动下载）
- 克隆配音可选：齿轮配置 → 本地组件，从国内镜像下载（权重不进 Git / 不进安装包）

Windows 下用项目根目录作为工作目录启动后端，这样 `backend` 包才能被找到。

## 国内镜像

客户在中国，默认走国内源，不要直连 Google / GitHub / HuggingFace。

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

`web/.npmrc` 和 `remotion/.npmrc` 已指向 `registry.npmmirror.com`。Electron 二进制走 `npmmirror.com/mirrors/electron/`。

克隆配音未配置自有 CDN 时，走 `https://hf-mirror.com`。有对象存储后在 `.env` 写：

```
KOUBO_CDN=https://your-bucket.oss-cn-hangzhou.aliyuncs.com/koubo
```

并把 `packaging/models.json` 里的 zip（`spark-tts-0.5b.zip`、`faster-whisper-base.zip`）传到该目录。

微软在线配音不稳时再设 `EDGE_TTS_PROXY`。

## 第一次安装

在项目根目录：

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

克隆配音开发机若要本地跑，再装（含 CPU torch，体积大）：

```bash
pip install -r requirements-spark.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --extra-index-url https://mirrors.aliyun.com/pytorch-wheels/cpu
```

```bash
cd web
npm install
```

```bash
cd remotion
npm install
```

复制环境变量模板（一般可保持空白）：

```bash
copy .env.example .env
```

可选项见 `.env.example`。LLM Key **不要**写进 `.env`，打开应用后进 **齿轮配置** 添加 DeepSeek / 通义等 OpenAI 兼容接口。

转写模型：启动后进 **齿轮配置 → 本地组件** 下载 Whisper；或按 [pretrained_models/README.md](pretrained_models/README.md) 手动放置。

## 启动

### 桌面端（推荐）

两个终端，先后端再窗口。

**终端 1 — API**（项目根目录）：

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8777
```

**终端 2 — 界面 + Electron**（`web/`）：

```bash
cd web
npm run electron:dev
```

会起 Vite `http://127.0.0.1:5288`，并打开「口播场记」窗口。若 8777 上已有 API，Electron 会复用，不再另起一份。

**重启桌面端：** 不要再开一份 `electron:dev`。先在跑它的那个终端按 `Ctrl+C` 停掉，再重新执行上面的命令。若报 `Port 5288 is already in use`，在 PowerShell 里先清端口再启动：

```powershell
Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

8777 上的 API 可以一直开着，不必跟着关。

只开浏览器、不要窗口时：终端 1 照旧，终端 2 改成：

```bash
cd web
npm run dev
```

然后打开 http://127.0.0.1:5288 。Vite 会把 `/api` 转到 8777。

### 健康检查

浏览器或 curl：http://127.0.0.1:8777/api/health  
`ok: true` 且 `whisper: true` 表示转写模型已就位。

## 日常使用

1. **制作**：录音、上传音视频，或直接贴口播原文
2. 确认转写 → 选体裁/平台，AI 改稿或跳过
3. **口播稿**：下一步把口播逐句平移成展示页；也可点「AI 生成展示稿」混排要点/数据/金句等
4. **展示稿**：用一句话描述画面感觉，让 AI 统一配样式；个别页可再单独覆盖
5. 成片选 AI 配音或提词器重录，选音色、横竖屏；主题底色由「生成效果方案」用 AI 原创
6. 生成 MP4；**发布**页只核对文案和成片，需自己发到平台

顶栏还可进 **声音 / 文稿 / 成片库 / 素材 / 齿轮配置**。

Edge 配音走微软在线接口，需能访问 Microsoft TTS。当前可用中文音色：晓晓、晓伊、云夏、云希、云扬、云健、晓北、晓妮。

## 桌面安装包（Windows / Mac）

安装包 = **壳（Electron）+ 本地引擎**。Win、Mac 分开打，不要打进另一平台的二进制。

**会打进安装包：** Electron、当前平台 ffmpeg / Node、FastAPI 后端（不含 torch）、Whisper-base、Remotion 渲染器、界面。

**不打进安装包：** Spark-TTS 权重、torch、用户 `data/`、成片、`.git`、Remotion Studio / Google 字体。

克隆配音在应用内 **齿轮配置 → 本地组件** 下载（模型商店，国内 CDN 或 hf-mirror）。

在对应系统上打包：

```bash
cd web
npm install
npm run pack:win      # Windows x64，生成 web/release/
npm run pack:mac      # Apple Silicon
npm run pack:mac-x64  # Intel Mac
```

会先 `vite build`，再 `packaging/prepare_engine.py` 组装 `packaging/engine/`，最后 electron-builder 出安装包。

## 端口

| 服务 | 地址 |
| --- | --- |
| 后端 API | http://127.0.0.1:8777 |
| 前端 Vite | http://127.0.0.1:5288 |
