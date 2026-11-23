import {
  getHoshihakobiUpgradeCost,
  HOSHIHAKOBI_STORIES,
  HOSHIHAKOBI_TRACKS,
  HOSHIHAKOBI_UPGRADES,
  WISH_STAR_TOKEN_MAP,
} from './config';
import { HoshihakobiStateManager } from './state';
import {
  ConstellationOrderDef,
  HoshihakobiRunStats,
  HoshihakobiTrackId,
  HoshihakobiUpgradeId,
} from './types';

export interface HoshihakobiUIHandlers {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: HoshihakobiTrackId) => void;
  onBuyUpgrade: (id: HoshihakobiUpgradeId) => void;
  onClickReleaseCrate: () => void;
  onClickFever: () => void;
  onClickStarShift: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class HoshihakobiUIController {
  private gsm: HoshihakobiStateManager;
  private handlers: HoshihakobiUIHandlers;

  private titleScreen = document.getElementById('title-screen') as HTMLElement;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status') as HTMLElement;
  private hud = document.getElementById('hud') as HTMLElement;
  private floatingLayer = document.getElementById('floating-layer') as HTMLElement;
  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  private elRoomRank = document.getElementById('hud-room-rank') as HTMLElement;
  private elStardust = document.getElementById('hud-stardust') as HTMLElement;
  private elMiracles = document.getElementById('hud-miracles') as HTMLElement;
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

  private elCrateFill = document.getElementById('crate-fill') as HTMLElement;
  private elCratePct = document.getElementById('crate-pct') as HTMLElement;
  private elCrateCount = document.getElementById('crate-count') as HTMLElement;
  private btnReleaseCrate = document.getElementById('btn-release-crate') as HTMLButtonElement;

  private btnStarShift = document.getElementById('ctrl-starshift') as HTMLButtonElement;
  private elShiftCdFill = document.getElementById('starshift-cd-fill') as HTMLElement;

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
  private elPauseStardust = document.getElementById('pause-stat-stardust') as HTMLElement;
  private elPauseMiracles = document.getElementById('pause-stat-miracles') as HTMLElement;

  private elResTrack = document.getElementById('result-track-name') as HTMLElement;
  private elResRank = document.getElementById('result-rank') as HTMLElement;
  private elResConstellations = document.getElementById('res-constellations') as HTMLElement;
  private elResShooting = document.getElementById('res-shooting') as HTMLElement;
  private elResOrders = document.getElementById('res-orders') as HTMLElement;
  private elResMaxCombo = document.getElementById('res-max-combo') as HTMLElement;
  private elResStardust = document.getElementById('res-stardust') as HTMLElement;
  private elResMiracles = document.getElementById('res-miracles') as HTMLElement;

  private optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
  private optBgmVal = document.getElementById('opt-bgm-val') as HTMLElement;
  private optSe = document.getElementById('opt-se') as HTMLInputElement;
  private optSeVal = document.getElementById('opt-se-val') as HTMLElement;
  private optOffset = document.getElementById('opt-offset') as HTMLInputElement;
  private optOffsetVal = document.getElementById('opt-offset-val') as HTMLElement;

  private seenStoryCount = 0;

  constructor(gsm: HoshihakobiStateManager, handlers: HoshihakobiUIHandlers) {
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
    this.btnReleaseCrate.addEventListener('click', () => this.handlers.onClickReleaseCrate());
    this.btnFever.addEventListener('click', () => this.handlers.onClickFever());

    this.btnStarShift.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClickStarShift();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.track as HoshihakobiTrackId;
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
      if (window.confirm('ホシハコビのセーブデータを初期化しますか？')) {
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

  public setModelReady(ready: boolean, customMessage?: string): void {
    this.btnStart.disabled = !ready;
    this.loadingStatus.textContent =
      customMessage ||
      (ready
        ? '準備完了 — ホシハコビと屋根裏の星の仕分け工房で願いを空へ届けよう'
        : '3Dモデルと楽曲を準備しています…');
    if (ready) this.loadingStatus.classList.add('ready');
  }

  public enterGame(): void {
    this.titleScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  public returnToLobby(): void {
    this.hud.classList.add('hidden');
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    this.resultModal.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
  }

  public showPauseModal(show: boolean, combo = 0): void {
    if (show) {
      this.elPauseCombo.textContent = String(combo);
      this.elPauseStardust.textContent = Math.floor(this.gsm.state.stardust).toLocaleString('ja-JP');
      this.elPauseMiracles.textContent = String(this.gsm.state.miracles);
    }
    this.pauseModal.classList.toggle('hidden', !show);
  }

  public showResultModal(show: boolean, trackTitle = '', stats?: HoshihakobiRunStats): void {
    if (show && stats) {
      this.elResTrack.textContent = `♪ ${trackTitle}`;
      this.elResConstellations.textContent = `${stats.constellationsLit}座`;
      this.elResShooting.textContent = `${stats.shootingStarsLaunched}個`;
      this.elResOrders.textContent = `${stats.ordersCompleted}件`;
      this.elResMaxCombo.textContent = String(stats.maxCombo);
      this.elResStardust.textContent = `+${stats.stardustEarned.toLocaleString('ja-JP')}`;
      this.elResMiracles.textContent = `+${stats.miraclesEarned}`;

      const rank =
        stats.score >= 2200
          ? 'S'
          : stats.score >= 1200
            ? 'A'
            : stats.score >= 600
              ? 'B'
              : 'C';
      this.elResRank.textContent = rank;
      this.elResRank.className = `result-rank rank-${rank.toLowerCase()}`;

      const upCount = this.gsm.getAffordableUpgradeCount();
      this.resultCraftBadge.classList.toggle('hidden', upCount === 0);
      this.resultCraftBadge.textContent = upCount > 0 ? `UP ${upCount}` : 'UP!';
    }
    this.resultModal.classList.toggle('hidden', !show);
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    this.elProgressFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%`;
    const secs = Math.max(0, Math.ceil(remainingSec));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    this.elTimeLeft.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  public updateBeatDots(beatIndex: number): void {
    const activeIdx = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === activeIdx);
    });
  }

  public updateCombo(combo: number, mult: number): void {
    if (combo >= 2) {
      this.elComboWrap.classList.remove('hidden');
      this.elComboCount.textContent = String(combo);
      this.elComboMult.textContent = `×${mult.toFixed(2)}`;
      this.elComboWrap.classList.remove('pop');
      void this.elComboWrap.offsetWidth;
      this.elComboWrap.classList.add('pop');
    } else {
      this.elComboWrap.classList.add('hidden');
    }
  }

  public updateOrder(order: ConstellationOrderDef, filled: boolean[]): void {
    this.elOrderName.textContent = order.name;
    this.elOrderSlots.innerHTML = '';
    order.items.forEach((id, idx) => {
      const def = WISH_STAR_TOKEN_MAP[id];
      const slot = document.createElement('span');
      slot.className = `order-slot${filled[idx] ? ' done' : ''}`;
      slot.style.setProperty('--slot-col', def.cssColor);
      slot.textContent = `${def.icon} ${def.shortName}`;
      this.elOrderSlots.appendChild(slot);
    });
    this.elOrderCard.classList.remove('flash');
    void this.elOrderCard.offsetWidth;
    this.elOrderCard.classList.add('flash');
  }

  public updateFever(active: boolean, pct: number, remainingSec: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.elFeverFill.style.width = `${clamped.toFixed(1)}%`;
    this.elFeverBanner.classList.toggle('hidden', !active);
    if (active) {
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.classList.add('active');
      this.btnFever.textContent = `🌠 MIRACLE ${remainingSec.toFixed(1)}s`;
    } else {
      this.btnFever.classList.remove('active');
      const ready = clamped >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready
        ? '✨ STARLIGHT MIRACLE 発動！ (F)'
        : `天の川の光 ${Math.floor(clamped)}%`;
    }
  }

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '⭐'.repeat(Math.min(5, shields)) : '―';
  }

  public updateShiftCooldown(pct: number, ready: boolean, shifting: boolean): void {
    this.elShiftCdFill.style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
    this.btnStarShift.classList.toggle('ready', ready);
    this.btnStarShift.classList.toggle('shifting', shifting);
    this.btnStarShift.disabled = !ready;
  }

  public updateHUD(trackId: HoshihakobiTrackId): void {
    const st = this.gsm.state;
    this.elRoomRank.textContent = `Lv.${this.gsm.getRoomRank()}`;
    this.elStardust.textContent = Math.floor(st.stardust).toLocaleString('ja-JP');
    this.elMiracles.textContent = String(st.miracles);

    const cap = this.gsm.getCrateCapacity();
    const fill = Math.min(cap, st.crateFill);
    const pct = Math.round((fill / cap) * 100);
    this.elCrateFill.style.height = `${pct}%`;
    this.elCratePct.textContent = `${pct}%`;
    this.elCrateCount.textContent = `${fill} / ${cap}`;

    const readyCrate = fill >= cap;
    this.btnReleaseCrate.disabled = !readyCrate;
    this.btnReleaseCrate.classList.toggle('ready', readyCrate);
    this.btnReleaseCrate.textContent = readyCrate
      ? '📦 星の箱を空へ放つ！ (E)'
      : `星の箱に収集中 (${fill}/${cap})`;

    this.elNowPlaying.textContent = `♪ ${HOSHIHAKOBI_TRACKS[trackId].title}`;

    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as HoshihakobiTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === trackId);
      btn.classList.toggle('locked', !unlocked);
    });

    const upCount = this.gsm.getAffordableUpgradeCount();
    const hasUp = upCount > 0;
    this.craftBadge.classList.toggle('hidden', !hasUp);
    this.craftBadge.textContent = hasUp ? `UP ${upCount}` : 'UP!';
    this.btnCraft.classList.toggle('has-upgrade', hasUp);
    this.roomQuickBadge.classList.toggle('hidden', !hasUp);
    this.roomQuickBadge.textContent = hasUp ? `${upCount}件OK` : '強化OK';
    this.btnRoomQuick.classList.toggle('has-upgrade', hasUp);

    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.seenStoryCount);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public renderCraftList(): void {
    this.craftList.innerHTML = '';
    for (const def of HOSHIHAKOBI_UPGRADES) {
      const lv = this.gsm.state.upgrades[def.id];
      const maxed = lv >= def.maxLevel;
      const cost = getHoshihakobiUpgradeCost(def, lv);
      const canBuy = !maxed && this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-item${canBuy ? ' affordable' : ''}${maxed ? ' maxed' : ''}`;
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
          <span class="craft-cost">
            ${
              maxed
                ? '✨ 最大レベル到達'
                : `星くず ${cost.stardust.toLocaleString('ja-JP')}${
                    cost.miracles > 0 ? ` ＋ 奇跡の流星 ${cost.miracles}` : ''
                  }`
            }
          </span>
          <button class="btn-buy-upgrade" type="button" ${canBuy ? '' : 'disabled'}>
            ${maxed ? '完了' : canBuy ? '強化する' : '不足'}
          </button>
        </div>
      `;
      const btn = card.querySelector('.btn-buy-upgrade') as HTMLButtonElement;
      btn.addEventListener('click', () => this.handlers.onBuyUpgrade(def.id));
      this.craftList.appendChild(card);
    }
  }

  public renderStoryList(): void {
    this.storyList.innerHTML = '';
    const deskLv = this.gsm.state.upgrades.starLogDesk;
    const totalMiracles = this.gsm.state.totalMiraclesSent;

    for (const ep of HOSHIHAKOBI_STORIES) {
      const unlocked = deskLv >= ep.requiredDeskLevel || totalMiracles >= ep.requiredMiraclesSent;
      const card = document.createElement('article');
      card.className = `story-card${unlocked ? ' unlocked' : ' locked'}`;
      if (unlocked) {
        card.innerHTML = `
          <div class="story-card-head">
            <span class="story-ch">第${ep.chapter}章</span>
            <h3>${ep.title}</h3>
          </div>
          <p class="story-sub">${ep.subtitle}</p>
          <div class="story-paragraphs">
            ${ep.body.map((p) => `<p>${p}</p>`).join('')}
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="story-card-head">
            <span class="story-ch">第${ep.chapter}章</span>
            <h3>？？？</h3>
          </div>
          <p class="story-lock-hint">
            解放条件：「星の記録帳の机と羽ペン」Lv.${ep.requiredDeskLevel} または 星座達成累計 ${ep.requiredMiraclesSent}座（現在 ${totalMiracles}座）
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
    el.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 980);
  }

  public showToast(title: string, body: string, tone: 'starlight' | 'gold' = 'starlight'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.classList.add('fade-out'), 3100);
    setTimeout(() => el.remove(), 3600);
  }
}
