/** Injected by Vite at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;

interface ImportMetaEnv {
  /** The build target (docs/PLAN.md §20), from `.env.<mode>`. Missing in dev = web. */
  readonly VITE_TARGET?: string;
}
