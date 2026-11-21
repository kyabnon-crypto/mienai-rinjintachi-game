import {
  AROMA_MAP,
  getSusunomiUpgradeCost,
  SUSUNOMI_STORIES,
  SUSUNOMI_TRACKS,
  SUSUNOMI_UPGRADES,
} from './config';
import { SusunomiStateManager } from './state';
import {
  MemoryRecipeDef,
  SusunomiRunStats,
  SusunomiTrackId,
  SusunomiUpgradeId,
} from './types';

export interface SusunomiUICallbacks {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: SusunomiTrackId) => void;
  onBuyUpgrade: (id: SusunomiUpgradeId) => void;
  onClickServePot: () => void;
  onClickFever: () => void;
  onClickStir: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class SusunomiUIController {
  private gsm: SusunomiStateManager;
  private cb: SusunomiUICallbacks;

  private titleScreen = document.getElementById('title-screen')!;
  private hud = document.getElementById('hud')!;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status')!;

  private elKitchenRank = document.getElementById('hud-kitchen-rank')!;
  private elDrops = document.getElementById('hud-drops')!;
  private elStars = document.getElementById('hud-stars')!;
  private elShields = document.getElementById('hud-shields')!;
  private elNowPlaying = document.getElementById('now-playing')!;
  private elTimeLeft = document.getElementById('hud-time-left')!;
  private elSongFill = document.getElementById('song-progress-fill')!;

  private elRecipeName = document.getElementById('recipe-name')!;
  private elRecipeSlots = document.getElementById('recipe-slots')!;

  private elPotFill = document.getElementById('pot-fill')!;
  private elPotPct = document.getElementById('pot-pct')!;
  private elPotCount = document.getElementById('pot-count')!;
  private btnServePot = document.getElementById('btn-serve-pot') as HTMLButtonElement;

  private elFeverFill = document.getElementById('fever-bar-fill')!;
  private btnFever = document.getElementById('btn-fever') as HTMLButtonElement;
  private elFeverBanner = document.getElementById('fever-banner')!;
  private elFeverTimer = document.getElementById('fever-timer')!;

  private btnStir = document.getElementById('ctrl-stir') as HTMLButtonElement;
  private elStirFill = document.getElementById('stir-cd-fill')!;

  private elComboWrap = document.getElementById('combo-display')!;
  private elComboCount = document.getElementById('combo-count')!;
  private elComboMult = document.getElementById('combo-mult')!;

  private craftDrawer = document.getElementById('craft-drawer')!;
  private craftList = document.getElementById('craft-list')!;
  private craftBadge = document.getElementById('craft-badge')!;

  private storyModal = document.getElementById('story-modal')!;
  private storyList = document.getElementById('story-list')!;
  private storyBadge = document.getElementById('story-badge')!;

  private settingsModal = document.getElementById('settings-modal')!;
  private pauseModal = document.getElementById('pause-modal')!;
  private resultModal = document.getElementById('result-modal')!;
  private floatingLayer = document.getElementById('floating-layer')!;
  private toastContainer = document.getElementById('toast-container')!;

  private beatDots = Array.from(document.querySelectorAll<HTMLElement>('.beat-dot'));
  private trackBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.track-btn'));

  private lastSeenStories = 0;

  constructor(gsm: SusunomiStateManager, cb: SusunomiUICallbacks) {
    this.gsm = gsm;
    this.cb = cb;
    this.lastSeenStories = gsm.getUnlockedStoriesCount();
    this.bindEvents();
    this.syncSettingsInputs();
    this.updateHUD(gsm.state.selectedTrack);
  }

  private bindEvents(): void {
    this.btnStart.addEventListener('click', () => this.cb.onStart());

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.track as SusunomiTrackId;
        this.cb.onSelectTrack(id);
      });
    });

    document.getElementById('btn-craft')!.addEventListener('click', () => {
      const willOpen = this.craftDrawer.classList.contains('hidden');
      this.craftDrawer.classList.toggle('hidden');
      if (willOpen) {
        this.storyModal.classList.add('hidden');
        this.settingsModal.classList.add('hidden');
        this.renderCraftList();
      }
      this.notifyOverlayState();
    });
    document.getElementById('btn-close-craft')!.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.notifyOverlayState();
    });

    document.getElementById('btn-story')!.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.settingsModal.classList.add('hidden');
      this.renderStories();
      this.storyModal.classList.remove('hidden');
      this.lastSeenStories = this.gsm.getUnlockedStoriesCount();
      this.storyBadge.classList.add('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-close-story')!.addEventListener('click', () => {
      this.storyModal.classList.add('hidden');
      this.notifyOverlayState();
    });
    this.storyModal.addEventListener('click', (e) => {
      if (e.target === this.storyModal) {
        this.storyModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });

    document.getElementById('btn-settings')!.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
      this.storyModal.classList.add('hidden');
      this.settingsModal.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
      this.notifyOverlayState();
    });
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.settingsModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });

    document.getElementById('btn-pause')!.addEventListener('click', () => this.cb.onPause());
    document.getElementById('btn-resume')!.addEventListener('click', () => this.cb.onResume());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
      this.notifyOverlayState();
    });
    document.getElementById('btn-return-lobby')!.addEventListener('click', () => {
      this.cb.onReturnToLobby();
    });
    this.pauseModal.addEventListener('click', (e) => {
      if (e.target === this.pauseModal) this.cb.onResume();
    });

    document.getElementById('btn-retry')!.addEventListener('click', () => this.cb.onRetry());
    document.getElementById('btn-result-craft')!.addEventListener('click', () => {
      this.resultModal.classList.add('hidden');
      this.craftDrawer.classList.remove('hidden');
      this.renderCraftList();
      this.notifyOverlayState();
    });
    document.getElementById('btn-result-lobby')!.addEventListener('click', () => {
      this.cb.onReturnToLobby();
    });

    this.btnServePot.addEventListener('click', () => this.cb.onClickServePot());
    this.btnFever.addEventListener('click', () => this.cb.onClickFever());
    this.btnStir.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onClickStir();
    });

    const optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
    const optSe = document.getElementById('opt-se') as HTMLInputElement;
    const optOff = document.getElementById('opt-offset') as HTMLInputElement;

    optBgm.addEventListener('input', () => {
      const v = Number(optBgm.value) / 100;
      document.getElementById('opt-bgm-val')!.textContent = `${optBgm.value}%`;
      this.cb.onChangeBgmVol(v);
    });
    optSe.addEventListener('input', () => {
      const v = Number(optSe.value) / 100;
      document.getElementById('opt-se-val')!.textContent = `${optSe.value}%`;
      this.cb.onChangeSeVol(v);
    });
    optOff.addEventListener('input', () => {
      const ms = Number(optOff.value);
      document.getElementById('opt-offset-val')!.textContent = `${ms > 0 ? '+' : ''}${ms}ms`;
      this.cb.onChangeOffset(ms);
    });

    document.getElementById('btn-reset-save')!.addEventListener('click', () => {
      if (window.confirm('ススノミのセーブデータを初期化して最初からやり直しますか？')) {
        this.cb.onResetSave();
        this.settingsModal.classList.add('hidden');
        this.notifyOverlayState();
      }
    });
  }

  private hasOpenOverlay(): boolean {
    return (
      !this.craftDrawer.classList.contains('hidden') ||
      !this.storyModal.classList.contains('hidden') ||
      !this.settingsModal.classList.contains('hidden')
    );
  }

  private notifyOverlayState(): void {
    this.cb.onOverlayVisibilityChange(this.hasOpenOverlay());
  }

  private syncSettingsInputs(): void {
    const s = this.gsm.state.settings;
    (document.getElementById('opt-bgm') as HTMLInputElement).value = String(Math.round(s.bgmVolume * 100));
    document.getElementById('opt-bgm-val')!.textContent = `${Math.round(s.bgmVolume * 100)}%`;
    (document.getElementById('opt-se') as HTMLInputElement).value = String(Math.round(s.seVolume * 100));
    document.getElementById('opt-se-val')!.textContent = `${Math.round(s.seVolume * 100)}%`;
    (document.getElementById('opt-offset') as HTMLInputElement).value = String(s.timingOffsetMs);
    document.getElementById('opt-offset-val')!.textContent = `${s.timingOffsetMs > 0 ? '+' : ''}${s.timingOffsetMs}ms`;
  }

  public setModelReady(ready: boolean, label?: string): void {
    this.loadingStatus.textContent =
      label || (ready ? 'ススノミと換気口の台所の準備が整いました' : '3Dモデルを読み込んでいます…');
    if (ready) {
      this.loadingStatus.classList.add('ready');
    }
  }

  public enterGame(): void {
    this.titleScreen.classList.add('fade-out');
    setTimeout(() => this.titleScreen.classList.add('hidden'), 420);
    this.hud.classList.remove('hidden');
  }

  public returnToLobby(): void {
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    this.resultModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.titleScreen.classList.remove('hidden', 'fade-out');
    this.updateHUD(this.gsm.state.selectedTrack);
  }

  public showPauseModal(show: boolean, combo = 0): void {
    if (show) {
      document.getElementById('pause-stat-combo')!.textContent = String(combo);
      document.getElementById('pause-stat-drops')!.textContent =
        this.gsm.state.drops.toLocaleString('ja-JP');
      document.getElementById('pause-stat-stars')!.textContent =
        this.gsm.state.stars.toLocaleString('ja-JP');
      this.pauseModal.classList.remove('hidden');
    } else {
      this.pauseModal.classList.add('hidden');
    }
  }

  public showResultModal(show: boolean, trackTitle?: string, stats?: SusunomiRunStats): void {
    if (!show) {
      this.resultModal.classList.add('hidden');
      return;
    }
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');

    if (stats) {
      document.getElementById('result-track-name')!.textContent = `♪ ${trackTitle || ''}`;
      document.getElementById('res-caught')!.textContent = String(stats.caught);
      document.getElementById('res-recipes')!.textContent = String(stats.recipesCompleted);
      document.getElementById('res-max-combo')!.textContent = String(stats.maxCombo);
      document.getElementById('res-purified')!.textContent = String(stats.sootPurified);
      document.getElementById('res-drops')!.textContent = `+${stats.dropsEarned.toLocaleString('ja-JP')}`;
      document.getElementById('res-stars')!.textContent = `+${stats.starsEarned}`;

      const score = stats.caught * 3 + stats.recipesCompleted * 32 + stats.maxCombo * 2 - stats.sootHits * 10;
      let rank = 'C';
      let rankClass = 'rank-c';
      if (score >= 220 && stats.sootHits <= 1) {
        rank = 'S';
        rankClass = 'rank-s';
      } else if (score >= 145) {
        rank = 'A';
        rankClass = 'rank-a';
      } else if (score >= 75) {
        rank = 'B';
        rankClass = 'rank-b';
      }
      const rankEl = document.getElementById('result-rank')!;
      rankEl.textContent = rank;
      rankEl.className = `result-rank ${rankClass}`;
    }
    this.resultModal.classList.remove('hidden');
  }

  public updateRecipe(recipe: MemoryRecipeDef, progress: number): void {
    this.elRecipeName.textContent = recipe.name;
    this.elRecipeSlots.innerHTML = '';
    recipe.ingredients.forEach((aromaId, idx) => {
      const def = AROMA_MAP[aromaId];
      const slot = document.createElement('div');
      const done = idx < progress;
      const isNext = idx === progress;
      slot.className = `recipe-slot ${done ? 'done' : isNext ? 'next' : ''}`;
      slot.innerHTML = `
        <span class="slot-icon">${def.icon}</span>
        <span class="slot-label">${done ? '済' : def.shortName}</span>
      `;
      this.elRecipeSlots.appendChild(slot);
    });
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    const pct = Math.max(0, Math.min(100, progress * 100));
    this.elSongFill.style.width = `${pct.toFixed(2)}%`;
    const totalSec = Math.ceil(Math.max(0, remainingSec));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.elTimeLeft.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  }

  public updateBeatDots(beatIndex: number): void {
    const active = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === active);
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

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '🌀'.repeat(Math.min(5, shields)) : '―';
  }

  public updateStirCooldown(readyPct: number, isReady: boolean): void {
    this.elStirFill.style.width = `${Math.round(readyPct * 100)}%`;
    this.btnStir.classList.toggle('ready', isReady);
    this.btnStir.disabled = !isReady;
  }

  public updateFever(active: boolean, pct: number, remainingSec: number): void {
    this.elFeverFill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
    if (active) {
      this.elFeverBanner.classList.remove('hidden');
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = '✨ 記憶の味フィーバー中！';
    } else {
      this.elFeverBanner.classList.add('hidden');
      const ready = pct >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready
        ? '✨ ことことフィーバー発動！'
        : `ことことゲージ ${Math.floor(pct)}%`;
    }
  }

  public updateHUD(currentTrack: SusunomiTrackId): void {
    const st = this.gsm.state;
    this.elKitchenRank.textContent = `Lv.${this.gsm.getKitchenRank()}`;
    this.elDrops.textContent = st.drops.toLocaleString('ja-JP');
    this.elStars.textContent = st.stars.toLocaleString('ja-JP');
    this.elNowPlaying.textContent = `♪ ${SUSUNOMI_TRACKS[currentTrack].title}`;

    const cap = this.gsm.getPotCapacity();
    const fill = Math.min(cap, st.potFill);
    const pct = Math.round((fill / cap) * 100);
    this.elPotFill.style.height = `${pct}%`;
    this.elPotPct.textContent = `${pct}%`;
    this.elPotCount.textContent = `${fill} / ${cap}`;

    const canServe = fill >= cap;
    this.btnServePot.disabled = !canServe;
    this.btnServePot.classList.toggle('ready', canServe);
    this.btnServePot.textContent = canServe
      ? `🍲 記憶の味を届ける (+${this.gsm.getStarsPerDish()}★)`
      : `ことこと煮込み中 (${fill}/${cap})`;

    this.trackBtns.forEach((btn) => {
      const id = btn.dataset.track as SusunomiTrackId;
      const unlocked = this.gsm.isTrackUnlocked(id);
      btn.classList.toggle('active', id === currentTrack);
      btn.classList.toggle('locked', !unlocked);
      const label = SUSUNOMI_TRACKS[id].shortLabel;
      btn.textContent = unlocked ? label : `🔒 ${label}`;
    });

    this.craftBadge.classList.toggle('hidden', !this.gsm.hasAnyAffordableUpgrade());
    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.lastSeenStories);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public renderCraftList(): void {
    this.craftList.innerHTML = '';
    for (const def of SUSUNOMI_UPGRADES) {
      const lv = this.gsm.state.upgrades[def.id];
      const isMax = lv >= def.maxLevel;
      const cost = getSusunomiUpgradeCost(def, lv);
      const affordable = this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-card ${isMax ? 'is-max' : ''}`;
      card.innerHTML = `
        <div class="craft-head">
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
              isMax
                ? '<span class="cost-max">最大レベル到達</span>'
                : `<span class="cost-item ${this.gsm.state.drops >= cost.drops ? 'ok' : 'ng'}">💧 ${cost.drops.toLocaleString('ja-JP')}</span>` +
                  (cost.stars > 0
                    ? `<span class="cost-item ${this.gsm.state.stars >= cost.stars ? 'ok' : 'ng'}">★ ${cost.stars}</span>`
                    : '')
            }
          </div>
          <button class="btn-buy" type="button" ${isMax || !affordable ? 'disabled' : ''}>
            ${isMax ? '完了' : '整える'}
          </button>
        </div>
      `;

      const buyBtn = card.querySelector<HTMLButtonElement>('.btn-buy')!;
      buyBtn.addEventListener('click', () => this.cb.onBuyUpgrade(def.id));
      this.craftList.appendChild(card);
    }
  }

  public renderStories(): void {
    this.storyList.innerHTML = '';
    const bookLv = this.gsm.state.upgrades.recipeBook;
    const totalDishes = this.gsm.state.totalDishesServed;

    for (const ep of SUSUNOMI_STORIES) {
      const unlocked = bookLv >= ep.requiredBookLevel || totalDishes >= ep.requiredDishesServed;
      const item = document.createElement('article');
      item.className = `story-card ${unlocked ? 'unlocked' : 'locked'}`;
      if (unlocked) {
        item.innerHTML = `
          <div class="story-meta">
            <span class="story-ch">第${ep.chapter}章</span>
            <span class="story-time">${ep.timeLabel}</span>
            <span class="story-dish">🍲 ${ep.dishBadge}</span>
          </div>
          <h3>${ep.title}</h3>
          <blockquote class="story-quote">${ep.quote}</blockquote>
          ${ep.body.map((p) => `<p>${p}</p>`).join('')}
        `;
      } else {
        item.innerHTML = `
          <div class="story-meta">
            <span class="story-ch">第${ep.chapter}章</span>
            <span class="story-time">未解放</span>
          </div>
          <h3>？？？</h3>
          <p class="story-lock-hint">解放条件：「記憶のレシピ帳」Lv.${ep.requiredBookLevel} または 記憶料理 ${ep.requiredDishesServed}皿（現在 ${totalDishes}皿）</p>
        `;
      }
      this.storyList.appendChild(item);
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
    el.className = 'floating-judge';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.innerHTML = `<span class="fj-main">${label}</span>${sub ? `<span class="fj-sub">${sub}</span>` : ''}`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 860);
  }

  public showToast(title: string, subtitle: string, tone: 'copper' | 'blue' = 'copper'): void {
    const el = document.createElement('div');
    el.className = `toast-item tone-${tone}`;
    el.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.classList.add('show'), 16);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
    }, 3400);
  }
}
