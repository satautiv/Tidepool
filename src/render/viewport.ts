/**
 * Keeps the renderer sized to its element: CSS size via ResizeObserver, and device pixel ratio
 * changes (browser zoom, moving to another monitor) via a resolution media query.
 */
import type { Insets } from './layout';
import type { Renderer } from './Renderer';

export interface ViewportEnv {
  observeResize(element: Element, onResize: (width: number, height: number) => void): () => void;
  devicePixelRatio(): number;
  /** Calls `onChange` once when the DPR moves away from `dpr`. Returns an unsubscribe function. */
  onDprChange(dpr: number, onChange: () => void): () => void;
}

export const browserViewportEnv: ViewportEnv = {
  observeResize(element, onResize) {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]!.contentRect;
      onResize(rect.width, rect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  },
  devicePixelRatio: () => window.devicePixelRatio || 1,
  onDprChange(dpr, onChange) {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    query.addEventListener('change', onChange, { once: true });
    return () => query.removeEventListener('change', onChange);
  },
};

/** Wires resize and DPR changes to `renderer.resize`. Returns a function that detaches everything. */
export function attachViewport(
  renderer: Renderer,
  element: Element,
  env: ViewportEnv = browserViewportEnv,
): () => void {
  let width = 0;
  let height = 0;
  let stopDpr = (): void => {};

  const apply = (): void => {
    const dpr = env.devicePixelRatio();
    renderer.resize(width, height, dpr);
    stopDpr();
    stopDpr = env.onDprChange(dpr, apply);
  };

  const stopResize = env.observeResize(element, (w, h) => {
    width = w;
    height = h;
    apply();
  });

  return () => {
    stopResize();
    stopDpr();
  };
}

/**
 * The CSS safe-area insets (notches, rounded corners, home indicator), read from
 * `env(safe-area-inset-*)` through a hidden probe element, for the canvas layout. The DOM uses
 * the same `env()` values directly. Zero where unsupported.
 */
export function readSafeArea(doc: Document = document): Insets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
    'env(safe-area-inset-bottom) env(safe-area-inset-left)';
  doc.body.append(probe);
  const style = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const insets = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
  probe.remove();
  return insets;
}
