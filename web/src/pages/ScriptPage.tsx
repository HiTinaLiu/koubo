import {captionHighlights, highlightParts} from '../highlight';
import {padIndex, slideLines, slideTitle} from '../slides';
import {genreName, platformName} from '../rewrite';
import {useStudio} from '../studio/StudioContext';
import {keywordHint, patchSpoken, scriptReady} from '../studio/script';

export function ScriptPage() {
  const {
    busy,
    working,
    view,
    currentScript,
    setDraft,
    rewrite,
    hasLlm,
    goBack,
    goNext,
    nextHint,
    narrationPreview,
    generateKeywordsForJob,
    scrubLimitsForJob,
    generateDeckForJob,
  } = useStudio();

  return (
    <section className="panel">
      {currentScript ? (
        <div className="fields">
          {currentScript.plan ? (
            <div className="plan-card">
              <div className="produce-head">规划架构</div>
              <p className="hint">
                {genreName(currentScript.genre) || genreName(rewrite.genre)}
                {' · '}
                {platformName(currentScript.platform) || platformName(rewrite.platform)}
                {currentScript.plan.tone ? ` · ${currentScript.plan.tone}` : ''}
              </p>
              {currentScript.plan.angle ? <p>角度：{currentScript.plan.angle}</p> : null}
              {currentScript.plan.audience ? <p>给谁看：{currentScript.plan.audience}</p> : null}
              {currentScript.plan.hook_plan ? <p>开头：{currentScript.plan.hook_plan}</p> : null}
              {currentScript.plan.beats && currentScript.plan.beats.length ? (
                <ol>
                  {currentScript.plan.beats.map((beat, index) => (
                    <li key={`${beat}-${index}`}>{beat}</li>
                  ))}
                </ol>
              ) : null}
              {currentScript.plan.cta_plan ? <p>结尾：{currentScript.plan.cta_plan}</p> : null}
              {currentScript.plan.platform_fit ? <p>平台：{currentScript.plan.platform_fit}</p> : null}
            </div>
          ) : null}
          <label>
            <span>主题词（可空，成片片头用；不点 AI 改稿不会自动填写）</span>
            <input
              type="text"
              value={currentScript.topic}
              onChange={(event) => setDraft(patchSpoken(currentScript, {topic: event.target.value}))}
            />
          </label>
          <label>
            <span>开头 Hook</span>
            <input
              type="text"
              value={currentScript.hook}
              onChange={(event) => setDraft(patchSpoken(currentScript, {hook: event.target.value}))}
            />
          </label>
          <label>
            <span>正文短句，一行一句。下一步会把口播逐句平移到展示稿；也可以让 AI 混排画面。</span>
            <textarea
              value={currentScript.body.join('\n')}
              onChange={(event) =>
                setDraft(
                  patchSpoken(currentScript, {
                    body: event.target.value.split('\n').map((line) => line.trimStart()),
                  }),
                )
              }
            />
          </label>
          <p className="hint">
            {slideLines(currentScript.hook, currentScript.body).length
              ? slideLines(currentScript.hook, currentScript.body).map((line, index, all) => (
                  <span key={`${index}-${line}`}>
                    {padIndex(index + 1)} {slideTitle(line)}
                    {index < all.length - 1 ? ' → ' : ''}
                  </span>
                ))
              : '还没有 Hook 和正文。补上句子后，下一步会整理展示稿。'}
          </p>
          <label>
            <span>CTA（可空）</span>
            <input
              type="text"
              value={currentScript.cta}
              onChange={(event) => setDraft(patchSpoken(currentScript, {cta: event.target.value}))}
            />
          </label>
          <label>
            <span>步骤卡重点词</span>
            <input
              type="text"
              value={(currentScript.keywords || []).join('，')}
              onChange={(event) =>
                setDraft({
                  ...currentScript,
                  keywords: event.target.value
                    .split(/[,，、\s]+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                  keyword_engine: 'manual',
                })
              }
              placeholder="关注，结论，方法"
            />
          </label>
          <p className="hint">{keywordHint(currentScript, hasLlm)}</p>
          <div className="actions" style={{marginTop: 0}}>
            <button
              type="button"
              className="btn ghost"
              disabled={busy || working || !view}
              onClick={generateKeywordsForJob}
            >
              AI 生成重点词
            </button>
          </div>
          <p className="hint narration-preview">
            朗读稿：
            {highlightParts(narrationPreview, captionHighlights(currentScript)).map((part, index) =>
              part.hit ? (
                <em key={`${part.text}-${index}`} className={part.step ? 'step' : undefined}>
                  {part.text}
                </em>
              ) : (
                <span key={`${part.text}-${index}`}>{part.text}</span>
              ),
            )}
          </p>
          {currentScript.notes.map((note) => (
            <p key={note} className="note">
              {note}
            </p>
          ))}
        </div>
      ) : (
        <p className="hint">还没有口播稿。请回到原文，确认文字后点下一步。</p>
      )}
      <div className="actions">
        <button className="btn ghost" disabled={busy || working} onClick={goBack}>
          上一步
        </button>
        <button
          className="btn ghost"
          disabled={busy || working || !scriptReady(currentScript)}
          onClick={() => void scrubLimitsForJob()}
        >
          验证平台极限词并调整
        </button>
        <button
          className="btn ghost"
          disabled={busy || working || !scriptReady(currentScript)}
          onClick={() => void generateDeckForJob()}
        >
          AI 生成展示稿
        </button>
        <button className="btn" disabled={busy || working || !scriptReady(currentScript)} onClick={() => void goNext()}>
          下一步
        </button>
      </div>
      {nextHint ? <p className="hint">{nextHint}</p> : null}
    </section>
  );
}
