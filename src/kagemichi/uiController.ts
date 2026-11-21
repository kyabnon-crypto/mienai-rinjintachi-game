import {
  getKagemichiUpgradeCost,
  KAGEMICHI_STORIES,
  KAGEMICHI_TRACKS,
  KAGEMICHI_UPGRADES,
} from './config';
import { KagemichiStateManager } from './state';
import { KagemichiRunStats, KagemichiTrackId, KagemichiUpgradeId } from './types';

export interface KagemichiUICallbacks {
  onStart: () => void;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onOverlayVisibilityChange: (open: boolean) => void;
  onSelectTrack: (trackId: KagemichiTrackId) => void;
  onBuyUpgrade: (id: KagemichiUpgradeId) => void;
  onClickSendDream: () => void;
  onClickExpress: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onJump: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class KagemichiUIController {
  private gsm: KagemichiStateManager;
  private cb: KagemichiUICallbacks;

  private titleScreen = document.getElementById('title-screen')!;
  private hud = document.getElementById('hud')!;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private loadingStatus = document.getElementById('loading-status')!;

  private elStationRank = document.getElementById('hud-station-rank')!;
  private elLights = document.getElementById('hud-lights')!;
  private elTickets = document.getElementById('hud-tickets')!;
  private elShields = document.getElementById('hud-shields')!;
  private elNowPlaying = document.getElementById('now-playing')!;
  private elTimeLeft = document.getElementById('hud-time-left')!;
  private elSongFill = document.getElementById('song-progress-fill')!;

  private elLanternFill = document.getElementById('lantern-fill')!;
  private elLanternPct = document.getElementById('lantern-pct')!;
  private elLanternCount = document.getElementById('lantern-count')!;
  private btnSendDream = document.getElementById('btn-send-dream') as HTMLButtonElement;

  private elExpressFill = document.getElementById('express-bar-fill')!;
  private btnExpress = document.getElementById('btn-express') as HTMLButtonElement;
  private elExpressBanner = document.getElementById('express-banner')!;
  private elExpressTimer = document.getElementById('express-timer')!;

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

  constructor(gsm: KagemichiStateManager, cb: KagemichiUICallbacks) {
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
        const id = btn.dataset.track as KagemichiTrackId;
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

    this.btnSendDream.addEventListener('click', () => this.cb.onClickSendDream());
    this.btnExpress.addEventListener('click', () => this.cb.onClickExpress());

    // Responsive touch / pointer control buttons
    const bindCtrl = (id: string, fn: () => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    bindCtrl('ctrl-left', () => this.cb.onMoveLeft());
    bindCtrl('ctrl-right', () => this.cb.onMoveRight());
    bindCtrl('ctrl-jump', () => this.cb.onJump());

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
      if (window.confirm('カゲミチのセーブデータを初期化して最初からやり直しますか？')) {
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
      label || (ready ? 'カゲミチとおわりの駅の準備が整いました' : '3Dモデルを読み込んでいます…');
    if (ready) {
      this.loadingStatus.classList.add('ready');
    }
  }

  public enterGame(): void {
    this.titleScreen.classList.add('fade-out');
    setTimeout(() => this.titleScreen.classList.add('hidden'), 420);
    this.hud.classList.remove('hidden');
  }

  public showPauseModal(show: boolean, currentCombo = 0): void {
    if (show) {
      this.craftDrawer.classList.add('hidden');
      this.storyModal.classList.add('hidden');
      this.settingsModal.classList.add('hidden');
      document.getElementById('pause-stat-combo')!.textContent = String(currentCombo);
      document.getElementById('pause-stat-lights')!.textContent = this.gsm.state.lights.toLocaleString('ja-JP');
      document.getElementById('pause-stat-tickets')!.textContent = String(this.gsm.state.tickets);
      this.pauseModal.classList.remove('hidden');
    } else {
      this.pauseModal.classList.add('hidden');
    }
  }

  public showResultModal(show: boolean, trackTitle = '', stats?: KagemichiRunStats): void {
    if (!show || !stats) {
      this.resultModal.classList.add('hidden');
      return;
    }
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');

    let rank = 'C';
    if (stats.collected >= 38 && stats.mistHits <= 1) rank = 'S';
    else if (stats.collected >= 26 && stats.mistHits <= 3) rank = 'A';
    else if (stats.collected >= 14) rank = 'B';

    document.getElementById('result-track-name')!.textContent = `♪ ${trackTitle}`;
    const rankEl = document.getElementById('result-rank')!;
    rankEl.textContent = rank;
    rankEl.className = `result-rank rank-${rank.toLowerCase()}`;

    document.getElementById('res-collected')!.textContent = String(stats.collected);
    document.getElementById('res-jumps')!.textContent = String(stats.jumpsCleared);
    document.getElementById('res-max-combo')!.textContent = String(stats.maxCombo);
    document.getElementById('res-mist')!.textContent = String(stats.mistHits);
    document.getElementById('res-lights')!.textContent = `+${stats.lightsEarned.toLocaleString('ja-JP')}`;
    document.getElementById('res-tickets')!.textContent = `+${stats.ticketsEarned}`;

    this.resultModal.classList.remove('hidden');
  }

  public returnToLobby(): void {
    this.pauseModal.classList.add('hidden');
    this.resultModal.classList.add('hidden');
    this.craftDrawer.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    requestAnimationFrame(() => this.titleScreen.classList.remove('fade-out'));
  }

  public updateSongProgress(progress: number, remainingSec: number): void {
    const pct = Math.min(100, Math.max(0, progress * 100));
    this.elSongFill.style.width = `${pct.toFixed(1)}%`;
    const sec = Math.ceil(Math.max(0, remainingSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.elTimeLeft.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  public updateShields(shields: number): void {
    this.elShields.textContent = shields > 0 ? '🛡'.repeat(Math.min(5, shields)) : '―';
  }

  public updateHUD(currentTrackId: KagemichiTrackId): void {
    const st = this.gsm.state;
    this.elStationRank.textContent = `Lv.${this.gsm.getStationRank()}`;
    this.elLights.textContent = st.lights.toLocaleString('ja-JP');
    this.elTickets.textContent = st.tickets.toLocaleString('ja-JP');

    const cap = this.gsm.getLanternCapacity();
    const pct = Math.min(100, Math.round((st.lanternFill / cap) * 100));
    this.elLanternFill.style.height = `${pct}%`;
    this.elLanternPct.textContent = `${pct}%`;
    this.elLanternCount.textContent = `${st.lanternFill} / ${cap}`;
    const ready = st.lanternFill >= cap;
    this.btnSendDream.disabled = !ready;
    this.btnSendDream.classList.toggle('ready', ready);
    this.btnSendDream.textContent = ready ? '✨ 夢へ送る！(E)' : `ランタン蓄積中 (${st.lanternFill}/${cap})`;

    this.elNowPlaying.textContent = `♪ ${KAGEMICHI_TRACKS[currentTrackId].title}`;

    this.trackBtns.forEach((btn) => {
      const tid = btn.dataset.track as KagemichiTrackId;
      const unlocked = this.gsm.isTrackUnlocked(tid);
      btn.classList.toggle('active', tid === currentTrackId);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? KAGEMICHI_TRACKS[tid].title
        : `「おわりの駅の時計」Lv.${KAGEMICHI_TRACKS[tid].unlockClockLevel} で解放`;
    });

    this.craftBadge.classList.toggle('hidden', !this.gsm.hasAnyAffordableUpgrade());
    const unlockedStories = this.gsm.getUnlockedStoriesCount();
    this.storyBadge.classList.toggle('hidden', unlockedStories <= this.lastSeenStories);

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateBeatDots(beatIndex: number): void {
    const idx = ((beatIndex % 4) + 4) % 4;
    this.beatDots.forEach((dot, i) => dot.classList.toggle('active', i === idx));
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

  public updateExpress(active: boolean, gaugePct: number, remainingSec: number): void {
    const pct = Math.min(100, Math.max(0, Math.round(gaugePct)));
    this.elExpressFill.style.width = `${pct}%`;

    if (active) {
      this.elExpressBanner.classList.remove('hidden');
      this.elExpressTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnExpress.disabled = true;
      this.btnExpress.classList.remove('ready');
      this.btnExpress.textContent = `🚆 夢行き並走中 ${remainingSec.toFixed(1)}s`;
    } else {
      this.elExpressBanner.classList.add('hidden');
      const ready = pct >= 100;
      this.btnExpress.disabled = !ready;
      this.btnExpress.classList.toggle('ready', ready);
      this.btnExpress.textContent = ready ? '🚆 DREAM EXPRESS 発車！(F)' : `DREAM EXPRESS ${pct}%`;
    }
  }

  public spawnFloatingText(label: string, sx: number, sy: number, color: string, sub?: string): void {
    const el = document.createElement('div');
    el.className = 'float-pop';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.color = color;
    el.innerHTML = `<span class="fp-main">${label}</span>${sub ? `<span class="fp-sub">${sub}</span>` : ''}`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 860);
  }

  public showToast(title: string, detail: string, accent: 'amber' | 'moon' = 'amber'): void {
    const el = document.createElement('div');
    el.className = `toast-item toast-${accent}`;
    el.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 350);
    }, 3400);
  }

  private renderCraftList(): void {
    this.craftList.innerHTML = '';
    KAGEMICHI_UPGRADES.forEach((def) => {
      const lv = this.gsm.state.upgrades[def.id];
      const isMax = lv >= def.maxLevel;
      const cost = getKagemichiUpgradeCost(def, lv);
      const canBuy = this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-card${isMax ? ' maxed' : ''}`;
      card.innerHTML = `
        <div class="craft-head">
          <div>
            <span class="craft-prop">${def.propName}</span>
            <h3>${def.name}</h3>
          </div>
          <span class="craft-lv">Lv.${lv}/${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <div class="craft-effect">${def.effectText(lv)}</div>
        <div class="craft-footer">
          <div class="craft-cost">
            ${
              isMax
                ? '<span class="cost-max">MAX 整備完了</span>'
                : `<span class="cost-light">🏮 ${cost.lights.toLocaleString('ja-JP')}</span>${
                    cost.tickets > 0 ? `<span class="cost-ticket">🎫 ${cost.tickets}</span>` : ''
                  }`
            }
          </div>
          <button class="btn-upgrade" type="button" ${!canBuy || isMax ? 'disabled' : ''}>
            ${isMax ? '完了' : '整える'}
          </button>
        </div>
      `;
      const btn = card.querySelector<HTMLButtonElement>('.btn-upgrade')!;
      btn.addEventListener('click', () => this.cb.onBuyUpgrade(def.id));
      this.craftList.appendChild(card);
    });
  }

  private renderStories(): void {
    this.storyList.innerHTML = '';
    KAGEMICHI_STORIES.forEach((ep) => {
      const unlocked =
        this.gsm.state.upgrades.memoryBox >= ep.requiredBoxLevel ||
        this.gsm.state.totalDreamsSent >= ep.requiredDreamsSent;
      const item = document.createElement('article');
      item.className = `story-card${unlocked ? '' : ' locked'}`;
      if (unlocked) {
        item.innerHTML = `
          <div class="story-meta">
            <span>第${ep.chapter}章 ・ ${ep.season}</span>
            <span class="story-ticket">🎫 ${ep.ticketName}</span>
          </div>
          <h3>${ep.title}</h3>
          <blockquote>${ep.quote}</blockquote>
          ${ep.body.map((p) => `<p>${p}</p>`).join('')}
        `;
      } else {
        item.innerHTML = `
          <div class="story-meta">
            <span>第${ep.chapter}章 ・ ${ep.season}</span>
            <span class="story-lock">🔒 未解放</span>
          </div>
          <h3>？？？</h3>
          <p class="story-unlock-hint">「想いの箱と駅員机」を Lv.${ep.requiredBoxLevel} にするか、夢送りを累計 ${ep.requiredDreamsSent} 回達成で解放</p>
        `;
      }
      this.storyList.appendChild(item);
    });
  }
}
