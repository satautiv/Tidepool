/** Switches between UI screens with a short cross-fade (docs/PLAN.md §10). */

export interface Screen {
  /** Builds and inserts the screen's DOM into `root`. */
  mount(root: HTMLElement): void;
  unmount(): void;
}

export const ROUTER = { fadeMs: 200 } as const;

export class Router {
  private current: { screen: Screen; layer: HTMLElement } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  get screen(): Screen | null {
    return this.current?.screen ?? null;
  }

  /** Shows `screen`; the previous one fades out and unmounts. */
  async show(screen: Screen): Promise<void> {
    const previous = this.current;
    const layer = document.createElement('div');
    layer.className = 'screen screen--entering';
    this.root.append(layer);
    screen.mount(layer);
    this.current = { screen, layer };

    // Next frame: trigger the CSS transition.
    await this.wait(0);
    layer.classList.remove('screen--entering');
    if (previous) {
      previous.layer.classList.add('screen--leaving');
      await this.wait(ROUTER.fadeMs);
      previous.screen.unmount();
      previous.layer.remove();
    }
  }
}
