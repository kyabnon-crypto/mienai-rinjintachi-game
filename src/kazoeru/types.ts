export type KazoeruTrackId = 'dreamy' | 'normal' | 'instrumental';

export type MemoryTokenId = 'smile' | 'tear' | 'effort' | 'bead' | 'starTally';

export type KazoeruUpgradeId =
  | 'tallyNotebook'
  | 'parkLamp'
  | 'scrollShelf'
  | 'swingChain'
  | 'knitScarf'
  | 'jarCollection';

export interface MemoryTokenDef {
  id: MemoryTokenId;
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

export interface TallySpotDef {
  id: number;
  category: 'smile' | 'tear' | 'effort' | 'bench';
  name: string;
  shortName: string;
  boardLabel: string;
  x: number;
  z: number;
  rotY: number;
  accentHex: number;
  cssColor: string;
  completedLine: string;
}

export interface TallyOrderDef {
  id: string;
  name: string;
  nightLabel: string;
  whisperMessage: string;
  items: MemoryTokenId[];
  bonusMarks: number;
  bonusStars: number;
}

export interface KazoeruTrackDef {
  id: KazoeruTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  gustRate: number;
  spotFadeSpeed: number;
  maxActiveTokens: number;
  valueMultiplier: number;
  unlockLampLevel: number;
}

export interface KazoeruUpgradeDef {
  id: KazoeruUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostMarks: number;
  baseCostStars: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface KazoeruStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredJarLevel: number;
  requiredTallies: number;
  body: string[];
}

export interface KazoeruSaveState {
  marks: number;
  totalMarksEarned: number;
  stars: number;
  totalTallies: number;
  totalSmilesCounted: number;
  totalTearsCounted: number;
  totalEffortsCounted: number;
  totalOrdersCompleted: number;
  totalScrollsArchived: number;
  bestCombo: number;
  bestScore: number;
  notebookFill: number;
  selectedTrack: KazoeruTrackId;
  upgrades: Record<KazoeruUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface KazoeruRunStats {
  score: number;
  tokensGathered: number;
  talliesCompleted: number;
  ordersCompleted: number;
  scrollsArchived: number;
  gustsCalmed: number;
  maxCombo: number;
  marksEarned: number;
  starsEarned: number;
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
