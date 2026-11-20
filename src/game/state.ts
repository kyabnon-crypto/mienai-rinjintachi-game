import { BOTTLE_CAPACITY_BASE, STORY_EPISODES, UPGRADES, getUpgradeCost } from './config';
import { SaveState, TrackId, UpgradeId } from './types';

const STORAGE_KEY = 'namidabin_orgel_save_v1';

export function createDefaultState(): SaveState {
  return {
    tears: 0,
    gems: 0,
    totalTearsEarned: 0,
    totalGemsCrafted: 0,
    bestCombo: 0,
    bottleCharge: 0,
    upgrades: {
      shelves: 0,
      workbench: 0,
      ladder: 0,
      cart: 0,
      desk: 0,
      musicbox: 0,
    },
    selectedTrack: 'dreamy',
    readEpisodes: [],
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class GameStateManager {
  public state: SaveState;
  public offlineEarnedTears = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): SaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<SaveState>;
      const merged: SaveState = {
        ...fallback,
        ...parsed,
        upgrades: { ...fallback.upgrades, ...(parsed.upgrades ?? {}) },
        settings: { ...fallback.settings, ...(parsed.settings ?? {}) },
        readEpisodes: Array.isArray(parsed.readEpisodes) ? parsed.readEpisodes : [],
      };
      // Calculate offline cart earnings (capped at 4 hours)
      const cartLv = merged.upgrades.cart || 0;
      if (cartLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(240, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * cartLv * 18);
          if (earned > 0) {
            merged.tears += earned;
            merged.totalTearsEarned += earned;
            this.offlineEarnedTears = earned;
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
      // Ignore storage quota errors in restricted environments
    }
  }

  public reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.state = createDefaultState();
    this.offlineEarnedTears = 0;
    this.save();
  }

  public getVaultRank(): number {
    const totalUpgrades = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalUpgrades / 2) + Math.floor(this.state.totalGemsCrafted / 4);
  }

  public getBottleCapacity(): number {
    return BOTTLE_CAPACITY_BASE;
  }

  public isBottleFull(): boolean {
    return this.state.bottleCharge >= this.getBottleCapacity();
  }

  public getTearMultiplier(): number {
    const benchBonus = 1 + this.state.upgrades.workbench * 0.25;
    const deskBonus = 1 + this.state.upgrades.desk * 0.2;
    return benchBonus * deskBonus;
  }

  public getPolishGemReward(perfectSteps: number, isFever: boolean): number {
    const base = 1 + this.state.upgrades.workbench;
    const bonus = perfectSteps >= 3 ? 1 : 0;
    return (base + bonus) * (isFever ? 2 : 1);
  }

  public getFeverDurationSec(): number {
    return 24 + this.state.upgrades.musicbox * 4;
  }

  public getLadderAutoCatchChance(): number {
    const lv = this.state.upgrades.ladder;
    if (lv <= 0) return 0;
    return 1 - Math.pow(0.84, lv);
  }

  public isTrackUnlocked(trackId: TrackId): boolean {
    const mb = this.state.upgrades.musicbox;
    if (trackId === 'dreamy') return true;
    if (trackId === 'normal') return mb >= 1;
    if (trackId === 'remix') return mb >= 3;
    return false;
  }

  public canAffordUpgrade(id: UpgradeId): boolean {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getUpgradeCost(def, lv);
    return this.state.tears >= cost.tears && this.state.gems >= cost.gems;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return UPGRADES.some((u) => this.canAffordUpgrade(u.id));
  }

  public buyUpgrade(id: UpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getUpgradeCost(def, lv);
    this.state.tears -= cost.tears;
    this.state.gems -= cost.gems;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getUnlockedEpisodesCount(): number {
    return STORY_EPISODES.filter(
      (ep) =>
        this.state.upgrades.desk >= ep.requiredDeskLevel &&
        this.state.totalGemsCrafted >= ep.requiredGemsCrafted
    ).length;
  }

  public hasUnreadEpisode(): boolean {
    return STORY_EPISODES.some(
      (ep) =>
        this.state.upgrades.desk >= ep.requiredDeskLevel &&
        this.state.totalGemsCrafted >= ep.requiredGemsCrafted &&
        !this.state.readEpisodes.includes(ep.id)
    );
  }

  public markEpisodeRead(id: string): void {
    if (!this.state.readEpisodes.includes(id)) {
      this.state.readEpisodes.push(id);
      this.save();
    }
  }
}
