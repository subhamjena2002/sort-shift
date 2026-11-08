import Phaser from 'phaser';
import type { BinSide, RunStats } from '../../types/game';
import type { PlayerIntent } from '../config/controls';
import { MAX_FRAME_DELTA_MS } from '../config/display';
import { DEFAULT_DIFFICULTY } from '../config/difficulty';
import { PARCEL_COLORS } from '../data/parcelCatalog';
import { DEFAULT_RULE } from '../data/sortingRules';
import { Conveyor } from '../entities/Conveyor';
import { ParcelView } from '../entities/ParcelView';
import { SortBin } from '../entities/SortBin';
import { InputController } from '../systems/InputController';
import { watchLayout } from '../systems/ResponsiveScaler';
import { clausesForSide } from '../systems/RuleEvaluator';
import { RunSession, type SessionEvent } from '../systems/RunSession';
import { Backdrop } from '../ui/Backdrop';
import { FeedbackLayer } from '../ui/FeedbackLayer';
import { Hud } from '../ui/Hud';
import { beltProgressToY, computeLayout, type GameLayout } from '../ui/layout';
import { NeonButton } from '../ui/NeonButton';
import { COLORS, CSS, DEPTH } from '../ui/theme';
import { createSeededRandom, randomSeed } from '../utils/random';
import { fadeIn, SceneDirector } from './SceneDirector';
import { SceneKeys } from './SceneKeys';

/** Everything visual in the Game scene; rebuilt when the orientation changes. */
interface DepotView {
  readonly layout: GameLayout;
  readonly backdrop: Backdrop;
  readonly conveyor: Conveyor;
  readonly bins: Readonly<Record<BinSide, SortBin>>;
  readonly buttons: Readonly<Record<BinSide, NeonButton>>;
  readonly hud: Hud;
  readonly feedback: FeedbackLayer;
  readonly parcels: readonly ParcelView[];
}

const RUN_END_DELAY_MS = 1100;
const PARCEL_POOL_SIZE = 2;

/**
 * The PLAYING scene. Game rules live in RunSession; this scene only feeds it
 * time and input and turns the resulting events into visuals.
 */
export class GameScene extends Phaser.Scene {
  private director!: SceneDirector;
  private session!: RunSession;
  private view: DepotView | null = null;
  private activeParcelView: ParcelView | null = null;
  private inputController: InputController | null = null;
  private endTimer: Phaser.Time.TimerEvent | null = null;
  private beltSpeedFactor = 1;
  private shownSpeedLevel = 1;

  constructor() {
    super(SceneKeys.GAME);
  }

  create(): void {
    this.director = SceneDirector.from(this);
    this.session = new RunSession({ rule: DEFAULT_RULE, random: createSeededRandom(randomSeed()) });
    this.activeParcelView = null;
    this.endTimer = null;
    this.beltSpeedFactor = 1;
    this.shownSpeedLevel = 1;

    this.buildView();

    this.inputController = new InputController(this, (intent) => this.handleIntent(intent, 'keyboard'));
    watchLayout(this, () => this.buildView());
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    fadeIn(this);
    this.view?.feedback.showBanner('SHIFT START', CSS.cyan, 450);
  }

  override update(_time: number, delta: number): void {
    const view = this.view;
    if (!view || !this.director.machine.is('PLAYING')) return;

    const dt = Math.min(delta, MAX_FRAME_DELTA_MS);
    this.applyEvents(this.session.update(dt));

    // Belt keeps running between parcels; it winds down once the run ends.
    if (this.session.isOver) this.beltSpeedFactor = Math.max(0, this.beltSpeedFactor - dt / 700);
    const belt = view.layout.belt;
    const pixelsPerMs = ((belt.decisionY - belt.spawnY) / this.session.currentTravelTimeMs) * this.beltSpeedFactor;
    const active = this.session.activeParcel;
    view.conveyor.update(dt, pixelsPerMs, active?.inDecisionZone ?? false);

    if (active && this.activeParcelView?.parcelId === active.parcel.id) {
      this.activeParcelView.setY(beltProgressToY(belt, active.progress));
    }
  }

  // ---------------------------------------------------------------- input

  private handleIntent(intent: PlayerIntent, source: 'keyboard' | 'pointer'): void {
    const view = this.view;
    if (!view || !this.director.machine.is('PLAYING')) return;

    if (intent === 'PAUSE') {
      if (source === 'keyboard') view.hud.flashPause();
      this.requestPause();
      return;
    }

    if (this.session.isOver) return;
    if (source === 'keyboard') view.buttons[intent].flash();
    this.applyEvents(this.session.choose(intent));
  }

  private requestPause(): void {
    if (this.session.isOver) return;
    this.director.pauseRun(this);
  }

  private handleFocusLoss(): void {
    if (this.director.machine.is('PLAYING')) this.requestPause();
  }

  // --------------------------------------------------------------- events

  private applyEvents(events: readonly SessionEvent[]): void {
    const view = this.view;
    if (!view) return;
    const belt = view.layout.belt;

    for (const event of events) {
      switch (event.type) {
        case 'PARCEL_SPAWNED': {
          const parcelView = this.acquireParcelView(view);
          parcelView.present(event.parcel, belt.x, beltProgressToY(belt, 0));
          this.activeParcelView = parcelView;
          break;
        }
        case 'PARCEL_SORTED': {
          const bin = view.bins[event.chosen];
          const mouth = bin.mouth;
          this.takeActiveParcelView(event.parcel.id)?.playSorted(mouth, event.correct, () => undefined);
          bin.flash(event.correct);
          view.feedback.burst(mouth.x, mouth.y, event.correct);
          if (event.correct) {
            view.feedback.popup(mouth.x, mouth.y - 70, `+${event.pointsAwarded}`, CSS.success);
          } else {
            view.feedback.popup(mouth.x, mouth.y - 70, 'WRONG BIN', CSS.danger);
            this.cameras.main.shake(180, 0.006);
          }
          break;
        }
        case 'PARCEL_MISSED': {
          this.takeActiveParcelView(event.parcel.id)?.playMissed(belt.rejectY, () => undefined);
          view.conveyor.flashReject();
          view.feedback.burst(belt.x, belt.decisionY, false);
          view.feedback.popup(belt.x, belt.decisionY - 80, 'MISSED', CSS.danger);
          this.cameras.main.shake(200, 0.007);
          break;
        }
        case 'SCORE_CHANGED': {
          view.hud.setScore(event.score, true);
          const level = this.session.speedLevel;
          view.hud.setSpeedLevel(level);
          if (level > this.shownSpeedLevel) {
            this.shownSpeedLevel = level;
            view.feedback.showBanner(`SPEED ${level}`, CSS.magenta, 450);
          }
          break;
        }
        case 'MISTAKES_CHANGED': {
          view.hud.setMistakesRemaining(event.remaining, true);
          if (event.remaining === 1) view.feedback.showBanner('LAST CHANCE', CSS.amber, 600);
          break;
        }
        case 'RUN_ENDED': {
          this.handleRunEnded(event.stats);
          break;
        }
      }
    }
  }

  private handleRunEnded(stats: RunStats): void {
    const view = this.view;
    view?.hud.setPauseEnabled(false);
    view?.buttons.LEFT.setEnabled(false);
    view?.buttons.RIGHT.setEnabled(false);
    view?.feedback.showBanner('SHIFT OVER', CSS.danger, 800);
    this.endTimer = this.time.delayedCall(RUN_END_DELAY_MS, () => {
      this.endTimer = null;
      this.director.endRun(this, stats);
    });
  }

  private acquireParcelView(view: DepotView): ParcelView {
    const free = view.parcels.find((p) => p.isFree);
    if (free) return free;
    // Pool exhausted (only possible if an animation is still running):
    // recycle the oldest view rather than allocating a new one.
    const recycled = view.parcels[0];
    if (!recycled) throw new Error('Parcel pool is empty');
    recycled.release();
    return recycled;
  }

  private takeActiveParcelView(parcelId: number): ParcelView | null {
    const current = this.activeParcelView;
    this.activeParcelView = null;
    return current && current.parcelId === parcelId ? current : null;
  }

  // ----------------------------------------------------------------- view

  /** (Re)build every visual from the current design size. Game state is untouched. */
  private buildView(): void {
    this.destroyView();
    const layout = computeLayout(this.scale.width, this.scale.height, DEFAULT_DIFFICULTY.decisionZoneStart);
    const rule = this.session.rule;

    const backdrop = new Backdrop(this, layout.width, layout.height);
    const conveyor = new Conveyor(this, layout.belt, {
      leftX: layout.bins.LEFT.x + layout.bins.LEFT.width / 2,
      rightX: layout.bins.RIGHT.x - layout.bins.RIGHT.width / 2,
      y: layout.bins.LEFT.y - layout.bins.LEFT.height * 0.12,
    });

    const acceptsFor = (side: BinSide) =>
      clausesForSide(rule, side).flatMap((clause) => (clause.when.color ? [PARCEL_COLORS[clause.when.color]] : []));
    const bins: Record<BinSide, SortBin> = {
      LEFT: new SortBin(this, layout.bins.LEFT, 'LEFT', acceptsFor('LEFT'), layout.uiScale),
      RIGHT: new SortBin(this, layout.bins.RIGHT, 'RIGHT', acceptsFor('RIGHT'), layout.uiScale),
    };

    const makeButton = (side: BinSide): NeonButton => {
      const box = layout.buttons[side];
      return new NeonButton(this, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        label: side,
        sublabel: side === 'LEFT' ? 'A  /  ←' : 'D  /  →',
        icon: side === 'LEFT' ? 'left' : 'right',
        accent: COLORS.cyan,
        fontSize: Math.round(Math.min(40, box.height * 0.3)),
        fireOn: 'down',
        onActivate: () => this.handleIntent(side, 'pointer'),
      }).setDepth(DEPTH.controls);
    };
    const buttons: Record<BinSide, NeonButton> = { LEFT: makeButton('LEFT'), RIGHT: makeButton('RIGHT') };

    const hud = new Hud(this, layout, {
      rule,
      bestScore: this.director.highScores.getBest(),
      maxMistakes: this.session.maxMistakes,
      onPause: () => this.handleIntent('PAUSE', 'pointer'),
    });
    hud.setScore(this.session.score, false);
    hud.setMistakesRemaining(this.session.mistakesRemaining, false);
    hud.setSpeedLevel(this.session.speedLevel);

    const feedback = new FeedbackLayer(this, layout.banner.x, layout.banner.y, layout.uiScale);
    const parcels: ParcelView[] = [];
    for (let i = 0; i < PARCEL_POOL_SIZE; i += 1) parcels.push(new ParcelView(this, layout.belt.parcelSize));

    this.view = { layout, backdrop, conveyor, bins, buttons, hud, feedback, parcels };

    // Restore the in-flight parcel (if any) at its logical position.
    this.activeParcelView = null;
    const active = this.session.activeParcel;
    if (active) {
      const parcelView = this.acquireParcelView(this.view);
      parcelView.present(active.parcel, layout.belt.x, beltProgressToY(layout.belt, active.progress));
      this.activeParcelView = parcelView;
    }
    if (this.session.isOver) {
      hud.setPauseEnabled(false);
      buttons.LEFT.setEnabled(false);
      buttons.RIGHT.setEnabled(false);
    }
  }

  private destroyView(): void {
    const view = this.view;
    if (!view) return;
    this.view = null;
    this.activeParcelView = null;
    for (const parcel of view.parcels) parcel.destroy();
    view.feedback.destroy();
    view.hud.destroy();
    view.buttons.LEFT.destroy();
    view.buttons.RIGHT.destroy();
    view.bins.LEFT.destroy();
    view.bins.RIGHT.destroy();
    view.conveyor.destroy();
    view.backdrop.destroy();
  }

  private cleanup(): void {
    this.inputController?.destroy();
    this.inputController = null;
    this.game.events.off(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.handleFocusLoss, this);
    this.endTimer?.remove(false);
    this.endTimer = null;
    this.destroyView();
  }
}
