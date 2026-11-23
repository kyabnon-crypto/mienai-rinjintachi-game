export type HenjiroTrackId = 'dreamy' | 'normal' | 'instrumental';

export type LetterWordId = 'gomen' | 'arigato' | 'suki' | 'matane' | 'daijoubu';

export type HenjiroUpgradeId =
  | 'quillDesk'
  | 'garlandLamp'
  | 'clothesline'
  | 'waxShelf'
  | 'glassesChair'
  | 'bookshelfWindow';

export interface LetterWordDef {
  id: LetterWordId;
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

export interface LetterDeskSpotDef {
  id: number;
  name: string;
  shortName: string;
  x: number;
  z: number;
  rotY: number;
  whisperLine: string;
}

export interface ReplyOrderDef {
  id: string;
  name: string;
  recipientLabel: string;
  whisperMessage: string;
  words: LetterWordId[];
  bonusLight: number;
  bonusSeals: number;
}

export interface HenjiroTrackDef {
  id: HenjiroTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  blotRate: number;
  spotFadeSpeed: number;
  maxActiveLetters: number;
  valueMultiplier: number;
  unlockLampLevel: number;
}

export interface HenjiroUpgradeDef {
  id: HenjiroUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostLight: number;
  baseCostSeals: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface HenjiroStoryEpisode {
  chapter: number;
  title: string;
  subtitle: string;
  requiredBookshelfLevel: number;
  requiredRepliesSent: number;
  body: string[];
}

export interface HenjiroSaveState {
  light: number;
  totalLightEarned: number;
  seals: number;
  totalRepliesSent: number;
  totalOrdersCompleted: number;
  totalWaxDispatches: number;
  bestCombo: number;
  bestScore: number;
  trayFill: number;
  selectedTrack: HenjiroTrackId;
  upgrades: Record<HenjiroUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface HenjiroRunStats {
  score: number;
  lettersSmoothed: number;
  repliesFinished: number;
  ordersCompleted: number;
  waxDispatches: number;
  blotsCleared: number;
  maxCombo: number;
  lightEarned: number;
  sealsEarned: number;
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
