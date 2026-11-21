export type SusunomiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type AromaId = 'fish' | 'curry' | 'bread' | 'miso' | 'starlight';

export type SusunomiUpgradeId =
  | 'copperPot'
  | 'blueStove'
  | 'spiceShelf'
  | 'woodenLadle'
  | 'ventFan'
  | 'recipeBook';

export interface AromaDef {
  id: AromaId;
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

export interface MemoryRecipeDef {
  id: string;
  name: string;
  residentThought: string;
  ingredients: [AromaId, AromaId, AromaId];
  bonusDrops: number;
  bonusStars: number;
}

export interface SusunomiTrackDef {
  id: SusunomiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  fallSpeed: number;
  spawnEveryBeats: number;
  sootRate: number;
  valueMultiplier: number;
  unlockStoveLevel: number;
}

export interface SusunomiUpgradeDef {
  id: SusunomiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostDrops: number;
  baseCostStars: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface SusunomiStoryEpisode {
  id: string;
  chapter: number;
  timeLabel: string;
  title: string;
  requiredBookLevel: number;
  requiredDishesServed: number;
  quote: string;
  body: string[];
  dishBadge: string;
}

export interface SusunomiSaveState {
  drops: number;
  totalDropsEarned: number;
  stars: number;
  totalDishesServed: number;
  totalRecipesCompleted: number;
  bestCombo: number;
  bestScore: number;
  potFill: number;
  selectedTrack: SusunomiTrackId;
  upgrades: Record<SusunomiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface SusunomiRunStats {
  caught: number;
  recipeMatches: number;
  recipesCompleted: number;
  dishesServed: number;
  sootPurified: number;
  sootHits: number;
  maxCombo: number;
  dropsEarned: number;
  starsEarned: number;
}
