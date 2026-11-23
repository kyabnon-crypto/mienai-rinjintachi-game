import {
  getHenjiroUpgradeCost,
  HENJIRO_STORIES,
  HENJIRO_TRACKS,
  HENJIRO_UPGRADES,
  LETTER_WORD_MAP,
} from './config';
import { HenjiroStateManager } from './state';
import {
  HenjiroRunStats,
  HenjiroTrackId,
  HenjiroUpgradeId,
  ReplyOrderDef,
} from './types';

export interface HenjiroUIHandlers {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: HenjiroTrackId) => void;
  onBuyUpgrade: (id: HenjiroUpgradeId) => void;
  onClickDispatchTray: () => void;
  onClickFever: () => void;
  onClickQuillFlourish: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class HenjiroUIController {
  private gsm: HenjiroStateManager;
  private handlers: HenjiroUIHandlers;

  private titleScreen = document.getElementById('title-screen') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status') as HTMLElement;
  private hud = document.getElementById('hud') as HTMLElement;
  private floatingLayer = document.getElementById('floating-layer') as HTMLElement;
  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  private elRoomRank = document.getElementById('hud-room-rank') as HTMLElement;
  private elLight = document.getElementById('hud-light') as HTMLElement;
  private elSeals = document.getElementById('hud-seals') as HTMLElement;
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

  private elTrayFill = document.getElementById('tray-fill') as HTMLElement;
  private elTrayPct = document.getElementById('tray-pct') as HTMLElement;
  private elTrayCount = document.getElementById('tray-count') as HTMLElement;
  private btnDispatchTray = document.getElementById('btn-dispatch-tray') as HTMLButtonElement;

  private btnFlourish = document.getElementById('ctrl-flourish') as HTMLButtonElement;
  private elFlourishCdFill = document.getElementById('flourish-cd-fill') as HTMLElement;

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
  private elPauseLight = document.getElementById('pause-stat-light') as HTMLElement;
  private elPauseSeals = document.getElementById('pause-stat-seals') as HTMLElement;

  private elResTrack = document.getElementById('result-track-name') as HTMLElement;
  private elResRank = document.getElementById('result-rank') as HTMLElement;
  private elResReplies = document.getElementById('res-replies') as HTMLElement;
  private elResOrders = document.getElementById('res-orders') as HTMLElement;
  private elResMaxCombo = document.getElementById('res-max-combo') as HTMLElement;
  private elResCleared = document.getElementById('res-cleared') as HTMLElement;
  private elResLight = document.getElementById('res-light') as HTMLElement;
  private elResSeals = document.getElementById('res-seals') as HTMLElement;

  private optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
  private optBgmVal = document.getElementById('opt-bgm-val') as HTMLElement;
  private optSe = document.getElementById('opt-se') as HTMLInputElement;
  private optSeVal = document.getElementById('opt-se-val') as HTMLElement;
  private optOffset = document.getElementById('opt-offset') as HTMLInputElement;
  private optOffsetVal = document.getElementById('opt-offset-val') as HTMLElement;

  private seenStoryCount = 0;

  constructor(gsm: HenjiroStateManager, handlers: HenjiroUIHandlers) {
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
    this.btnDispatchTray.addEventListener('click', () => this.handlers.onClickDispatchTray());
    this.btnFever.addEventListener('click', () => this.handlers.onClickFever());

    this.btnFlourish.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClickQuillFlourish();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.track as HenjiroTrackId;
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
      this.optOffsetVal.textContent = `${ms}ms`;
      this.handlers.onChangeOffset(ms);
    });

    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      if (window.confirm('ヘンジロウのセーブデータを初期化しますか？')) {
        this.handlers.onResetSave();
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
    this.optOffsetVal.textContent = `${s.timingOffsetMs}ms`;
  }

  public setModelReady(ready: boolean, customMessage?: string): void {
    if (ready) {
      this.loadingStatus.textContent =
        customMessage || '3Dヘンジロウ＆赤いポストの書斎の準備が整いました';
      this.loadingStatus.classList.add('ready');
    }
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

  public showPauseModal(show: boolean, currentCombo = 0): void {
    if (show) {
      this.elPauseCombo.textContent = String(currentCombo);
      this.elPauseLight.textContent = this.gsm.state.light.toLocaleString('ja-JP');
      this.elPauseSeals.textContent = this.gsm.state.seals.toLocaleString('ja-JP');
      this.pauseModal.classList.remove('hidden');
    } else {
      this.pauseModal.classList.add('hidden');
    }
  }

  public showResultModal(show: boolean, trackTitle = '', stats?: HenjiroRunStats): void {
    if (!show || !stats) {
      this.resultModal.classList.add('hidden');
      return;
    }

    this.elResTrack.textContent = `♪ ${trackTitle}`;
    this.elResReplies.textContent = `${stats.repliesFinished}通`;
    this.elResOrders.textContent = `${stats.ordersCompleted}件`;
    this.elResMaxCombo.textContent = String(stats.maxCombo);
    this.elResCleared.textContent = `${stats.blotsCleared}個`;
    this.elResLight.textContent = `+${stats.lightEarned.toLocaleString('ja-JP')}`;
    this.elResSeals.textContent = `+${stats.sealsEarned.toLocaleString('ja-JP')}`;

    const perf =
      stats.repliesFinished * 20 +
      stats.ordersCompleted * 30 +
      stats.maxCombo * 2 +
      stats.lettersSmoothed * 3;
    let rank = 'B';
    let rankCls = 'rank-b';
    if (perf >= 260) {
      rank = 'S';
      rankCls = 'rank-s';
    } else if (perf >= 150) {
      rank = 'A';
      rankCls = 'rank-a';
    }
    this.elResRank.textContent = rank;
    this.elResRank.className = `result-rank ${rankCls}`;

    const upCount = this.gsm.getAffordableUpgradeCount();
    this.resultCraftBadge.classList.toggle('hidden', upCount === 0);
    this.resultCraftBadge.textContent = upCount > 0 ? `${upCount}件UP!` : 'UP!';
    this.btnResultCraft.classList.toggle('has-upgrades', upCount > 0);

    this.resultModal.classList.remove('hidden');
  }

  public updateHUD(currentTrackId: HenjiroTrackId): void {
    const st = this.gsm.state;
    this.elRoomRank.textContent = `Lv.${this.gsm.getRoomRank()}`;
    this.elLight.textContent = st.light.toLocaleString('ja-JP');
    this.elSeals.textContent = st.seals.toLocaleString('ja-JP');
    this.elNowPlaying.textContent = `♪ ${HENJIRO_TRACKS[currentTrackId].title}`;

    // Reply tray meter
    const cap = this.gsm.getTrayCapacity();
    const fill = Math.min(cap, st.trayFill);
    const pct = Math.round((fill / Math.max(1, cap)) * 100);
    this.elTrayFill.style.height = `${pct}%`;
    this.elTrayPct.textContent = `${pct}%`;
    this.elTrayCount.textContent = `${fill} / ${cap}`;
    const ready = fill >= cap;
    this.btnDispatchTray.disabled = !ready;
    this.btnDispatchTray.classList.toggle('ready', ready);
    this.btnDispatchTray.textContent = ready
      ? '📮 赤い封蝋で一斉発送！'
      : `返事トレイに綴り中 (${fill}/${cap})`;

    // Track buttons
    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as HenjiroTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === currentTrackId);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? HENJIRO_TRACKS[tid].title
        : `「天井ランプと電球ガーランド」Lv.${HENJIRO_TRACKS[tid].unlockLampLevel} で解放`;
    });

    // Upgrade badges
    const upCount = this.gsm.getAffordableUpgradeCount();
    const hasUp = upCount > 0;
    this.craftBadge.classList.toggle('hidden', !hasUp);
    this.craftBadge.textContent = hasUp ? `${upCount}件UP!` : 'UP!';
    this.btnCraft.classList.toggle('has-upgrades', hasUp);

    this.roomQuickBadge.classList.toggle('hidden', !hasUp);
    this.roomQuickBadge.textContent = hasUp ? `${upCount}件強化OK` : '強化OK';
    this.btnRoomQuick.classList.toggle('has-upgrades', hasUp);

    // Story badge
    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.seenStoryCount);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateOrder(order: ReplyOrderDef, filled: boolean[]): void {
    this.elOrderName.textContent = order.name;
    this.elOrderCard.classList.remove('order-pop');
    void this.elOrderCard.offsetWidth;
    this.elOrderCard.classList.add('order-pop');

    this.elOrderSlots.innerHTML = '';
    order.words.forEach((wid, idx) => {
      const def = LETTER_WORD_MAP[wid];
      const done = !!filled[idx];
      const chip = document.createElement('span');
      chip.className = `order-slot ${done ? 'done' : ''}`;
      chip.style.setProperty('--slot-col', def.cssColor);
      chip.innerHTML = `<span class="slot-ico">${def.icon}</span><span>${def.shortName}</span>`;
      this.elOrderSlots.appendChild(chip);
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
    this.elComboWrap.classList.remove('combo-bump');
    void this.elComboWrap.offsetWidth;
    this.elComboWrap.classList.add('combo-bump');
  }

  public updateFever(active: boolean, pct: number, remainingSec: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.elFeverFill.style.width = `${clamped}%`;
    this.elFeverBanner.classList.toggle('hidden', !active);
    if (active) {
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `🌙 MOONLIGHT REPLY ${remainingSec.toFixed(1)}s`;
    } else {
      const ready = clamped >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready
        ? '🌙 月あかりの返事時間 発動！ (F)'
        : `月あかりゲージ ${Math.floor(clamped)}%`;
    }
  }

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '👓'.repeat(Math.min(5, shields)) : '―';
  }

  public updateFlourishCooldown(pct: number, ready: boolean): void {
    const clamped = Math.max(0, Math.min(1, pct));
    this.elFlourishCdFill.style.width = `${Math.round(clamped * 100)}%`;
    this.btnFlourish.classList.toggle('ready', ready);
    this.btnFlourish.disabled = !ready;
  }

  public updateBeatDots(beatIndex: number): void {
    const activeIdx = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, i) => {
      dot.classList.toggle('on', i === activeIdx);
    });
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.elProgressFill.style.width = `${(clamped * 100).toFixed(2)}%`;
    const sec = Math.max(0, Math.ceil(remainingSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.elTimeLeft.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  private renderCraftList(): void {
    this.craftList.innerHTML = '';
    for (const def of HENJIRO_UPGRADES) {
      const lv = this.gsm.state.upgrades[def.id];
      const maxed = lv >= def.maxLevel;
      const cost = getHenjiroUpgradeCost(def, lv);
      const affordable = this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-item ${affordable ? 'affordable' : ''} ${maxed ? 'maxed' : ''}`;
      card.innerHTML = `
        <div class="craft-item-head">
          <div>
            <h3>${def.name}</h3>
            <p class="craft-prop">${def.propName}</p>
          </div>
          <span class="craft-lv">Lv.${lv} / ${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <p class="craft-effect">${def.effectText(lv)}</p>
        <div class="craft-footer">
          <div class="craft-cost">
            ${
              maxed
                ? '<span class="cost-max">最大レベル到達</span>'
                : `<span class="cost-pill ${this.gsm.state.light >= cost.light ? 'ok' : 'ng'}">🕯️ ${cost.light.toLocaleString('ja-JP')}</span>` +
                  (cost.seals > 0
                    ? `<span class="cost-pill ${this.gsm.state.seals >= cost.seals ? 'ok' : 'ng'}">💌 ${cost.seals}</span>`
                    : '')
            }
          </div>
          <button class="btn-buy" type="button" ${maxed || !affordable ? 'disabled' : ''}>
            ${maxed ? '完了' : 'しつらえる'}
          </button>
        </div>
      `;

      const buyBtn = card.querySelector('.btn-buy') as HTMLButtonElement;
      buyBtn.addEventListener('click', () => this.handlers.onBuyUpgrade(def.id));
      this.craftList.appendChild(card);
    }
  }

  private renderStoryList(): void {
    this.storyList.innerHTML = '';
    for (const ep of HENJIRO_STORIES) {
      const unlocked =
        this.gsm.state.upgrades.bookshelfWindow >= ep.requiredBookshelfLevel ||
        this.gsm.state.totalRepliesSent >= ep.requiredRepliesSent;
      const card = document.createElement('article');
      card.className = `story-card ${unlocked ? 'unlocked' : 'locked'}`;
      if (unlocked) {
        card.innerHTML = `
          <div class="story-card-head">
            <span class="story-ch">第${ep.chapter}章</span>
            <h3>${ep.title}</h3>
            <p class="story-sub">${ep.subtitle}</p>
          </div>
          <div class="story-body">
            ${ep.body.map((p) => `<p>${p}</p>`).join('')}
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="story-card-head">
            <span class="story-ch">第${ep.chapter}章 ・ 未解放</span>
            <h3>${ep.title}</h3>
          </div>
          <p class="story-lock-hint">
            解放条件：「本棚と額縁・丸い窓」Lv.${ep.requiredBookshelfLevel} または 返事を合計 ${ep.requiredRepliesSent}通 届ける（現在 ${this.gsm.state.totalRepliesSent}通）
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
    el.style.left = `${Math.round(sx)}px`;
    el.style.top = `${Math.round(sy)}px`;
    el.style.color = color;
    el.innerHTML = `<strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 980);
  }

  public showToast(title: string, body: string, tone: 'gold' | 'blue' = 'gold'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
    this.toastContainer.appendChild(el);
    while (this.toastContainer.children.length > 3) {
      this.toastContainer.firstElementChild?.remove();
    }
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 360);
    }, 3400);
  }
}
