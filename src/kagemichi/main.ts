import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { KagemichiAudioEngine } from './audioEngine';
import { KAGEMICHI_STORIES, KAGEMICHI_TRACKS } from './config';
import { KagemichiActor } from './kagemichiActor';
import { RunnerSystem } from './runnerSystem';
import { KagemichiStateManager } from './state';
import { StationScene } from './stationScene';
import { KagemichiTrackId, KagemichiUpgradeId } from './types';
import { KagemichiUIController } from './uiController';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new KagemichiStateManager();
  const audio = new KagemichiAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const station = new StationScene(gameCanvas);
  station.syncUpgrades(gsm.state);

  const actor = new KagemichiActor(station.worldGroup, station.glowTex);

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
    station.resize(width, height);
    runner.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = KAGEMICHI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 終点の記録解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'amber');
    }
  };

  const startRound = (trackId: KagemichiTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    station.setCameraMode('run');
    runner.resetSession(true);
    ui.showResultModal(false);
    ui.showPauseModal(false);

    audio.init(trackId);
    const info = audio.update(0, false);
    runner.resetBeatCursors(info.beatFloat);
    ui.updateSongProgress(0, info.durationSec);
    ui.updateHUD(trackId);
  };

  const pauseGame = () => {
    if (!started || paused || roundComplete) return;
    paused = true;
    audio.pause();
    gsm.save();
    ui.showPauseModal(true, runner.combo);
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
    // Automatically deliver any full lantern at finish line
    if (gsm.state.lanternFill >= gsm.getLanternCapacity()) {
      runner.sendToDream();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = KAGEMICHI_TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...runner.sessionStats });
    audio.playDreamSendSE();
  };

  const returnToLobby = () => {
    if (!started) return;
    started = false;
    paused = false;
    overlayPaused = false;
    roundComplete = false;
    gsm.save();
    audio.stopAll();
    runner.resetSession(false);
    station.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const moveLeft = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    if (actor.moveLane(-1)) audio.playLaneShiftSE();
  };

  const moveRight = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    if (actor.moveLane(1)) audio.playLaneShiftSE();
  };

  const doJump = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    if (actor.jump()) audio.playJumpSE();
  };

  const ui = new KagemichiUIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedLights > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '詰め所の小瓶が灯りを集めてくれました',
          `不在中に +${gsm.offlineEarnedLights.toLocaleString('ja-JP')} 想いの灯火`,
          'amber'
        );
      } else {
        ui.showToast('終電のあとのホームへようこそ', '左右移動＆ジャンプで帰れなかった想いを集めよう', 'moon');
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
          const trackTitle = KAGEMICHI_TRACKS[gsm.state.selectedTrack].title;
          ui.showResultModal(true, trackTitle, { ...runner.sessionStats });
        }
        return;
      }
      if (open) {
        audio.pauseBgm();
      } else if (!paused) {
        audio.resume();
      }
    },

    onSelectTrack: async (trackId: KagemichiTrackId) => {
      if (isGameFrozen()) return;
      if (runner.isExpress) {
        ui.showToast('DREAM EXPRESS 並走中です', 'フィーバー終了後に楽曲を切り替えられます', 'amber');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = KAGEMICHI_TRACKS[trackId].unlockClockLevel;
        ui.showToast(
          `${KAGEMICHI_TRACKS[trackId].shortLabel} は未解放です`,
          `「おわりの駅の時計」を Lv.${req} にすると切替できます`,
          'moon'
        );
        return;
      }
      gsm.state.selectedTrack = trackId;
      gsm.save();
      roundComplete = false;
      ui.showResultModal(false);
      runner.resetSession(true);
      await audio.switchTrack(trackId, 0, 0.5, false);
      const info = audio.update(0, false);
      runner.resetBeatCursors(info.beatFloat);
      ui.updateSongProgress(0, info.durationSec);
      ui.updateHUD(trackId);
      ui.showToast('楽曲を切り替えました', KAGEMICHI_TRACKS[trackId].title, 'moon');
    },

    onBuyUpgrade: (id: KagemichiUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      station.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'clock' && gsm.state.upgrades.clock === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'amber');
      } else if (id === 'clock' && gsm.state.upgrades.clock === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲を演奏できます', 'amber');
      } else {
        checkStoryUnlock();
      }
    },

    onClickSendDream: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      runner.sendToDream();
    },

    onClickExpress: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      if (runner.activateExpress()) {
        ui.showToast('🚆 DREAM EXPRESS 発車！', '夢行き終電が並走！全レーン吸引＆無敵2倍！', 'amber');
      }
    },

    onMoveLeft: moveLeft,
    onMoveRight: moveRight,
    onJump: doJump,

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
      station.syncUpgrades(gsm.state);
      runner.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい終電の夜がはじまります', 'moon');
    },
  });

  const runner = new RunnerSystem(station, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onDreamSent: (ticketsEarned, totalDreamsSent) => {
      ui.showToast(
        `🌙 夢へ届けました！ +${ticketsEarned} 夢の切符`,
        `通算 ${totalDreamsSent} 回目の想いが誰かの夢へ旅立ちました`,
        'amber'
      );
      checkStoryUnlock();
    },
    onExpressChange: (active, pct, rem) => {
      ui.updateExpress(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
  });

  applyViewportResize();

  actor
    .load('./assets/models/kagemichi.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load kagemichi.glb:', err);
      ui.setModelReady(true, 'おわりの駅の準備が整いました（軽量モード）');
    });

  // Gesture controls on the 3D canvas: swipe left/right/up OR direct 3-lane tap
  let pointerStart: { x: number; y: number } | null = null;
  let gestureConsumed = false;

  gameCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    pointerStart = viewport.clientToVirtual(e.clientX, e.clientY);
    gestureConsumed = false;
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointerStart || gestureConsumed || !started || isGameFrozen() || roundComplete) return;
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    const dx = pt.x - pointerStart.x;
    const dy = pt.y - pointerStart.y;
    if (Math.hypot(dx, dy) > 28) {
      gestureConsumed = true;
      if (Math.abs(dy) > Math.abs(dx) && dy < -24) {
        doJump();
      } else if (dx < -24) {
        moveLeft();
      } else if (dx > 24) {
        moveRight();
      }
    }
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (!pointerStart || !started || isGameFrozen() || roundComplete) {
      pointerStart = null;
      return;
    }
    if (!gestureConsumed) {
      // Tap directly on left / center / right third of stage to snap to that lane!
      const pt = viewport.clientToVirtual(e.clientX, e.clientY);
      const { width } = viewport.getSize();
      const targetLane = pt.x < width * 0.36 ? 0 : pt.x > width * 0.64 ? 2 : 1;
      if (targetLane === actor.laneIndex) {
        doJump();
      } else if (actor.setLane(targetLane)) {
        audio.playLaneShiftSE();
      }
    }
    pointerStart = null;
  });

  window.addEventListener('keydown', (e) => {
    if (!started || e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (roundComplete || overlayPaused) return;
      e.preventDefault();
      if (paused) resumeGame();
      else pauseGame();
      return;
    }
    if (isGameFrozen() || roundComplete) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      moveLeft();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      moveRight();
    } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      doJump();
    } else if (e.code === 'KeyE') {
      e.preventDefault();
      runner.sendToDream();
    } else if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      if (runner.activateExpress()) {
        ui.showToast('🚆 DREAM EXPRESS 発車！', '夢行き終電が並走！全レーン吸引＆無敵2倍！', 'amber');
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
      station.renderer.render(station.scene, station.camera);
      return;
    }

    elapsed += dt;
    const beatInfo = audio.update(dt, roundComplete || !started);

    const active = started && !roundComplete;
    if (active) {
      ui.updateBeatDots(beatInfo.beatIndex);
      if (!runner.isExpress) {
        ui.updateSongProgress(beatInfo.progress, beatInfo.remainingSec);
      }

      autoSaveTimer += dt;
      if (autoSaveTimer >= 12) {
        autoSaveTimer = 0;
        gsm.save();
      }

      if (beatInfo.ended && !runner.isExpress) {
        finishRound();
      }
    }

    runner.update(elapsed, dt, beatInfo.beatFloat, beatInfo.remainingSec, active);
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      runner.isExpress,
      gsm.getMagnetRadius(),
      runner.shieldsRemaining
    );
    station.setFocusX(actor.getPosition().x);
    station.update(
      elapsed,
      dt,
      active ? runner.getCurrentSpeed() : 2.8,
      beatInfo.beatPhase,
      beatInfo.energy,
      runner.isExpress
    );
  }

  requestAnimationFrame(loop);
}

void bootstrap();
