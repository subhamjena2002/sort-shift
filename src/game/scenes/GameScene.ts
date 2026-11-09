import Phaser from 'phaser';
import type { BinSide, GameState, RunStats } from '../../types/game';
import type { PlayerIntent } from '../config/controls';
import { MAX_FRAME_DELTA_MS } from '../config/display';
import { DEFAULT_DIFFICULTY } from '../config/difficulty';
import type { SortingRule } from '../data/sortingRules';
import { Conveyor } from '../entities/Conveyor';
import { ParcelView } from '../entities/ParcelView';
import { SortBin } from '../entities/SortBin';
import { InputController } from '../systems/InputController';
import { watchLayout } from '../systems/ResponsiveScaler';
import { RunSession, type BonusKind, type SessionEvent } from '../systems/RunSession';
import { soundsForEvents } from '../systems/sessionSounds';
import { ShiftManager } from '../systems/ShiftManager';
import { Backdrop } from '../ui/Backdrop';
import { CountdownDisplay } from '../ui/CountdownDisplay';
import { FeedbackLayer } from '../ui/FeedbackLayer';
import { Hud } from '../ui/Hud';
import { beltProgressToY, computeLayout, type GameLayout, type Point } from '../ui/layout';
import { NeonButton } from '../ui/NeonButton';
import { glyphsForSide } from '../ui/ruleGlyphs';
import { ShiftAnnouncement } from '../ui/ShiftAnnouncement';
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
  readonly announcement: ShiftAnnouncement;
  readonly countdown: CountdownDisplay;
  readonly parcels: readonly ParcelView[];
}

const RUN_END_DELAY_MS = 1100;
// One parcel on the belt plus up to two still finishing their exit animation.
const PARCEL_POOL_SIZE = 3;
const BELT_EASE_MS = 320;
/** High-level states in which this scene is driving a run. */
const RUN_STATES: readonly GameState[] = ['PLAYING', 'SHIFT_ANNOUNCEMENT', 'COUNTDOWN'];

const BONUS_LABELS: Readonly<Record<BonusKind, string>> = {
  STREAK: 'STREAK',
  GOLDEN: 'GOLDEN',
  PERFECT_SHIFT: 'PERFECT',
};

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
  private zoneNotifiedParcel: number | null = null;

  constructor() {
    super(SceneKeys.GAME);
  }

  create(): void {
    this.director = SceneDirector.from(this);
    const { seed, startShift } = this.director.runOverrides;
    this.session = new RunSession({ shifts: new ShiftManager(undefined, startShift), random: createSeededRandom(seed ?? randomSeed()) });
    this.activeParcelView = null;
    this.endTimer = null;
    this.beltSpeedFactor = 1;
    this.zoneNotifiedParcel = null;

    this.buildView();

    this.inputController = new InputController(this, (intent) => this.handleIntent(intent, 'keyboard'));
    watchLayout(this, () => this.buildView());
    this.game.events.on(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    fadeIn(this);
  }

  override update(_time: number, delta: number): void {
    if (!this.view || !RUN_STATES.includes(this.director.machine.state)) return;

    const dt = Math.min(delta, MAX_FRAME_DELTA_MS);
    this.applyEvents(this.session.update(dt));
    const view = this.view;

    // The belt winds down between shifts and when the run ends, and stays
    // stopped until the countdown has finished.
    const stopped = this.session.isOver || this.session.phase === 'TRANSITION';
    const targetSpeed = stopped ? 0 : 1;
    this.beltSpeedFactor += (targetSpeed - this.beltSpeedFactor) * Math.min(1, dt / BELT_EASE_MS);
    const belt = view.layout.belt;
    const pixelsPerMs = ((belt.decisionY - belt.spawnY) / this.session.currentTravelTimeMs) * this.beltSpeedFactor;
    const active = this.session.activeParcel;
    const counting = this.session.transition?.stage === 'COUNTDOWN';
    view.conveyor.update(dt, pixelsPerMs, active?.inDecisionZone ?? false, counting);

    if (active && this.activeParcelView?.parcelId === active.parcel.id) {
      this.activeParcelView.setBeltPosition(beltProgressToY(belt, active.progress), active.progress);
      if (active.inDecisionZone && this.zoneNotifiedParcel !== active.parcel.id) {
        this.zoneNotifiedParcel = active.parcel.id;
        view.conveyor.pulseZone();
        this.activeParcelView.enterZone();
      }
    }
  }

  // ---------------------------------------------------------------- input

  private handleIntent(intent: PlayerIntent, source: 'keyboard' | 'pointer'): void {
    const view = this.view;
    const { machine } = this.director;
    if (!view || !RUN_STATES.includes(machine.state)) return;

    switch (intent) {
      case 'PAUSE':
        if (source === 'keyboard') view.hud.flashPause();
        this.requestPause();
        return;
      case 'MUTE':
        this.toggleMute(view);
        return;
      case 'READY':
        this.confirmReady(view);
        return;
      case 'LEFT':
      case 'RIGHT':
        // Sorting exists only while the belt runs, never during a shift change.
        if (!machine.is('PLAYING') || this.session.isOver) return;
        if (source === 'keyboard') view.buttons[intent].flash();
        this.applyEvents(this.session.choose(intent));
        return;
    }
  }

  private confirmReady(view: DepotView): void {
    if (!this.director.machine.is('SHIFT_ANNOUNCEMENT') || !view.announcement.isArmed(this.time.now)) return;
    this.applyEvents(this.session.confirmReady());
  }

  private toggleMute(view: DepotView): void {
    const { audio } = this.director;
    view.hud.setMuted(audio.toggleMuted());
    audio.play('ui');
  }

  private requestPause(): void {
    if (this.session.isOver) return;
    this.director.pauseRun(this);
  }

  /** Losing focus pauses anything time-driven. An announcement is already waiting. */
  private handleFocusLoss(): void {
    const { machine } = this.director;
    if (machine.is('PLAYING') || machine.is('COUNTDOWN')) this.requestPause();
  }

  // --------------------------------------------------------------- events

  private applyEvents(events: readonly SessionEvent[]): void {
    const view = this.view;
    if (!view) return;
    const belt = view.layout.belt;
    let lastMouth: Point = { x: belt.x, y: belt.decisionY };
    const { machine, audio } = this.director;
    for (const sound of soundsForEvents(events)) audio.play(sound);

    for (const event of events) {
      switch (event.type) {
        case 'PARCEL_SPAWNED': {
          const parcelView = this.acquireParcelView(view);
          parcelView.present(event.parcel, belt.x, beltProgressToY(belt, 0));
          this.activeParcelView = parcelView;
          if (event.parcel.kind === 'GOLDEN') view.feedback.popup(belt.x, belt.spawnY + 40, 'GOLDEN', CSS.gold);
          break;
        }
        case 'PARCEL_SORTED': {
          const bin = view.bins[event.chosen];
          const mouth = bin.mouth;
          lastMouth = mouth;
          this.takeActiveParcelView(event.parcel.id)?.playSorted(mouth, event.correct, () => undefined);
          bin.flash(event.correct);
          view.conveyor.flashGate(event.chosen, event.correct);
          view.feedback.burst(mouth.x, mouth.y, event.correct);
          view.feedback.stamp(mouth.x, mouth.y, event.correct);
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
          view.feedback.stamp(belt.x, belt.decisionY, false);
          view.feedback.popup(belt.x, belt.decisionY - 80, 'MISSED', CSS.danger);
          this.cameras.main.shake(200, 0.007);
          break;
        }
        case 'SCORE_CHANGED': {
          view.hud.setScore(event.score, true);
          this.refreshShiftReadout(view);
          break;
        }
        case 'MISTAKES_CHANGED': {
          view.hud.setMistakesRemaining(event.remaining, true);
          if (event.remaining === 1) view.feedback.showBanner('LAST CHANCE', CSS.amber, 600);
          break;
        }
        case 'COMBO_CHANGED': {
          const status = this.session.comboStatus;
          view.hud.setCombo(event.combo.streak, event.combo.multiplier, status?.nextTierAt ?? null, !event.combo.broken);
          if (event.combo.multiplierIncreased) {
            view.feedback.showBanner(`COMBO ×${event.combo.multiplier}`, CSS.amber, 380);
            view.hud.flashComboTier();
          }
          if (event.combo.broken && event.combo.previousStreak >= 5) {
            view.hud.showComboCallout('LOST', CSS.danger);
          }
          break;
        }
        case 'BONUS_AWARDED': {
          this.showBonus(view, event.kind, event.points, lastMouth);
          break;
        }
        case 'SHIFT_COMPLETED': {
          const message = event.perfect ? 'PERFECT SHIFT' : `SHIFT ${event.shift} CLEAR`;
          view.feedback.showBanner(message, event.perfect ? CSS.gold : CSS.success, 420);
          this.refreshShiftReadout(view);
          break;
        }
        case 'SHIFT_ANNOUNCED': {
          machine.transition('SHIFT_ANNOUNCEMENT');
          this.beltSpeedFactor = 0;
          this.showRule(view, event.plan.rule, true);
          this.refreshShiftReadout(view);
          view.announcement.show(event.briefing, event.opening, true);
          break;
        }
        case 'COUNTDOWN_STARTED': {
          machine.transition('COUNTDOWN');
          view.announcement.hide();
          break;
        }
        case 'COUNTDOWN_TICK': {
          view.countdown.show(event.value, true);
          break;
        }
        case 'SHIFT_STARTED': {
          machine.transition('PLAYING');
          view.countdown.hide();
          view.feedback.showBanner('GO!', CSS.success, 220);
          this.cameras.main.flash(120, 34, 240, 255);
          break;
        }
        case 'RUN_ENDED': {
          this.handleRunEnded(event.stats);
          break;
        }
      }
    }
  }

  private showBonus(view: DepotView, kind: BonusKind, points: number, mouth: Point): void {
    const text = `${BONUS_LABELS[kind]} +${points}`;
    if (kind === 'GOLDEN') {
      view.feedback.goldBurst(mouth.x, mouth.y);
      view.feedback.popup(mouth.x, mouth.y - 118, text, CSS.gold);
    } else if (kind === 'STREAK') {
      view.hud.showComboCallout(`+${points}`, CSS.amber);
    } else {
      view.feedback.popup(view.hud.scoreAnchor.x, view.hud.scoreAnchor.y, text, CSS.gold);
    }
  }

  private refreshShiftReadout(view: DepotView): void {
    const status = this.session.shiftStatus;
    if (status) view.hud.setShift(status.plan, status.correct);
  }

  private showRule(view: DepotView, rule: SortingRule, animate: boolean): void {
    view.hud.setRule(rule, animate);
    view.bins.LEFT.setAccepts(glyphsForSide(rule, 'LEFT'));
    view.bins.RIGHT.setAccepts(glyphsForSide(rule, 'RIGHT'));
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

    const bins: Record<BinSide, SortBin> = {
      LEFT: new SortBin(this, layout.bins.LEFT, 'LEFT', glyphsForSide(rule, 'LEFT'), layout.uiScale),
      RIGHT: new SortBin(this, layout.bins.RIGHT, 'RIGHT', glyphsForSide(rule, 'RIGHT'), layout.uiScale),
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
      muted: this.director.audio.muted,
      onPause: () => this.handleIntent('PAUSE', 'pointer'),
      onToggleMute: () => this.handleIntent('MUTE', 'pointer'),
    });
    hud.setScore(this.session.score, false);
    hud.setMistakesRemaining(this.session.mistakesRemaining, false);

    const feedback = new FeedbackLayer(this, layout.banner.x, layout.banner.y, layout.uiScale);
    const announcement = new ShiftAnnouncement(this, layout, () => this.handleIntent('READY', 'pointer'));
    const countdown = new CountdownDisplay(this, layout);
    const parcels: ParcelView[] = [];
    for (let i = 0; i < PARCEL_POOL_SIZE; i += 1) parcels.push(new ParcelView(this, layout.belt.parcelSize));

    const view: DepotView = { layout, backdrop, conveyor, bins, buttons, hud, feedback, announcement, countdown, parcels };
    this.view = view;

    this.refreshShiftReadout(view);
    const combo = this.session.comboStatus;
    if (combo) hud.setCombo(combo.streak, combo.multiplier, combo.nextTierAt, false);

    // Restore an in-flight announcement or parcel at its logical state.
    const transition = this.session.transition;
    if (transition?.stage === 'ANNOUNCING') announcement.show(transition.briefing, transition.opening, false);
    if (transition?.countdownValue != null) countdown.show(transition.countdownValue, false);
    this.activeParcelView = null;
    const active = this.session.activeParcel;
    if (active) {
      const parcelView = this.acquireParcelView(view);
      parcelView.present(active.parcel, layout.belt.x, beltProgressToY(layout.belt, active.progress), false);
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
    view.countdown.destroy();
    view.announcement.destroy();
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
