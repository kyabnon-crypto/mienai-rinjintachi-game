export type KagemichiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type MemoryTypeId = 'thanks' | 'letter' | 'bottle' | 'warmth' | 'ticket';

export type KagemichiUpgradeId =
  | 'lantern'
  | 'sortingShelf'
  | 'clock'
  | 'jarShelf'
  | 'streetlamp'
  | 'memoryBox';

export interface MemoryTypeDef {
  id: MemoryTypeId;
  name: string;
  subtitle: string;
  colorHex: number;
  emissiveHex: number;
  cssColor: string;
  baseValue: number;
  feverGain: number;
  weight: number;
}

export interface KagemichiTrackDef {
  id: KagemichiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  runSpeed: number; // world units per second
  spawnEveryBeats: number;
  obstacleRate: number;
  valueMultiplier: number;
  unlockClockLevel: number;
}

export interface KagemichiUpgradeDef {
  id: KagemichiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostLights: number;
  baseCostTickets: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface KagemichiStoryEpisode {
  id: string;
  chapter: number;
  season: string;
  title: string;
  requiredBoxLevel: number;
  requiredDreamsSent: number;
  quote: string;
  body: string[];
  ticketName: string;
}

export interface KagemichiSaveState {
  lights: number;
  totalLightsEarned: number;
  tickets: number;
  totalDreamsSent: number;
  bestCombo: number;
  bestScore: number;
  lanternFill: number;
  selectedTrack: KagemichiTrackId;
  upgrades: Record<KagemichiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface KagemichiRunStats {
  collected: number;
  jumpsCleared: number;
  mistHits: number;
  purified: number;
  maxCombo: number;
  lightsEarned: number;
  ticketsEarned: number;
  dreamsSent: number;
  score: number;
}
