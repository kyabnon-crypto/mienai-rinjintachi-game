import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { SusunomiAudioEngine } from './audioEngine';
import { COUNTER_HALF_WIDTH, SUSUNOMI_STORIES, SUSUNOMI_TRACKS } from './config';
import { KitchenScene } from './kitchenScene';
import { KitchenSystem } from './kitchenSystem';
import { SusunomiStateManager } from './state';
import { SusunomiActor } from './susunomiActor';
import { SusunomiTrackId, SusunomiUpgradeId } from './types';
import { SusunomiUIController } from './uiController';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new SusunomiStateManager();
  const audio = new SusunomiAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const kitchen = new KitchenScene(gameCanvas);
  kitchen.syncUpgrades(gsm.state);

  const actor = new SusunomiActor(kitchen.worldGroup, kitchen.glowTex);

  let started = false;
  let paused = false;
  let overlayPaused = false;
  let roundComplete = false;
  let autoSaveTimer = 0;
  let shownOfflineToast = false;
  let prevUnlockedStories = gsm.getUnlockedStoriesCount();
  let lastBeatPhase = 0;

  const keysHeld = { left: false, right: false };

  const isGameFrozen = () => paused || overlayPaused;

  const applyViewportResize = () => {
    viewport.sync();
    const { width, height } = viewport.getSize();
    kitchen.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = SUSUNOMI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 換気口の記録解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'copper');
    }
  };

  const startRound = (trackId: SusunomiTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    kitchen.setCameraMode('play');
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
    // Automatically serve full simmering pot at dawn
    if (gsm.state.potFill >= gsm.getPotCapacity()) {
      system.serveSimmeredPot();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = SUSUNOMI_TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...system.sessionStats });
    audio.playDishCompleteSE();
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
    kitchen.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doStir = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerStirBurst(lastBeatPhase);
  };

  const ui = new SusunomiUIController(gsm, {
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
          '香り瓶の棚が雫を集めてくれました',
          `不在中に +${gsm.offlineEarnedDrops.toLocaleString('ja-JP')} 香りの雫`,
          'copper'
        );
      } else {
        ui.showToast('換気口の小さな台所へようこそ', 'ドラッグ・矢印で銅鍋を動かし、レシピの匂いを集めよう', 'blue');
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
          const trackTitle = SUSUNOMI_TRACKS[gsm.state.selectedTrack].title;
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

    onSelectTrack: async (trackId: SusunomiTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('ことことフィーバー中です', 'フィーバー終了後に楽曲を切り替えられます', 'copper');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = SUSUNOMI_TRACKS[trackId].unlockStoveLevel;
        ui.showToast(
          `${SUSUNOMI_TRACKS[trackId].shortLabel} は未解放です`,
          `「青いガスコンロ」を Lv.${req} にすると切替できます`,
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
      ui.showToast('楽曲を切り替えました', SUSUNOMI_TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: SusunomiUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      kitchen.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'blueStove' && gsm.state.upgrades.blueStove === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'copper');
      } else if (id === 'blueStove' && gsm.state.upgrades.blueStove === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲を調理できます', 'copper');
      } else {
        checkStoryUnlock();
      }
    },

    onClickServePot: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      system.serveSimmeredPot();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      if (system.activateFever()) {
        ui.showToast('✨ ことことフィーバー発動！', '銅鍋から記憶の光があふれ出す！全香り吸引＆2倍！', 'copper');
      }
    },

    onClickStir: doStir,

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
      kitchen.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい換気口の夜がはじまります', 'blue');
    },
  });

  const system = new KitchenSystem(kitchen, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onRecipeChange: (recipe, progress) => ui.updateRecipe(recipe, progress),
    onDishServed: (title, thought, starsEarned) => {
      ui.showToast(`🍲 ${title} 完成！ +${starsEarned} 記憶の星`, thought, 'copper');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onStirCooldownChange: (pct, ready) => ui.updateStirCooldown(pct, ready),
  });

  applyViewportResize();

  actor
    .load('./assets/models/susunomi.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load susunomi.glb:', err);
      ui.setModelReady(true, '換気口の台所の準備が整いました（軽量モード）');
    });

  // Intuitive pointer / touch drag across the kitchen counter to glide Susunomi & the Copper Pot
  let dragging = false;

  const mapVirtualXToWorldX = (vx: number): number => {
    const { width } = viewport.getSize();
    const norm = (vx / Math.max(1, width)) * 2 - 1; // -1 .. +1
    return norm * (COUNTER_HALF_WIDTH + 0.35);
  };

  gameCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    dragging = true;
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    actor.setTargetX(mapVirtualXToWorldX(pt.x));
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging || !started || isGameFrozen() || roundComplete) return;
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    actor.setTargetX(mapVirtualXToWorldX(pt.x));
  });

  window.addEventListener('pointerup', () => {
    dragging = false;
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

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      keysHeld.left = true;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      keysHeld.right = true;
    } else if (!e.repeat && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) {
      e.preventDefault();
      doStir();
    } else if (!e.repeat && e.code === 'KeyE') {
      e.preventDefault();
      system.serveSimmeredPot();
    } else if (!e.repeat && (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
      e.preventDefault();
      if (system.activateFever()) {
        ui.showToast('✨ ことことフィーバー発動！', '銅鍋から記憶の光があふれ出す！全香り吸引＆2倍！', 'copper');
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysHeld.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keysHeld.right = false;
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
      kitchen.renderer.render(kitchen.scene, kitchen.camera);
      return;
    }

    elapsed += dt;
    const beatInfo = audio.update(dt, roundComplete || !started);
    lastBeatPhase = beatInfo.beatPhase;

    const active = started && !roundComplete;
    if (active) {
      // Smooth continuous keyboard movement
      const moveDir = (keysHeld.right ? 1 : 0) - (keysHeld.left ? 1 : 0);
      if (moveDir !== 0) {
        actor.nudgeTargetX(moveDir * 7.6 * dt);
      }

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
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      gsm.getCatchRadius(),
      system.shieldsRemaining
    );
    kitchen.setFocusX(actor.currentX);
    kitchen.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, system.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
