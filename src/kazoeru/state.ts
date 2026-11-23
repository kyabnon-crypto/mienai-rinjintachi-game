import {
  getKazoeruUpgradeCost,
  KAZOERU_STORIES,
  KAZOERU_TRACKS,
  KAZOERU_UPGRADES,
  NOTEBOOK_PAGE_CAPACITY,
} from './config';
import { KazoeruSaveState, KazoeruTrackId, KazoeruUpgradeId } from './types';

const STORAGE_KEY = 'mienai_kazoeru_v1';

function createDefaultState(): KazoeruSaveState {
  return {
    marks: 0,
    totalMarksEarned: 0,
    stars: 0,
    totalTallies: 0,
    totalSmilesCounted: 0,
    totalTearsCounted: 0,
    totalEffortsCounted: 0,
    totalOrdersCompleted: 0,
    totalScrollsArchived: 0,
    bestCombo: 0,
    bestScore: 0,
    notebookFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      tallyNotebook: 0,
      parkLamp: 0,
      scrollShelf: 0,
      swingChain: 0,
      knitScarf: 0,
      jarCollection: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class KazoeruStateManager {
  public state: KazoeruSaveState;
  public offlineEarnedMarks = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): KazoeruSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<KazoeruSaveState>;
      const validTracks: KazoeruTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as KazoeruTrackId)
        ? (parsed.selectedTrack as KazoeruTrackId)
        : 'dreamy';

      const merged: KazoeruSaveState = {
        ...fallback,
        ...parsed,
        selectedTrack,
        upgrades: {
          ...fallback.upgrades,
          ...(parsed.upgrades || {}),
        },
        settings: {
          ...fallback.settings,
          ...(parsed.settings || {}),
        },
      };

      const scarfLv = merged.upgrades.knitScarf;
      if (scarfLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * scarfLv * 24);
          if (earned > 0) {
            merged.marks += earned;
            merged.totalMarksEarned += earned;
            this.offlineEarnedMarks = earned;
          }
        }
      }
      return merged;
    } catch {
      return fallback;
    }
  }

  public save(): void {
    this.state.lastSavedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage quota errors
    }
  }

  public reset(): void {
    this.state = createDefaultState();
    this.offlineEarnedMarks = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getNotebookCapacity(): number {
    return NOTEBOOK_PAGE_CAPACITY;
  }

  /** Radius around Kazoeru to gather memory tokens & tally at spots */
  public getReachRadius(): number {
    return 1.4 + this.state.upgrades.tallyNotebook * 0.16;
  }

  /** How fast Kazoeru writes 正 strokes at a tally spot (pct/sec; 20% = 1 stroke) */
  public getTallyWriteRate(): number {
    return 48 + this.state.upgrades.tallyNotebook * 7.5;
  }

  /** Radius of SWING TALLY ("数え鳴らし") moonlit ripple */
  public getSwingTallyRadius(): number {
    return 4.2 + this.state.upgrades.swingChain * 0.48;
  }

  public getSwingTallyCooldownSec(): number {
    return Math.max(1.5, 3.1 - this.state.upgrades.swingChain * 0.22);
  }

  public getMarksMultiplier(): number {
    const nbBonus = 1 + this.state.upgrades.tallyNotebook * 0.18;
    const shelfBonus = 1 + this.state.upgrades.scrollShelf * 0.16;
    const jarBonus = 1 + this.state.upgrades.jarCollection * 0.22;
    return nbBonus * shelfBonus * jarBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.parkLamp * 2;
  }

  public getStarsPerScroll(): number {
    return 1 + this.state.upgrades.scrollShelf;
  }

  public getShieldCount(): number {
    return this.state.upgrades.knitScarf;
  }

  public isTrackUnlocked(trackId: KazoeruTrackId): boolean {
    return this.state.upgrades.parkLamp >= KAZOERU_TRACKS[trackId].unlockLampLevel;
  }

  public canAffordUpgrade(id: KazoeruUpgradeId): boolean {
    const def = KAZOERU_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getKazoeruUpgradeCost(def, lv);
    return this.state.marks >= cost.marks && this.state.stars >= cost.stars;
  }

  public buyUpgrade(id: KazoeruUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = KAZOERU_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getKazoeruUpgradeCost(def, lv);
    this.state.marks -= cost.marks;
    this.state.stars -= cost.stars;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return KAZOERU_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return KAZOERU_STORIES.filter(
      (ep) =>
        this.state.upgrades.jarCollection >= ep.requiredJarLevel ||
        this.state.totalTallies >= ep.requiredTallies
    ).length;
  }
}
