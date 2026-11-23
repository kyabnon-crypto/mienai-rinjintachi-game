export type YumeatsumeTrackId = 'dreamy' | 'normal' | 'instrumental';

export type YumeatsumeUpgradeId =
  | 'bottlingBench'
  | 'glassDome'
  | 'dreamSatchel'
  | 'slidingLadder'
  | 'cottonCandyNook'
  | 'receiptDesk';

export type DreamLightTokenId =
  | 'cakeDream'
  | 'astroDream'
  | 'painterDream'
  | 'musicDream'
  | 'cottonDream';

export type DreamPedestalThemeId = 'music' | 'patissier' | 'astronaut' | 'painter';

export interface YumeatsumeTrackDef {
  id: YumeatsumeTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  mistRate: number;
  pedestalDrainSpeed: number;
  maxActiveTokens: number;
  valueMultiplier: number;
  unlockDomeLevel: number;
}

export interface DreamPedestalDef {
  id: number;
  theme: DreamPedestalThemeId;
  name: string;
  shortName: string;
  tagLabel: string;
  x: number;
  z: number;
  rotY: number;
  accentHex: number;
  cssColor: string;
  completedLine: string;
  dreamsAwakened: number;
}

export interface DreamLightTokenDef {
  id: DreamLightTokenId;
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

export interface DreamReturnOrderDef {
  id: string;
  name: string;
  vaultLabel: string;
  whisperMessage: string;
  items: DreamLightTokenId[];
  bonusDrops: number;
  bonusJars: number;
}

export interface YumeatsumeUpgradeDef {
  id: YumeatsumeUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostDrops: number;
  baseCostJars: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface YumeatsumeStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredDeskLevel: number;
  requiredDreamsReturned: number;
  body: string[];
}

export interface YumeatsumeSaveState {
  drops: number;
  totalDropsEarned: number;
  jars: number;
  totalDreamsReturned: number;
  totalLidsOpened: number;
  totalOrdersCompleted: number;
  totalSatchelsStored: number;
  bestCombo: number;
  bestScore: number;
  satchelFill: number;
  selectedTrack: YumeatsumeTrackId;
  upgrades: Record<YumeatsumeUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface YumeatsumeRunStats {
  score: number;
  lightsGathered: number;
  dreamsAwakened: number;
  lidsOpened: number;
  ordersCompleted: number;
  satchelsStored: number;
  mistsCleared: number;
  maxCombo: number;
  dropsEarned: number;
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
