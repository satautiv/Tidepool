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

export interface FakeCanvas {
  width: number;
  height: number;
  ctx: CanvasRenderingContext2D & FakeContext;
  getContext(type: '2d'): CanvasRenderingContext2D;
}

/** A canvas factory that records every canvas it creates. */
export function fakeCanvasFactory() {
  const created: FakeCanvas[] = [];
  const factory = (width: number, height: number) => {
    const ctx = fakeContext();
    const canvas: FakeCanvas = { width, height, ctx, getContext: () => ctx };
    created.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  return { factory, created };
}
