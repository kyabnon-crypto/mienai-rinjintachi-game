import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { TomerunAudioEngine } from './audioEngine';
import { TOMERUN_STORIES, TOMERUN_TRACKS } from './config';
import { FridgeVaultScene } from './fridgeVaultScene';
import { PreservationSystem } from './preservationSystem';
import { TomerunStateManager } from './state';
import { TomerunActor } from './tomerunActor';
import { TomerunTrackId, TomerunUpgradeId } from './types';
import { TomerunUIController } from './uiController';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new TomerunStateManager();
  const audio = new TomerunAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const vaultScene = new FridgeVaultScene(gameCanvas);
  vaultScene.syncUpgrades(gsm.state);

  const actor = new TomerunActor(vaultScene.worldGroup, vaultScene.glowTex);

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
    vaultScene.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = TOMERUN_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 時間保存日誌解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: TomerunTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    activePointerId = null;
    vaultScene.setCameraMode('play');
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
    if (gsm.state.jarFill >= gsm.getJarCapacity()) {
      system.bottleToShelf();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = TOMERUN_TRACKS[gsm.state.selectedTrack].title;
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
    vaultScene.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doValvePause = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerValvePause();
  };

  const ui = new TomerunUIController(gsm, {
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
          '時間保存室に時の砂が蓄わりました',
          `不在中に +${gsm.offlineEarnedSands.toLocaleString('ja-JP')} 時の砂`,
          'gold'
        );
      } else {
        ui.showToast(
          '冷蔵庫の奥、もうひとつの棚へようこそ',
          '時間の欠片を集め4つの食卓スポットを守ろう！⏳ / Space でバルブ回し！',
          'frost'
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
          const trackTitle = TOMERUN_TRACKS[gsm.state.selectedTrack].title;
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

    onSelectTrack: async (trackId: TomerunTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('ETERNAL SHELF 発動中です', '黄金の棚時間終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = TOMERUN_TRACKS[trackId].unlockLanternLevel;
        ui.showToast(
          `${TOMERUN_TRACKS[trackId].shortLabel} は未解放です`,
          `「天井の時間ランタンと冷蔵庫の灯り」を Lv.${req} にすると切替できます`,
          'frost'
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
      ui.showToast('楽曲を切り替えました', TOMERUN_TRACKS[trackId].title, 'frost');
    },

    onBuyUpgrade: (id: TomerunUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      vaultScene.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'timeLantern' && gsm.state.upgrades.timeLantern === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'timeLantern' && gsm.state.upgrades.timeLantern === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で時間保存室を楽しめます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickBottleShelf: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      system.bottleToShelf();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '⏳ ETERNAL SHELF 発動！',
          '時間ランタンの黄金光が満ち、全秒針渦が「永遠のひと粒」へ変化＆自動保存＆時の砂2倍！',
          'gold'
        );
      }
    },

    onClickValvePause: doValvePause,

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
      vaultScene.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい夜の時間保存室がはじまります', 'frost');
    },
  });

  const system = new PreservationSystem(vaultScene, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => {
      ui.updateHUD(audio.currentTrackId);
      checkStoryUnlock();
    },
    onOrderChange: (order, filled) => ui.updateOrder(order, filled),
    onOrderCompleted: (title, message, jarsEarned) => {
      ui.showToast(`🫙 ${title} 達成！ +${jarsEarned} 宝物の時間瓶`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onValveCooldownChange: (pct, ready, pausing) => ui.updateValveCooldown(pct, ready, pausing),
  });

  applyViewportResize();

  actor
    .load('./assets/models/tomerun.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load tomerun.glb:', err);
      ui.setModelReady(true, '時間保存室の準備が整いました（軽量モード）');
    });

  // Pointer tap & drag steering inside the time preservation vault
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
      doValvePause();
    } else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.bottleToShelf();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '⏳ ETERNAL SHELF 発動！',
          '時間ランタンの黄金光が満ち、全秒針渦が「永遠のひと粒」へ変化＆自動保存＆時の砂2倍！',
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
    const dt = Math.max(0, Math.min(0.05, (now - prevTime) / 1000));
    prevTime = now;

    if (isGameFrozen()) {
      vaultScene.renderer.render(vaultScene.scene, vaultScene.camera);
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
    const jarRatio = gsm.state.jarFill / Math.max(1, gsm.getJarCapacity());
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      system.isValvePaused,
      gsm.getReachRadius(),
      jarRatio,
      system.shieldsRemaining
    );
    vaultScene.update(
      elapsed,
      dt,
      beatInfo.beatPhase,
      beatInfo.energy,
      system.isFever,
      system.isValvePaused
    );
  }

  requestAnimationFrame(loop);
}

void bootstrap();
