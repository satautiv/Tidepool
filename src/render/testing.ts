/** Test doubles for canvas code. Test-only: never import from game code. */

export interface FakeContext {
  /** Every method call, in order: [name, ...args]. */
  calls: Array<[string, ...unknown[]]>;
  count(name: string): number;
  reset(): void;
}

/** A 2D context that records calls and accepts any property writes. */
export function fakeContext(): CanvasRenderingContext2D & FakeContext {
  const calls: Array<[string, ...unknown[]]> = [];
  const gradient = () => ({ addColorStop: () => {} });
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  };
  const props: Record<string, unknown> = {
    calls,
    count: (name: string) => calls.filter((c) => c[0] === name).length,
    reset: () => {
      calls.length = 0;
    },
  };
  return new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        return methods[key]?.(...args);
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D & FakeContext;
}

/** A canvas stand-in: records its 2D context calls and accepts event listeners. */
export class FakeCanvas extends EventTarget {
  readonly ctx = fakeContext();

  constructor(
    public width: number,
    public height: number,
  ) {
    super();
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height };
  }

  setPointerCapture(): void {}
}

/** A canvas factory that records every canvas it creates. */
export function fakeCanvasFactory() {
  const created: FakeCanvas[] = [];
  const factory = (width: number, height: number) => {
    const canvas = new FakeCanvas(width, height);
    created.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  return { factory, created };
}
