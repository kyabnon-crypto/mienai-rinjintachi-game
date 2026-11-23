import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { TsumazukiAudioEngine } from './audioEngine';
import { TSUMAZUKI_STORIES, TSUMAZUKI_TRACKS } from './config';
import { LandingScene } from './landingScene';
import { TsumazukiStateManager } from './state';
import { TimeSlowSystem } from './timeSlowSystem';
import { TsumazukiActor } from './tsumazukiActor';
import { TsumazukiTrackId, TsumazukiUpgradeId } from './types';
import { TsumazukiUIController } from './uiController';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new TsumazukiStateManager();
  const audio = new TsumazukiAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const landingScene = new LandingScene(gameCanvas);
  landingScene.syncUpgrades(gsm.state);

  const actor = new TsumazukiActor(landingScene.worldGroup, landingScene.glowTex);

  let started = false;
  let paused = false;
  let overlayPaused = false;
  let roundComplete = false;
  let autoSaveTimer = 0;
  let shownOfflineToast = false;
  let prevUnlockedStories = gsm.getUnlockedStoriesCount();
  let activePointerId: number | null = null;

  const isGameFrozen = () => paused || overlayPaused;

  const applyViewportResize = () => {
    viewport.sync();
    const { width, height } = viewport.getSize();
    landingScene.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = TSUMAZUKI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 見張り日誌解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: TsumazukiTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    activePointerId = null;
    landingScene.setCameraMode('play');
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
    activePointerId = null;
    system.clearKeys();
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
    activePointerId = null;
    system.clearKeys();
    if (gsm.state.basketFill >= gsm.getBasketCapacity()) {
      system.returnBasket();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = TSUMAZUKI_TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...system.sessionStats });
    audio.playOrderCompleteSE(true);
  };

  const returnToLobby = () => {
    if (!started) return;
    started = false;
    paused = false;
    overlayPaused = false;
    roundComplete = false;
    activePointerId = null;
    system.clearKeys();
    gsm.save();
    audio.stopAll();
    system.resetSession(false);
    landingScene.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doTimeSlow = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerTimeSlow();
  };

  const ui = new TsumazukiUIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedDrops > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '階段裏の見張り部屋に時のしずくが蓄わりました',
          `不在中に +${gsm.offlineEarnedDrops.toLocaleString('ja-JP')} 時のしずく`,
          'gold'
        );
      } else {
        ui.showToast(
          '朝の階段の踊り場、見張りのはじまり',
          '落ちかけた物をキャッチ＆4つのひやりスポットへ寄り添おう！⏳ / Space でほんのひと秒！',
          'teal'
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
          const trackTitle = TSUMAZUKI_TRACKS[gsm.state.selectedTrack].title;
          ui.showResultModal(true, trackTitle, { ...system.sessionStats });
        }
        return;
      }
      if (open) {
        activePointerId = null;
        system.clearKeys();
        audio.pauseBgm();
      } else if (!paused) {
        audio.resume();
      }
    },

    onSelectTrack: async (trackId: TsumazukiTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('SLOW SECOND 発動中です', 'ひと秒フィーバー終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = TSUMAZUKI_TRACKS[trackId].unlockWindowLevel;
        ui.showToast(
          `${TSUMAZUKI_TRACKS[trackId].shortLabel} は未解放です`,
          `「アーチ窓の朝灯りと電球ガーランド」を Lv.${req} にすると切替できます`,
          'teal'
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
      ui.showToast('楽曲を切り替えました', TSUMAZUKI_TRACKS[trackId].title, 'teal');
    },

    onBuyUpgrade: (id: TsumazukiUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      landingScene.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'archWindow' && gsm.state.upgrades.archWindow === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'archWindow' && gsm.state.upgrades.archWindow === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で見張り番を楽しめます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickReturnBasket: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      system.returnBasket();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '⏳ SLOW SECOND 発動！',
          '朝の光が踊り場に満ち、すべてのあわて渦が懐中時計に変化＆自動吸引＆しずく2倍！',
          'gold'
        );
      }
    },

    onClickTimeSlow: doTimeSlow,

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
      landingScene.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい朝の階段の踊り場がはじまります', 'teal');
    },
  });

  const system = new TimeSlowSystem(landingScene, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onOrderChange: (order, filled) => ui.updateOrder(order, filled),
    onOrderCompleted: (title, message, charmsEarned) => {
      ui.showToast(`⏳ ${title} 達成！ +${charmsEarned} だいじょうぶの証`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onTimeSlowCooldownChange: (pct, ready, slowing) =>
      ui.updateTimeSlowCooldown(pct, ready, slowing),
  });

  applyViewportResize();

  actor
    .load('./assets/models/tsumazuki.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load tsumazuki.glb:', err);
      ui.setModelReady(true, '階段の踊り場の準備が整いました（軽量モード）');
    });

  // Pointer tap & drag steering on the sunlit landing
  gameCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    activePointerId = e.pointerId;
    gameCanvas.setPointerCapture(e.pointerId);
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    system.setPointerTarget(pt.x, pt.y);
  });

  gameCanvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (activePointerId !== e.pointerId || !started || isGameFrozen() || roundComplete) return;
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    system.setPointerTarget(pt.x, pt.y);
  });

  const releasePointer = (e: PointerEvent) => {
    if (activePointerId === e.pointerId) {
      activePointerId = null;
      try {
        gameCanvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };
  gameCanvas.addEventListener('pointerup', releasePointer);
  gameCanvas.addEventListener('pointercancel', releasePointer);

  const mapKeyDir = (code: string): 'up' | 'down' | 'left' | 'right' | null => {
    if (code === 'ArrowUp' || code === 'KeyW') return 'up';
    if (code === 'ArrowDown' || code === 'KeyS') return 'down';
    if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
    if (code === 'ArrowRight' || code === 'KeyD') return 'right';
    return null;
  };

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

    const dir = mapKeyDir(e.code);
    if (dir) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.setKey(dir, true);
      return;
    }

    if (!e.repeat && (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
      e.preventDefault();
      doTimeSlow();
    } else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.returnBasket();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '⏳ SLOW SECOND 発動！',
          '朝の光が踊り場に満ち、すべてのあわて渦が懐中時計に変化＆自動吸引＆しずく2倍！',
          'gold'
        );
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = mapKeyDir(e.code);
    if (dir) system.setKey(dir, false);
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
      landingScene.renderer.render(landingScene.scene, landingScene.camera);
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
    const basketRatio = gsm.state.basketFill / Math.max(1, gsm.getBasketCapacity());
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      system.isTimeSlowActive,
      gsm.getReachRadius(),
      basketRatio,
      system.shieldsRemaining
    );
    landingScene.update(
      elapsed,
      dt,
      beatInfo.beatPhase,
      beatInfo.energy,
      system.isFever,
      active ? system.worldTimeScale : 1.0
    );
  }

  requestAnimationFrame(loop);
}

void bootstrap();
