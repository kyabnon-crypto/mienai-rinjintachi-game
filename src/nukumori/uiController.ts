import {
  getNukumoriUpgradeCost,
  NUKUMORI_STORIES,
  NUKUMORI_TRACKS,
  NUKUMORI_UPGRADES,
  WARMTH_ITEM_MAP,
} from './config';
import { NukumoriStateManager } from './state';
import {
  NukumoriRunStats,
  NukumoriTrackId,
  NukumoriUpgradeId,
  WarmthOrderDef,
} from './types';

export interface NukumoriUIHandlers {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: NukumoriTrackId) => void;
  onBuyUpgrade: (id: NukumoriUpgradeId) => void;
  onClickDeliverCans: () => void;
  onClickFever: () => void;
  onClickSteamWave: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class NukumoriUIController {
  private gsm: NukumoriStateManager;
  private handlers: NukumoriUIHandlers;

  private titleScreen = document.getElementById('title-screen') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status') as HTMLElement;
  private hud = document.getElementById('hud') as HTMLElement;
  private floatingLayer = document.getElementById('floating-layer') as HTMLElement;
  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  private elRoomRank = document.getElementById('hud-room-rank') as HTMLElement;
  private elWarmth = document.getElementById('hud-warmth') as HTMLElement;
  private elBottles = document.getElementById('hud-bottles') as HTMLElement;
  private elShields = document.getElementById('hud-shields') as HTMLElement;
  private elTimeLeft = document.getElementById('hud-time-left') as HTMLElement;
  private elProgressFill = document.getElementById('song-progress-fill') as HTMLElement;
  private elNowPlaying = document.getElementById('now-playing') as HTMLElement;

  private elOrderCard = document.getElementById('order-card') as HTMLElement;
  private elOrderName = document.getElementById('order-name') as HTMLElement;
  private elOrderSlots = document.getElementById('order-slots') as HTMLElement;

  private elComboWrap = document.getElementById('combo-display') as HTMLElement;
  private elComboCount = document.getElementById('combo-count') as HTMLElement;
  private elComboMult = document.getElementById('combo-mult') as HTMLElement;

  private elFeverBanner = document.getElementById('fever-banner') as HTMLElement;
  private elFeverTimer = document.getElementById('fever-timer') as HTMLElement;
  private elFeverFill = document.getElementById('fever-bar-fill') as HTMLElement;
  private btnFever = document.getElementById('btn-fever') as HTMLButtonElement;

  private elRackFill = document.getElementById('rack-fill') as HTMLElement;
  private elRackPct = document.getElementById('rack-pct') as HTMLElement;
  private elRackCount = document.getElementById('rack-count') as HTMLElement;
  private btnDeliverCans = document.getElementById('btn-deliver-cans') as HTMLButtonElement;

  private btnWave = document.getElementById('ctrl-wave') as HTMLButtonElement;
  private elWaveCdFill = document.getElementById('wave-cd-fill') as HTMLElement;

  private beatDots = Array.from(document.querySelectorAll('.beat-dot')) as HTMLElement[];
  private trackBtns = Array.from(document.querySelectorAll('.track-btn')) as HTMLButtonElement[];

  private craftDrawer = document.getElementById('craft-drawer') as HTMLElement;
  private craftList = document.getElementById('craft-list') as HTMLElement;
  private btnCraft = document.getElementById('btn-craft') as HTMLButtonElement;
  private craftBadge = document.getElementById('craft-badge') as HTMLElement;
  private btnRoomQuick = document.getElementById('btn-room-quick') as HTMLButtonElement;
  private roomQuickBadge = document.getElementById('room-quick-badge') as HTMLElement;
  private btnResultCraft = document.getElementById('btn-result-craft') as HTMLButtonElement;
  private resultCraftBadge = document.getElementById('result-craft-badge') as HTMLElement;
  private storyBadge = document.getElementById('story-badge') as HTMLElement;

  private storyModal = document.getElementById('story-modal') as HTMLElement;
  private storyList = document.getElementById('story-list') as HTMLElement;
  private settingsModal = document.getElementById('settings-modal') as HTMLElement;
  private pauseModal = document.getElementById('pause-modal') as HTMLElement;
  private resultModal = document.getElementById('result-modal') as HTMLElement;

  private elPauseCombo = document.getElementById('pause-stat-combo') as HTMLElement;
  private elPauseWarmth = document.getElementById('pause-stat-warmth') as HTMLElement;
  private elPauseBottles = document.getElementById('pause-stat-bottles') as HTMLElement;

  private elResTrack = document.getElementById('result-track-name') as HTMLElement;
  private elResRank = document.getElementById('result-rank') as HTMLElement;
  private elResBenches = document.getElementById('res-benches') as HTMLElement;
  private elResOrders = document.getElementById('res-orders') as HTMLElement;
  private elResMaxCombo = document.getElementById('res-max-combo') as HTMLElement;
  private elResMelted = document.getElementById('res-melted') as HTMLElement;
  private elResWarmth = document.getElementById('res-warmth') as HTMLElement;
  private elResBottles = document.getElementById('res-bottles') as HTMLElement;

  private optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
  private optBgmVal = document.getElementById('opt-bgm-val') as HTMLElement;
  private optSe = document.getElementById('opt-se') as HTMLInputElement;
  private optSeVal = document.getElementById('opt-se-val') as HTMLElement;
  private optOffset = document.getElementById('opt-offset') as HTMLInputElement;
  private optOffsetVal = document.getElementById('opt-offset-val') as HTMLElement;

  private seenStoryCount = 0;

  constructor(gsm: NukumoriStateManager, handlers: NukumoriUIHandlers) {
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

  private toggleCraftDrawer(): void {
    const opening = this.craftDrawer.classList.contains('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.craftDrawer.classList.toggle('hidden', !opening);
    if (opening) this.renderCraftList();
    this.notifyOverlayState();
  }

  private bindEvents(): void {
    this.btnStart.addEventListener('click', () => this.handlers.onStart());
    this.btnDeliverCans.addEventListener('click', () => this.handlers.onClickDeliverCans());
    this.btnFever.addEventListener('click', () => this.handlers.onClickFever());

    this.btnWave.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClickSteamWave();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.track as NukumoriTrackId;
        if (tid) this.handlers.onSelectTrack(tid);
      });
    });

    this.btnCraft.addEventListener('click', () => this.toggleCraftDrawer());
    document.getElementById('btn-room-rank')?.addEventListener('click', () => this.toggleCraftDrawer());
    this.btnRoomQuick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCraftDrawer();
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
    document.getElementById('btn-pause-craft')?.addEventListener('click', () => {
      this.renderCraftList();
      this.craftDrawer.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      this.syncSettingsControls();
      this.settingsModal.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-return-lobby')?.addEventListener('click', () => this.handlers.onReturnToLobby());

    document.getElementById('btn-retry')?.addEventListener('click', () => this.handlers.onRetry());
    this.btnResultCraft.addEventListener('click', () => {
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
      if (window.confirm('ヌクモリの温度番小屋の進行データを初期化しますか？')) {
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

  public setModelReady(ready: boolean, message?: string): void {
    this.loadingStatus.textContent =
      message || (ready ? '自販機裏の小屋の準備が整いました' : '3Dモデルと楽曲を準備しています…');
    this.loadingStatus.classList.toggle('ready', ready);
  }

  public enterGame(): void {
    this.titleScreen.classList.add('hidden');
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
  }

  public updateHUD(currentTrack: NukumoriTrackId): void {
    const st = this.gsm.state;
    this.elRoomRank.textContent = `Lv.${this.gsm.getRoomRank()}`;
    this.elWarmth.textContent = st.warmth.toLocaleString('ja-JP');
    this.elBottles.textContent = st.bottles.toLocaleString('ja-JP');

    const cap = this.gsm.getCanRackCapacity();
    const fill = Math.min(cap, st.canRackFill);
    const pct = Math.round((fill / cap) * 100);
    this.elRackFill.style.height = `${pct}%`;
    this.elRackPct.textContent = `${pct}%`;
    this.elRackCount.textContent = `${fill} / ${cap}`;

    const canDeliver = fill >= cap;
    this.btnDeliverCans.disabled = !canDeliver;
    this.btnDeliverCans.classList.toggle('ready', canDeliver);
    this.btnDeliverCans.textContent = canDeliver
      ? '🥫 あったか〜い差し入れ！（押す / E）'
      : `ほかほか缶を温め中 (${fill}/${cap})`;

    this.elNowPlaying.textContent = `♪ ${NUKUMORI_TRACKS[currentTrack].title}`;
    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as NukumoriTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === currentTrack);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? NUKUMORI_TRACKS[tid].title
        : `裸電球と看板 Lv.${NUKUMORI_TRACKS[tid].unlockLampLevel} で解放`;
    });

    const upgradeCount = this.gsm.getAffordableUpgradeCount();
    const hasUpgrade = upgradeCount > 0;
    const badgeLabel = upgradeCount > 1 ? `UP ×${upgradeCount}` : 'UP!';

    this.craftBadge.textContent = badgeLabel;
    this.craftBadge.classList.toggle('hidden', !hasUpgrade);
    this.btnCraft.classList.toggle('has-upgrade', hasUpgrade);

    this.roomQuickBadge.textContent = upgradeCount > 1 ? `強化 ×${upgradeCount}` : '強化OK';
    this.roomQuickBadge.classList.toggle('hidden', !hasUpgrade);
    this.btnRoomQuick.classList.toggle('has-upgrade', hasUpgrade);

    this.resultCraftBadge.textContent = badgeLabel;
    this.resultCraftBadge.classList.toggle('hidden', !hasUpgrade);
    this.btnResultCraft.classList.toggle('has-upgrade', hasUpgrade);

    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.seenStoryCount);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateOrder(order: WarmthOrderDef, filled: boolean[]): void {
    this.elOrderName.textContent = order.name;
    this.elOrderCard.classList.toggle('almost', filled.filter(Boolean).length === order.items.length - 1);
    this.elOrderSlots.innerHTML = order.items
      .map((id, idx) => {
        const def = WARMTH_ITEM_MAP[id];
        const done = filled[idx];
        return `<span class="order-slot ${done ? 'done' : ''}" style="--slot-col:${def.cssColor}" title="${def.name}">
          <span class="slot-icon">${def.icon}</span>
          <span class="slot-label">${def.shortName}</span>
        </span>`;
      })
      .join('');
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

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '🧣'.repeat(Math.min(5, shields)) : '―';
  }

  public updateFever(active: boolean, pct: number, remainingSec: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.elFeverFill.style.width = `${clamped}%`;
    this.elFeverBanner.classList.toggle('hidden', !active);
    if (active) {
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `♨️ POKAPOKA NIGHT (${remainingSec.toFixed(1)}s)`;
    } else if (clamped >= 100) {
      this.btnFever.disabled = false;
      this.btnFever.classList.add('ready');
      this.btnFever.textContent = '✨ ぽかぽかの夜を発動！（押す / F）';
    } else {
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `ぽかぽかゲージ ${Math.floor(clamped)}%`;
    }
  }

  public updateWaveCooldown(readyPct: number, ready: boolean): void {
    this.elWaveCdFill.style.width = `${Math.round(Math.max(0, Math.min(1, readyPct)) * 100)}%`;
    this.btnWave.classList.toggle('ready', ready);
  }

  public updateBeatDots(beatIndex: number): void {
    const b = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === b);
    });
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    this.elProgressFill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
    const sec = Math.max(0, Math.ceil(remainingSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.elTimeLeft.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  public showPauseModal(show: boolean, combo = 0): void {
    this.pauseModal.classList.toggle('hidden', !show);
    if (show) {
      this.elPauseCombo.textContent = String(combo);
      this.elPauseWarmth.textContent = this.gsm.state.warmth.toLocaleString('ja-JP');
      this.elPauseBottles.textContent = this.gsm.state.bottles.toLocaleString('ja-JP');
    }
  }

  public showResultModal(show: boolean, trackTitle = '', stats?: NukumoriRunStats): void {
    this.resultModal.classList.toggle('hidden', !show);
    if (!show || !stats) return;

    this.elResTrack.textContent = `♪ ${trackTitle}`;
    this.elResBenches.textContent = String(stats.benchesWarmed);
    this.elResOrders.textContent = String(stats.ordersCompleted);
    this.elResMaxCombo.textContent = String(stats.maxCombo);
    this.elResMelted.textContent = String(stats.frostsMelted);
    this.elResWarmth.textContent = `+${stats.warmthEarned.toLocaleString('ja-JP')}`;
    this.elResBottles.textContent = `+${stats.bottlesEarned.toLocaleString('ja-JP')}`;

    const scoreMetric = stats.benchesWarmed * 4 + stats.ordersCompleted * 6 + stats.itemsCollected;
    const rank = scoreMetric >= 42 ? 'S' : scoreMetric >= 28 ? 'A' : scoreMetric >= 15 ? 'B' : 'C';
    this.elResRank.textContent = rank;
    this.elResRank.className = `result-rank rank-${rank.toLowerCase()}`;
  }

  public spawnFloatingText(label: string, sx: number, sy: number, color: string, sub?: string): void {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.innerHTML = sub
      ? `<strong>${label}</strong><span class="ft-sub">${sub}</span>`
      : `<strong>${label}</strong>`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  private toastHideTimer: number | null = null;
  private toastRemoveTimer: number | null = null;

  public showToast(title: string, body: string, tone: 'gold' | 'blue' = 'gold'): void {
    if (this.toastHideTimer !== null) {
      window.clearTimeout(this.toastHideTimer);
      this.toastHideTimer = null;
    }
    if (this.toastRemoveTimer !== null) {
      window.clearTimeout(this.toastRemoveTimer);
      this.toastRemoveTimer = null;
    }

    // Keep only the single latest notification in the top-right corner so playfield stays unobstructed
    this.toastContainer.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
    this.toastContainer.appendChild(toast);

    this.toastHideTimer = window.setTimeout(() => {
      toast.classList.add('out');
      this.toastHideTimer = null;
    }, 2200);
    this.toastRemoveTimer = window.setTimeout(() => {
      toast.remove();
      this.toastRemoveTimer = null;
    }, 2550);
  }

  private renderCraftList(): void {
    const st = this.gsm.state;
    this.craftList.innerHTML = NUKUMORI_UPGRADES.map((def) => {
      const lv = st.upgrades[def.id];
      const maxed = lv >= def.maxLevel;
      const cost = getNukumoriUpgradeCost(def, lv);
      const canBuy = this.gsm.canAffordUpgrade(def.id);
      const costParts = [
        `<span class="${st.warmth >= cost.warmth ? 'ok' : 'ng'}">♨️ ${cost.warmth.toLocaleString('ja-JP')}</span>`,
      ];
      if (cost.bottles > 0) {
        costParts.push(
          `<span class="${st.bottles >= cost.bottles ? 'ok' : 'ng'}">🫧 ${cost.bottles}</span>`
        );
      }

      return `<div class="craft-item ${canBuy ? 'affordable' : ''} ${maxed ? 'maxed' : ''}">
        <div class="craft-item-head">
          <div>
            <h3>${def.name}</h3>
            <p class="craft-prop">${def.propName}</p>
          </div>
          <span class="craft-lv">Lv.${lv} / ${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <p class="craft-effect">${def.effectText(lv)}</p>
        <div class="craft-foot">
          <div class="craft-cost">${maxed ? '<span class="ok">MAX 強化済み</span>' : costParts.join('')}</div>
          <button class="btn-buy-upgrade" data-upgrade="${def.id}" type="button" ${!canBuy || maxed ? 'disabled' : ''}>
            ${maxed ? '完了' : '強化する'}
          </button>
        </div>
      </div>`;
    }).join('');

    this.craftList.querySelectorAll<HTMLButtonElement>('.btn-buy-upgrade').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.upgrade as NukumoriUpgradeId;
        if (id) this.handlers.onBuyUpgrade(id);
      });
    });
  }

  private renderStoryList(): void {
    const unlockedCount = this.gsm.getUnlockedStoriesCount();
    this.storyList.innerHTML = NUKUMORI_STORIES.map((ep, idx) => {
      const unlocked = idx < unlockedCount;
      if (!unlocked) {
        return `<article class="story-card locked">
          <div class="story-meta">第${ep.chapter}章 ・ 未解放</div>
          <h3>🔒 ${ep.title}</h3>
          <p class="story-cond">「白い息の小瓶棚」Lv.${ep.requiredJarsLevel} または ベンチ温め累計 ${ep.requiredBenchesWarmed}回 で解放</p>
        </article>`;
      }
      return `<article class="story-card">
        <div class="story-meta">第${ep.chapter}章 ・ ${ep.timeLabel}</div>
        <h3>${ep.title}</h3>
        <blockquote>${ep.quote}</blockquote>
        ${ep.body.map((p) => `<p>${p}</p>`).join('')}
        <div class="story-relic">🧣 記憶のしるし：${ep.relicBadge}</div>
      </article>`;
    }).join('');
  }
}
