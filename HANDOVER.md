# 口播场记 · 接手说明

给接手整仓的程序员：产品是什么、代码怎么分层、任务怎么跑、改哪里、常见坑。日常安装与启动命令见 [README.md](README.md)。

产品名：**口播场记**。本机短视频口播生产线，**不自动发布**。

---

## 1. 产品一句话

用户把录音、音视频或口播原文丢进来，系统完成本地转写、可选 AI 改稿、配音或提词器重录，再用 Remotion 导出 9:16 / 16:9 的 MP4。发布页只做风控检查和平台文案包，人自己去抖音 / 视频号 / 小红书发。

界面五步：

1. **输入** — 录音、上传、或贴文
2. **原文** — 确认转写
3. **口播稿** — 选体裁/平台，AI 改稿或跳过
4. **成片** — AI 配音，或提词器出镜重录
5. **发布** — 检查清单 + 标题/简介/标签，不代发

成片两条路：

| 模式 | `produce_mode` | 声音从哪来 | 画面 |
| --- | --- | --- | --- |
| AI 配音 | `tts` | Edge-TTS 或 Spark 克隆 → `voice.mp3` | 主题色 / 图片或视频背景 + 步骤卡 + CTA |
| 提词器重录 | `teleprompter` | 用户录像抽音 | 出镜画面叠步骤卡和 CTA，不再走 TTS |

没有 LLM Key 也能跑：改稿走规则兜底（`engine: heuristic`）。Key 只存在页面齿轮配置里，**不要写进 `.env`**。

---

## 2. 总体架构

```
┌─────────────────────────────────┐     ┌──────────────────────────────────────┐
│  web/                           │     │  backend/  FastAPI                   │
│  Vite + React  :5288            │ /api │  uvicorn  :8777                      │
│  Electron 壳（可选）            │────▶│  转写 / 改稿 / 配音 / 成片 / 设置    │
│  开发时 Vite 把 /api 代理到 8777│     │                                      │
└─────────────────────────────────┘     │  长任务：BackgroundTasks + 轮询 job    │
                                        └──────────────┬───────────────────────┘
                                                       │
                    ┌──────────────────────────────────┼────────────────────────┐
                    ▼                                  ▼                        ▼
           faster-whisper                    OpenAI 兼容 LLM            Edge-TTS / Spark-TTS
           CPU int8                         data/settings.json           ffmpeg 转码
                    │                                  │                        │
                    └──────────────────────────────────┼────────────────────────┘
                                                       ▼
                                              remotion/ TalkingVideo
                                              无头 Chrome 渲 MP4
                                                       ▼
                                              data/jobs/<id>/final.mp4
```

**没有数据库。** 任务、设置、音色、素材、文稿库全是本地 JSON + 文件。不要按「加一张表」的思路改存储，除非你准备整仓迁移。

绑定本机：`127.0.0.1`。CORS 只放行本地 Vite / Electron 端口。这不是 SaaS。

开发时推荐两个进程：后端 `8777` 常开，前端 `electron:dev` 或 `npm run dev`。Electron 若发现 8777 已健康，**不会再起一份 API**。

---

## 3. 目录地图

| 路径 | 职责 | 接手时先看 |
| --- | --- | --- |
| `backend/main.py` | 应用工厂：CORS、中间件、挂路由 | 必读 |
| `backend/api/routes/` | HTTP 路由（jobs / settings / voices / …） | 必读 |
| `backend/api/dto.py` | 请求体 | 改接口 |
| `backend/services/pipeline.py` | 转写 / 改稿 / 成片后台任务 | 必读 |
| `backend/services/scripting.py` | 朗读稿拼接 | 改稿/成片 |
| `backend/schemas.py` | Job / Script / Timeline / Review 契约 | 必读 |
| `backend/config.py` | 路径、打包环境变量、ffmpeg/node | 必读 |
| `backend/jobs.py` | 任务目录读写、状态、删除 | 必读 |
| `backend/llm.py` | 规划 + 写稿两步 LLM | 改稿相关 |
| `backend/rewrite.py` | 体裁、平台文案 | 改稿相关 |
| `backend/prompts.py` | 默认可覆盖的 prompt | 改稿相关 |
| `backend/settings_store.py` | LLM 多套配置、prompt、体裁覆盖 | 配置页 |
| `backend/stt.py` | Whisper 转写 | 转写 |
| `backend/tts.py` | Edge-TTS 分段、字级时间戳 | 配音 |
| `backend/spark_tts.py` | Spark 克隆推理 | 克隆配音 |
| `backend/timeline.py` | 步骤卡时间轴、片头标题结束点 | 成片 |
| `backend/render.py` | 调 Remotion CLI | 成片 |
| `backend/review.py` | 发布风控 + 三平台文案包 | 发布页 |
| `backend/errors.py` | 用户可读错误 | 排障 |
| `backend/keywords.py` | 步骤卡高亮词 | 步骤卡 |
| `backend/voices.py` / `voice_lib.py` | Edge 音色 + 克隆库 | 声音页 |
| `backend/assets.py` | 背景图/视频、BGM | 素材页 |
| `backend/library.py` | 文稿库 | 文稿页 |
| `backend/themes.py` | 主题 id | 成片主题 |
| `backend/cover.py` | 从成片抽封面 jpg | 成片库 |
| `backend/models_store.py` | 模型商店下载/卸载 | 本地组件 |
| `backend/audio.py` | ffmpeg 封装 | 音视频 |
| `web/src/App.tsx` | 前端路由壳 | 前端主路径 |
| `web/src/api.ts` | 前端 API 封装 | 前后端约定 |
| `web/src/types.ts` | 前端类型（对齐 schemas） | 改接口时一起改 |
| `web/electron/main.cjs` | 桌面壳、起停 uvicorn | 打包/启动 |
| `remotion/src/TalkingVideo.tsx` | 成片画面 | 步骤卡/主题/布局 |
| `data/` | 运行时用户数据，**不要提交密钥** | 本地 |
| `pretrained_models/` | Whisper；Spark 走模型商店 | 体积大 |
| `sparktts/` | Spark 推理代码（不含权重） | 克隆 |
| `packaging/` | 安装包引擎组装、`models.json` | 打包 |

`web/node_modules`、`remotion/node_modules`、`data/jobs` 里的成片产物都不是业务源码。

---

## 4. 运行时路径（开发 vs 安装包）

`backend/config.py` 用两个根：

| 变量 | 开发 | 安装包（Electron `app.isPackaged`） |
| --- | --- | --- |
| `KOUBO_ENGINE` | 未设置，等于仓库根 | `process.resourcesPath/engine` |
| `KOUBO_USER_DATA` | 未设置，等于仓库根 | Electron `userData` |
| `PACKAGED` | `False` | `True`（只要设了 `KOUBO_ENGINE`） |

开发时数据在仓库 `data/`。安装包用户数据在系统用户目录，引擎只读。

关键目录：

- `DATA_ROOT` → `jobs/`、`voices/`、`library/`、`assets/`、`voice_previews/`、`settings.json`
- Whisper：优先引擎内 `pretrained_models/faster-whisper-base/model.bin`
- Spark：优先用户 `models/Spark-TTS-0.5B`
- Remotion 素材暂存：开发用 `remotion/public/jobs/<id>/`；安装包用 `USER_DATA/remotion-public/`

Windows 必须在**项目根**启动 `python -m uvicorn backend.main:app`，否则找不到 `backend` 包。

---

## 5. 任务状态机

`JobStatus`（`backend/schemas.py`）：

```
draft
  → transcribing → transcribed     （音频入口）
  → analyzing    → script_ready   （改稿；贴文可跳过转写直接分析）
  → voicing      → rendering → done
  ↘ failed（任意步骤；error 存用户可读说明）
```

`WORKING_STATUSES = transcribing | analyzing | voicing | rendering`。进行中的任务不能删。

前端对 working 状态轮询 `GET /api/jobs/{id}`，进度在 `job.progress`（0–100）和 `step_message`。

典型任务目录 `data/jobs/<10位hex>/`：

| 文件 | 含义 |
| --- | --- |
| `job.json` | 状态、成片参数、体裁平台 |
| `raw.*` | 原始录音/上传 |
| `transcript.json` | 转写 |
| `script.json` | 口播稿 |
| `timeline.json` | Remotion 时间轴 |
| `voice.mp3` | TTS 或重录抽音 |
| `talk.mp4` | 提词器出镜（仅 teleprompter） |
| `take.*` | 提词器原始录像 |
| `final.mp4` | 成片 |
| `cover.jpg` | 封面 |
| `review.json` | 发布检查 |
| `remotion-props.json` | 送给 Remotion 的 props 备份 |

`script.engine`：`llm` | `heuristic` | `manual`。手改稿后多为 `manual`，成片时 `narration` 可能不再强制用 hook+body+cta 重拼（见 `services/scripting.py` 的 `compose_narration`）。

---

## 6. 主流程（后端）

### 6.1 创建

- `POST /api/jobs/text`：正文写入 transcript，状态 `transcribed`
- `POST /api/jobs/audio`：存 `raw.*`，后台 `pipeline.run_transcribe`

转写：`stt.transcribe_file` → ffmpeg 转 16k wav → faster-whisper CPU int8 → OpenCC 简体。单段上限 **90 分钟**；超过 8 分钟会给更保守的进度提示。

### 6.2 改稿

`POST /api/jobs/{id}/analyze` → `pipeline.run_analyze` → `llm.analyze_transcript`：

1. **plan** prompt：只出结构 JSON（`ScriptPlan`）
2. **write** prompt：按结构出 `Script`（topic / hook / body / cta / narration / keywords）
3. JSON 解析失败会从模型输出里抠 `{...}`

体裁、平台定义在 `rewrite.py`，可被 `settings.json` 覆盖。Prompt 正文在 `prompts.py`，也可在设置页改。

无 LLM 或调用失败：启发式清洗口语、按句切 body、平台默认 CTA。

用户也可 `POST .../script/from-transcript` 用原文直接当口播稿。

### 6.3 成片

`POST /api/jobs/{id}/render` 写入成片参数后，后台 `pipeline.run_render`：

**TTS 模式**

1. 拼朗读稿 `compose_spoken`
2. 缺 keywords 则 `fill_keywords`（LLM 或启发式）
3. `tts.synthesize`：按句切段（避免 Edge 长文本失败），拿字级时间戳
4. 拷背景/BGM 进任务目录
5. `build_timeline` → `render_video` → 抽 `cover.jpg`

**提词器模式**

1. 必须已有 `take.*`（`POST /api/jobs/{id}/take`）
2. 转 H264 `talk.mp4`，抽 `voice.mp3`
3. 再转写 take 对齐步骤卡；失败则按 hook + body 均分
4. 出镜作为 `talking_head`，背景通常不用（画面已是人）

### 6.4 Remotion

`render.py`：

1. `stage_assets`：音频/背景/BGM/talk 拷到 public
2. 写 `props.json`（jobId、audioFile、timeline）
3. 调 `npx remotion render`（实际优先 `remotion/node_modules/.bin/remotion`）
4. 解析 Encoded/Rendered 行更新进度

`TalkingVideo.tsx` 用 timeline 画：背景循环、标题、按 `body` 翻页的步骤卡、CTA 卡、水印、配乐音量。出镜时人像铺满，步骤卡叠在下部。中文字体走系统字体栈，避免安装包打 Google Fonts。

### 6.5 发布核对

`POST /api/jobs/{id}/review`：有 LLM 走 review prompt，否则 `heuristic_review`。输出 findings（`block` / `warn`）和抖音 / 视频号 / 小红书三份 pack。`GET .../pack.txt` 导出纯文本。

---

## 7. HTTP API 分组

前端只打相对路径 `/api/...`。开发走 Vite 代理；安装包由后端 `StaticFiles` 托管 `web/dist`，同源。

| 前缀 | 作用 |
| --- | --- |
| `GET /api/health` | whisper / llm / 引擎组件是否就绪 |
| `/api/settings*` | 读改设置、测 LLM、切换/删除 profile、重置 prompt |
| `/api/models*` | 模型商店安装卸载 |
| `/api/voices*` | 音色列表、试听、克隆增删 |
| `/api/jobs*` | 任务 CRUD、转写、改稿、成片、媒体下载 |
| `/api/library*` | 文稿库；`reuse` 从库再开一条任务 |
| `/api/assets*` | 素材上传列表删除 |

长任务（转写、改稿、成片、模型安装）立即返回，状态写进 JSON，前端轮询。不要把这些改成同步请求等几分钟。

JSON 写盘是「写临时文件再 replace」，并带重试，避免 Windows 下读到半截文件。

---

## 8. 前端结构

Hash 路由。`App.tsx` 只挂页面；顶栏：制作 / 声音 / 文稿 / 成片库 / 素材 / 齿轮。制作五步是独立路由。

| 文件 | 页面 |
| --- | --- |
| `pages/InputPage.tsx` 等 | 制作五步 |
| `Recorder.tsx` | 浏览器录音 |
| `RewritePicker.tsx` | 体裁/平台 |
| `ProduceSettings.tsx` | 音色、横竖屏、主题、步骤卡、BGM |
| `Teleprompter.tsx` | 提词器 + 摄像头 |
| `ReviewPanel.tsx` | 发布检查 |
| `VoicePage.tsx` | 音色与克隆 |
| `LibraryPage.tsx` | 文稿库 |
| `HistoryPage.tsx` | 成片库 |
| `AssetsPage.tsx` | 素材 |
| `SettingsPage.tsx` / `ModelStore.tsx` | 配置与模型下载 |
| `theme.ts` / `ThemePreview.tsx` / `captionStyle.ts` | 主题预览（与 Remotion 主题要对齐） |
| `highlight.ts` | 字幕/提词器高亮分词 |

成片偏好存在 `localStorage`：`koubo.produce`、`koubo.rewrite`。

Electron：`web/electron/main.cjs`。开发加载 `http://127.0.0.1:5288`；安装包加载 `http://127.0.0.1:8777/`。权限只开 `media`（麦克风/摄像头）和剪贴板。`preload` + `sandbox`，渲染进程不要直接 `require('fs')`。

---

## 9. 技术栈与外部依赖

| 层 | 技术 | 注意 |
| --- | --- | --- |
| 后端 | Python 3.10+（建议 3.11/3.12）、FastAPI、uvicorn | 根目录启动 |
| 转写 | faster-whisper-base、CPU int8 | 要 `model.bin` |
| LLM | `openai` SDK，任意 OpenAI 兼容网关 | DeepSeek / 通义 / 硅基等，见 `settings_store.PROVIDERS` |
| 配音 | edge-tts（在线）、Spark-TTS 0.5B（可选、本机 CPU） | Spark 另装 `requirements-spark.txt` |
| 音视频 | ffmpeg / ffprobe | PATH 或 `ffmpeg/` 捆绑 |
| 成片 | Remotion 4.0.332、无头 Chrome | 国内走 npmmirror 下 Chrome |
| 前端 | React 18、Vite 6、无状态库 | 端口 **5288**（不是 5173） |
| 桌面 | Electron 33、electron-builder | Win/Mac 分开打 |
| 中文 | OpenCC | 转写简体 |

国内默认：清华 PyPI、npmmirror、`HF_ENDPOINT=https://hf-mirror.com`。客户在中国，不要改回直连 HuggingFace / Google。

Spark 相关：`numpy>=1.26.4,<2`。升到 NumPy 2 会和 SciPy/transformers 炸（见 `errors.py`）。

---

## 10. 配置项

`.env`（可选，仓库根或用户数据目录）：

```
EDGE_TTS_VOICE=zh-CN-XiaoxiaoNeural
API_HOST=127.0.0.1
API_PORT=8777
EDGE_TTS_PROXY=          # 微软 TTS 不稳时
KOUBO_CDN=             # 模型 zip 的对象存储
HF_ENDPOINT=https://hf-mirror.com
```

**不要**把 LLM `api_key` 放进 `.env`。存在 `data/settings.json`（安装包在 userData）。`public_settings()` 对外会藏掉完整 Key。

`packaging/models.json`：Whisper 与 Spark 的 zip 名、HF repo、安装标记文件。自建 CDN 后把 zip 放到 `KOUBO_CDN` 对应路径。

---

## 11. 改功能时改哪里

| 需求 | 改这些 |
| --- | --- |
| 新 API | `backend/api/routes/` + `web/src/api.ts` + `types.ts` |
| Job 字段 | `schemas.py` → 前端 `types.ts` → 读写 `jobs.py` |
| 改稿语气/平台 | `rewrite.py`、`prompts.py`；用户还可在设置页覆盖 |
| 步骤卡切分、高亮 | `timeline.py`、`slides.py`、`keywords.py`、`highlight.ts`、`TalkingVideo.tsx` |
| 成片画面/主题色 | **必须**同时改 `themes.py`、`TalkingVideo.tsx`、`web/src/theme.ts` |
| 新 Edge 音色 | `voices.py`（微软可能下线音色） |
| 用户可读报错 | `errors.py` |
| 安装包体积/捆绑物 | `packaging/prepare_engine.py`、`web/package.json` 的 pack 脚本 |

前后端类型没有代码生成，靠手齐。改 Script/Timeline 字段时搜一遍 `model_dump` 和 Remotion `types.ts`。

---

## 12. 常见问题

### 12.1 启动与端口

- **`ModuleNotFoundError: backend`**：不在项目根跑 uvicorn。
- **`Port 5288 is already in use`**：不要叠开 `electron:dev`。先 Ctrl+C，必要时杀占用 5288 的进程（README 有 PowerShell）。8777 可一直开。
- **Electron 空白 / 启动失败**：8777 没起来，或 90s 内 health 失败。看 `[api]` 日志。开发时先手动起 API 再 `electron:dev`。
- **health 里 `whisper: false`**：缺 `pretrained_models/faster-whisper-base/model.bin`。安装包内置；开发机用齿轮「本地组件」或按 README 放模型。

### 12.2 转写

- 超 90 分钟会直接失败，需先切片。
- 没 ffmpeg：抽 wav / 时长失败。开发机 PATH 要有 ffmpeg；安装包带一份。
- 识别差：当前是 **base** 模型，有意保体积。换大模型要改 `models.json`、打包策略和内存预期。

### 12.3 改稿

- 没配 Key：稿子能出，但结构弱，`job.llm_configured === false`。
- 配了 Key 仍 heuristic：测连接失败、base_url 少 `/v1`、模型名填错（豆包常是接入点 ID）。
- 模型爱包 ```json```：`llm._extract_json` 会剥；若仍解析失败会落到 heuristic 或任务 `failed`。
- 用户抱怨「被压成十几秒」：prompt 已要求篇幅跟原稿，不要再往「短视频 15–60 秒」上加限制。

### 12.4 配音

- **微软 NoAudioReceived**：网络、音色下线、地区限制。换晓晓/云希；设 `EDGE_TTS_PROXY`。当前中文列表以 `voices.py` 为准。
- **克隆不能用**：未装 Spark + torch。齿轮下载；开发机 `pip install -r requirements-spark.txt`（CPU torch，很重）。安装包**故意不打** Spark 权重。
- **NumPy 报 multiarray**：按 `requirements.txt` 锁 `<2` 重装。
- 试听失败：预览走同一套 synthesize，先看是 Edge 网络还是 Spark 未 loaded。

### 12.5 成片 / Remotion

- **未找到 Remotion**：`cd remotion && npm install`。
- **无头浏览器超时**：Chrome for Testing 没下完或被占用。国内镜像：`PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing`。
- **No frame found / compositor**：背景视频短于口播或帧率怪。`TalkingVideo` 会 Loop 背景；仍失败就换更长视频或改图片。
- 改了 `TalkingVideo` 但成片没变：确认渲染的是 `remotion/` 这份；安装包用引擎里拷贝的 remotion。
- 中文方框：成片机缺中文字体。组件用的是微软雅黑 / PingFang 等系统字体，不要依赖 Google Fonts。

### 12.6 提词器

- 成片报「还没有提词器录像」：先在提词器页录并 `uploadTake`，再点生成。
- 浏览器/Electron 要麦克风和摄像头权限。安装包已在 session 里放行 `media`。
- 重录后步骤卡对不齐：会再转写 take；转写失败则按正文均分时间轴。

### 12.7 打包

- Win / Mac **分开打**，不要把另一平台 ffmpeg/node 打进去。
- `npm run pack:win` 会 `vite build` → `prepare_engine.py` → electron-builder。产物在 `web/release/`。
- 安装包含：Electron、当前平台 ffmpeg/node、FastAPI（无 torch）、Whisper-base、Remotion、前端。
- 不含：Spark 权重、torch、用户 `data/`、`.git`、Remotion Studio、Google 字体。
- 打包后改 Python 代码必须重新 `prepare_engine` / 打安装包；开发热重载只管源码树。

### 12.8 Windows 文件锁

任务 JSON 用临时文件 + `os.replace` 重试。成片过程中不要用播放器锁死 `final.mp4` 再覆盖。删除任务时若文件被占用可能删不干净。

### 12.9 前端代理

`vite.config.ts`：`strictPort: true`，端口 5288。改端口要同步 CORS、Electron `VITE_URL`、README。旧注释里的 5173 已不作为默认开发口。

---

## 13. 安全与产品边界

- 只监听本机。不要把 uvicorn 改成 `0.0.0.0` 再暴露到公网，除非另做鉴权。
- LLM Key 在本机 JSON；`GET /api/settings` 不应回完整密钥。
- 发布检查是启发式 + 模型审校，**不是法律意见**，也不发到任何平台。
- 营销体裁 prompt 禁止绝对化疗效、稳赚等；改 prompt 时不要拿掉这层。

---

## 14. 建议阅读顺序

1. [README.md](README.md) — 装起来跑通一条「贴文 → 改稿 → Edge 成片」
2. 本文第 2–6 节
3. `backend/schemas.py` + `backend/api/routes/` + `backend/services/pipeline.py`
4. `web/src/pages/` 五步页面与 `StudioContext`
5. `backend/timeline.py` + `remotion/src/TalkingVideo.tsx`
6. `web/electron/main.cjs` + `packaging/prepare_engine.py`（若要碰安装包）

健康检查：浏览器打开 http://127.0.0.1:8777/api/health ，`ok: true` 且 `whisper: true`。

---

## 15. 刻意没做的事

- 不自动登录、不代发各平台
- 无账号系统、无云同步、无多用户
- 无 Postgres / Redis / 队列中间件（后台任务就是 FastAPI BackgroundTasks）
- Spark 不进安装包（体积与授权）
- 不保证微软 Edge 音色长期可用

接手后若要上云或多人协作，等于换存储和任务队列，不要在现有 JSON 目录上硬堆锁。
)
