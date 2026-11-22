export type TokitsugiTrackId = 'dreamy' | 'normal' | 'instrumental';

export type FragmentId = 'photo' | 'word' | 'timing' | 'promise' | 'dream';

export type TokitsugiUpgradeId =
  | 'repairKit'
  | 'grandClock'
  | 'goldenThread'
  | 'memoryJars'
  | 'hourglass'
  | 'closetDiary';

export interface FragmentDef {
  id: FragmentId;
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

export interface BrokenTimeOrderDef {
  id: string;
  name: string;
  miracleMessage: string;
  fragments: [FragmentId, FragmentId, FragmentId];
  bonusSands: number;
  bonusMiracles: number;
}

export interface TokitsugiTrackDef {
  id: TokitsugiTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  beatsPerRevolution: number;
  spawnEveryBeats: number;
  riftRate: number;
  pairRate: number;
  valueMultiplier: number;
  unlockClockLevel: number;
}

export interface TokitsugiUpgradeDef {
  id: TokitsugiUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostSands: number;
  baseCostMiracles: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface TokitsugiStoryEpisode {
  id: string;
  chapter: number;
  timeLabel: string;
  title: string;
  requiredDiaryLevel: number;
  requiredWatchesMended: number;
  quote: string;
  body: string[];
  relicBadge: string;
}

export interface TokitsugiSaveState {
  sands: number;
  totalSandsEarned: number;
  miracles: number;
  totalWatchesMended: number;
  totalOrdersCompleted: number;
  bestCombo: number;
  bestScore: number;
  watchFill: number;
  selectedTrack: TokitsugiTrackId;
  upgrades: Record<TokitsugiUpgradeId, number>;
  settings: {
    bgmVolume: number;
    seVolume: number;
    timingOffsetMs: number;
  };
  lastSavedAt: number;
}

export interface TokitsugiRunStats {
  stitched: number;
  perfects: number;
  linksCompleted: number;
  ordersCompleted: number;
  watchesMended: number;
  riftsPurified: number;
  riftHits: number;
  maxCombo: number;
  sandsEarned: number;
  miraclesEarned: number;
}
