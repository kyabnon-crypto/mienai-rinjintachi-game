import {
  FRAGMENT_MAP,
  getTokitsugiUpgradeCost,
  TOKITSUGI_STORIES,
  TOKITSUGI_TRACKS,
  TOKITSUGI_UPGRADES,
} from './config';
import { TokitsugiStateManager } from './state';
import {
  BrokenTimeOrderDef,
  TokitsugiRunStats,
  TokitsugiTrackId,
  TokitsugiUpgradeId,
} from './types';

export interface TokitsugiUIHandlers {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: TokitsugiTrackId) => void;
  onBuyUpgrade: (id: TokitsugiUpgradeId) => void;
  onClickWindWatch: () => void;
  onClickFever: () => void;
  onClickRewind: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class TokitsugiUIController {
  private gsm: TokitsugiStateManager;
  private handlers: TokitsugiUIHandlers;

  private titleScreen = document.getElementById('title-screen') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status') as HTMLElement;
  private hud = document.getElementById('hud') as HTMLElement;
  private floatingLayer = document.getElementById('floating-layer') as HTMLElement;
  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  private elWorkshopRank = document.getElementById('hud-workshop-rank') as HTMLElement;
  private elSands = document.getElementById('hud-sands') as HTMLElement;
  private elMiracles = document.getElementById('hud-miracles') as HTMLElement;
  private elShields = document.getElementById('hud-shields') as HTMLElement;
  private elTimeLeft = document.getElementById('hud-time-left') as HTMLElement;
  private elProgressFill = document.getElementById('song-progress-fill') as HTMLElement;
  private elNowPlaying = document.getElementById('now-playing') as HTMLElement;

  private elOrderName = document.getElementById('order-name') as HTMLElement;
  private elOrderSlots = document.getElementById('order-slots') as HTMLElement;

  private elComboWrap = document.getElementById('combo-display') as HTMLElement;
  private elComboCount = document.getElementById('combo-count') as HTMLElement;
  private elComboMult = document.getElementById('combo-mult') as HTMLElement;

  private elFeverBanner = document.getElementById('fever-banner') as HTMLElement;
  private elFeverTimer = document.getElementById('fever-timer') as HTMLElement;
  private elFeverFill = document.getElementById('fever-bar-fill') as HTMLElement;
  private btnFever = document.getElementById('btn-fever') as HTMLButtonElement;

  private elWatchFill = document.getElementById('watch-fill') as HTMLElement;
  private elWatchPct = document.getElementById('watch-pct') as HTMLElement;
  private elWatchCount = document.getElementById('watch-count') as HTMLElement;
  private btnWindWatch = document.getElementById('btn-wind-watch') as HTMLButtonElement;

  private btnRewind = document.getElementById('ctrl-rewind') as HTMLButtonElement;
  private elRewindCdFill = document.getElementById('rewind-cd-fill') as HTMLElement;

  private beatDots = Array.from(document.querySelectorAll('.beat-dot')) as HTMLElement[];
  private trackBtns = Array.from(document.querySelectorAll('.track-btn')) as HTMLButtonElement[];

  private craftDrawer = document.getElementById('craft-drawer') as HTMLElement;
  private craftList = document.getElementById('craft-list') as HTMLElement;
  private craftBadge = document.getElementById('craft-badge') as HTMLElement;
  private storyBadge = document.getElementById('story-badge') as HTMLElement;

  private storyModal = document.getElementById('story-modal') as HTMLElement;
  private storyList = document.getElementById('story-list') as HTMLElement;
  private settingsModal = document.getElementById('settings-modal') as HTMLElement;
  private pauseModal = document.getElementById('pause-modal') as HTMLElement;
  private resultModal = document.getElementById('result-modal') as HTMLElement;

  private elPauseCombo = document.getElementById('pause-stat-combo') as HTMLElement;
  private elPauseSands = document.getElementById('pause-stat-sands') as HTMLElement;
  private elPauseMiracles = document.getElementById('pause-stat-miracles') as HTMLElement;

  private elResTrack = document.getElementById('result-track-name') as HTMLElement;
  private elResRank = document.getElementById('result-rank') as HTMLElement;
  private elResStitched = document.getElementById('res-stitched') as HTMLElement;
  private elResPerfects = document.getElementById('res-perfects') as HTMLElement;
  private elResMaxCombo = document.getElementById('res-max-combo') as HTMLElement;
  private elResPurified = document.getElementById('res-purified') as HTMLElement;
  private elResSands = document.getElementById('res-sands') as HTMLElement;
  private elResMiracles = document.getElementById('res-miracles') as HTMLElement;

  private optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
  private optBgmVal = document.getElementById('opt-bgm-val') as HTMLElement;
  private optSe = document.getElementById('opt-se') as HTMLInputElement;
  private optSeVal = document.getElementById('opt-se-val') as HTMLElement;
  private optOffset = document.getElementById('opt-offset') as HTMLInputElement;
  private optOffsetVal = document.getElementById('opt-offset-val') as HTMLElement;

  private seenStoryCount = 0;

  constructor(gsm: TokitsugiStateManager, handlers: TokitsugiUIHandlers) {
    this.gsm = gsm;
    this.handlers = handlers;
    this.seenStoryCount = gsm.getUnlockedStoriesCount();
    this.bindEvents();
    this.syncSettingsControls();
  }

  private isAnyOverlayOpen(): boolean {
    return (
      !this.craftDrawer.classList.contains('hidden') ||
      !this.storyModal.classList.contains('hidden') ||
      !this.settingsModal.classList.contains('hidden')
    );
  }

  private notifyOverlayState(): void {
    this.handlers.onOverlayVisibilityChange(this.isAnyOverlayOpen());
  }

  private bindEvents(): void {
    this.btnStart.addEventListener('click', () => this.handlers.onStart());
    this.btnWindWatch.addEventListener('click', () => this.handlers.onClickWindWatch());
    this.btnFever.addEventListener('click', () => this.handlers.onClickFever());

    this.btnRewind.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClickRewind();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.track as TokitsugiTrackId;
        if (tid) this.handlers.onSelectTrack(tid);
      });
    });

    document.getElementById('btn-craft')?.addEventListener('click', () => {
      const opening = this.craftDrawer.classList.contains('hidden');
      this.storyModal.classList.add('hidden');
      this.settingsModal.classList.add('hidden');
      this.craftDrawer.classList.toggle('hidden', !opening);
      if (opening) this.renderCraftList();
      this.notifyOverlayState();
    });

    document.getElementById('btn-close-craft')?.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-story')?.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.settingsModal.classList.add('hidden');
      this.renderStoryList();
      this.storyModal.classList.remove('hidden');
      this.seenStoryCount = this.gsm.getUnlockedStoriesCount();
      this.storyBadge.classList.add('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-close-story')?.addEventListener('click', () => {
      this.storyModal.classList.add('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.storyModal.classList.add('hidden');
      this.syncSettingsControls();
      this.settingsModal.classList.remove('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-pause')?.addEventListener('click', () => this.handlers.onPause());
    document.getElementById('btn-resume')?.addEventListener('click', () => this.handlers.onResume());
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      this.syncSettingsControls();
      this.settingsModal.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-return-lobby')?.addEventListener('click', () => this.handlers.onReturnToLobby());

    document.getElementById('btn-retry')?.addEventListener('click', () => this.handlers.onRetry());
    document.getElementById('btn-result-craft')?.addEventListener('click', () => {
      this.resultModal.classList.add('hidden');
      this.renderCraftList();
      this.craftDrawer.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-result-lobby')?.addEventListener('click', () => this.handlers.onReturnToLobby());

    this.storyModal.addEventListener('click', (e) => {
      if (e.target === this.storyModal) {
        this.storyModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.settingsModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });

    this.optBgm.addEventListener('input', () => {
      const v = Number(this.optBgm.value) / 100;
      this.optBgmVal.textContent = `${Math.round(v * 100)}%`;
      this.handlers.onChangeBgmVol(v);
    });

    this.optSe.addEventListener('input', () => {
      const v = Number(this.optSe.value) / 100;
      this.optSeVal.textContent = `${Math.round(v * 100)}%`;
      this.handlers.onChangeSeVol(v);
    });

    this.optOffset.addEventListener('input', () => {
      const ms = Number(this.optOffset.value);
      this.optOffsetVal.textContent = `${ms > 0 ? '+' : ''}${ms}ms`;
      this.handlers.onChangeOffset(ms);
    });

    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      if (window.confirm('トキツギの時計工房の進行データを初期化しますか？')) {
        this.handlers.onResetSave();
        this.settingsModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });
  }

  private syncSettingsControls(): void {
    const s = this.gsm.state.settings;
    this.optBgm.value = String(Math.round(s.bgmVolume * 100));
    this.optBgmVal.textContent = `${Math.round(s.bgmVolume * 100)}%`;
    this.optSe.value = String(Math.round(s.seVolume * 100));
    this.optSeVal.textContent = `${Math.round(s.seVolume * 100)}%`;
    this.optOffset.value = String(s.timingOffsetMs);
    this.optOffsetVal.textContent = `${s.timingOffsetMs > 0 ? '+' : ''}${s.timingOffsetMs}ms`;
  }

  public setModelReady(ready: boolean, customText?: string): void {
    if (customText) {
      this.loadingStatus.textContent = customText;
    } else if (ready) {
      this.loadingStatus.textContent = '押し入れの時計工房の準備が整いました';
    }
    this.loadingStatus.classList.toggle('ready', ready);
  }

  public enterGame(): void {
    this.titleScreen.classList.add('fade-out');
    setTimeout(() => {
      this.titleScreen.classList.add('hidden');
    }, 420);
    this.hud.classList.remove('hidden');
  }

  public returnToLobby(): void {
    this.pauseModal.classList.add('hidden');
    this.resultModal.classList.add('hidden');
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.titleScreen.classList.remove('fade-out');
    });
  }

  public showPauseModal(show: boolean, combo = 0): void {
    if (show) {
      this.elPauseCombo.textContent = String(combo);
      this.elPauseSands.textContent = this.gsm.state.sands.toLocaleString('ja-JP');
      this.elPauseMiracles.textContent = this.gsm.state.miracles.toLocaleString('ja-JP');
    }
    this.pauseModal.classList.toggle('hidden', !show);
  }

  public showResultModal(show: boolean, trackTitle?: string, stats?: TokitsugiRunStats): void {
    if (show && stats) {
      this.elResTrack.textContent = `♪ ${trackTitle || ''}`;
      this.elResStitched.textContent = String(stats.stitched);
      this.elResPerfects.textContent = String(stats.perfects);
      this.elResMaxCombo.textContent = String(stats.maxCombo);
      this.elResPurified.textContent = String(stats.riftsPurified);
      this.elResSands.textContent = `+${stats.sandsEarned.toLocaleString('ja-JP')}`;
      this.elResMiracles.textContent = `+${stats.miraclesEarned.toLocaleString('ja-JP')}`;

      const score =
        stats.stitched * 2 +
        stats.perfects * 2 +
        stats.ordersCompleted * 18 +
        stats.linksCompleted * 8 +
        stats.maxCombo;
      let rank = 'B';
      let rankCls = 'rank-b';
      if (score >= 175) {
        rank = 'SS';
        rankCls = 'rank-ss';
      } else if (score >= 115) {
        rank = 'S';
        rankCls = 'rank-s';
      } else if (score >= 65) {
        rank = 'A';
        rankCls = 'rank-a';
      }
      this.elResRank.textContent = rank;
      this.elResRank.className = `result-rank ${rankCls}`;
    }
    this.resultModal.classList.toggle('hidden', !show);
  }

  public updateHUD(trackId: TokitsugiTrackId): void {
    const st = this.gsm.state;
    this.elWorkshopRank.textContent = `Lv.${this.gsm.getWorkshopRank()}`;
    this.elSands.textContent = st.sands.toLocaleString('ja-JP');
    this.elMiracles.textContent = st.miracles.toLocaleString('ja-JP');
    this.elNowPlaying.textContent = `♪ ${TOKITSUGI_TRACKS[trackId].title}`;

    // Pocket watch mainspring progress
    const cap = this.gsm.getWatchCapacity();
    const pct = Math.min(100, Math.round((st.watchFill / cap) * 100));
    this.elWatchFill.style.height = `${pct}%`;
    this.elWatchPct.textContent = `${pct}%`;
    this.elWatchCount.textContent = `${st.watchFill} / ${cap}`;

    const ready = st.watchFill >= cap;
    this.btnWindWatch.disabled = !ready;
    this.btnWindWatch.classList.toggle('ready', ready);
    this.btnWindWatch.textContent = ready
      ? `🕰️ ぜんまいを巻く（+${this.gsm.getMiraclesPerWatch()} 奇跡）`
      : `時を繋いでいます (${st.watchFill}/${cap})`;

    // Track switch buttons
    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as TokitsugiTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === trackId);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? TOKITSUGI_TRACKS[tid].title
        : `「大きな柱時計」Lv.${TOKITSUGI_TRACKS[tid].unlockClockLevel} で解放`;
    });

    // Badges
    this.craftBadge.classList.toggle('hidden', !this.gsm.hasAnyAffordableUpgrade());
    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.seenStoryCount);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateOrder(order: BrokenTimeOrderDef, filled: [boolean, boolean, boolean]): void {
    this.elOrderName.textContent = order.name;
    this.elOrderSlots.innerHTML = order.fragments
      .map((fid, idx) => {
        const def = FRAGMENT_MAP[fid];
        const done = filled[idx];
        return `<span class="order-slot ${done ? 'done' : ''}" style="--slot-col:${def.cssColor}">
          <span class="slot-icon">${def.icon}</span>
          <span class="slot-name">${def.shortName}</span>
        </span>`;
      })
      .join('');
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    this.elProgressFill.style.width = `${(Math.min(1, Math.max(0, progress)) * 100).toFixed(2)}%`;
    const sec = Math.max(0, Math.ceil(remainingSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.elTimeLeft.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  public updateBeatDots(beatIndex: number): void {
    const active = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === active);
    });
  }

  public updateCombo(combo: number, mult: number): void {
    if (combo <= 1) {
      this.elComboWrap.classList.add('hidden');
      return;
    }
    this.elComboWrap.classList.remove('hidden');
    this.elComboCount.textContent = String(combo);
    this.elComboMult.textContent = `×${mult.toFixed(2)}`;
    this.elComboWrap.classList.remove('pop');
    void this.elComboWrap.offsetWidth;
    this.elComboWrap.classList.add('pop');
  }

  public updateFever(active: boolean, pct: number, remainingSec: number): void {
    const clamped = Math.min(100, Math.max(0, pct));
    this.elFeverFill.style.width = `${clamped.toFixed(1)}%`;
    this.elFeverFill.classList.toggle('fever-active', active);

    if (active) {
      this.elFeverBanner.classList.remove('hidden');
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `✨ GOLDEN HOUR ${remainingSec.toFixed(1)}s`;
    } else {
      this.elFeverBanner.classList.add('hidden');
      const ready = clamped >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready
        ? '✨ GOLDEN HOUR 発動！ (F)'
        : `黄金の刻ゲージ ${Math.floor(clamped)}%`;
    }
  }

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '⏳'.repeat(Math.min(5, shields)) : '―';
  }

  public updateRewindCooldown(pct: number, ready: boolean): void {
    this.elRewindCdFill.style.width = `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`;
    this.btnRewind.classList.toggle('ready', ready);
  }

  public renderCraftList(): void {
    const st = this.gsm.state;
    this.craftList.innerHTML = TOKITSUGI_UPGRADES.map((def) => {
      const lv = st.upgrades[def.id];
      const isMax = lv >= def.maxLevel;
      const cost = getTokitsugiUpgradeCost(def, lv);
      const canBuy = !isMax && st.sands >= cost.sands && st.miracles >= cost.miracles;

      const costHtml = isMax
        ? `<span class="cost-max">MAX 整備完了</span>`
        : `<span class="cost-item ${st.sands >= cost.sands ? 'ok' : 'ng'}">⏳ ${cost.sands.toLocaleString('ja-JP')} 砂</span>
           ${
             cost.miracles > 0
               ? `<span class="cost-item ${st.miracles >= cost.miracles ? 'ok' : 'ng'}">✨ ${cost.miracles} 奇跡</span>`
               : ''
           }`;

      return `<div class="craft-item ${canBuy ? 'affordable' : ''}">
        <div class="craft-head">
          <div>
            <h3>${def.name}</h3>
            <span class="craft-prop">${def.propName}</span>
          </div>
          <span class="craft-lv">Lv.${lv} / ${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <p class="craft-effect">${def.effectText(lv)}</p>
        <div class="craft-footer">
          <div class="craft-cost">${costHtml}</div>
          <button class="btn-buy" data-upgrade="${def.id}" type="button" ${canBuy ? '' : 'disabled'}>
            ${isMax ? '完了' : '整える'}
          </button>
        </div>
      </div>`;
    }).join('');

    this.craftList.querySelectorAll('.btn-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.upgrade as TokitsugiUpgradeId;
        if (id) this.handlers.onBuyUpgrade(id);
      });
    });
  }

  public renderStoryList(): void {
    const diaryLv = this.gsm.state.upgrades.closetDiary;
    const mended = this.gsm.state.totalWatchesMended;

    this.storyList.innerHTML = TOKITSUGI_STORIES.map((ep) => {
      const unlocked = diaryLv >= ep.requiredDiaryLevel || mended >= ep.requiredWatchesMended;
      if (!unlocked) {
        return `<article class="story-card locked">
          <div class="story-meta">第${ep.chapter}章 ・ ${ep.timeLabel}</div>
          <h3>🔒 ${ep.title}</h3>
          <p class="story-lock-hint">解放条件：「押し入れの記録帳」Lv.${ep.requiredDiaryLevel} または 懐中時計を累計 ${ep.requiredWatchesMended}個修繕</p>
        </article>`;
      }
      return `<article class="story-card">
        <div class="story-meta">第${ep.chapter}章 ・ ${ep.timeLabel}</div>
        <h3>${ep.title}</h3>
        <blockquote class="story-quote">${ep.quote}</blockquote>
        ${ep.body.map((p) => `<p class="story-para">${p}</p>`).join('')}
        <div class="story-badge-row">🕰️ 修繕の証：${ep.relicBadge}</div>
      </article>`;
    }).join('');
  }

  public spawnFloatingText(
    label: string,
    sx: number,
    sy: number,
    color: string,
    sub?: string
  ): void {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.innerHTML = `<strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 920);
  }

  public showToast(title: string, desc: string, tone: 'gold' | 'blue' = 'gold'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3650);
  }
}
