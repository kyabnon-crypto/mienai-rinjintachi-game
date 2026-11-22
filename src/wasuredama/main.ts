import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { WasuredamaAudioEngine } from './audioEngine';
import { WASUREDAMA_STORIES, WASUREDAMA_TRACKS } from './config';
import { WasuredamaStateManager } from './state';
import { StreetScene } from './streetScene';
import { StreetSystem } from './streetSystem';
import { WasuredamaTrackId, WasuredamaUpgradeId } from './types';
import { WasuredamaUIController } from './uiController';
import { WasuredamaActor } from './wasuredamaActor';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new WasuredamaStateManager();
  const audio = new WasuredamaAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const street = new StreetScene(gameCanvas);
  street.syncUpgrades(gsm.state);

  const actor = new WasuredamaActor(street.worldGroup, street.glowTex);

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
    street.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = WASUREDAMA_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 街灯の記録解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: WasuredamaTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    activePointerId = null;
    street.setCameraMode('play');
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
    if (gsm.state.sackFill >= gsm.getSackCapacity()) {
      system.deliverFullSack();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = WASUREDAMA_TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...system.sessionStats });
    audio.playDeliverSE(true);
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
    street.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doLampPulse = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerLampPulse();
  };

  const ui = new WasuredamaUIController(gsm, {
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
          '仕分け棚の忘れ物たちが灯りを集めてくれました',
          `不在中に +${gsm.offlineEarnedLights.toLocaleString('ja-JP')} こころの灯り`,
          'gold'
        );
      } else {
        ui.showToast(
          '街灯の下の忘れ物係、今夜もはじまり',
          'タッチドラッグ / 矢印キーで歩いて忘れ物を拾い、まだ必要な人のそばへそっと届けよう',
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
          const trackTitle = WASUREDAMA_TRACKS[gsm.state.selectedTrack].title;
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

    onSelectTrack: async (trackId: WasuredamaTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('STARLIT STREET 発動中です', '星明かりフィーバー終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = WASUREDAMA_TRACKS[trackId].unlockLightsLevel;
        ui.showToast(
          `${WASUREDAMA_TRACKS[trackId].shortLabel} は未解放です`,
          `「夜道の吊り電球」を Lv.${req} にすると切替できます`,
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
      ui.showToast('楽曲を切り替えました', WASUREDAMA_TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: WasuredamaUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      street.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'stringLights' && gsm.state.upgrades.stringLights === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'stringLights' && gsm.state.upgrades.stringLights === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で夜道を歩けます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickDeliverSack: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      system.deliverFullSack();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast('✨ STARLIT STREET 発動！', '街灯と吊り電球が満天の星明かりに！全もやが星灯り玉へ＆2倍！', 'gold');
      }
    },

    onClickLampPulse: doLampPulse,

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
      street.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい街灯の下の夜がはじまります', 'blue');
    },
  });

  const system = new StreetSystem(street, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onOrderChange: (order, filled, ready) => ui.updateOrder(order, filled, ready),
    onDelivered: (title, message, sproutsEarned) => {
      ui.showToast(`🌱 ${title} お届け完了！ +${sproutsEarned} 思い出の芽`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onPulseCooldownChange: (pct, ready) => ui.updatePulseCooldown(pct, ready),
  });

  applyViewportResize();

  actor
    .load('./assets/models/wasuredama.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load wasuredama.glb:', err);
      ui.setModelReady(true, '街灯の下の広場の準備が整いました（軽量モード）');
    });

  // Pointer drag / tap steering on cobblestones
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
        // Ignore if not captured
      }
    }
  };
  gameCanvas.addEventListener('pointerup', releasePointer);
  gameCanvas.addEventListener('pointercancel', releasePointer);

  // Keyboard steering + Lamp Pulse / Deliver / Fever / Pause
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
      doLampPulse();
    } else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.deliverFullSack();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast('✨ STARLIT STREET 発動！', '街灯と吊り電球が満天の星明かりに！全もやが星灯り玉へ＆2倍！', 'gold');
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = mapKeyDir(e.code);
    if (dir) {
      system.setKey(dir, false);
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
      street.renderer.render(street.scene, street.camera);
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
    const sackRatio = gsm.state.sackFill / Math.max(1, gsm.getSackCapacity());
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      gsm.getPickupRadius(),
      sackRatio,
      system.shieldsRemaining
    );
    street.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, system.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
