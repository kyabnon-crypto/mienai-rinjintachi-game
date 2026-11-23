import {
  CAN_RACK_CAPACITY,
  getNukumoriUpgradeCost,
  NUKUMORI_STORIES,
  NUKUMORI_TRACKS,
  NUKUMORI_UPGRADES,
} from './config';
import { NukumoriSaveState, NukumoriTrackId, NukumoriUpgradeId } from './types';

const STORAGE_KEY = 'mienai_nukumori_v1';

function createDefaultState(): NukumoriSaveState {
  return {
    warmth: 0,
    totalWarmthEarned: 0,
    bottles: 0,
    totalBenchesWarmed: 0,
    totalOrdersCompleted: 0,
    totalCanDeliveries: 0,
    bestCombo: 0,
    bestScore: 0,
    canRackFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      thermostat: 0,
      hangingLamp: 0,
      stoveKettle: 0,
      canWarmer: 0,
      redScarfBed: 0,
      breathJars: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class NukumoriStateManager {
  public state: NukumoriSaveState;
  public offlineEarnedWarmth = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): NukumoriSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<NukumoriSaveState>;
      const validTracks: NukumoriTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as NukumoriTrackId)
        ? (parsed.selectedTrack as NukumoriTrackId)
        : 'dreamy';

      const merged: NukumoriSaveState = {
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

      const warmerLv = merged.upgrades.canWarmer;
      if (warmerLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * warmerLv * 24);
          if (earned > 0) {
            merged.warmth += earned;
            merged.totalWarmthEarned += earned;
            this.offlineEarnedWarmth = earned;
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
    this.offlineEarnedWarmth = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getCanRackCapacity(): number {
    return CAN_RACK_CAPACITY;
  }

  /** Radius around Nukumori for picking up warmth seeds & hand-warming benches */
  public getWarmRadius(): number {
    return 1.32 + this.state.upgrades.thermostat * 0.17;
  }

  /** How fast Nukumori warms a chilly bench when placing hands nearby (deg/sec) */
  public getBenchWarmRate(): number {
    return 44 + this.state.upgrades.thermostat * 7.5;
  }

  /** Radius of the Steam Wave pulse */
  public getSteamWaveRadius(): number {
    return 4.0 + this.state.upgrades.thermostat * 0.42;
  }

  public getSteamWaveCooldownSec(): number {
    return Math.max(1.4, 3.0 - this.state.upgrades.stoveKettle * 0.18);
  }

  public getWarmthMultiplier(): number {
    const thermBonus = 1 + this.state.upgrades.thermostat * 0.18;
    const stoveBonus = 1 + this.state.upgrades.stoveKettle * 0.15;
    const jarBonus = 1 + this.state.upgrades.breathJars * 0.22;
    return thermBonus * stoveBonus * jarBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.hangingLamp * 2;
  }

  public getBottlesPerDelivery(): number {
    return 1 + this.state.upgrades.stoveKettle;
  }

  public getShieldCount(): number {
    return this.state.upgrades.redScarfBed;
  }

  public isTrackUnlocked(trackId: NukumoriTrackId): boolean {
    return this.state.upgrades.hangingLamp >= NUKUMORI_TRACKS[trackId].unlockLampLevel;
  }

  public canAffordUpgrade(id: NukumoriUpgradeId): boolean {
    const def = NUKUMORI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getNukumoriUpgradeCost(def, lv);
    return this.state.warmth >= cost.warmth && this.state.bottles >= cost.bottles;
  }

  public buyUpgrade(id: NukumoriUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = NUKUMORI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getNukumoriUpgradeCost(def, lv);
    this.state.warmth -= cost.warmth;
    this.state.bottles -= cost.bottles;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return NUKUMORI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return NUKUMORI_STORIES.filter(
      (ep) =>
        this.state.upgrades.breathJars >= ep.requiredJarsLevel ||
        this.state.totalBenchesWarmed >= ep.requiredBenchesWarmed
    ).length;
  }
}
