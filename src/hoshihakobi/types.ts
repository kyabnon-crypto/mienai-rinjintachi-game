export type HoshihakobiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type HoshihakobiUpgradeId =
  | 'starWorkbench'
  | 'skylightLantern'
  | 'starCrateBackpack'
  | 'constellationMap'
  | 'fluffyBed'
  | 'starLogDesk';

export type WishStarTokenId =
  | 'wishStar'
  | 'shootingTail'
  | 'timingGear'
  | 'reunionGlow'
  | 'milkyWayStar';

export type StarSpotThemeId = 'shooting' | 'wish' | 'timing' | 'reunion';

export interface HoshihakobiTrackDef {
  id: HoshihakobiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  cloudRate: number;
  spotDrainSpeed: number;
  maxActiveTokens: number;
  valueMultiplier: number;
  unlockSkylightLevel: number;
}

export interface StarSpotDef {
  id: number;
  theme: StarSpotThemeId;
  name: string;
  shortName: string;
  tagLabel: string;
  x: number;
  z: number;
  rotY: number;
  accentHex: number;
  cssColor: string;
  completedLine: string;
  starsAligned: number;
}

export interface WishStarTokenDef {
  id: WishStarTokenId;
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

export interface ConstellationOrderDef {
  id: string;
  name: string;
  skyLabel: string;
  whisperMessage: string;
  items: WishStarTokenId[];
  bonusStardust: number;
  bonusMiracles: number;
}

export interface HoshihakobiUpgradeDef {
  id: HoshihakobiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostStardust: number;
  baseCostMiracles: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface HoshihakobiStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredDeskLevel: number;
  requiredMiraclesSent: number;
  body: string[];
}

export interface HoshihakobiSaveState {
  stardust: number;
  totalStardustEarned: number;
  miracles: number;
  totalMiraclesSent: number;
  totalShootingStars: number;
  totalOrdersCompleted: number;
  totalCratesReleased: number;
  bestCombo: number;
  bestScore: number;
  crateFill: number;
  selectedTrack: HoshihakobiTrackId;
  upgrades: Record<HoshihakobiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface HoshihakobiRunStats {
  score: number;
  starsGathered: number;
  constellationsLit: number;
  shootingStarsLaunched: number;
  ordersCompleted: number;
  cratesReleased: number;
  cloudsCleared: number;
  maxCombo: number;
  stardustEarned: number;
  miraclesEarned: number;
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
