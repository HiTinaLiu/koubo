import {NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import type {ReactNode} from 'react';
import {NoticeDialog} from '../component/NoticeDialog';
import {PATH, STUDIO_STEPS, settingsPath} from '../paths';
import {COMPONENT_LABELS} from '../studio/engine';
import {JobWait} from '../component/JobWait';
import {useStudio} from '../studio/StudioContext';

export function AppShell({children}: {children?: ReactNode}) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    view,
    busy,
    working,
    isStudio,
    studioPath,
    canReach,
    llmOn,
    llmLabel,
    requiredMissing,
    apiDown,
    restarting,
    flash,
    setFlash,
    llmSecondary,
    openSettings,
    forceRestartBackend,
  } = useStudio();

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark" />
          <div>
            <h1>口播场记</h1>
            <p>录音/文字 → 改稿 → 配音 → 成片 → 发布检查</p>
          </div>
        </div>
        <div className="top-tools">
          <div className="nav-tabs">
            <NavLink to={studioPath} className={() => (isStudio ? 'btn' : 'btn ghost')}>
              制作
            </NavLink>
            <NavLink to={PATH.voices} className={({isActive}) => (isActive ? 'btn' : 'btn ghost')}>
              声音
            </NavLink>
            <NavLink to={PATH.library} className={({isActive}) => (isActive ? 'btn' : 'btn ghost')}>
              文稿
            </NavLink>
            <NavLink to={PATH.history} className={({isActive}) => (isActive ? 'btn' : 'btn ghost')}>
              成片
            </NavLink>
            <NavLink to={PATH.assets} className={({isActive}) => (isActive ? 'btn' : 'btn ghost')}>
              素材
            </NavLink>
            <NavLink
              to={requiredMissing.length ? settingsPath('components') : PATH.settings}
              className={({isActive}) => (isActive ? 'btn icon-btn' : 'btn ghost icon-btn')}
              title="配置"
              aria-label="配置"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.81 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.93 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.06.24.26.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
                />
              </svg>
            </NavLink>
          </div>
          <div className="meta">
            {view ? `JOB ${view.job.id}` : 'NEW JOB'}
            {window.koubo?.desktop ? ' · 桌面' : ''}
            {llmOn && llmLabel ? ` · ${llmLabel}` : llmOn || view?.job.llm_configured ? ' · LLM' : ' · 规则草稿'}
          </div>
        </div>
      </header>

      {apiDown || restarting ? (
        <button
          type="button"
          className="engine-banner danger"
          disabled={restarting}
          onClick={() => void forceRestartBackend()}
        >
          {restarting
            ? '正在强制重启后端…'
            : window.koubo?.restartApi
              ? '后端没有响应。点此强制重启（会结束占用 8777 的进程）。'
              : '后端没有响应。点此尝试重启；若仍无响应，请到运行 uvicorn 的终端结束进程后重开。'}
        </button>
      ) : requiredMissing.length > 0 && location.pathname !== PATH.settings ? (
        <button type="button" className="engine-banner" onClick={() => openSettings('components')}>
          缺少 {requiredMissing.map((id) => COMPONENT_LABELS[id] || id).join('、')}，转写或成片可能失败。点此去齿轮安装。
        </button>
      ) : null}

      {isStudio ? (
        <nav className="steps">
          {STUDIO_STEPS.map((item, index) => (
            <button
              key={item.path}
              type="button"
              className={`step ${location.pathname === item.path ? 'active' : ''} ${
                studioStepDone(location.pathname, index) ? 'done' : ''
              }`}
              disabled={busy || working || !canReach[index]}
              onClick={() => navigate(item.path)}
            >
              <b>0{index + 1}</b>
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}

      {isStudio ? <JobWait mode="sticky" /> : null}

      {children ?? <Outlet />}

      {flash ? (
        <NoticeDialog
          {...flash}
          onClose={() => {
            llmSecondary.current = null;
            setFlash(null);
          }}
          onAction={
            flash.actionLabel
              ? () => {
                  llmSecondary.current = null;
                  const dest = flash.go || 'llm';
                  setFlash(null);
                  openSettings(dest);
                }
              : undefined
          }
          onSecondary={
            flash.secondaryLabel
              ? () => {
                  const run = llmSecondary.current;
                  llmSecondary.current = null;
                  setFlash(null);
                  run?.();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function studioStepDone(pathname: string, index: number) {
  const current = STUDIO_STEPS.findIndex((item) => item.path === pathname);
  return current > index;
}
