export type WarmthItemId = 'can' | 'steam' | 'breath' | 'scarf' | 'starsteam';

export type NukumoriTrackId = 'dreamy' | 'normal' | 'instrumental';

export type NukumoriUpgradeId =
  | 'thermostat'
  | 'hangingLamp'
  | 'stoveKettle'
  | 'canWarmer'
  | 'redScarfBed'
  | 'breathJars';

export interface WarmthItemDef {
  id: WarmthItemId;
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

export interface BenchSpotDef {
  id: number;
  name: string;
  shortName: string;
  x: number;
  z: number;
  rotY: number;
  visitorLine: string;
}

export interface WarmthOrderDef {
  id: string;
  name: string;
  recipientLabel: string;
  whisperMessage: string;
  items: WarmthItemId[];
  bonusWarmth: number;
  bonusBottles: number;
}

export interface NukumoriTrackDef {
  id: NukumoriTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  frostRate: number;
  benchCoolSpeed: number;
  maxActiveItems: number;
  valueMultiplier: number;
  unlockLampLevel: number;
}

export interface NukumoriUpgradeDef {
  id: NukumoriUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostWarmth: number;
  baseCostBottles: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface NukumoriStoryEpisode {
  id: string;
  chapter: number;
  timeLabel: string;
  title: string;
  requiredJarsLevel: number;
  requiredBenchesWarmed: number;
  quote: string;
  body: string[];
  relicBadge: string;
}

export interface NukumoriSettings {
  bgmVolume: number;
  seVolume: number;
  timingOffsetMs: number;
}

export interface NukumoriSaveState {
  warmth: number;
  totalWarmthEarned: number;
  bottles: number;
  totalBenchesWarmed: number;
  totalOrdersCompleted: number;
  totalCanDeliveries: number;
  bestCombo: number;
  bestScore: number;
  canRackFill: number;
  selectedTrack: NukumoriTrackId;
  upgrades: Record<NukumoriUpgradeId, number>;
  settings: NukumoriSettings;
  lastSavedAt: number;
}

export interface NukumoriRunStats {
  benchesWarmed: number;
  itemsCollected: number;
  ordersCompleted: number;
  frostsMelted: number;
  maxCombo: number;
  warmthEarned: number;
  bottlesEarned: number;
  score: number;
}
