import {
  getWasuredamaUpgradeCost,
  SACK_CAPACITY,
  WASUREDAMA_STORIES,
  WASUREDAMA_TRACKS,
  WASUREDAMA_UPGRADES,
} from './config';
import { WasuredamaSaveState, WasuredamaTrackId, WasuredamaUpgradeId } from './types';

const STORAGE_KEY = 'mienai_wasuredama_v1';

function createDefaultState(): WasuredamaSaveState {
  return {
    lights: 0,
    totalLightsEarned: 0,
    sprouts: 0,
    totalDeliveries: 0,
    totalOrdersCompleted: 0,
    bestCombo: 0,
    bestScore: 0,
    sackFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      streetLamp: 0,
      stringLights: 0,
      burlapSack: 0,
      sortingShelf: 0,
      hopeJars: 0,
      oldNotebook: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class WasuredamaStateManager {
  public state: WasuredamaSaveState;
  public offlineEarnedLights = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): WasuredamaSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<WasuredamaSaveState>;
      const validTracks: WasuredamaTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as WasuredamaTrackId)
        ? (parsed.selectedTrack as WasuredamaTrackId)
        : 'dreamy';

      const merged: WasuredamaSaveState = {
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

      const shelfLv = merged.upgrades.sortingShelf;
      if (shelfLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * shelfLv * 22);
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

  public getCornerRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getSackCapacity(): number {
    return SACK_CAPACITY;
  }

  /** Radius around Wasuredama where lost items automatically float into the burlap sack */
  public getPickupRadius(): number {
    return 1.25 + this.state.upgrades.streetLamp * 0.17;
  }

  /** Radius of the Lamp Bloom pulse wave */
  public getPulseRadius(): number {
    return 3.4 + this.state.upgrades.streetLamp * 0.36;
  }

  public getPulseCooldownSec(): number {
    return Math.max(1.4, 3.0 - this.state.upgrades.burlapSack * 0.18);
  }

  public getLightMultiplier(): number {
    const lampBonus = 1 + this.state.upgrades.streetLamp * 0.18;
    const sackBonus = 1 + this.state.upgrades.burlapSack * 0.15;
    const noteBonus = 1 + this.state.upgrades.oldNotebook * 0.22;
    return lampBonus * sackBonus * noteBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.stringLights * 2;
  }

  public getSproutsPerDelivery(): number {
    return 1 + this.state.upgrades.burlapSack;
  }

  public getShieldCount(): number {
    return this.state.upgrades.hopeJars;
  }

  public isTrackUnlocked(trackId: WasuredamaTrackId): boolean {
    return this.state.upgrades.stringLights >= WASUREDAMA_TRACKS[trackId].unlockLightsLevel;
  }

  public canAffordUpgrade(id: WasuredamaUpgradeId): boolean {
    const def = WASUREDAMA_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getWasuredamaUpgradeCost(def, lv);
    return this.state.lights >= cost.lights && this.state.sprouts >= cost.sprouts;
  }

  public buyUpgrade(id: WasuredamaUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = WASUREDAMA_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getWasuredamaUpgradeCost(def, lv);
    this.state.lights -= cost.lights;
    this.state.sprouts -= cost.sprouts;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return WASUREDAMA_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return WASUREDAMA_STORIES.filter(
      (ep) =>
        this.state.upgrades.oldNotebook >= ep.requiredNotebookLevel ||
        this.state.totalDeliveries >= ep.requiredDeliveries
    ).length;
  }
}
