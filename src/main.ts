import './ui/styles/base.css';

// Bootstrap placeholder. The renderer (T1.11) and App shell (T1.18) take over from here.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

function resize(target: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  target.width = Math.round(target.clientWidth * dpr);
  target.height = Math.round(target.clientHeight * dpr);
}

new ResizeObserver(() => resize(canvas)).observe(canvas);
resize(canvas);
