import type { DesktopBridge } from './desktop';

declare global {
  interface Window {
    markdownStudioDesktop?: DesktopBridge;
  }
}

export {};
