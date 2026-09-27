/** The Endless play screen: the canvas underneath does the playing; this adds the HUD. */
import { GameOverPanel } from '../components/GameOverPanel';
import { Hud } from '../components/Hud';
import { PauseDialog, type PauseActions } from '../components/PauseDialog';
import type { Screen } from '../Router';

export interface GameScreenActions extends PauseActions {
  onPause: () => void;
  onPlayAgain: () => void;
  onSecondChance?: () => void;
}

export class GameScreen implements Screen {
  readonly hud: Hud;
  readonly gameOver: GameOverPanel;
  readonly pause: PauseDialog;

  constructor(actions: GameScreenActions) {
    this.hud = new Hud(actions.onPause);
    this.gameOver = new GameOverPanel(actions);
    this.pause = new PauseDialog(actions);
  }

  mount(root: HTMLElement): void {
    root.append(this.hud.el, this.gameOver.el, this.pause.el);
  }

  unmount(): void {
    this.hud.el.remove();
    this.gameOver.el.remove();
    this.pause.el.remove();
  }
}
