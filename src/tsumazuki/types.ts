export type TsumazukiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type DroppedItemId = 'cup' | 'key' | 'plane' | 'coin' | 'watch';

export type TsumazukiUpgradeId =
  | 'hourglasses'
  | 'archWindow'
  | 'lostShelf'
  | 'pendulumClock'
  | 'tealCloak'
  | 'watchJournal';

export interface DroppedItemDef {
  id: DroppedItemId;
  wordText: string;
  name: string;
  shortName: string;
  icon: string;
  colorHex: number;
  emissiveHex: number;
  cssColor: string;
  baseValue: number;
  feverGain: number;
  weight: number;
}

export interface StumbleSpotDef {
  id: number;
  name: string;
  shortName: string;
  x: number;
  z: number;
  rotY: number;
  savedLine: string;
}

export interface WatchOrderDef {
  id: string;
  name: string;
  residentLabel: string;
  whisperMessage: string;
  items: DroppedItemId[];
  bonusDrops: number;
  bonusCharms: number;
}

export interface TsumazukiTrackDef {
  id: TsumazukiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  rushRate: number;
  spotSlipSpeed: number;
  maxActiveItems: number;
  valueMultiplier: number;
  unlockWindowLevel: number;
}

export interface TsumazukiUpgradeDef {
  id: TsumazukiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostDrops: number;
  baseCostCharms: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface TsumazukiStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredJournalLevel: number;
  requiredSaves: number;
  body: string[];
}

export interface TsumazukiSaveState {
  drops: number;
  totalDropsEarned: number;
  charms: number;
  totalSaves: number;
  totalOrdersCompleted: number;
  totalBasketReturns: number;
  bestCombo: number;
  bestScore: number;
  basketFill: number;
  selectedTrack: TsumazukiTrackId;
  upgrades: Record<TsumazukiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface TsumazukiRunStats {
  score: number;
  itemsCaught: number;
  stumblesSaved: number;
  ordersCompleted: number;
  basketReturns: number;
  rushesCalmed: number;
  maxCombo: number;
  dropsEarned: number;
  charmsEarned: number;
}

export interface BeatInfo {
  songTime: number;
  beatFloat: number;
  beatIndex: number;
  beatPhase: number;
  bpm: number;
  energy: number;
  durationSec: number;
  remainingSec: number;
  progress: number;
  ended: boolean;
}
