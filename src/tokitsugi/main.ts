import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { TokitsugiAudioEngine } from './audioEngine';
import { ClockworkSystem } from './clockworkSystem';
import { TOKITSUGI_STORIES, TOKITSUGI_TRACKS } from './config';
import { TokitsugiStateManager } from './state';
import { TokitsugiActor } from './tokitsugiActor';
import { TokitsugiTrackId, TokitsugiUpgradeId } from './types';
import { TokitsugiUIController } from './uiController';
import { WorkshopScene } from './workshopScene';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new TokitsugiStateManager();
  const audio = new TokitsugiAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const workshop = new WorkshopScene(gameCanvas);
  workshop.syncUpgrades(gsm.state);

  const actor = new TokitsugiActor(workshop.worldGroup, workshop.glowTex);

  let started = false;
  let paused = false;
  let overlayPaused = false;
  let roundComplete = false;
  let autoSaveTimer = 0;
  let shownOfflineToast = false;
  let prevUnlockedStories = gsm.getUnlockedStoriesCount();

  const isGameFrozen = () => paused || overlayPaused;

  const applyViewportResize = () => {
    viewport.sync();
    const { width, height } = viewport.getSize();
    workshop.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = TOKITSUGI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 押し入れの記録解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: TokitsugiTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    workshop.setCameraMode('play');
    system.resetSession(true);
    ui.showResultModal(false);
    ui.showPauseModal(false);

    audio.init(trackId);
    const info = audio.update(0, false);
    system.resetBeatCursors(info.beatFloat);
    ui.updateSongProgress(0, info.durationSec);
    ui.updateHUD(trackId);
  };

  const pauseGame = () => {
    if (!started || paused || roundComplete) return;
    paused = true;
    audio.pause();
    gsm.save();
    ui.showPauseModal(true, system.combo);
  };

  const resumeGame = () => {
    if (!started || !paused) return;
    paused = false;
    ui.showPauseModal(false);
    if (!overlayPaused) {
      audio.resume();
    }
    void viewport.enterLandscape().then(applyViewportResize);
  };

  const finishRound = () => {
    if (roundComplete) return;
    roundComplete = true;
    if (gsm.state.watchFill >= gsm.getWatchCapacity()) {
      system.windAndSendWatch();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = TOKITSUGI_TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...system.sessionStats });
    audio.playWatchMendedSE();
  };

  const returnToLobby = () => {
    if (!started) return;
    started = false;
    paused = false;
    overlayPaused = false;
    roundComplete = false;
    gsm.save();
    audio.stopAll();
    system.resetSession(false);
    workshop.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doRewind = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerRewindStitch();
  };

  const ui = new TokitsugiUIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedSands > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '思い出の瓶が時の砂を集めてくれました',
          `不在中に +${gsm.offlineEarnedSands.toLocaleString('ja-JP')} 時の砂`,
          'gold'
        );
      } else {
        ui.showToast(
          '押し入れの時計工房へようこそ',
          '回る光の針に合わせてタップ（または欠片を直接タップ）で金色の糸を繋ごう',
          'blue'
        );
      }
    },

    onRetry: () => {
      if (!started) return;
      startRound(gsm.state.selectedTrack);
    },

    onPause: () => pauseGame(),
    onResume: () => resumeGame(),
    onReturnToLobby: () => returnToLobby(),

    onOverlayVisibilityChange: (open: boolean) => {
      overlayPaused = open;
      if (!started) return;
      if (roundComplete) {
        if (!open) {
          const trackTitle = TOKITSUGI_TRACKS[gsm.state.selectedTrack].title;
          ui.showResultModal(true, trackTitle, { ...system.sessionStats });
        }
        return;
      }
      if (open) {
        audio.pauseBgm();
      } else if (!paused) {
        audio.resume();
      }
    },

    onSelectTrack: async (trackId: TokitsugiTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('GOLDEN HOUR 発動中です', '黄金の刻終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = TOKITSUGI_TRACKS[trackId].unlockClockLevel;
        ui.showToast(
          `${TOKITSUGI_TRACKS[trackId].shortLabel} は未解放です`,
          `「大きな柱時計」を Lv.${req} にすると切替できます`,
          'blue'
        );
        return;
      }
      gsm.state.selectedTrack = trackId;
      gsm.save();
      roundComplete = false;
      ui.showResultModal(false);
      system.resetSession(true);
      await audio.switchTrack(trackId, 0, 0.5, false);
      const info = audio.update(0, false);
      system.resetBeatCursors(info.beatFloat);
      ui.updateSongProgress(0, info.durationSec);
      ui.updateHUD(trackId);
      ui.showToast('楽曲を切り替えました', TOKITSUGI_TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: TokitsugiUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      workshop.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'grandClock' && gsm.state.upgrades.grandClock === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'grandClock' && gsm.state.upgrades.grandClock === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で時を繋げます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickWindWatch: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      system.windAndSendWatch();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      if (system.activateFever()) {
        ui.showToast('✨ GOLDEN HOUR 発動！', '押し入れの隙間から黄金の光が満ちる！全ほころび浄化＆2倍！', 'gold');
      }
    },

    onClickRewind: doRewind,

    onChangeBgmVol: (val) => {
      gsm.state.settings.bgmVolume = val;
      audio.setBgmVolume(val);
      gsm.save();
    },

    onChangeSeVol: (val) => {
      gsm.state.settings.seVolume = val;
      audio.setSeVolume(val);
      gsm.save();
    },

    onChangeOffset: (ms) => {
      gsm.state.settings.timingOffsetMs = ms;
      audio.setTimingOffsetMs(ms);
      gsm.save();
    },

    onResetSave: () => {
      gsm.reset();
      workshop.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい押し入れの夜がはじまります', 'blue');
    },
  });

  const system = new ClockworkSystem(workshop, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onOrderChange: (order, filled) => ui.updateOrder(order, filled),
    onWatchMended: (title, message, miraclesEarned) => {
      ui.showToast(`🕰️ ${title} 修繕完了！ +${miraclesEarned} 小さな奇跡`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onRewindCooldownChange: (pct, ready) => ui.updateRewindCooldown(pct, ready),
  });

  applyViewportResize();

  actor
    .load('./assets/models/tokitsugi.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load tokitsugi.glb:', err);
      ui.setModelReady(true, '押し入れの時計工房の準備が整いました（軽量モード）');
    });

  // Tap/click on canvas stitches at the hand or directly on the tapped fragment
  gameCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    system.triggerStitchInput(pt.x, pt.y);
  });

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (roundComplete || overlayPaused) return;
      e.preventDefault();
      if (paused) resumeGame();
      else pauseGame();
      return;
    }
    if (isGameFrozen() || roundComplete) return;

    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyJ')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.triggerStitchInput();
    } else if (!e.repeat && (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyR' || e.code === 'KeyK')) {
      e.preventDefault();
      doRewind();
    } else if (!e.repeat && (e.code === 'KeyW' || e.code === 'KeyE')) {
      e.preventDefault();
      system.windAndSendWatch();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      if (system.activateFever()) {
        ui.showToast('✨ GOLDEN HOUR 発動！', '押し入れの隙間から黄金の光が満ちる！全ほころび浄化＆2倍！', 'gold');
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused && !roundComplete) {
      pauseGame();
    }
  });

  window.addEventListener('resize', applyViewportResize);
  window.addEventListener('orientationchange', () => setTimeout(applyViewportResize, 120));
  document.addEventListener('fullscreenchange', () => setTimeout(applyViewportResize, 80));

  let prevTime = performance.now();
  let elapsed = 0;

  function loop(now: number): void {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prevTime) / 1000);
    prevTime = now;

    if (isGameFrozen()) {
      workshop.renderer.render(workshop.scene, workshop.camera);
      return;
    }

    elapsed += dt;
    const beatInfo = audio.update(dt, roundComplete || !started);

    const active = started && !roundComplete;
    if (active) {
      ui.updateBeatDots(beatInfo.beatIndex);
      if (!system.isFever) {
        ui.updateSongProgress(beatInfo.progress, beatInfo.remainingSec);
      }

      autoSaveTimer += dt;
      if (autoSaveTimer >= 12) {
        autoSaveTimer = 0;
        gsm.save();
      }

      if (beatInfo.ended && !system.isFever) {
        finishRound();
      }
    }

    system.update(elapsed, dt, beatInfo.beatFloat, active);
    actor.update(elapsed, dt, active, beatInfo.beatPhase, system.isFever, system.shieldsRemaining);
    workshop.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, system.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
