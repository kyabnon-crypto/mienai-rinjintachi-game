export type TomerunTrackId = 'dreamy' | 'normal' | 'instrumental';

export type TomerunUpgradeId =
  | 'hourglassValve'
  | 'timeLantern'
  | 'diningJars'
  | 'expiryTags'
  | 'blueBlanket'
  | 'diaryDesk';

export type MomentTokenId =
  | 'soup'
  | 'laughter'
  | 'karaage'
  | 'winterBreath'
  | 'goldenSand';

export type SpotThemeId = 'dining' | 'tonight' | 'father' | 'lastFamily';

export interface TomerunTrackDef {
  id: TomerunTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  hurryRate: number;
  spotDrainSpeed: number;
  maxActiveTokens: number;
  valueMultiplier: number;
  unlockLanternLevel: number;
}

export interface TimeSpotDef {
  id: number;
  theme: SpotThemeId;
  name: string;
  shortName: string;
  tagLabel: string;
  x: number;
  z: number;
  rotY: number;
  accentHex: number;
  cssColor: string;
  savedLine: string;
  secondsAdded: number;
}

export interface MomentTokenDef {
  id: MomentTokenId;
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

export interface PreservationOrderDef {
  id: string;
  name: string;
  shelfLabel: string;
  whisperMessage: string;
  items: MomentTokenId[];
  bonusSands: number;
  bonusJars: number;
}

export interface TomerunUpgradeDef {
  id: TomerunUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostSands: number;
  baseCostJars: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface TomerunStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredDeskLevel: number;
  requiredMomentsSaved: number;
  body: string[];
}

export interface TomerunSaveState {
  sands: number;
  totalSandsEarned: number;
  jars: number;
  totalMomentsSaved: number;
  totalSecondsExtended: number;
  totalOrdersCompleted: number;
  totalShelfBottled: number;
  bestCombo: number;
  bestScore: number;
  jarFill: number;
  selectedTrack: TomerunTrackId;
  upgrades: Record<TomerunUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface TomerunRunStats {
  score: number;
  tokensGathered: number;
  momentsSaved: number;
  secondsExtended: number;
  ordersCompleted: number;
  shelfBottled: number;
  hurriesPaused: number;
  maxCombo: number;
  sandsEarned: number;
  jarsEarned: number;
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
