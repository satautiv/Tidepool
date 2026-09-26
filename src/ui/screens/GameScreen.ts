/** The Endless play screen: the canvas underneath does the playing; this adds the HUD. */
import { Hud } from '../components/Hud';
import type { Screen } from '../Router';

export class GameScreen implements Screen {
  readonly hud: Hud;

  constructor(onPause: () => void) {
    this.hud = new Hud(onPause);
  }

  mount(root: HTMLElement): void {
    root.append(this.hud.el);
  }

  unmount(): void {
    this.hud.el.remove();
  }
}
