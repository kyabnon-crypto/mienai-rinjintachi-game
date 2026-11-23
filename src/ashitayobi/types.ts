export type AshitayobiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type AshitayobiUpgradeId =
  | 'sortingBench'
  | 'dawnDrawers'
  | 'mixingDesk'
  | 'dawnSatchel'
  | 'sunriseArch'
  | 'loadingLedger';

export type DawnLightTokenId =
  | 'courageDawn'
  | 'gentleDawn'
  | 'smileDawn'
  | 'wishDawn'
  | 'specialDawn';

export type DawnWindowThemeId = 'hospital' | 'tearful' | 'stumbled' | 'lonely';

export interface AshitayobiTrackDef {
  id: AshitayobiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  gloomRate: number;
  windowDrainSpeed: number;
  maxActiveTokens: number;
  valueMultiplier: number;
  unlockArchLevel: number;
}

export interface DawnWindowSpotDef {
  id: number;
  theme: DawnWindowThemeId;
  name: string;
  shortName: string;
  tagLabel: string;
  x: number;
  z: number;
  rotY: number;
  accentHex: number;
  cssColor: string;
  completedLine: string;
  morningsDelivered: number;
}

export interface DawnLightTokenDef {
  id: DawnLightTokenId;
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

export interface DawnDeliveryOrderDef {
  id: string;
  name: string;
  windowLabel: string;
  whisperMessage: string;
  items: DawnLightTokenId[];
  bonusGlow: number;
  bonusBottles: number;
}

export interface AshitayobiUpgradeDef {
  id: AshitayobiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostGlow: number;
  baseCostBottles: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface AshitayobiStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredLedgerLevel: number;
  requiredMorningsDelivered: number;
  body: string[];
}

export interface AshitayobiSaveState {
  glow: number;
  totalGlowEarned: number;
  bottles: number;
  totalMorningsDelivered: number;
  totalWindowsLit: number;
  totalOrdersCompleted: number;
  totalSatchelsDispatched: number;
  bestCombo: number;
  bestScore: number;
  satchelFill: number;
  selectedTrack: AshitayobiTrackId;
  upgrades: Record<AshitayobiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface AshitayobiRunStats {
  score: number;
  lightsGathered: number;
  morningsDelivered: number;
  windowsLit: number;
  ordersCompleted: number;
  satchelsDispatched: number;
  gloomsCleared: number;
  maxCombo: number;
  glowEarned: number;
  bottlesEarned: number;
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
