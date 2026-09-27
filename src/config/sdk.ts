/**
 * Portal SDK scripts, injected into index.html at build time for their target only
 * (vite.config.ts). Kept out of the runtime targets table so other builds never contain them.
 * Verify the URLs against the current official SDK docs when integrating (T3.05, T3.06).
 */
import type { TargetId } from './targets';

export const SDK_SCRIPTS: Partial<Record<TargetId, string>> = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
};
