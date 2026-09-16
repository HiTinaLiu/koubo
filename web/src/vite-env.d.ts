/// <reference types="vite/client" />

interface KouboDesktop {
  desktop: boolean;
  restartApi?: () => Promise<{ok: boolean; message?: string}>;
}

interface Window {
  koubo?: KouboDesktop;
}
