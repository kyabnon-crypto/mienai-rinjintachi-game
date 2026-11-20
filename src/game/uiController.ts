import { STORY_EPISODES, TRACKS, UPGRADES, getUpgradeCost } from './config';
import { GameStateManager } from './state';
import { Judgment, TearTypeDef, TrackId, UpgradeId } from './types';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.floor(n).toLocaleString('ja-JP');
}

function formatTallyMarks(count: number): string {
  if (count <= 0) return '―';
  const full = Math.floor(count / 5);
  const rem = count % 5;
  const remChars = ['', '一', '丅', '下', '止'];
  const shownFull = Math.min(full, 6);
  const suffix = full > 6 ? `×${full}` : '';
  return `${'正'.repeat(shownFull)}${suffix}${remChars[rem]}`;
}

export interface UIActions {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReturnToLobby: () => void;
  onSelectTrack: (trackId: TrackId) => void;
  onBuyUpgrade: (id: UpgradeId) => void;
  onClickPolish: () => void;
  onClickFever: () => void;
  onChangeBgmVol: (val: number) => void;
  onChangeSeVol: (val: number) => void;
  onChangeOffset: (ms: number) => void;
  onResetSave: () => void;
}

export class UIController {
  private gsm: GameStateManager;
  private actions: UIActions;

  private titleScreen = document.getElementById('title-screen')!;
  private loadingStatus = document.getElementById('loading-status')!;
  private btnStart = document.getElementById('btn-start') as HTMLButtonElement;
  private hud = document.getElementById('hud')!;
  private floatingLayer = document.getElementById('floating-layer')!;

  private elVaultRank = document.getElementById('hud-vault-rank')!;
  private elTears = document.getElementById('hud-tears')!;
  private elGems = document.getElementById('hud-gems')!;
  private elTally = document.getElementById('hud-tally')!;

  private elComboWrap = document.getElementById('combo-display')!;
  private elComboCount = document.getElementById('combo-count')!;
  private elComboMult = document.getElementById('combo-mult')!;

  private elFeverBanner = document.getElementById('fever-banner')!;
  private elFeverTimer = document.getElementById('fever-timer')!;
  private elFeverBarFill = document.getElementById('fever-bar-fill')!;
  private btnFever = document.getElementById('btn-fever') as HTMLButtonElement;

  private elBottleFill = document.getElementById('bottle-fill')!;
  private elBottlePct = document.getElementById('bottle-pct')!;
  private elBottleCount = document.getElementById('bottle-count')!;
  private btnPolish = document.getElementById('btn-polish') as HTMLButtonElement;
  private elNowPlaying = document.getElementById('now-playing')!;

  private beatDots = Array.from(document.querySelectorAll<HTMLElement>('.beat-dot'));
  private trackBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.track-btn'));

  private craftDrawer = document.getElementById('craft-drawer')!;
  private craftList = document.getElementById('craft-list')!;
  private craftBadge = document.getElementById('craft-badge')!;

  private pauseModal = document.getElementById('pause-modal')!;
  private pauseStatCombo = document.getElementById('pause-stat-combo')!;
  private pauseStatTears = document.getElementById('pause-stat-tears')!;
  private pauseStatGems = document.getElementById('pause-stat-gems')!;

  private storyModal = document.getElementById('story-modal')!;
  private storyList = document.getElementById('story-list')!;
  private storyBadge = document.getElementById('story-badge')!;

  private settingsModal = document.getElementById('settings-modal')!;
  private polishPrompt = document.getElementById('polish-prompt')!;
  private polishRingOuter = document.getElementById('polish-ring-outer')!;
  private polishStepText = document.getElementById('polish-step-text')!;
  private toastContainer = document.getElementById('toast-container')!;

  constructor(gsm: GameStateManager, actions: UIActions) {
    this.gsm = gsm;
    this.actions = actions;
    this.bindEvents();
    this.syncSettingsInputs();
  }

  private bindEvents(): void {
    this.btnStart.addEventListener('click', () => this.actions.onStart());

    document.getElementById('btn-pause')!.addEventListener('click', () => this.actions.onPause());
    document.getElementById('btn-resume')!.addEventListener('click', () => this.actions.onResume());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });
    document.getElementById('btn-return-lobby')!.addEventListener('click', () => {
      this.actions.onReturnToLobby();
    });

    this.trackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.track as TrackId;
        this.actions.onSelectTrack(id);
      });
    });

    this.btnPolish.addEventListener('click', () => this.actions.onClickPolish());
    this.btnFever.addEventListener('click', () => this.actions.onClickFever());

    document.getElementById('btn-craft')!.addEventListener('click', () => {
      const opening = this.craftDrawer.classList.contains('hidden');
      this.craftDrawer.classList.toggle('hidden');
      if (opening) this.renderCraftList();
    });
    document.getElementById('btn-close-craft')!.addEventListener('click', () => {
      this.craftDrawer.classList.add('hidden');
    });

    document.getElementById('btn-story')!.addEventListener('click', () => {
      this.renderStoryList();
      this.storyModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-story')!.addEventListener('click', () => {
      this.storyModal.classList.add('hidden');
      this.updateHUD();
    });

    document.getElementById('btn-settings')!.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-settings')!.addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
    });

    // Backdrop click closes secondary modals (not pause modal accidentally)
    [this.storyModal, this.settingsModal].forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.add('hidden');
      });
    });

    const optBgm = document.getElementById('opt-bgm') as HTMLInputElement;
    const optSe = document.getElementById('opt-se') as HTMLInputElement;
    const optOffset = document.getElementById('opt-offset') as HTMLInputElement;

    optBgm.addEventListener('input', () => {
      const v = Number(optBgm.value) / 100;
      document.getElementById('opt-bgm-val')!.textContent = `${optBgm.value}%`;
      this.actions.onChangeBgmVol(v);
    });
    optSe.addEventListener('input', () => {
      const v = Number(optSe.value) / 100;
      document.getElementById('opt-se-val')!.textContent = `${optSe.value}%`;
      this.actions.onChangeSeVol(v);
    });
    optOffset.addEventListener('input', () => {
      const ms = Number(optOffset.value);
      document.getElementById('opt-offset-val')!.textContent = `${ms > 0 ? '+' : ''}${ms}ms`;
      this.actions.onChangeOffset(ms);
    });

    document.getElementById('btn-reset-save')!.addEventListener('click', () => {
      if (window.confirm('涙蔵のセーブデータを初期化しますか？')) {
        this.actions.onResetSave();
        this.settingsModal.classList.add('hidden');
      }
    });
  }

  private syncSettingsInputs(): void {
    const s = this.gsm.state.settings;
    const bgmPct = Math.round(s.bgmVolume * 100);
    const sePct = Math.round(s.seVolume * 100);
    (document.getElementById('opt-bgm') as HTMLInputElement).value = String(bgmPct);
    document.getElementById('opt-bgm-val')!.textContent = `${bgmPct}%`;
    (document.getElementById('opt-se') as HTMLInputElement).value = String(sePct);
    document.getElementById('opt-se-val')!.textContent = `${sePct}%`;
    (document.getElementById('opt-offset') as HTMLInputElement).value = String(s.timingOffsetMs);
    document.getElementById('opt-offset-val')!.textContent = `${s.timingOffsetMs > 0 ? '+' : ''}${s.timingOffsetMs}ms`;
  }

  public setModelReady(ok: boolean, message?: string): void {
    this.loadingStatus.textContent = message ?? (ok ? '準備が整いました — 涙蔵があなたを待っています' : '3Dモデル読み込み中…');
    this.loadingStatus.classList.toggle('ready', ok);
  }

  public enterGame(): void {
    this.titleScreen.classList.add('fade-out');
    setTimeout(() => {
      if (this.titleScreen.classList.contains('fade-out')) {
        this.titleScreen.classList.add('hidden');
      }
    }, 550);
    this.hud.classList.remove('hidden');
    this.pauseModal.classList.add('hidden');
    this.updateHUD();
  }

  public showPauseModal(visible: boolean, currentCombo = 0): void {
    if (visible) {
      this.pauseStatCombo.textContent = String(currentCombo);
      this.pauseStatTears.textContent = formatNumber(this.gsm.state.tears);
      this.pauseStatGems.textContent = formatNumber(this.gsm.state.gems);
      this.craftDrawer.classList.add('hidden');
    }
    this.pauseModal.classList.toggle('hidden', !visible);
  }

  public returnToLobby(): void {
    this.pauseModal.classList.add('hidden');
    this.storyModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.craftDrawer.classList.add('hidden');
    this.polishPrompt.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.floatingLayer.innerHTML = '';

    this.titleScreen.classList.remove('hidden', 'fade-out');
  }

  public updateHUD(activeTrackId?: TrackId): void {
    const st = this.gsm.state;
    this.elVaultRank.textContent = `Lv.${this.gsm.getVaultRank()}`;
    this.elTears.textContent = formatNumber(st.tears);
    this.elGems.textContent = formatNumber(st.gems);
    this.elTally.textContent = formatTallyMarks(st.totalGemsCrafted);

    // Bottle fill
    const cap = this.gsm.getBottleCapacity();
    const pct = Math.min(100, Math.round((st.bottleCharge / cap) * 100));
    this.elBottleFill.style.height = `${pct}%`;
    this.elBottlePct.textContent = `${pct}%`;
    this.elBottleCount.textContent = `${Math.floor(st.bottleCharge)} / ${cap}`;

    const readyPolish = this.gsm.isBottleFull();
    this.btnPolish.disabled = !readyPolish;
    this.btnPolish.classList.toggle('ready', readyPolish);
    this.btnPolish.textContent = readyPolish ? '✨ 台座で磨いて宝石にする！' : '台座で磨く（満タンで解放）';

    // Track buttons
    const currentTrack = activeTrackId ?? st.selectedTrack;
    this.elNowPlaying.textContent = `♪ ${TRACKS[currentTrack].title}`;
    this.trackBtns.forEach((btn) => {
      const id = btn.dataset.track as TrackId;
      const unlocked = this.gsm.isTrackUnlocked(id);
      btn.classList.toggle('active', id === currentTrack);
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? TRACKS[id].title
        : `オルゴール結晶 Lv.${TRACKS[id].unlockMusicboxLevel} で常時解放`;
    });

    // Badges
    this.craftBadge.classList.toggle('hidden', !this.gsm.hasAnyAffordableUpgrade());
    this.storyBadge.classList.toggle('hidden', !this.gsm.hasUnreadEpisode());

    if (!this.craftDrawer.classList.contains('hidden')) {
      this.renderCraftList();
    }
  }

  public updateBeatDots(beatIndex: number): void {
    this.beatDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === beatIndex);
    });
  }

  public updateCombo(combo: number, mult: number): void {
    if (combo <= 1) {
      this.elComboWrap.classList.add('hidden');
      return;
    }
    this.elComboWrap.classList.remove('hidden');
    this.elComboCount.textContent = String(combo);
    this.elComboMult.textContent = `×${mult.toFixed(2).replace(/\.00$/, '.0')}`;
    this.elComboWrap.classList.remove('pop');
    void this.elComboWrap.offsetWidth;
    this.elComboWrap.classList.add('pop');
  }

  public updateFever(active: boolean, gaugePct: number, remainingSec: number): void {
    this.elFeverBarFill.style.width = `${Math.max(0, Math.min(100, gaugePct))}%`;
    this.elFeverBanner.classList.toggle('hidden', !active);
    if (active) {
      this.elFeverTimer.textContent = `${remainingSec.toFixed(1)}s`;
      this.btnFever.disabled = true;
      this.btnFever.classList.add('active');
      this.btnFever.classList.remove('ready');
      this.btnFever.textContent = `🔥 CRYSTAL RUSH 中！`;
    } else {
      const ready = gaugePct >= 100;
      this.btnFever.disabled = !ready;
      this.btnFever.classList.remove('active');
      this.btnFever.classList.toggle('ready', ready);
      this.btnFever.textContent = ready
        ? '✨ CRYSTAL RUSH 発動！（Remix）'
        : `CRYSTAL RUSH ${Math.floor(gaugePct)}%`;
    }
  }

  public updatePolishPrompt(active: boolean, step: number, totalSteps: number, ringProgress = 0): void {
    this.polishPrompt.classList.toggle('hidden', !active);
    if (active) {
      this.polishStepText.textContent = `磨く ${step + 1} / ${totalSteps}`;
      const scale = 1.0 + ringProgress * 1.15;
      this.polishRingOuter.style.transform = `scale(${scale.toFixed(3)})`;
      this.polishRingOuter.classList.toggle('sweet', ringProgress <= 0.34);
    }
  }

  public spawnJudgmentFloat(
    judgment: Judgment,
    x: number,
    y: number,
    gainTears: number,
    tear: TearTypeDef
  ): void {
    const el = document.createElement('div');
    el.className = `float-pop judge-${judgment.toLowerCase()}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--tear-color', tear.cssColor);
    el.innerHTML = `<span class="fp-j">${judgment}!</span><span class="fp-v">+${formatNumber(gainTears)}</span>`;
    this.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 820);
  }

  public showToast(title: string, subtitle?: string, accent: 'blue' | 'gold' = 'blue'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${accent}`;
    el.innerHTML = `<strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ''}`;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, 3400);
  }

  public renderCraftList(): void {
    this.craftList.innerHTML = '';
    UPGRADES.forEach((def) => {
      const lv = this.gsm.state.upgrades[def.id];
      const maxed = lv >= def.maxLevel;
      const cost = getUpgradeCost(def, lv);
      const affordable = !maxed && this.gsm.canAffordUpgrade(def.id);

      const card = document.createElement('div');
      card.className = `craft-item ${affordable ? 'can-buy' : ''} ${maxed ? 'is-max' : ''}`;
      card.innerHTML = `
        <div class="craft-top">
          <div>
            <div class="craft-name">${def.name}</div>
            <div class="craft-prop">${def.propName}</div>
          </div>
          <span class="craft-lv">Lv.${lv} / ${def.maxLevel}</span>
        </div>
        <p class="craft-desc">${def.description}</p>
        <div class="craft-effect">${def.effectText(lv)}</div>
        <div class="craft-footer">
          ${
            maxed
              ? '<span class="craft-max-badge">最大まで整いました</span>'
              : `<div class="craft-cost">
                   <span class="${this.gsm.state.tears >= cost.tears ? 'ok' : 'short'}">💧 ${formatNumber(cost.tears)}</span>
                   ${
                     cost.gems > 0
                       ? `<span class="${this.gsm.state.gems >= cost.gems ? 'ok' : 'short'}">💎 ${cost.gems}</span>`
                       : ''
                   }
                 </div>
                 <button class="btn-upgrade" type="button" ${affordable ? '' : 'disabled'}>整える</button>`
          }
        </div>
      `;

      const btn = card.querySelector<HTMLButtonElement>('.btn-upgrade');
      if (btn) {
        btn.addEventListener('click', () => this.actions.onBuyUpgrade(def.id));
      }
      this.craftList.appendChild(card);
    });
  }

  private renderStoryList(): void {
    this.storyList.innerHTML = '';
    const deskLv = this.gsm.state.upgrades.desk;
    const gemsCrafted = this.gsm.state.totalGemsCrafted;

    STORY_EPISODES.forEach((ep) => {
      const unlocked = deskLv >= ep.requiredDeskLevel && gemsCrafted >= ep.requiredGemsCrafted;
      const card = document.createElement('article');
      card.className = `story-card ${unlocked ? 'unlocked' : 'locked'}`;

      if (unlocked) {
        this.gsm.markEpisodeRead(ep.id);
        card.innerHTML = `
          <div class="story-meta">
            <span class="story-season">${ep.season}</span>
            <span class="story-gem-tag">💎 ${ep.gemName}</span>
          </div>
          <h3>第${ep.chapter}章：${ep.title}</h3>
          <blockquote>${ep.quote}</blockquote>
          ${ep.body.map((p) => `<p>${p}</p>`).join('')}
        `;
      } else {
        card.innerHTML = `
          <div class="story-meta">
            <span class="story-season">${ep.season}</span>
            <span class="story-lock-tag">未解放</span>
          </div>
          <h3>第${ep.chapter}章：？？？</h3>
          <p class="story-req">解放条件：ラベルとインクの机 Lv.${ep.requiredDeskLevel}（現在 Lv.${deskLv}） ／ 宝石昇華 ${ep.requiredGemsCrafted}回（現在 ${gemsCrafted}回）</p>
        `;
      }
      this.storyList.appendChild(card);
    });
  }
}
