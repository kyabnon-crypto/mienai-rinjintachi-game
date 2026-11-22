import {
  getWasuredamaUpgradeCost,
  LOST_ITEM_MAP,
  WASUREDAMA_STORIES,
  WASUREDAMA_TRACKS,
  WASUREDAMA_UPGRADES,
} from './config';
import { WasuredamaStateManager } from './state';
import {
  RecipientOrderDef,
  WasuredamaRunStats,
  WasuredamaTrackId,
  WasuredamaUpgradeId,
} from './types';

export interface WasuredamaUIHandlers {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: WasuredamaTrackId) => void;
  onBuyUpgrade: (id: WasuredamaUpgradeId) => void;
  onClickDeliverSack: () => void;
  onClickFever: () => void;
  onClickLampPulse: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class WasuredamaUIController {
  private gsm: WasuredamaStateManager;
  private handlers: WasuredamaUIHandlers;

  private titleScreen = document.getElementById('title-screen') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status') as HTMLElement;
  private hud = document.getElementById('hud') as HTMLElement;
  private floatingLayer = document.getElementById('floating-layer') as HTMLElement;
  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  private elCornerRank = document.getElementById('hud-corner-rank') as HTMLElement;
  private elLights = document.getElementById('hud-lights') as HTMLElement;
  private elSprouts = document.getElementById('hud-sprouts') as HTMLElement;
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

  private elSackFill = document.getElementById('sack-fill') as HTMLElement;
  private elSackPct = document.getElementById('sack-pct') as HTMLElement;
  private elSackCount = document.getElementById('sack-count') as HTMLElement;
  private btnDeliverSack = document.getElementById('btn-deliver-sack') as HTMLButtonElement;

  private btnPulse = document.getElementById('ctrl-pulse') as HTMLButtonElement;
  private elPulseCdFill = document.getElementById('pulse-cd-fill') as HTMLElement;

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
  private elPauseLights = document.getElementById('pause-stat-lights') as HTMLElement;
  private elPauseSprouts = document.getElementById('pause-stat-sprouts') as HTMLElement;

  private elResTrack = document.getElementById('result-track-name') as HTMLElement;
  private elResRank = document.getElementById('result-rank') as HTMLElement;
  private elResPicked = document.getElementById('res-picked') as HTMLElement;
  private elResOrders = document.getElementById('res-orders') as HTMLElement;
  private elResMaxCombo = document.getElementById('res-max-combo') as HTMLElement;
  private elResCleared = document.getElementById('res-cleared') as HTMLElement;
  private elResLights = document.getElementById('res-lights') as HTMLElement;
  private elResSprouts = document.getElementById('res-sprouts') as HTMLElement;

  private optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
  private optBgmVal = document.getElementById('opt-bgm-val') as HTMLElement;
  private optSe = document.getElementById('opt-se') as HTMLInputElement;
  private optSeVal = document.getElementById('opt-se-val') as HTMLElement;
  private optOffset = document.getElementById('opt-offset') as HTMLInputElement;
  private optOffsetVal = document.getElementById('opt-offset-val') as HTMLElement;

  private seenStoryCount = 0;

  constructor(gsm: WasuredamaStateManager, handlers: WasuredamaUIHandlers) {
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
    this.btnDeliverSack.addEventListener('click', () => this.handlers.onClickDeliverSack());
    this.btnFever.addEventListener('click', () => this.handlers.onClickFever());

    this.btnPulse.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClickLampPulse();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.track as WasuredamaTrackId;
        if (tid) this.handlers.onSelectTrack(tid);
      });
    });

    this.btnCraft.addEventListener('click', () => this.toggleCraftDrawer());
    document.getElementById('btn-corner-rank')?.addEventListener('click', () => this.toggleCraftDrawer());
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
      if (window.confirm('ワスレダマの街灯の広場の進行データを初期化しますか？')) {
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
      message || (ready ? '街灯の下の準備が整いました' : '3Dモデルと楽曲を準備しています…');
    this.loadingStatus.classList.toggle('ready', ready);
  }

  public enterGame(): void {
    this.titleScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  public returnToLobby(): void {
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    this.resultModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
  }

  public updateHUD(currentTrackId: WasuredamaTrackId): void {
    const st = this.gsm.state;
    this.elCornerRank.textContent = `Lv.${this.gsm.getCornerRank()}`;
    this.elLights.textContent = st.lights.toLocaleString('ja-JP');
    this.elSprouts.textContent = st.sprouts.toLocaleString('ja-JP');

    const cap = this.gsm.getSackCapacity();
    const fill = Math.min(cap, st.sackFill);
    const pct = Math.round((fill / cap) * 100);
    this.elSackFill.style.height = `${pct}%`;
    this.elSackPct.textContent = `${pct}%`;
    this.elSackCount.textContent = `${fill} / ${cap}`;

    const full = fill >= cap;
    this.btnDeliverSack.disabled = !full;
    this.btnDeliverSack.classList.toggle('ready', full);
    this.btnDeliverSack.textContent = full
      ? `✨ そっと届ける (+${this.gsm.getSproutsPerDelivery()} 思い出の芽)`
      : `忘れ物を集めています (${fill}/${cap})`;

    const track = WASUREDAMA_TRACKS[currentTrackId];
    this.elNowPlaying.textContent = `♪ ${track.title}`;

    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as WasuredamaTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === currentTrackId);
      btn.classList.toggle('locked', !unlocked);
      const label = WASUREDAMA_TRACKS[tid].shortLabel;
      btn.textContent = unlocked ? label : `🔒 ${label}`;
    });

    // Prominent room upgrade buttons with UP count badges
    const affordableCount = this.gsm.getAffordableUpgradeCount();
    const canUpgrade = affordableCount > 0;
    const badgeLabel = `強化OK (${affordableCount})`;

    this.btnCraft.classList.toggle('can-upgrade', canUpgrade);
    this.craftBadge.classList.toggle('hidden', !canUpgrade);
    this.craftBadge.textContent = canUpgrade ? `UP! ${affordableCount}` : '';

    this.btnRoomQuick.classList.toggle('can-upgrade', canUpgrade);
    this.roomQuickBadge.classList.toggle('hidden', !canUpgrade);
    this.roomQuickBadge.textContent = canUpgrade ? badgeLabel : '';

    this.btnResultCraft.classList.toggle('can-upgrade', canUpgrade);
    this.resultCraftBadge.classList.toggle('hidden', !canUpgrade);
    this.resultCraftBadge.textContent = canUpgrade ? badgeLabel : '';

    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.seenStoryCount);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateOrder(order: RecipientOrderDef, filled: boolean[], readyToDeliver: boolean): void {
    this.elOrderName.textContent = readyToDeliver
      ? `✨ ${order.recipientLabel}のそばへ届けよう！`
      : order.name;
    this.elOrderCard.classList.toggle('ready', readyToDeliver);
    this.elOrderSlots.innerHTML = '';
    order.items.forEach((kind, i) => {
      const def = LOST_ITEM_MAP[kind];
      const slot = document.createElement('div');
      slot.className = `order-slot${filled[i] ? ' filled' : ''}`;
      slot.style.setProperty('--slot-color', def.cssColor);
      slot.innerHTML = `<span class="slot-icon">${def.icon}</span><span class="slot-name">${def.shortName}</span>`;
      this.elOrderSlots.appendChild(slot);
    });
  }

  public updateCombo(combo: number, mult: number): void {
    if (combo < 2) {
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

  public updateFever(active: boolean, pct: number, remSec: number): void {
    this.elFeverBanner.classList.toggle('hidden', !active);
    if (active) {
      this.elFeverTimer.textContent = `${remSec.toFixed(1)}s`;
      this.elFeverFill.style.width = `${Math.min(100, pct)}%`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `STARLIT STREET ${remSec.toFixed(1)}s`;
    } else {
      const clamped = Math.min(100, Math.max(0, Math.round(pct)));
      this.elFeverFill.style.width = `${clamped}%`;
      const ready = clamped >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready ? '✨ 星明かりの夜道 発動！' : `星明かりゲージ ${clamped}%`;
    }
  }

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '🏮'.repeat(Math.min(5, shields)) : '―';
  }

  public updatePulseCooldown(pct: number, ready: boolean): void {
    this.elPulseCdFill.style.width = `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`;
    this.btnPulse.classList.toggle('ready', ready);
  }

  public updateBeatDots(beatIndex: number): void {
    const activeIdx = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === activeIdx);
    });
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    this.elProgressFill.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    const total = Math.max(0, Math.ceil(remainingSec));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    this.elTimeLeft.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  public showPauseModal(show: boolean, combo = 0): void {
    this.pauseModal.classList.toggle('hidden', !show);
    if (show) {
      this.elPauseCombo.textContent = String(combo);
      this.elPauseLights.textContent = this.gsm.state.lights.toLocaleString('ja-JP');
      this.elPauseSprouts.textContent = this.gsm.state.sprouts.toLocaleString('ja-JP');
    }
  }

  public showResultModal(show: boolean, trackTitle = '', stats?: WasuredamaRunStats): void {
    this.resultModal.classList.toggle('hidden', !show);
    if (!show || !stats) return;

    this.elResTrack.textContent = `♪ ${trackTitle}`;
    this.elResPicked.textContent = String(stats.pickedUp);
    this.elResOrders.textContent = String(stats.ordersCompleted);
    this.elResMaxCombo.textContent = String(stats.maxCombo);
    this.elResCleared.textContent = String(stats.hazesCleared);
    this.elResLights.textContent = `+${stats.lightsEarned.toLocaleString('ja-JP')}`;
    this.elResSprouts.textContent = `+${stats.sproutsEarned.toLocaleString('ja-JP')}`;

    let rank = 'B';
    if (stats.pickedUp >= 36 || stats.ordersCompleted >= 4 || stats.maxCombo >= 26) rank = 'S';
    else if (stats.pickedUp >= 22 || stats.ordersCompleted >= 2 || stats.maxCombo >= 14) rank = 'A';

    this.elResRank.textContent = rank;
    this.elResRank.className = `result-rank rank-${rank.toLowerCase()}`;
  }

  public renderCraftList(): void {
    this.craftList.innerHTML = '';
    for (const def of WASUREDAMA_UPGRADES) {
      const lv = this.gsm.state.upgrades[def.id];
      const isMax = lv >= def.maxLevel;
      const cost = getWasuredamaUpgradeCost(def, lv);
      const affordable = this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-card${affordable ? ' affordable' : ''}${isMax ? ' maxed' : ''}`;
      card.innerHTML = `
        <div class="craft-head">
          <div>
            <strong class="craft-name">${def.name}</strong>
            <span class="craft-prop">${def.propName}</span>
          </div>
          <span class="craft-lv">Lv.${lv} / ${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <p class="craft-effect">${def.effectText(lv)}</p>
        <div class="craft-foot">
          <div class="craft-costs">
            ${
              isMax
                ? '<span class="cost-max">MAX 整備完了</span>'
                : `<span class="cost-item">💡 ${cost.lights.toLocaleString('ja-JP')} 灯り</span>${
                    cost.sprouts > 0 ? `<span class="cost-item cost-sprout">🌱 ${cost.sprouts} 芽</span>` : ''
                  }`
            }
          </div>
          <button class="craft-buy-btn" type="button" ${!affordable || isMax ? 'disabled' : ''}>
            ${isMax ? '完了' : '整える'}
          </button>
        </div>
      `;

      const buyBtn = card.querySelector('.craft-buy-btn') as HTMLButtonElement;
      buyBtn.addEventListener('click', () => this.handlers.onBuyUpgrade(def.id));
      this.craftList.appendChild(card);
    }
  }

  public renderStoryList(): void {
    this.storyList.innerHTML = '';
    const st = this.gsm.state;

    for (const ep of WASUREDAMA_STORIES) {
      const unlocked =
        st.upgrades.oldNotebook >= ep.requiredNotebookLevel ||
        st.totalDeliveries >= ep.requiredDeliveries;

      const card = document.createElement('article');
      card.className = `story-card${unlocked ? ' unlocked' : ' locked'}`;
      if (unlocked) {
        card.innerHTML = `
          <div class="story-meta">
            <span class="story-chapter">第${ep.chapter}章</span>
            <span class="story-time">${ep.timeLabel}</span>
          </div>
          <h3 class="story-title">${ep.title}</h3>
          <blockquote class="story-quote">${ep.quote}</blockquote>
          <div class="story-body">${ep.body.map((p) => `<p>${p}</p>`).join('')}</div>
          <div class="story-relic">🌱 思い出の証：${ep.relicBadge}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="story-meta">
            <span class="story-chapter">第${ep.chapter}章</span>
            <span class="story-time">未解放</span>
          </div>
          <h3 class="story-title">🔒 ？？？</h3>
          <p class="story-lock-hint">
            「引き出しの古いノート」Lv.${ep.requiredNotebookLevel} または お届け合計 ${ep.requiredDeliveries}回 で解放
          </p>
        `;
      }
      this.storyList.appendChild(card);
    }
  }

  public spawnFloatingText(
    label: string,
    sx: number,
    sy: number,
    color: string,
    sub?: string
  ): void {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.innerHTML = sub
      ? `<span class="ft-main">${label}</span><span class="ft-sub">${sub}</span>`
      : `<span class="ft-main">${label}</span>`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  public showToast(title: string, body: string, tone: 'gold' | 'blue' = 'gold'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.innerHTML = `<strong class="toast-title">${title}</strong><span class="toast-body">${body}</span>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    }, 3400);
  }
}
