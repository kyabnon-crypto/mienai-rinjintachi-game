import {
  getHenjiroUpgradeCost,
  HENJIRO_STORIES,
  HENJIRO_TRACKS,
  HENJIRO_UPGRADES,
  LETTER_TRAY_CAPACITY,
} from './config';
import { HenjiroSaveState, HenjiroTrackId, HenjiroUpgradeId } from './types';

const STORAGE_KEY = 'mienai_henjiro_v1';

function createDefaultState(): HenjiroSaveState {
  return {
    light: 0,
    totalLightEarned: 0,
    seals: 0,
    totalRepliesSent: 0,
    totalOrdersCompleted: 0,
    totalWaxDispatches: 0,
    bestCombo: 0,
    bestScore: 0,
    trayFill: 0,
    selectedTrack: 'dreamy',
    upgrades: {
      quillDesk: 0,
      garlandLamp: 0,
      clothesline: 0,
      waxShelf: 0,
      glassesChair: 0,
      bookshelfWindow: 0,
    },
    settings: {
      bgmVolume: 0.72,
      seVolume: 0.85,
      timingOffsetMs: 0,
    },
    lastSavedAt: Date.now(),
  };
}

export class HenjiroStateManager {
  public state: HenjiroSaveState;
  public offlineEarnedLight = 0;

  constructor() {
    this.state = this.load();
  }

  private load(): HenjiroSaveState {
    const fallback = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<HenjiroSaveState>;
      const validTracks: HenjiroTrackId[] = ['dreamy', 'normal', 'instrumental'];
      const selectedTrack = validTracks.includes(parsed.selectedTrack as HenjiroTrackId)
        ? (parsed.selectedTrack as HenjiroTrackId)
        : 'dreamy';

      const merged: HenjiroSaveState = {
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

      const chairLv = merged.upgrades.glassesChair;
      if (chairLv > 0 && merged.lastSavedAt) {
        const elapsedMin = Math.min(480, Math.max(0, (Date.now() - merged.lastSavedAt) / 60000));
        if (elapsedMin >= 0.5) {
          const earned = Math.floor(elapsedMin * chairLv * 24);
          if (earned > 0) {
            merged.light += earned;
            merged.totalLightEarned += earned;
            this.offlineEarnedLight = earned;
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
    this.offlineEarnedLight = 0;
    this.save();
  }

  public getRoomRank(): number {
    const totalLv = Object.values(this.state.upgrades).reduce((a, b) => a + b, 0);
    return 1 + Math.floor(totalLv / 2);
  }

  public getTrayCapacity(): number {
    return LETTER_TRAY_CAPACITY;
  }

  /** Radius around Henjiro for picking up & smoothing crumpled letters and writing at spots */
  public getReachRadius(): number {
    return 1.32 + this.state.upgrades.quillDesk * 0.16;
  }

  /** How fast Henjiro writes a reply at an active desk/writing spot (pct/sec) */
  public getWriteRate(): number {
    return 46 + this.state.upgrades.quillDesk * 7.5;
  }

  /** Radius of Quill Flourish pulse */
  public getFlourishRadius(): number {
    return 3.9 + this.state.upgrades.waxShelf * 0.45;
  }

  public getFlourishCooldownSec(): number {
    return Math.max(1.4, 3.0 - this.state.upgrades.waxShelf * 0.22);
  }

  public getLightMultiplier(): number {
    const deskBonus = 1 + this.state.upgrades.quillDesk * 0.18;
    const lineBonus = 1 + this.state.upgrades.clothesline * 0.16;
    const bookBonus = 1 + this.state.upgrades.bookshelfWindow * 0.22;
    return deskBonus * lineBonus * bookBonus;
  }

  public getFeverDurationSec(): number {
    return 14 + this.state.upgrades.garlandLamp * 2;
  }

  public getSealsPerDispatch(): number {
    return 1 + this.state.upgrades.clothesline;
  }

  public getShieldCount(): number {
    return this.state.upgrades.glassesChair;
  }

  public isTrackUnlocked(trackId: HenjiroTrackId): boolean {
    return this.state.upgrades.garlandLamp >= HENJIRO_TRACKS[trackId].unlockLampLevel;
  }

  public canAffordUpgrade(id: HenjiroUpgradeId): boolean {
    const def = HENJIRO_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.state.upgrades[id];
    if (lv >= def.maxLevel) return false;
    const cost = getHenjiroUpgradeCost(def, lv);
    return this.state.light >= cost.light && this.state.seals >= cost.seals;
  }

  public buyUpgrade(id: HenjiroUpgradeId): boolean {
    if (!this.canAffordUpgrade(id)) return false;
    const def = HENJIRO_UPGRADES.find((u) => u.id === id)!;
    const lv = this.state.upgrades[id];
    const cost = getHenjiroUpgradeCost(def, lv);
    this.state.light -= cost.light;
    this.state.seals -= cost.seals;
    this.state.upgrades[id] = lv + 1;
    this.save();
    return true;
  }

  public getAffordableUpgradeCount(): number {
    return HENJIRO_UPGRADES.filter((u) => this.canAffordUpgrade(u.id)).length;
  }

  public hasAnyAffordableUpgrade(): boolean {
    return this.getAffordableUpgradeCount() > 0;
  }

  public getUnlockedStoriesCount(): number {
    return HENJIRO_STORIES.filter(
      (ep) =>
        this.state.upgrades.bookshelfWindow >= ep.requiredBookshelfLevel ||
        this.state.totalRepliesSent >= ep.requiredRepliesSent
    ).length;
  }
}
