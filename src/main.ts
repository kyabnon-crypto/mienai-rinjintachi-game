import './style.css';
import { AudioEngine } from './game/audioEngine';
import { STORY_EPISODES, TRACKS } from './game/config';
import { NamidabinActor } from './game/namidabinActor';
import { RhythmSystem } from './game/rhythmSystem';
import { GameStateManager } from './game/state';
import { TrackId, UpgradeId } from './game/types';
import { UIController } from './game/uiController';
import { VaultScene } from './game/vaultScene';

async function bootstrap(): Promise<void> {
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const gsm = new GameStateManager();
  const audio = new AudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const vault = new VaultScene(gameCanvas);
  vault.syncUpgrades(gsm.state);

  const actor = new NamidabinActor(vault.vaultGroup, vault.glowTex);

  let started = false;
  let lastBeatFloat = 0;
  let lastPolishStep = 0;
  let lastPolishTotal = 4;
  let autoSaveTimer = 0;

  let prevUnlockedStories = gsm.getUnlockedEpisodesCount();

  const ui = new UIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      ui.enterGame();
      audio.init(gsm.state.selectedTrack);
      const tickInfo = audio.update(0);
      rhythm.resetBeatCursors(tickInfo.beatFloat);
      ui.updateHUD(audio.currentTrackId);

      if (gsm.offlineEarnedTears > 0) {
        ui.showToast(
          '荷車が涙瓶を運んでくれました',
          `不在中に +${gsm.offlineEarnedTears.toLocaleString('ja-JP')} 涙の結晶を採集`,
          'blue'
        );
      } else {
        ui.showToast('涙蔵へようこそ', '光る輪が重なる瞬間にタップ＆スワイプ！', 'blue');
      }
    },

    onSelectTrack: async (trackId: TrackId) => {
      if (rhythm.isFever) {
        ui.showToast('CRYSTAL RUSH 中です', 'フィーバー終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = TRACKS[trackId].unlockMusicboxLevel;
        ui.showToast(
          `${TRACKS[trackId].shortLabel} は未解放です`,
          `「オルゴール結晶」を Lv.${req} にすると常時切替できます`,
          'blue'
        );
        return;
      }
      gsm.state.selectedTrack = trackId;
      gsm.save();
      await audio.switchTrack(trackId, undefined, 0.75);
      const info = audio.update(0);
      rhythm.resetBeatCursors(info.beatFloat);
      ui.updateHUD(trackId);
      ui.showToast('楽曲を切り替えました', TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: UpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      vault.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      // Check for newly unlocked tracks or story chapters
      if (id === 'musicbox' && gsm.state.upgrades.musicbox === 1) {
        ui.showToast('✨ 通常版アレンジ解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'musicbox' && gsm.state.upgrades.musicbox === 3) {
        ui.showToast('🔥 Digital Math Punk Remix 常時解放！', '超高速モードをいつでも演奏できます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickPolish: () => {
      if (!started) return;
      rhythm.startPolish(lastBeatFloat);
    },

    onClickFever: () => {
      if (!started) return;
      void rhythm.activateFever(lastBeatFloat);
      ui.updateHUD('remix');
      ui.showToast('🔥 CRYSTAL RUSH 発動！', 'Digital Math Punk Remix — 宝石＆結晶 2倍！', 'gold');
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
      rhythm.combo = 0;
      rhythm.feverGauge = 0;
      prevUnlockedStories = 0;
      ui.updateCombo(0, 1);
      ui.updateFever(false, 0, 0);
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

  // Load real Namidabin .glb model asynchronously while scene is already alive
  actor
    .load('./assets/models/namidabin.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load namidabin.glb:', err);
      ui.setModelReady(true, '涙蔵の準備が整いました（軽量モード）');
    });

  // Pointer & touch interaction on the 3D canvas
  const onPointerDown = (e: PointerEvent) => {
    if (!started) return;
    audio.unlockOnGesture();
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    vault.setPointerNdc(nx, ny);
    rhythm.handlePointerDown(e.clientX, e.clientY, lastBeatFloat);
  };

  const onPointerMove = (e: PointerEvent) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    vault.setPointerNdc(nx, ny);
    if (started) {
      rhythm.handlePointerMove(e.clientX, e.clientY, lastBeatFloat);
    }
  };

  const onPointerUp = () => {
    rhythm.handlePointerUp();
  };

  gameCanvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Also allow tapping anywhere on the polish overlay itself during polishing
  document.getElementById('polish-prompt')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (started && rhythm.isPolishing) {
      rhythm.tapPolish(lastBeatFloat);
    }
  });

  // Keyboard shortcuts for crisp PC rhythm play (Space / Z / X / J / K / F)
  window.addEventListener('keydown', (e) => {
    if (!started || e.repeat) return;
    if (['Space', 'KeyZ', 'KeyX', 'KeyJ', 'KeyK'].includes(e.code)) {
      e.preventDefault();
      rhythm.handleKeySnap(lastBeatFloat);
    } else if (e.code === 'KeyF' && rhythm.feverGauge >= 100 && !rhythm.isFever) {
      void rhythm.activateFever(lastBeatFloat);
      ui.updateHUD('remix');
    }
  });

  // Resize handler
  window.addEventListener('resize', () => {
    vault.resize(window.innerWidth, window.innerHeight);
    rhythm.resizeFx(window.innerWidth, window.innerHeight);
  });

  // Main 60fps animation loop
  let prevTime = performance.now();
  let elapsed = 0;

  function loop(now: number): void {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - prevTime) / 1000);
    prevTime = now;
    elapsed += dt;

    const beatInfo = audio.update(dt);
    lastBeatFloat = beatInfo.beatFloat;

    if (started) {
      ui.updateBeatDots(beatInfo.beatIndex);
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
    }

    rhythm.update(dt, beatInfo.beatFloat, started);
    actor.update(dt, beatInfo.beatPhase, rhythm.isFever);
    vault.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, rhythm.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
