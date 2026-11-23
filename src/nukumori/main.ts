import './style.css';
import { LandscapeViewport } from '../game/viewport';
import { NukumoriAudioEngine } from './audioEngine';
import { NUKUMORI_STORIES, NUKUMORI_TRACKS } from './config';
import { NukumoriActor } from './nukumoriActor';
import { NukumoriStateManager } from './state';
import { NukumoriTrackId, NukumoriUpgradeId } from './types';
import { NukumoriUIController } from './uiController';
import { VendingScene } from './vendingScene';
import { WarmthSystem } from './warmthSystem';

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement;
  const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx-canvas') as HTMLCanvasElement;

  const viewport = new LandscapeViewport(appEl);
  const gsm = new NukumoriStateManager();
  const audio = new NukumoriAudioEngine();
  audio.bgmVolume = gsm.state.settings.bgmVolume;
  audio.seVolume = gsm.state.settings.seVolume;
  audio.timingOffsetMs = gsm.state.settings.timingOffsetMs;

  const vendingScene = new VendingScene(gameCanvas);
  vendingScene.syncUpgrades(gsm.state);

  const actor = new NukumoriActor(vendingScene.worldGroup, vendingScene.glowTex);

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
    vendingScene.resize(width, height);
    system.resizeFx(width, height);
  };

  const checkStoryUnlock = () => {
    const nowCount = gsm.getUnlockedStoriesCount();
    if (nowCount > prevUnlockedStories) {
      const ep = NUKUMORI_STORIES[nowCount - 1];
      prevUnlockedStories = nowCount;
      ui.showToast(`📖 温度番の記録解放：第${ep.chapter}章`, `『${ep.title}』が読めるようになりました`, 'gold');
    }
  };

  const startRound = (trackId: NukumoriTrackId) => {
    roundComplete = false;
    paused = false;
    overlayPaused = false;
    activePointerId = null;
    vendingScene.setCameraMode('play');
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
    if (gsm.state.canRackFill >= gsm.getCanRackCapacity()) {
      system.deliverHotCanRack();
    }
    audio.stopAll();
    gsm.save();
    const trackTitle = NUKUMORI_TRACKS[gsm.state.selectedTrack].title;
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
    vendingScene.setCameraMode('lobby');
    ui.returnToLobby();
    void viewport.exitLandscape().then(applyViewportResize);
  };

  const doSteamWave = () => {
    if (!started || isGameFrozen() || roundComplete) return;
    audio.unlockOnGesture();
    system.triggerSteamWave();
  };

  const ui = new NukumoriUIController(gsm, {
    onStart: () => {
      if (started) return;
      started = true;
      void viewport.enterLandscape().then(applyViewportResize);
      applyViewportResize();

      ui.enterGame();
      startRound(gsm.state.selectedTrack);

      if (gsm.offlineEarnedWarmth > 0 && !shownOfflineToast) {
        shownOfflineToast = true;
        ui.showToast(
          '缶ウォーマーがほかほかぬくもりを蓄えてくれました',
          `不在中に +${gsm.offlineEarnedWarmth.toLocaleString('ja-JP')} ぬくもり`,
          'gold'
        );
      } else {
        ui.showToast(
          '自動販売機の裏の温度番、今夜もはじまり',
          '冷えたベンチをタップ・近づいてじんわり温めよう！♨️ / Space で湯気ウェーブ！',
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
          const trackTitle = NUKUMORI_TRACKS[gsm.state.selectedTrack].title;
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

    onSelectTrack: async (trackId: NukumoriTrackId) => {
      if (isGameFrozen()) return;
      if (system.isFever) {
        ui.showToast('POKAPOKA NIGHT 発動中です', 'ぽかぽかフィーバー終了後に楽曲を切り替えられます', 'gold');
        return;
      }
      if (!gsm.isTrackUnlocked(trackId)) {
        const req = NUKUMORI_TRACKS[trackId].unlockLampLevel;
        ui.showToast(
          `${NUKUMORI_TRACKS[trackId].shortLabel} は未解放です`,
          `「裸電球と看板」を Lv.${req} にすると切替できます`,
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
      ui.showToast('楽曲を切り替えました', NUKUMORI_TRACKS[trackId].title, 'blue');
    },

    onBuyUpgrade: (id: NukumoriUpgradeId) => {
      if (!gsm.buyUpgrade(id)) return;
      audio.playUpgradeSE();
      vendingScene.syncUpgrades(gsm.state);
      ui.updateHUD(audio.currentTrackId);

      if (id === 'hangingLamp' && gsm.state.upgrades.hangingLamp === 1) {
        ui.showToast('✨ 通常版 解放！', '右上の楽曲ボタンからいつでも切替できます', 'gold');
      } else if (id === 'hangingLamp' && gsm.state.upgrades.hangingLamp === 2) {
        ui.showToast('🎹 Instrumental バージョン解放！', '全3バージョンの楽曲で真冬の街を温められます', 'gold');
      } else {
        checkStoryUnlock();
      }
    },

    onClickDeliverCans: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      system.deliverHotCanRack();
    },

    onClickFever: () => {
      if (!started || isGameFrozen() || roundComplete) return;
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '♨️ POKAPOKA NIGHT 発動！',
          '真冬の夜空が黄金の湯気雪に！全ベンチ自動保温＆ぬくもり2倍！',
          'gold'
        );
      }
    },

    onClickSteamWave: doSteamWave,

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
      vendingScene.syncUpgrades(gsm.state);
      system.resetSession(false);
      prevUnlockedStories = 0;
      ui.updateHUD(audio.currentTrackId);
      ui.showToast('セーブデータを初期化しました', '新しい真冬の温度番の夜がはじまります', 'blue');
    },
  });

  const system = new WarmthSystem(vendingScene, actor, audio, gsm, fxCanvas, {
    onFloatingText: (label, sx, sy, color, sub) => ui.spawnFloatingText(label, sx, sy, color, sub),
    onComboChange: (combo, mult) => ui.updateCombo(combo, mult),
    onStateDirty: () => ui.updateHUD(audio.currentTrackId),
    onOrderChange: (order, filled) => ui.updateOrder(order, filled),
    onOrderCompleted: (title, message, bottlesEarned) => {
      ui.showToast(`🫧 ${title} 達成！ +${bottlesEarned} 白い息の小瓶`, message, 'gold');
      checkStoryUnlock();
    },
    onFeverChange: (active, pct, rem) => {
      ui.updateFever(active, pct, rem);
      if (!active) ui.updateHUD(audio.currentTrackId);
    },
    onShieldChange: (shields) => ui.updateShields(shields),
    onWaveCooldownChange: (pct, ready) => ui.updateWaveCooldown(pct, ready),
  });

  applyViewportResize();

  actor
    .load('./assets/models/nukumori.glb')
    .then(() => ui.setModelReady(true))
    .catch((err) => {
      console.error('Failed to load nukumori.glb:', err);
      ui.setModelReady(true, '自販機裏の小屋の準備が整いました（軽量モード）');
    });

  // Pointer tap (snap to bench) & drag steering on winter plaza
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
      doSteamWave();
    } else if (!e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      audio.unlockOnGesture();
      system.deliverHotCanRack();
    } else if (!e.repeat && e.code === 'KeyF') {
      e.preventDefault();
      audio.unlockOnGesture();
      if (system.activateFever()) {
        ui.showToast(
          '♨️ POKAPOKA NIGHT 発動！',
          '真冬の夜空が黄金の湯気雪に！全ベンチ自動保温＆ぬくもり2倍！',
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
      vendingScene.renderer.render(vendingScene.scene, vendingScene.camera);
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
    const rackRatio = gsm.state.canRackFill / Math.max(1, gsm.getCanRackCapacity());
    actor.update(
      elapsed,
      dt,
      active,
      beatInfo.beatPhase,
      system.isFever,
      gsm.getWarmRadius(),
      rackRatio,
      system.shieldsRemaining
    );
    vendingScene.update(elapsed, dt, beatInfo.beatPhase, beatInfo.energy, system.isFever);
  }

  requestAnimationFrame(loop);
}

void bootstrap();
