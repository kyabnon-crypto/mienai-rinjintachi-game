export type LostItemId = 'dream' | 'promise' | 'hope' | 'note' | 'starlight';

export type WasuredamaTrackId = 'dreamy' | 'normal' | 'instrumental';

export type WasuredamaUpgradeId =
  | 'streetLamp'
  | 'stringLights'
  | 'burlapSack'
  | 'sortingShelf'
  | 'hopeJars'
  | 'oldNotebook';

export interface LostItemDef {
  id: LostItemId;
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

export interface RecipientOrderDef {
  id: string;
  name: string;
  recipientLabel: string;
  whisperMessage: string;
  items: LostItemId[];
  bonusLights: number;
  bonusSprouts: number;
}

export interface WasuredamaTrackDef {
  id: WasuredamaTrackId;
  title: string;
  shortLabel: string;
  url: string;
  bpm: number;
  durationSec: number;
  spawnEveryBeats: number;
  hazeRate: number;
  maxActiveItems: number;
  valueMultiplier: number;
  unlockLightsLevel: number;
}

export interface WasuredamaUpgradeDef {
  id: WasuredamaUpgradeId;
  name: string;
  propName: string;
  description: string;
  maxLevel: number;
  baseCostLights: number;
  baseCostSprouts: number;
  costScale: number;
  effectText: (level: number) => string;
}

export interface WasuredamaStoryEpisode {
  id: string;
  chapter: number;
  timeLabel: string;
  title: string;
  requiredNotebookLevel: number;
  requiredDeliveries: number;
  quote: string;
  body: string[];
  relicBadge: string;
}

export interface WasuredamaSettings {
  bgmVolume: number;
  seVolume: number;
  timingOffsetMs: number;
}

export interface WasuredamaSaveState {
  lights: number;
  totalLightsEarned: number;
  sprouts: number;
  totalDeliveries: number;
  totalOrdersCompleted: number;
  bestCombo: number;
  bestScore: number;
  sackFill: number;
  selectedTrack: WasuredamaTrackId;
  upgrades: Record<WasuredamaUpgradeId, number>;
  settings: WasuredamaSettings;
  lastSavedAt: number;
}

export interface WasuredamaRunStats {
  pickedUp: number;
  delivered: number;
  ordersCompleted: number;
  hazesCleared: number;
  maxCombo: number;
  lightsEarned: number;
  sproutsEarned: number;
  score: number;
}
