import {createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {
  adoptScript,
  analyzeJob,
  createTextJob,
  generateKeywords,
  getJob,
  getModels,
  getSettings,
  planDeck,
  pingHealth,
  restartBackend,
  listAssets,
  listVoices,
  renderJob,
  saveDeck,
  saveScript,
  saveTranscript,
  scrubScriptLimits,
} from '../api';
import type {NoticeState} from '../component/NoticeDialog';
import {REWRITE_GENRES, REWRITE_PLATFORMS} from '../rewrite';
import type {RewriteOptions} from '../rewrite';
import {
  isStudioPath,
  PATH,
  settingsPath,
  studioPathFromStep,
  studioStepFromPath,
  type StudioPath,
} from '../paths';
import type {AssetItem, EngineStatus, JobStatus, JobView, ProduceOptions, Script, SparkStatus, VoiceItem} from '../types';
import {COMPONENT_LABELS, componentMissing, installHint} from './engine';
import {loadPrefs, loadRewritePrefs, normalizeDeckKind, savePrefs, saveRewritePrefs} from './prefs';
import {composeSpoken, scriptReady} from './script';

const WORKING: JobStatus[] = ['transcribing', 'analyzing', 'voicing', 'rendering'];

type StudioContextValue = {
  view: JobView | null;
  setView: React.Dispatch<React.SetStateAction<JobView | null>>;
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  draft: Script | null;
  setDraft: React.Dispatch<React.SetStateAction<Script | null>>;
  produce: ProduceOptions;
  changeProduce: (next: ProduceOptions) => void;
  rewrite: RewriteOptions;
  changeRewrite: (next: RewriteOptions) => void;
  voices: VoiceItem[];
  spark: SparkStatus | null;
  engine: EngineStatus | null;
  assets: AssetItem[];
  refreshVoices: () => Promise<void>;
  refreshAssets: () => Promise<void>;
  refreshEngine: () => Promise<void>;
  llmOn: boolean;
  llmLabel: string;
  setLlmMeta: (next: {configured: boolean; label: string}) => void;
  hasLlm: boolean;
  busy: boolean;
  working: boolean;
  waiting: boolean;
  uploading: boolean;
  setAudioPending: React.Dispatch<React.SetStateAction<boolean>>;
  elapsed: number;
  waitKind: JobStatus | 'uploading';
  step: number;
  studioPath: StudioPath;
  isStudio: boolean;
  canReach: boolean[];
  nextHint: string;
  currentScript: Script | null;
  transcriptText: string;
  narrationPreview: string;
  requiredMissing: string[];
  apiDown: boolean;
  restarting: boolean;
  flash: NoticeState | null;
  setFlash: React.Dispatch<React.SetStateAction<NoticeState | null>>;
  llmSecondary: React.MutableRefObject<(() => void) | null>;
  wrap: (action: () => Promise<JobView>, ok?: string) => Promise<JobView | null>;
  goBack: () => void;
  goNext: () => Promise<void>;
  goStudio: (path: StudioPath, force?: boolean) => void;
  openSettings: (focus?: 'llm' | 'components' | '') => void;
  resetJob: () => void;
  beginVoice: () => Promise<JobView | null>;
  beginRender: () => Promise<JobView | null>;
  remindNeedEngine: (ids: string[], feature: string) => boolean;
  remindNeedLlm: (feature: string, secondary?: {label: string; run: () => void}) => void;
  generateKeywordsForJob: () => void;
  scrubLimitsForJob: () => void;
  generateDeckForJob: () => void;
  forceRestartBackend: () => Promise<void>;
  openJob: (next: JobView, nextStep: number) => void;
  startAnalyze: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error('useStudio must be used inside StudioProvider');
  return value;
}

export function StudioProvider({children}: {children: ReactNode}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [llmOn, setLlmOn] = useState(false);
  const [llmLabel, setLlmLabel] = useState('');
  const [view, setView] = useState<JobView | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<NoticeState | null>(null);
  const [draft, setDraft] = useState<Script | null>(null);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [spark, setSpark] = useState<SparkStatus | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [produce, setProduce] = useState<ProduceOptions>(loadPrefs);
  const [rewrite, setRewrite] = useState<RewriteOptions>(loadRewritePrefs);
  const [elapsed, setElapsed] = useState(0);
  const [audioPending, setAudioPending] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [studioPath, setStudioPath] = useState<StudioPath>(PATH.input);
  const prevStatus = useRef<JobStatus | undefined>(undefined);
  const waitClock = useRef({key: '', started: 0});
  const llmSecondary = useRef<(() => void) | null>(null);
  const pingMisses = useRef(0);
  const hasLlm = llmOn || Boolean(view?.job.llm_configured);
  const isStudio = isStudioPath(location.pathname);
  const step = isStudio ? studioStepFromPath(location.pathname) : studioStepFromPath(studioPath);

  useEffect(() => {
    if (isStudioPath(location.pathname)) setStudioPath(location.pathname);
  }, [location.pathname]);

  function refreshVoices() {
    return listVoices()
      .then((payload) => {
        setVoices(payload.voices);
        setSpark(payload.spark);
        setProduce((current) => {
          if (payload.voices.some((item) => item.id === current.voice)) return current;
          return {...current, voice: payload.default_voice};
        });
      })
      .catch(() => undefined);
  }

  function refreshAssets() {
    return listAssets()
      .then((payload) => {
        setAssets(payload.items);
        setProduce((current) => {
          const backgroundOk = !current.backgroundId || payload.items.some((item) => item.id === current.backgroundId);
          const musicOk =
            !current.musicId ||
            current.musicId === '__bg_audio__' ||
            payload.items.some((item) => item.id === current.musicId);
          if (backgroundOk && musicOk) return current;
          const next = {
            ...current,
            backgroundId: backgroundOk ? current.backgroundId : '',
            musicId: musicOk ? current.musicId : '',
          };
          savePrefs(next);
          return next;
        });
      })
      .catch(() => undefined);
  }

  function refreshEngine() {
    return getModels()
      .then(setEngine)
      .catch(() => undefined);
  }

  async function forceRestartBackend() {
    if (restarting) return;
    setRestarting(true);
    try {
      const message = await restartBackend();
      pingMisses.current = 0;
      setApiDown(false);
      setBusy(false);
      setAudioPending(false);
      await refreshEngine();
      await refreshVoices();
      setFlash({kind: 'ok', title: '后端已重启', message: message || '可以继续制作。进行中的任务已中断，请重试。'});
    } catch (err) {
      setFlash({
        kind: 'error',
        title: '重启失败',
        message: err instanceof Error ? err.message : '强制重启失败',
      });
    } finally {
      setRestarting(false);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (restarting) return;
      void pingHealth(3500).then((ok) => {
        if (ok) {
          pingMisses.current = 0;
          setApiDown(false);
          return;
        }
        pingMisses.current += 1;
        if (pingMisses.current >= 2) setApiDown(true);
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [restarting]);

  function goStudio(path: StudioPath, force = false) {
    setStudioPath(path);
    if (force || isStudioPath(location.pathname) || location.pathname === '/') navigate(path);
  }

  function openSettings(focus: 'llm' | 'components' | '' = '') {
    navigate(settingsPath(focus));
  }

  function remindNeedEngine(ids: string[], feature: string) {
    if (!engine) return false;
    const missing = ids.filter((id) => componentMissing(engine, id));
    if (!missing.length) return false;
    setFlash({
      kind: 'warn',
      title: '缺少本地组件',
      message: `「${feature}」还缺：${missing.map((id) => COMPONENT_LABELS[id] || id).join('、')}。请到齿轮配置 → 本地组件安装。`,
      actionLabel: '去安装组件',
      go: 'components',
    });
    return true;
  }

  useEffect(() => {
    void refreshVoices();
    void refreshEngine();
    void getSettings()
      .then((payload) => {
        setLlmOn(payload.configured);
        setLlmLabel(payload.llm.label);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isStudio || location.pathname === PATH.assets) void refreshAssets();
    if (location.pathname === PATH.settings) void refreshEngine();
  }, [location.pathname, isStudio]);

  useEffect(() => {
    if (!view?.job.voice) return;
    setProduce((current) => ({
      ...current,
      voice: view.job.voice || current.voice,
      deckKind: view.job.deck_kind ? normalizeDeckKind(view.job.deck_kind) : current.deckKind,
    }));
    const genre = REWRITE_GENRES.find((item) => item.id === view.job.rewrite_genre)?.id;
    const platform = REWRITE_PLATFORMS.find((item) => item.id === view.job.rewrite_platform)?.id;
    if (genre || platform) {
      setRewrite((current) => {
        const next = {
          genre: genre || current.genre,
          platform: platform || current.platform,
        };
        saveRewritePrefs(next);
        return next;
      });
    }
  }, [view?.job.id]);

  function changeProduce(next: ProduceOptions) {
    setProduce(next);
    savePrefs(next);
  }

  function changeRewrite(next: RewriteOptions) {
    setRewrite(next);
    saveRewritePrefs(next);
  }

  const working = WORKING.includes(view?.job.status ?? 'draft');
  const uploading = audioPending && !working && isStudio;
  const waiting = working || uploading;
  const waitKind: JobStatus | 'uploading' = uploading ? 'uploading' : (view?.job.status ?? 'draft');
  const waitKey = uploading ? 'upload' : working && view ? `${view.job.id}:${view.job.status}` : '';
  const transcriptText = view?.transcript?.text ?? text;
  const currentScript = draft ?? view?.script ?? null;

  const canReach = [
    true,
    Boolean(view && transcriptText.trim()),
    Boolean(view && transcriptText.trim()),
    Boolean(view && scriptReady(currentScript)),
    Boolean(view && (scriptReady(currentScript) || view.has_final)),
    Boolean(view && scriptReady(currentScript)),
  ];

  const nextHint = useMemo(() => {
    if (step === 0 && !text.trim() && !view?.transcript?.text) return '先录音、上传音频，或贴一段口播文字。';
    if (step === 1 && !transcriptText.trim()) return '原文不能为空。';
    if (step === 2 && !scriptReady(currentScript)) return '口播稿需要有可朗读的正文。下一步会把口播逐句平移成展示页。';
    if (step === 3 && !view?.deck?.beats?.length) return '请先回到口播稿：下一步平移，或点「AI 生成展示稿」混排。';
    if (step === 3) return '写想要的效果，点「生成效果方案」会同时配主题、展示卡样式和揭示方式。';
    if (step === 4 && produce.mode === 'teleprompter' && !view?.has_take) {
      return '先对着提词器录一段，再生成成片。';
    }
    if (step === 4 && !view?.has_final && !working) return '可以先生成成片，或直接去做发布检查。';
    return '';
  }, [step, text, view?.transcript?.text, transcriptText, currentScript, produce.mode, view?.has_take, view?.has_final, view?.deck?.beats?.length, working]);

  const requiredMissing = engine
    ? ['ffmpeg', 'node', 'remotion', 'whisper-base'].filter((id) => componentMissing(engine, id))
    : [];

  const narrationPreview = useMemo(() => (currentScript ? composeSpoken(currentScript) : ''), [currentScript]);

  useEffect(() => {
    if (!view || !WORKING.includes(view.job.status)) return;
    const timer = window.setInterval(() => {
      void getJob(view.job.id)
        .then((next) => {
          setView(next);
          if (next.script) setDraft(next.script);
          if (next.transcript?.text) setText(next.transcript.text);
        })
        .catch(() => undefined);
    }, 800);
    return () => window.clearInterval(timer);
  }, [view?.job.id, view?.job.status]);

  useEffect(() => {
    if (!waitKey) {
      waitClock.current = {key: '', started: 0};
      setElapsed(0);
      return;
    }
    if (waitClock.current.key !== waitKey) {
      const continueClock =
        waitClock.current.started > 0 &&
        waitClock.current.key.startsWith('upload') &&
        waitKey.includes('transcribing');
      waitClock.current = {
        key: waitKey,
        started: continueClock ? waitClock.current.started : Date.now(),
      };
      if (!continueClock) setElapsed(0);
    }
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - waitClock.current.started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitKey]);

  useEffect(() => {
    const status = view?.job.status;
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev === 'transcribing' && status === 'transcribed') {
      goStudio(PATH.transcript);
      setFlash({kind: 'ok', title: '识别完成', message: '请确认原文，改稿时会按原稿篇幅来写。'});
    }
    if (prev === 'analyzing' && status === 'script_ready') {
      goStudio(PATH.script);
      setFlash({kind: 'ok', title: '改稿完成', message: '请确认口播稿，再整理展示画面。'});
    }
    if (status === 'voicing' || status === 'rendering') goStudio(PATH.produce);
    if (prev === 'voicing' && status === 'script_ready') {
      goStudio(PATH.produce);
      setFlash({kind: 'ok', title: '声音已导出', message: '可以试听、下载 MP3，或再生成成片。'});
    }
    if ((prev === 'voicing' || prev === 'rendering') && status === 'done') {
      goStudio(PATH.produce);
      setFlash({kind: 'ok', title: '成片已导出', message: '可以预览、下载，或去做发布检查。'});
    }
    if (status === 'failed' && prev && prev !== 'failed') {
      const message = view?.job.error || '任务失败，请重试。';
      setFlash({
        kind: 'error',
        title: '处理失败',
        message,
        actionLabel: installHint(message) ? '去安装组件' : undefined,
        go: installHint(message) ? 'components' : undefined,
      });
    }
  }, [view?.job.status, view?.job.error]);

  useEffect(() => {
    if (view?.transcript?.text && !text) setText(view.transcript.text);
  }, [view?.transcript?.text]);

  function flashOk(message: string, title = '完成') {
    setFlash({kind: 'ok', title, message});
  }

  function flashErr(message: string, title = '操作失败') {
    setFlash({kind: 'error', title, message});
  }

  function remindNeedLlm(feature: string, secondary?: {label: string; run: () => void}) {
    llmSecondary.current = secondary?.run ?? null;
    setFlash({
      kind: 'warn',
      title: '还没有配置大模型',
      message: `「${feature}」需要先在齿轮里添加 DeepSeek、通义等接口，再点「保存并使用」。不配也能继续：口播稿可用原文，发布检查仍走规则。`,
      actionLabel: '去配置大模型',
      go: 'llm',
      secondaryLabel: secondary?.label,
    });
  }

  async function wrap(action: () => Promise<JobView>, ok?: string): Promise<JobView | null> {
    setBusy(true);
    try {
      const next = await action();
      setView(next);
      if (next.script) setDraft(next.script);
      if (next.transcript?.text) setText(next.transcript.text);
      if (ok) flashOk(ok);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败';
      if (installHint(message)) {
        setFlash({
          kind: 'error',
          title: '缺少本地组件',
          message,
          actionLabel: '去安装组件',
          go: 'components',
        });
      } else {
        flashErr(message);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (location.pathname !== PATH.script || !view || working || busy) return;
    if (draft || view.script) return;
    if (!transcriptText.trim()) return;
    void wrap(() => adoptScript(view.job.id));
  }, [location.pathname, view?.job.id]);

  function beginVoice() {
    const needs = ['ffmpeg'];
    const voice = voices.find((item) => item.id === produce.voice);
    if (produce.mode === 'tts' && voice?.engine === 'spark') needs.push('spark-tts');
    if (remindNeedEngine(needs, '生成声音')) return Promise.resolve(null);
    if (!view) return Promise.resolve(null);
    return wrap(async () => {
      if (currentScript) await saveScript(view.job.id, currentScript);
      return renderJob(view.job.id, produce, {audioOnly: true});
    }, '已开始生成声音，请稍候。');
  }

  function beginRender() {
    const needs = ['ffmpeg', 'node', 'remotion'];
    const voice = voices.find((item) => item.id === produce.voice);
    if (produce.mode === 'tts' && voice?.engine === 'spark') needs.push('spark-tts');
    if (remindNeedEngine(needs, '生成成片')) return Promise.resolve(null);
    if (!view) return Promise.resolve(null);
    return wrap(async () => {
      if (currentScript) await saveScript(view.job.id, currentScript);
      return renderJob(view.job.id, produce);
    }, '已开始生成成片，请稍候。');
  }

  function goBack() {
    if (step > 0 && !busy && !working) goStudio(studioPathFromStep(step - 1), true);
  }

  async function goNext() {
    if (busy || working) return;
    try {
      if (step === 0) {
        const source = text.trim();
        if (!source) {
          flashErr('先录音、上传音频，或贴一段口播文字。', '还不能继续');
          return;
        }
        if (view) {
          const saved = await wrap(() => saveTranscript(view.job.id, source));
          if (!saved) return;
        } else {
          const created = await wrap(() => createTextJob(source, produce.voice), '文字已导入，请确认原文。');
          if (!created) return;
        }
        goStudio(PATH.transcript, true);
        return;
      }
      if (step === 1) {
        if (!view || !transcriptText.trim()) {
          flashErr('原文不能为空。', '还不能继续');
          return;
        }
        const saved = await wrap(() => saveTranscript(view.job.id, transcriptText));
        if (!saved) return;
        const existing = saved.script;
        const keepRewrite =
          existing != null &&
          (existing.engine === 'llm' || existing.engine === 'heuristic') &&
          (existing.cleaned_transcript || '').trim() === transcriptText.trim();
        if (!keepRewrite) {
          const adopted = await wrap(() => adoptScript(view.job.id));
          if (!adopted) return;
        }
        goStudio(PATH.script, true);
        return;
      }
      if (step === 2) {
        if (!view || !currentScript || !scriptReady(currentScript)) {
          flashErr('口播稿需要有可朗读的正文。', '还不能继续');
          return;
        }
        const saved = await wrap(() => saveScript(view.job.id, currentScript));
        if (!saved) return;
        try {
          const payload = await planDeck(saved.job.id, 'mirror');
          setView((current) => (current ? {...current, deck: payload.deck} : current));
          changeProduce({...produce, deckKind: 'mirror'});
        } catch (err) {
          flashErr(err instanceof Error ? err.message : '平移展示稿失败');
          return;
        }
        goStudio(PATH.deck, true);
        return;
      }
      if (step === 3) {
        if (!view || !currentScript || !scriptReady(currentScript)) {
          flashErr('口播稿需要有可朗读的正文。', '还不能继续');
          return;
        }
        const localDeck = view.deck;
        const saved = await wrap(() => saveScript(view.job.id, currentScript));
        if (!saved) return;
        try {
          const toSave = localDeck?.beats?.length
            ? localDeck
            : (await planDeck(saved.job.id, 'mirror')).deck;
          const payload = await saveDeck(saved.job.id, toSave);
          setView((current) => (current ? {...current, deck: payload.deck} : current));
        } catch (err) {
          flashErr(err instanceof Error ? err.message : '保存展示稿失败');
          return;
        }
        goStudio(PATH.produce, true);
        return;
      }
      if (step === 4) {
        if (!view || !scriptReady(currentScript)) {
          flashErr('口播稿需要有可朗读的正文。', '还不能继续');
          return;
        }
        if (currentScript) {
          const saved = await wrap(() => saveScript(view.job.id, currentScript));
          if (!saved) return;
        }
        goStudio(PATH.publish, true);
      }
    } catch {
      /* wrap already recorded the error */
    }
  }

  function resetJob() {
    setView(null);
    setText('');
    setDraft(null);
    setFlash(null);
    setAudioPending(false);
    goStudio(PATH.input, true);
  }

  function openJob(next: JobView, nextStep: number) {
    setView(next);
    setText(next.transcript?.text ?? '');
    setDraft(next.script);
    setFlash(null);
    goStudio(studioPathFromStep(nextStep), true);
  }

  function generateKeywordsForJob() {
    if (!view || !currentScript) return;
    const run = () =>
      void wrap(async () => {
        await saveScript(view.job.id, currentScript);
        return generateKeywords(view.job.id);
      }, '重点词已更新。');
    if (!hasLlm) {
      remindNeedLlm('AI 生成重点词', {label: '用规则抽取', run});
      return;
    }
    run();
  }

  function scrubLimitsForJob() {
    if (!view || !currentScript || !scriptReady(currentScript)) {
      flashErr('口播稿需要有可朗读的正文。', '还不能核对极限词');
      return;
    }
    void wrap(async () => {
      await saveScript(view.job.id, currentScript);
      return scrubScriptLimits(view.job.id);
    }).then((next) => {
      if (!next?.script) return;
      const note = (next.script.notes || []).find((item) => item.startsWith('极限词'));
      flashOk(note || next.job.step_message || '已核对极限词。', '极限词');
    });
  }

  function generateDeckForJob() {
    if (!view || !currentScript || !scriptReady(currentScript)) {
      flashErr('口播稿需要有可朗读的正文。', '还不能生成展示稿');
      return;
    }
    const run = () =>
      void wrap(async () => {
        await saveScript(view.job.id, currentScript);
        const payload = await planDeck(view.job.id, 'auto');
        changeProduce({...produce, deckKind: 'auto'});
        const next = await getJob(view.job.id);
        return {...next, deck: payload.deck};
      }, '已用 AI 混排展示稿。').then((saved) => {
        if (saved) goStudio(PATH.deck, true);
      });
    if (!hasLlm) {
      remindNeedLlm('AI 生成展示稿', {label: '改为逐句平移', run: () => void goNext()});
      return;
    }
    run();
  }

  function startAnalyze() {
    if (!hasLlm) {
      remindNeedLlm('AI 改稿');
      return;
    }
    if (!view) return;
    void wrap(async () => {
      await saveTranscript(view.job.id, transcriptText);
      return analyzeJob(view.job.id, rewrite);
    }, '已开始改稿，请稍候。');
  }

  const value: StudioContextValue = {
    view,
    setView,
    text,
    setText,
    draft,
    setDraft,
    produce,
    changeProduce,
    rewrite,
    changeRewrite,
    voices,
    spark,
    engine,
    assets,
    refreshVoices,
    refreshAssets,
    refreshEngine,
    llmOn,
    llmLabel,
    setLlmMeta: (next) => {
      setLlmOn(next.configured);
      setLlmLabel(next.label);
    },
    hasLlm,
    busy,
    working,
    waiting,
    uploading,
    setAudioPending,
    elapsed,
    waitKind,
    step,
    studioPath,
    isStudio,
    canReach,
    nextHint,
    currentScript,
    transcriptText,
    narrationPreview,
    requiredMissing,
    apiDown,
    restarting,
    flash,
    setFlash,
    llmSecondary,
    wrap,
    goBack,
    goNext,
    goStudio,
    openSettings,
    resetJob,
    beginVoice,
    beginRender,
    remindNeedEngine,
    remindNeedLlm,
    generateKeywordsForJob,
    scrubLimitsForJob,
    generateDeckForJob,
    forceRestartBackend,
    openJob,
    startAnalyze,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
