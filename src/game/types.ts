export type TrackId = 'dreamy' | 'normal' | 'instrumental';

export type TearKind = 'sad' | 'frustrated' | 'happy' | 'farewell' | 'reunion';

export type Judgment = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export type UpgradeId =
  | 'shelves'
  | 'workbench'
  | 'ladder'
  | 'cart'
  | 'desk'
  | 'musicbox';

export interface TearTypeDef {
  id: TearKind;
  name: string;
  subtitle: string;
  colorHex: number;
  emissiveHex: number;
  cssColor: string;
  baseValue: number;
  feverGain: number;
  weight: number;
}

export interface TrackDef {
  id: TrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number; // e.g., 1.5, 1, 0.5
  approachBeats: number;   // beats from spawn until perfect hit
  valueMultiplier: number;
  feverStartOffsetSec: number;
  unlockMusicboxLevel: number;
}

export interface SessionStats {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
  tearsEarned: number;
  gemsEarned: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostTears: number;
  baseCostGems: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface StoryEpisode {
  id: string;
  chapter: number;
  season: string;
  title: string;
  requiredDeskLevel: number;
  requiredGemsCrafted: number;
  quote: string;
  body: string[];
  gemName: string;
}

export interface SaveState {
  tears: number;
  gems: number;
  totalTearsEarned: number;
  totalGemsCrafted: number;
  bestCombo: number;
  bottleCharge: number;
  upgrades: Record<UpgradeId, number>;
  selectedTrack: TrackId;
  readEpisodes: string[];
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}
