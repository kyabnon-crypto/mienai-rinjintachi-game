import {
  getSusunomiUpgradeCost,
  POT_CAPACITY,
  SUSUNOMI_STORIES,
  SUSUNOMI_TRACKS,
  SUSUNOMI_UPGRADES,
} from './config';
import { SusunomiSaveState, SusunomiTrackId, SusunomiUpgradeId } from './types';

const STORAGE_KEY = 'mienai_susunomi_v1';

function createDefaultState(): SusunomiSaveState {
  return {
    drops: 0,
    totalDropsEarned: 0,
    stars: 0,
    totalDishesServed: 0,
    totalRecipesCompleted: 0,
    bestCombo: 0,
    bestScore: 0,
    potFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      copperPot: 0,
      blueStove: 0,
      spiceShelf: 0,
      woodenLadle: 0,
      ventFan: 0,
      recipeBook: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class SusunomiStateManager {
  public state: SusunomiSaveState;
  public offlineEarnedDrops = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): SusunomiSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<SusunomiSaveState>;
      const validTracks: SusunomiTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as SusunomiTrackId)
        ? (parsed.selectedTrack as SusunomiTrackId)
        : 'dreamy';

      const merged: SusunomiSaveState = {
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

      const shelfLv = merged.upgrades.spiceShelf;
      if (shelfLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * shelfLv * 22);
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

  public getKitchenRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getPotCapacity(): number {
    return POT_CAPACITY;
  }

  public getCatchRadius(): number {
    return 1.18 + this.state.upgrades.copperPot * 0.18;
  }

  public getStirRadius(): number {
    return 2.6 + this.state.upgrades.woodenLadle * 0.25;
  }

  public getStirCooldownSec(): number {
    return Math.max(1.4, 2.6 - this.state.upgrades.woodenLadle * 0.14);
  }

  public getDropMultiplier(): number {
    const potBonus = 1 + this.state.upgrades.copperPot * 0.18;
    const ladleBonus = 1 + this.state.upgrades.woodenLadle * 0.15;
    const bookBonus = 1 + this.state.upgrades.recipeBook * 0.22;
    return potBonus * ladleBonus * bookBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.blueStove * 2;
  }

  public getStarsPerDish(): number {
    return 1 + this.state.upgrades.woodenLadle;
  }

  public getShieldCount(): number {
    return this.state.upgrades.ventFan;
  }

  public isTrackUnlocked(trackId: SusunomiTrackId): boolean {
    return this.state.upgrades.blueStove >= SUSUNOMI_TRACKS[trackId].unlockStoveLevel;
  }

  public canAffordUpgrade(id: SusunomiUpgradeId): boolean {
    const def = SUSUNOMI_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getSusunomiUpgradeCost(def, lv);
    return this.state.drops >= cost.drops && this.state.stars >= cost.stars;
  }

  public buyUpgrade(id: SusunomiUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = SUSUNOMI_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getSusunomiUpgradeCost(def, lv);
    this.state.drops -= cost.drops;
    this.state.stars -= cost.stars;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return SUSUNOMI_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return SUSUNOMI_STORIES.filter(
      (ep) =>
        this.state.upgrades.recipeBook >= ep.requiredBookLevel ||
        this.state.totalDishesServed >= ep.requiredDishesServed
    ).length;
  }
}
