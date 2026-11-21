import './style.css';
import { AudioEngine } from './game/audioEngine';
import { STORY_EPISODES, TRACKS } from './game/config';
import { NamidabinActor } from './game/namidabinActor';
import { RhythmSystem } from './game/rhythmSystem';
import { GameStateManager } from './game/state';
import { TrackId, UpgradeId } from './game/types';
import { UIController } from './game/uiController';
import { VaultScene } from './game/vaultScene';
import { LandscapeViewport } from './game/viewport';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new GameStateManager();
  const audio = new AudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const vault = new VaultScene(gameCanvas);
  vault.syncUpgrades(gsm.state);

  const actor = new NamidabinActor(vault.vaultGroup, vault.glowTex);

  let started = false;
  let paused = false;
  let overlayPaused = false;
  let roundComplete = false;
  let lastBeatFloat = 0;
  let lastSongTimeSec = 0;
  let lastPolishStep = 0;
  let lastPolishTotal = 4;
  let autoSaveTimer = 0;
  let shownOfflineToast = false;

  let prevUnlockedStories = gsm.getUnlockedEpisodesCount();

  const isGameFrozen = () => paused || overlayPaused;

  const applyViewportResize = () => {
    viewport.sync();
    const { width, height } = viewport.getSize();
    vault.resize(width, height);
    rhythm.resizeFx(width, height);
  };

  const startRound = (trackId: TrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    rhythm.resetSession(true);
    ui.showResultModal(false);
    ui.showPauseModal(false);

    audio.init(trackId);
    const tickInfo = audio.update(0, false);
    lastBeatFloat = tickInfo.beatFloat;
    lastSongTimeSec = tickInfo.songTimeSec;
    rhythm.resetBeatCursors(tickInfo.beatFloat);
    ui.updateSongProgress(0, tickInfo.durationSec);
    ui.updateHUD(trackId);
  };

  const pauseGame = () => {
    if (!started || paused || roundComplete) return;
    paused = true;
    rhythm.handlePointerUp();
    audio.pause();
    gsm.save();
    ui.showPauseModal(true, rhythm.combo);
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
    rhythm.handlePointerUp();
    audio.stopAll();
    gsm.save();
    const trackTitle = TRACKS[gsm.state.selectedTrack].title;
    ui.updateSongProgress(1, 0);
    ui.showResultModal(true, trackTitle, { ...rhythm.sessionStats });
    audio.playGemAscendSE();
  };

  const returnToLobby = () => {
    if (!started) return;
    started = false;
    paused = false;
    overlayPaused = false;
    roundComplete = false;
    gsm.save();
    audio.stopAll();
    rhythm.resetSession(false);
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const ui = new UIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedTears > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '荷車が涙瓶を運んでくれました',
          `不在中に +${gsm.offlineEarnedTears.toLocaleString('ja-JP')} 涙の結晶を採集`,
          'blue'
        );
      } else {
        ui.showToast('涙蔵へようこそ', '1分間のリズム採集！消える前にタップ＆スワイプ', 'blue');
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
      if (!started || roundComplete) return;
      if (open) {
        rhythm.handlePointerUp();
        audio.pauseBgm();
      } else if (!paused) {
        audio.resume();
      }
    },

    onSelectTrack: async (trackId: TrackId) => {
      if (isGameFrozen()) return;
      if (rhythm.isFever) {
        ui.showToast('CRYSTAL RUSH 中です', 'フィーバー終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = TRACKS[trackId].unlockMusicboxLevel;
        ui.showToast(
          `${TRACKS[trackId].shortLabel} は未解放です`,
          `「オルゴール結晶」を Lv.${req} にすると切替できます`,
          'blue'
        );
        return;
      }
      gsm.state.selectedTrack = trackId;
      gsm.save();
      roundComplete = false;
      ui.showResultModal(false);
      rhythm.resetSession(true);
      await audio.switchTrack(trackId, 0, 0.55, false);
      const info = audio.update(0, false);
      rhythm.resetBeatCursors(info.beatFloat);
      ui.updateSongProgress(0, info.durationSec);
      ui.updateHUD(trackId);
      ui.showToast('楽曲を切り替えました', TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: UpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      vault.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'musicbox' && gsm.state.upgrades.musicbox === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'musicbox' && gsm.state.upgrades.musicbox === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲を演奏できます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickPolish: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      rhythm.startPolish(lastBeatFloat);
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      void rhythm.activateFever(lastSongTimeSec);
      ui.showToast('🔥 CRYSTAL RUSH 発動！', '宝石＆結晶 2倍！高速採集タイム！', 'gold');
    },

    onChangeBgmVol: (val: number) => {
      gsm.state.settings.bgmVolume = val;
      audio.setBgmVolume(val);
      gsm.save();
    },

    onChangeSeVol: (val: number) => {
      gsm.state.settings.seVolume = val;
      audio.setSeVolume(val);
      gsm.save();
    },

    onChangeOffset: (ms: number) => {
      gsm.state.settings.timingOffsetMs = ms;
      audio.setTimingOffsetMs(ms);
      gsm.save();
    },

    onResetSave: () => {
      gsm.reset();
      vault.syncUpgrades(gsm.state);
      rhythm.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい夜がはじまります', 'blue');
    },
  });

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedEpisodesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = STORY_EPISODES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 記憶ラベル解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const rhythm = new RhythmSystem(vault, actor, audio, gsm, fxCanvas, {
    onJudgment: (judgment, sx, sy, gain, tear) => {
      ui.spawnJudgmentFloat(judgment, sx, sy, gain, tear);
    },
    onComboChange: (combo, mult) => {
      ui.updateCombo(combo, mult);
    },
    onStateDirty: () => {
      ui.updateHUD(audio.currentTrackId);
    },
    onPolishStateChange: (active, step, totalSteps) => {
      lastPolishStep = step;
      lastPolishTotal = totalSteps;
      ui.updatePolishPrompt(active, step, totalSteps, rhythm.getPolishRingProgress(lastBeatFloat));
    },
    onGemAscended: (gemsEarned, totalCrafted) => {
      ui.showToast(
        `💎 Beautiful Crystal! +${gemsEarned} 宝石`,
        `涙蔵の棚に ${totalCrafted} 個目の宝石が飾られました`,
        'gold'
      );
      checkStoryUnlock();
    },
    onFeverChange: (active, gaugePct, remainingSec) => {
      ui.updateFever(active, gaugePct, remainingSec);
      if (!active) {
        ui.updateHUD(audio.currentTrackId);
      }
    },
    onPassiveResonance: () => {
      // Quietly updates HUD via onStateDirty
    },
  });

  applyViewportResize();

  actor
    .load('./assets/models/namidabin.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load namidabin.glb:', err);
      ui.setModelReady(true, '涙蔵の準備が整いました（軽量モード）');
    });

  const onPointerDown = (e: PointerEvent) => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    const { width, height } = viewport.getSize();
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    const nx = (pt.x / width) * 2 - 1;
    const ny = -((pt.y / height) * 2 - 1);
    vault.setPointerNdc(nx, ny);
    rhythm.handlePointerDown(pt.x, pt.y, lastBeatFloat);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (isGameFrozen()) return;
    const { width, height } = viewport.getSize();
    const pt = viewport.clientToVirtual(e.clientX, e.clientY);
    const nx = (pt.x / width) * 2 - 1;
    const ny = -((pt.y / height) * 2 - 1);
    vault.setPointerNdc(nx, ny);
    if (started && !roundComplete) {
      rhythm.handlePointerMove(pt.x, pt.y);
    }
  };

  const onPointerUp = () => {
    rhythm.handlePointerUp();
  };

  gameCanvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  document.getElementById('polish-prompt')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (started && !isGameFrozen() && !roundComplete && rhythm.isPolishing) {
      rhythm.tapPolish(lastBeatFloat);
    }
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
    if (['Space', 'KeyZ', 'KeyX', 'KeyJ', 'KeyK'].includes(e.code)) {
      e.preventDefault();
      rhythm.handleKeySnap(lastBeatFloat);
    } else if (e.code === 'KeyF' && rhythm.feverGauge >= 100 && !rhythm.isFever) {
      void rhythm.activateFever(lastSongTimeSec);
      ui.showToast('🔥 CRYSTAL RUSH 発動！', '宝石＆結晶 2倍！高速採集タイム！', 'gold');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused && !roundComplete) {
      pauseGame();
    }
  });

  window.addEventListener('resize', applyViewportResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(applyViewportResize, 120);
  });
  document.addEventListener('fullscreenchange', () => {
    setTimeout(applyViewportResize, 80);
  });

  let prevTime = performance.now();
  let elapsed = 0;

  function loop(now: number): void {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prevTime) / 1000);
    prevTime = now;

    if (isGameFrozen()) {
      // Keep rendering the live 3D vault (so prop upgrades light up visually) without advancing gameplay/music
      vault.renderer.render(vault.scene, vault.camera);
      return;
    }

    elapsed += dt;
    const beatInfo = audio.update(dt, roundComplete);
    lastBeatFloat = beatInfo.beatFloat;
    lastSongTimeSec = beatInfo.songTimeSec;

    if (started && !roundComplete) {
      ui.updateBeatDots(beatInfo.beatIndex);
      if (!rhythm.isFever) {
        ui.updateSongProgress(beatInfo.progress, beatInfo.remainingSec);
      }

      if (rhythm.isPolishing) {
        ui.updatePolishPrompt(
          true,
          lastPolishStep,
          lastPolishTotal,
          rhythm.getPolishRingProgress(beatInfo.beatFloat)
        );
      }

      autoSaveTimer += dt;
      if (autoSaveTimer >= 12) {
        autoSaveTimer = 0;
        gsm.save();
      }

      if (beatInfo.ended && !rhythm.isFever && !rhythm.isPolishing) {
        finishRound();
      }
    }

    rhythm.update(dt, beatInfo.beatFloat, beatInfo.remainingSec, started && !roundComplete);
    actor.update(dt, beatInfo.beatPhase, rhythm.isFever);
    vault.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, rhythm.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
