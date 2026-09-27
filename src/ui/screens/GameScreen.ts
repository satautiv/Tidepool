/** The Endless play screen: the canvas underneath does the playing; this adds the HUD. */
import { FxLayer, type CalloutTiming, type FloatTiming } from '../components/FxLayer';
import { GameOverPanel } from '../components/GameOverPanel';
import { Hint } from '../components/Hint';
import { Hud, type HudClock } from '../components/Hud';
import { PauseDialog, type PauseActions } from '../components/PauseDialog';
import type { Screen } from '../Router';

export interface GameScreenActions extends PauseActions {
  onPause: () => void;
  onPlayAgain: () => void;
  onSecondChance?: () => void;
}

/** Feel values (FEEL.callout, FEEL.score) and injectable clocks for tests. */
export interface GameScreenOptions {
  callout: CalloutTiming;
  score: FloatTiming & { countUpDuration: number };
  clock?: HudClock;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

export class GameScreen implements Screen {
  readonly hud: Hud;
  readonly gameOver: GameOverPanel;
  readonly fx: FxLayer;
  readonly hint = new Hint();
  readonly pause: PauseDialog;

  constructor(actions: GameScreenActions, opts: GameScreenOptions) {
    this.hud = new Hud(actions.onPause, {
      score: opts.score,
      ...(opts.clock ? { clock: opts.clock } : {}),
      ...(opts.setTimer ? { setTimer: opts.setTimer } : {}),
    });
    this.fx = new FxLayer(opts.callout, opts.score, opts.setTimer);
    this.gameOver = new GameOverPanel(actions);
    this.pause = new PauseDialog(actions);
  }

  mount(root: HTMLElement): void {
    root.append(this.hud.el, this.fx.el, this.hint.el, this.gameOver.el, this.pause.el);
  }

  unmount(): void {
    this.hud.el.remove();
    this.fx.el.remove();
    this.hint.el.remove();
    this.gameOver.el.remove();
    this.pause.el.remove();
  }
}
