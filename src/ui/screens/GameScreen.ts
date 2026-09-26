/** The Endless play screen: the canvas underneath does the playing; this adds the HUD. */
import { GameOverPanel } from '../components/GameOverPanel';
import { Hud } from '../components/Hud';
import type { Screen } from '../Router';

export interface GameScreenActions {
  onPause: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export class GameScreen implements Screen {
  readonly hud: Hud;
  readonly gameOver: GameOverPanel;

  constructor(actions: GameScreenActions) {
    this.hud = new Hud(actions.onPause);
    this.gameOver = new GameOverPanel(actions);
  }

  mount(root: HTMLElement): void {
    root.append(this.hud.el, this.gameOver.el);
  }

  unmount(): void {
    this.hud.el.remove();
    this.gameOver.el.remove();
  }
}
