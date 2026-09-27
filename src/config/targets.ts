/**
 * Build targets (docs/PLAN.md §20). One codebase, built per target with
 * `vite build --mode <target>` (which reads `.env.<target>` → `VITE_TARGET`). This table
 * decides the services and policies each target gets.
 */

export type TargetId = 'web' | 'itch' | 'crazygames' | 'poki' | 'android';

export interface TargetConfig {
  readonly id: TargetId;
  /** Ad provider (the others are never bundled: see services/ads/index.ts). */
  readonly ads: 'none' | 'crazygames' | 'poki' | 'admob';
  /** Service worker / offline install (T3.08). */
  readonly pwa: boolean;
  readonly storage: 'localStorage' | 'capacitor';
  readonly haptics: 'web' | 'capacitor';
  /** Some portals forbid links that leave the game (e.g. the privacy page). */
  readonly externalLinks: boolean;
}

export const TARGETS: Readonly<Record<TargetId, TargetConfig>> = {
  web: {
    id: 'web',
    ads: 'none',
    pwa: true,
    storage: 'localStorage',
    haptics: 'web',
    externalLinks: true,
  },
  itch: {
    id: 'itch',
    ads: 'none',
    pwa: false, // itch serves games in an iframe
    storage: 'localStorage',
    haptics: 'web',
    externalLinks: true,
  },
  crazygames: {
    id: 'crazygames',
    ads: 'crazygames',
    pwa: false,
    storage: 'localStorage',
    haptics: 'web',
    externalLinks: false,
  },
  poki: {
    id: 'poki',
    ads: 'poki',
    pwa: false,
    storage: 'localStorage',
    haptics: 'web',
    externalLinks: false,
  },
  android: {
    id: 'android',
    ads: 'admob',
    pwa: false, // assets are bundled in the app
    storage: 'capacitor',
    haptics: 'capacitor',
    externalLinks: true,
  },
};

export function isTargetId(v: unknown): v is TargetId {
  return typeof v === 'string' && v in TARGETS;
}

/** The config for a target id; unknown or missing ids are `web`. */
export function targetConfig(id: unknown): TargetConfig {
  return isTargetId(id) ? TARGETS[id] : TARGETS.web;
}
