import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { AshitayobiActor } from './ashitayobiActor';
import { AshitayobiAudioEngine } from './audioEngine';
import { ASHITAYOBI_STORIES, ASHITAYOBI_TRACKS } from './config';
import { DawnDeliverySystem } from './dawnDeliverySystem';
import { DawnPostOfficeScene } from './dawnPostOfficeScene';
import { AshitayobiStateManager } from './state';
import { AshitayobiTrackId, AshitayobiUpgradeId } from './types';
import { AshitayobiUIController } from './uiController';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new AshitayobiStateManager();
  const audio = new AshitayobiAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const postScene = new DawnPostOfficeScene(gameCanvas);
  postScene.syncUpgrades(gsm.state);

  const actor = new AshitayobiActor(postScene.worldGroup, postScene.glowTex);

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
    postScene.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = ASHITAYOBI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 配達日誌解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: AshitayobiTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    activePointerId = null;
    postScene.setCameraMode('play');
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
    if (gsm.state.satchelFill >= gsm.getSatchelCapacity()) {
      system.dispatchDawnSatchel();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = ASHITAYOBI_TRACKS[gsm.state.selectedTrack].title;
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
    postScene.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doDawnWave = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerDawnWave();
  };

  const ui = new AshitayobiUIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedGlow > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '朝焼け配達所に朝焼けの光が集まりました',
          `不在中に +${gsm.offlineEarnedGlow.toLocaleString('ja-JP')} 朝焼けの光`,
          'gold'
        );
      } else {
        ui.showToast(
          '東門の「朝焼け配達所」へようこそ',
          '勇気・優しさ・笑顔の朝焼けを集めて4つの窓辺へ届けよう！🌅 / Space で「特別な朝焼け」！',
          'dawn'
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
          const trackTitle = ASHITAYOBI_TRACKS[gsm.state.selectedTrack].title;
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

    onSelectTrack: async (trackId: AshitayobiTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('GOLDEN DAYBREAK 発動中です', '夜明けの特別配達終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = ASHITAYOBI_TRACKS[trackId].unlockArchLevel;
        ui.showToast(
          `${ASHITAYOBI_TRACKS[trackId].shortLabel} は未解放です`,
          `「大アーチ窓と東門の発着バルコニー」を Lv.${req} にすると切替できます`,
          'dawn'
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
      ui.showToast('楽曲を切り替えました', ASHITAYOBI_TRACKS[trackId].title, 'dawn');
    },

    onBuyUpgrade: (id: AshitayobiUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      postScene.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'sunriseArch' && gsm.state.upgrades.sunriseArch === 1) {
        ui.showToast('🌅 Melodic Core Ver. 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'sunriseArch' && gsm.state.upgrades.sunriseArch === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で朝焼け配達を楽しめます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickDispatchSatchel: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      system.dispatchDawnSatchel();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '🌅 GOLDEN DAYBREAK — 夜明けの特別配達！',
          '東の空に黄金の朝日が昇り、全夜霧が「特別な朝焼け」へ変化＆自動吸引＆朝焼けの光2倍！',
          'gold'
        );
      }
    },

    onClickDawnWave: doDawnWave,

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
      postScene.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい夜明けの朝焼け配達がはじまります', 'dawn');
    },
  });

  const system = new DawnDeliverySystem(postScene, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => {
      ui.updateHUD(audio.currentTrackId);
      checkStoryUnlock();
    },
    onOrderChange: (order, filled) => ui.updateOrder(order, filled),
    onOrderCompleted: (title, message, bottlesEarned) => {
      ui.showToast(`🌅 ${title} 達成！ +${bottlesEarned} あしたの小瓶`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onDawnWaveCooldownChange: (pct, ready, delivering) =>
      ui.updateDawnWaveCooldown(pct, ready, delivering),
  });

  applyViewportResize();

  actor
    .load('./assets/models/ashitayobi.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load ashitayobi.glb:', err);
      ui.setModelReady(true, '朝焼け配達所の準備が整いました（軽量モード）');
    });

  // Pointer tap & drag steering inside the Dawn Post Office
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
      doDawnWave();
    } else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.dispatchDawnSatchel();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '🌅 GOLDEN DAYBREAK — 夜明けの特別配達！',
          '東の空に黄金の朝日が昇り、全夜霧が「特別な朝焼け」へ変化＆自動吸引＆朝焼けの光2倍！',
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
      postScene.renderer.render(postScene.scene, postScene.camera);
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
    const satchelRatio = gsm.state.satchelFill / Math.max(1, gsm.getSatchelCapacity());
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      system.isDeliveringWave,
      gsm.getReachRadius(),
      satchelRatio,
      system.shieldsRemaining
    );
    postScene.update(
      elapsed,
      dt,
      beatInfo.beatPhase,
      beatInfo.energy,
      beatInfo.progress,
      system.isFever,
      system.isDeliveringWave
    );
  }

  requestAnimationFrame(loop);
}

void bootstrap();
