import {useEffect, useState} from 'react';
import {reviewJob} from '../api';
import {NoticeDialog, type NoticeState} from './NoticeDialog';
import type {PlatformPack, Review, ReviewPlatform} from '../types';

const PLATFORM_NAME: Record<ReviewPlatform, string> = {
  douyin: '抖音',
  weixin: '视频号',
  xiaohongshu: '小红书',
};

const VERDICT_LABEL = {
  pass: '可通过',
  revise: '建议修改',
  block: '先改再发',
};

function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

function packClipboard(pack: PlatformPack) {
  const tags = pack.tags.map((tag) => `#${tag}`).join(' ');
  return `标题：${pack.title}\n封面：${pack.cover}\n简介：${pack.caption}\n话题：${tags}`;
}

export function ReviewPanel({
  jobId,
  initial,
  llmConfigured,
  coverUrl,
  onReviewed,
  onOpenSettings,
}: {
  jobId: string;
  initial?: Review | null;
  llmConfigured: boolean;
  coverUrl?: string;
  onReviewed?: (review: Review) => void;
  onOpenSettings?: () => void;
}) {
  const [review, setReview] = useState<Review | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<NoticeState | null>(null);
  const [copied, setCopied] = useState('');

  async function run(fromUser = false) {
    if (fromUser && !llmConfigured) {
      setFlash({
        kind: 'warn',
        title: '还没有配置大模型',
        message: '「发布前检查」会调用大模型做风控和文案包。请先在齿轮里添加 DeepSeek、通义等接口，再点「保存并使用」。',
        actionLabel: onOpenSettings ? '去配置大模型' : undefined,
        secondaryLabel: '仍用规则检查',
      });
      return;
    }
    setBusy(true);
    try {
      const next = await reviewJob(jobId);
      setReview(next.review || null);
      if (next.review) {
        onReviewed?.(next.review);
        setFlash({kind: 'ok', title: '检查完成', message: next.review.summary || '发布前检查已完成。'});
      }
    } catch (err) {
      setFlash({
        kind: 'error',
        title: '检查失败',
        message: err instanceof Error ? err.message : '检查失败',
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setReview(initial || null);
    if (initial) return;
    if (!llmConfigured) return;
    void run();
  }, [jobId, llmConfigured]);

  async function copy(key: string, text: string) {
    try {
      await copyText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
      setFlash({kind: 'ok', title: '已复制', message: '文案已复制到剪贴板。'});
    } catch {
      setFlash({kind: 'error', title: '复制失败', message: '请手动选中文字。'});
    }
  }

  return (
    <div className="review">
      <div className="produce-head">发布前检查</div>
      <p className="hint">
        {llmConfigured
          ? '对照抖音、视频号、小红书看一遍口播和文案。已配置 AI，会连规则一起查。'
          : '对照抖音、视频号、小红书看一遍口播和文案。未配置大模型时，「开始检查」需要先添加 Key，或改用规则检查。'}
      </p>
      {coverUrl ? (
        <figure className="cover-wrap">
          <img src={coverUrl} alt="成片主图" />
        </figure>
      ) : null}
      {busy && !review ? <p className="hint">正在检查发布风险…</p> : null}
      {review ? (
        <>
          <div className={`review-summary ${review.verdict}`}>
            <b>
              {VERDICT_LABEL[review.verdict]} · {review.score} 分
            </b>
            <p>{review.summary}</p>
            <small>{review.engine === 'llm' ? 'AI + 规则' : '规则检查'}</small>
          </div>
          {review.findings.length ? (
            <div className="finding-list">
              {review.findings.map((item) => (
                <article key={`${item.code}-${item.title}`} className={`finding ${item.level}`}>
                  <b>
                    {item.level === 'block' ? '拦截' : '注意'} · {item.title}
                  </b>
                  <p>{item.detail}</p>
                  {item.suggestion ? <p>建议：{item.suggestion}</p> : null}
                  <small>{item.platforms.map((name) => PLATFORM_NAME[name]).join('、')}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="hint">没有列出拦截项。发之前仍请你自己看一遍封面和口播。</p>
          )}
          <div className="pack-grid">
            {review.packs.map((pack) => (
              <article key={pack.platform} className="pack-card">
                <b>{PLATFORM_NAME[pack.platform]}</b>
                <p>
                  <span>标题</span>
                  {pack.title}
                </p>
                <p>
                  <span>封面大字</span>
                  {pack.cover}
                </p>
                <p>
                  <span>简介</span>
                  {pack.caption}
                </p>
                <p>
                  <span>话题</span>
                  {pack.tags.map((tag) => `#${tag}`).join(' ')}
                </p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void copy(pack.platform, packClipboard(pack))}
                >
                  {copied === pack.platform ? '已复制' : '复制文案'}
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(true)}>
          {busy ? '检查中' : review ? '重新检查' : '开始检查'}
        </button>
        <a className="btn ghost" href={`/api/jobs/${jobId}/pack.txt`} download>
          下载文案包
        </a>
        {coverUrl ? (
          <a className="btn ghost" href={coverUrl} download>
            下载主图
          </a>
        ) : null}
      </div>
      {flash ? (
        <NoticeDialog
          {...flash}
          onClose={() => setFlash(null)}
          onAction={
            flash.actionLabel && onOpenSettings
              ? () => {
                  setFlash(null);
                  onOpenSettings();
                }
              : undefined
          }
          onSecondary={
            flash.secondaryLabel
              ? () => {
                  setFlash(null);
                  void run(false);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
