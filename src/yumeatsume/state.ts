import {
  getYumeatsumeUpgradeCost,
  SATCHEL_CAPACITY,
  YUMEATSUME_STORIES,
  YUMEATSUME_TRACKS,
  YUMEATSUME_UPGRADES,
} from './config';
import { YumeatsumeSaveState, YumeatsumeTrackId, YumeatsumeUpgradeId } from './types';

const STORAGE_KEY = 'mienai_yumeatsume_v1';

function createDefaultState(): YumeatsumeSaveState {
  return {
    drops: 0,
    totalDropsEarned: 0,
    jars: 0,
    totalDreamsReturned: 0,
    totalLidsOpened: 0,
    totalOrdersCompleted: 0,
    totalSatchelsStored: 0,
    bestCombo: 0,
    bestScore: 0,
    satchelFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      bottlingBench: 0,
      glassDome: 0,
      dreamSatchel: 0,
      slidingLadder: 0,
      cottonCandyNook: 0,
      receiptDesk: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class YumeatsumeStateManager {
  public state: YumeatsumeSaveState;
  public offlineEarnedDrops = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): YumeatsumeSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<YumeatsumeSaveState>;
      const validTracks: YumeatsumeTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as YumeatsumeTrackId)
        ? (parsed.selectedTrack as YumeatsumeTrackId)
        : 'dreamy';

      const merged: YumeatsumeSaveState = {
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

      const nookLv = merged.upgrades.cottonCandyNook;
      if (nookLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * nookLv * 24);
          if (earned > 0) {
            merged.drops += earned;
            merged.totalDropsEarned += earned;
            this.offlineEarnedDrops = earned;
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
    this.offlineEarnedDrops = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getSatchelCapacity(): number {
    return SATCHEL_CAPACITY;
  }

  /** Radius around Yumeatsume to scoop dream lights & awaken pedestal jars */
  public getReachRadius(): number {
    return 1.44 + this.state.upgrades.bottlingBench * 0.16;
  }

  /** How fast Yumeatsume awakens a sleeping dream jar pedestal (pct/sec) */
  public getAwakenRate(): number {
    return 48 + this.state.upgrades.bottlingBench * 7.5;
  }

  /** Radius of "おかえり (LID OPEN)" dream awakening wave */
  public getLidOpenRadius(): number {
    return 4.4 + this.state.upgrades.slidingLadder * 0.48;
  }

  public getLidOpenCooldownSec(): number {
    return Math.max(1.6, 3.3 - this.state.upgrades.slidingLadder * 0.24);
  }

  public getLidOpenDurationSec(): number {
    return 2.4 + this.state.upgrades.slidingLadder * 0.18;
  }

  public getDropsMultiplier(): number {
    const benchBonus = 1 + this.state.upgrades.bottlingBench * 0.18;
    const satchelBonus = 1 + this.state.upgrades.dreamSatchel * 0.16;
    const deskBonus = 1 + this.state.upgrades.receiptDesk * 0.22;
    return benchBonus * satchelBonus * deskBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.glassDome * 2;
  }

  public getJarsPerSatchelStore(): number {
    return 1 + this.state.upgrades.dreamSatchel;
  }

  public getShieldCount(): number {
    return this.state.upgrades.cottonCandyNook;
  }

  public isTrackUnlocked(trackId: YumeatsumeTrackId): boolean {
    return this.state.upgrades.glassDome >= YUMEATSUME_TRACKS[trackId].unlockDomeLevel;
  }

  public canAffordUpgrade(id: YumeatsumeUpgradeId): boolean {
    const def = YUMEATSUME_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getYumeatsumeUpgradeCost(def, lv);
    return this.state.drops >= cost.drops && this.state.jars >= cost.jars;
  }

  public buyUpgrade(id: YumeatsumeUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = YUMEATSUME_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getYumeatsumeUpgradeCost(def, lv);
    this.state.drops -= cost.drops;
    this.state.jars -= cost.jars;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return YUMEATSUME_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return YUMEATSUME_STORIES.filter(
      (ep) =>
        this.state.upgrades.receiptDesk >= ep.requiredDeskLevel ||
        this.state.totalDreamsReturned >= ep.requiredDreamsReturned
    ).length;
  }
}
