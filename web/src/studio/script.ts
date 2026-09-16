import type {Script} from '../types';

export function scriptReady(script: Script | null | undefined) {
  if (!script) return false;
  const spoken = script.narration.trim() || script.hook.trim() || script.body.some((line) => line.trim());
  return Boolean(spoken);
}

function spokenLetters(text: string) {
  return text.replace(/[^\w\u4e00-\u9fff]+/g, '');
}

function withSpokenStop(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

export function composeSpoken(script: Pick<Script, 'topic' | 'hook' | 'body' | 'cta' | 'narration'>) {
  const topic = script.topic.trim();
  const hook = script.hook.trim();
  const cta = script.cta.trim();
  const fallback = script.narration.trim();
  const join = (parts: string[]) => parts.map(withSpokenStop).filter(Boolean).join('') || fallback;
  const topicKey = spokenLetters(topic);
  const hookKey = spokenLetters(hook);
  if (topicKey && hookKey && (hookKey === topicKey || hookKey.startsWith(topicKey))) {
    return join([hook, ...script.body, cta]);
  }
  if (topic) return join([topic, hook, ...script.body, cta]);
  return join([hook, ...script.body, cta]);
}

export function patchSpoken(script: Script, patch: Partial<Script>): Script {
  const next = {...script, ...patch};
  if (patch.topic !== undefined || patch.hook !== undefined || patch.body !== undefined || patch.cta !== undefined) {
    next.narration = composeSpoken(next);
  }
  return next;
}

export function keywordHint(script: Script | null, llm: boolean) {
  if (script?.engine === 'manual' && !(script.keywords || []).length) {
    return '未走 AI 改稿时默认为空，可手填或点下方按钮生成。';
  }
  if (script?.keyword_engine === 'llm') return 'AI 抽取，不限个数，可改。朗读稿、提词器和步骤卡片都会标这些词。';
  if (script?.keyword_engine === 'manual') return '手改重点词，不限个数。朗读稿、提词器和步骤卡片都会标这些词。';
  if (llm) return '不限个数。点按钮可用 AI 抽取，也会标在朗读稿和提词器上。';
  return '未配置 LLM，当前按规则抽取，不限个数。朗读稿、提词器和步骤卡片都会标这些词。';
}
