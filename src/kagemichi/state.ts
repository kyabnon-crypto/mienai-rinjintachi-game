import {
  getKagemichiUpgradeCost,
  KAGEMICHI_STORIES,
  KAGEMICHI_TRACKS,
  KAGEMICHI_UPGRADES,
  LANTERN_CAPACITY,
} from './config';
import { KagemichiSaveState, KagemichiTrackId, KagemichiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_kagemichi_v1';

function createDefaultState(): KagemichiSaveState {
  return {
    lights: 0,
    totalLightsEarned: 0,
    tickets: 0,
    totalDreamsSent: 0,
    bestCombo: 0,
    bestScore: 0,
    lanternFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      lantern: 0,
      sortingShelf: 0,
      clock: 0,
      jarShelf: 0,
      streetlamp: 0,
      memoryBox: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class KagemichiStateManager {
  public state: KagemichiSaveState;
  public offlineEarnedLights = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): KagemichiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<KagemichiSaveState>;
      const validTracks: KagemichiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as KagemichiTrackId)
        ? (parsed.selectedTrack as KagemichiTrackId)
        : 'dreamy';

      const merged: KagemichiSaveState = {
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

      const jarLv = merged.upgrades.jarShelf;
      if (jarLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * jarLv * 20);
          if (earned > 0) {
            merged.lights += earned;
            merged.totalLightsEarned += earned;
            this.offlineEarnedLights = earned;
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
    this.offlineEarnedLights = 0;
    this.save();
  }

  public getStationRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getLanternCapacity(): number {
    return LANTERN_CAPACITY;
  }

  public getMagnetRadius(): number {
    return 1.28 + this.state.upgrades.lantern * 0.22;
  }

  public getLightMultiplier(): number {
    const lanternBonus = 1 + this.state.upgrades.lantern * 0.16;
    const shelfBonus = 1 + this.state.upgrades.sortingShelf * 0.25;
    const boxBonus = 1 + this.state.upgrades.memoryBox * 0.22;
    return lanternBonus * shelfBonus * boxBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.clock * 2;
  }

  public getTicketsPerDreamSend(): number {
    return 1 + this.state.upgrades.sortingShelf;
  }

  public getShieldCount(): number {
    return this.state.upgrades.streetlamp;
  }

  public isTrackUnlocked(trackId: KagemichiTrackId): boolean {
    return this.state.upgrades.clock >= KAGEMICHI_TRACKS[trackId].unlockClockLevel;
  }

  public canAffordUpgrade(id: KagemichiUpgradeId): boolean {
    const def = KAGEMICHI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getKagemichiUpgradeCost(def, lv);
    return this.state.lights >= cost.lights && this.state.tickets >= cost.tickets;
  }

  public buyUpgrade(id: KagemichiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = KAGEMICHI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getKagemichiUpgradeCost(def, lv);
    this.state.lights -= cost.lights;
    this.state.tickets -= cost.tickets;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return KAGEMICHI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return KAGEMICHI_STORIES.filter(
      (ep) =>
        this.state.upgrades.memoryBox >= ep.requiredBoxLevel ||
        this.state.totalDreamsSent >= ep.requiredDreamsSent
    ).length;
  }
}
