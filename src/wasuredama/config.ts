import {
  LostItemDef,
  LostItemId,
  RecipientOrderDef,
  WasuredamaStoryEpisode,
  WasuredamaTrackDef,
  WasuredamaTrackId,
  WasuredamaUpgradeDef,
} from './types';

export const PLAY_AREA_HALF_X = 5.2;
export const PLAY_AREA_MIN_Z = -3.4;
export const PLAY_AREA_MAX_Z = 4.2;
export const SACK_CAPACITY = 12;

export const LOST_ITEM_LIST: LostItemDef[] = [
  {
    id: 'dream',
    name: '言いかけてやめた夢',
    shortName: 'やめた夢',
    icon: '☁️',
    colorHex: 0x84c8ff,
    emissiveHex: 0x3a8ee6,
    cssColor: '#84c8ff',
    baseValue: 16,
    feverGain: 5.8,
    weight: 29,
  },
  {
    id: 'promise',
    name: '途中で諦めた約束',
    shortName: '古い約束',
    icon: '🎗️',
    colorHex: 0xffb46b,
    emissiveHex: 0xd97324,
    cssColor: '#ffb870',
    baseValue: 18,
    feverGain: 6.2,
    weight: 26,
  },
  {
    id: 'hope',
    name: '心の奥にしまった希望',
    shortName: '小さな希望',
    icon: '🌱',
    colorHex: 0xa8e89e,
    emissiveHex: 0x4ca852,
    cssColor: '#a8e89e',
    baseValue: 20,
    feverGain: 6.6,
    weight: 23,
  },
  {
    id: 'note',
    name: '引き出しの古いノート',
    shortName: '古いノート',
    icon: '📓',
    colorHex: 0xffe094,
    emissiveHex: 0xd99b2e,
    cssColor: '#ffe094',
    baseValue: 24,
    feverGain: 7.4,
    weight: 16,
  },
  {
    id: 'starlight',
    name: '星灯りのわすれ玉',
    shortName: '星灯り玉',
    icon: '✨',
    colorHex: 0xfff5c8,
    emissiveHex: 0xffc65c,
    cssColor: '#fff5c8',
    baseValue: 56,
    feverGain: 14.0,
    weight: 6,
  },
];

export const LOST_ITEM_MAP: Record<LostItemId, LostItemDef> = LOST_ITEM_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<LostItemId, LostItemDef>
);

export const RECIPIENT_ORDERS: RecipientOrderDef[] = [
  {
    id: 'tired_adult',
    name: '疲れた大人の帰り道',
    recipientLabel: '帰り道の誰か',
    whisperMessage: '「あれ……？ そうだ、ずっとやってみたかったんだ」',
    items: ['dream', 'hope', 'dream'],
    bonusLights: 84,
    bonusSprouts: 1,
  },
  {
    id: 'rainy_bench',
    name: '雨上がりのベンチの約束',
    recipientLabel: 'ベンチで待つ人',
    whisperMessage: '「あの日守れなかった約束、もう一度話してみようかな」',
    items: ['promise', 'dream', 'promise'],
    bonusLights: 92,
    bonusSprouts: 1,
  },
  {
    id: 'drawer_note',
    name: '引き出しの奥の古いノート',
    recipientLabel: '机に向かう人',
    whisperMessage: '「『しょうらいのゆめ』……まだ心の中で小さく光ってた」',
    items: ['note', 'hope', 'note'],
    bonusLights: 102,
    bonusSprouts: 1,
  },
  {
    id: 'quiet_window',
    name: '眠れない夜の窓辺の灯り',
    recipientLabel: '窓を見上げる人',
    whisperMessage: '「遠回りしてもいいんだね。明日から、また歩いてみよう」',
    items: ['hope', 'promise', 'dream'],
    bonusLights: 112,
    bonusSprouts: 1,
  },
  {
    id: 'childhood_dream',
    name: '絵本をつくりたかったあの日',
    recipientLabel: 'ノートを開く人',
    whisperMessage: '「ぜったい、あきらめない！……ふふ、懐かしいな」',
    items: ['note', 'dream', 'hope'],
    bonusLights: 122,
    bonusSprouts: 2,
  },
  {
    id: 'tokoyo_street',
    name: '常世町の星巡りわすれ玉',
    recipientLabel: 'まだ必要な人',
    whisperMessage: '「それは消えたんじゃない。ただ眠っていただけ」',
    items: ['promise', 'note', 'hope'],
    bonusLights: 136,
    bonusSprouts: 2,
  },
];

export const WASUREDAMA_TRACKS: Record<WasuredamaTrackId, WasuredamaTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ワスレダマ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/wasuredama_dreamy.mp3',
    bpm: 101.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    hazeRate: 0.16,
    maxActiveItems: 10,
    valueMultiplier: 1.0,
    unlockLightsLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ワスレダマ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/wasuredama_normal.mp3',
    bpm: 102.0,
    durationSec: 62,
    spawnEveryBeats: 1.25,
    hazeRate: 0.22,
    maxActiveItems: 12,
    valueMultiplier: 1.45,
    unlockLightsLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ワスレダマ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/wasuredama_instrumental.mp3',
    bpm: 100.0,
    durationSec: 62,
    spawnEveryBeats: 1.0,
    hazeRate: 0.28,
    maxActiveItems: 14,
    valueMultiplier: 1.9,
    unlockLightsLevel: 2,
  },
};

export const WASUREDAMA_UPGRADES: WasuredamaUpgradeDef[] = [
  {
    id: 'streetLamp',
    name: '街灯のあかりを磨く',
    propName: '中央の街灯＆「わすれもの」看板',
    description: 'ワスレダマの照らし＆拾い範囲が広がり、集める「こころの灯り」が増えます。',
    maxLevel: 8,
    baseCostLights: 55,
    baseCostSprouts: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `拾い範囲 +${(lv * 14).toFixed(0)}% / 灯り ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'stringLights',
    name: '夜道の吊り電球を灯す',
    propName: '通りに渡した星明かり電球',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、星明かりフィーバー時間を延ばします。',
    maxLevel: 5,
    baseCostLights: 90,
    baseCostSprouts: 1,
    costScale: 1.95,
    effectText: (lv) => {
      const dur = 14 + lv * 2;
      if (lv === 0) return `星明かりフィーバー ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 2) return `星明かりフィーバー ${dur}秒 / 通常版解放済（Lv.2でInst解放）`;
      return `星明かりフィーバー ${dur}秒 / 全3バージョン解放済！`;
    },
  },
  {
    id: 'burlapSack',
    name: 'たいせつな布袋を繕う',
    propName: '芽タグ付きの大きな布袋',
    description: 'お届け完了時の「思い出の芽」報酬が増え、「灯りパルス」の再使用時間が短くなります。',
    maxLevel: 8,
    baseCostLights: 70,
    baseCostSprouts: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `お届け完了 +${lv} 思い出の芽 / 灯りパルス -${(lv * 0.18).toFixed(2)}秒`,
  },
  {
    id: 'sortingShelf',
    name: '「まだ必要な人へ」仕分け棚を整える',
    propName: '奥の壁の仕分け棚＆小瓶',
    description: '仕分け棚の忘れ物たちが4拍ごとに共鳴して自動で「こころの灯り」を蓄えます（不在中も蓄積）。',
    maxLevel: 6,
    baseCostLights: 75,
    baseCostSprouts: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動共鳴なし）' : `4拍ごとに +${lv * 9} 灯り / 放置 +${lv * 22}/分`,
  },
  {
    id: 'hopeJars',
    name: '希望の小瓶と約束の結び糸を並べる',
    propName: '木箱の上の希望の瓶＆青い結び糸',
    description: 'ためらいのもやを防ぐ「街灯のまもり」が付与され、レアな「星灯りのわすれ玉」が現れやすくなります。',
    maxLevel: 5,
    baseCostLights: 85,
    baseCostSprouts: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0 ? '未強化（街灯のまもりなし）' : `街灯のまもり ${lv}回 / 星灯り玉率 +${lv * 5}%`,
  },
  {
    id: 'oldNotebook',
    name: '引き出しの古いノートを綴じる',
    propName: '古いノート「わたしの夢」＆ベンチ',
    description: '第四話『街灯の下の忘れ物係』の物語が順に解放され、全体の獲得灯り倍率が上昇します。',
    maxLevel: 5,
    baseCostLights: 80,
    baseCostSprouts: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `街灯の記録 ${lv} / 5 解放 / 全灯り ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export const WASUREDAMA_STORIES: WasuredamaStoryEpisode[] = [
  {
    id: 'ws_ep1',
    chapter: 1,
    timeLabel: '22:45 — ぽつぽつ灯る夜の住宅街',
    title: '街灯の下の丸い影',
    requiredNotebookLevel: 1,
    requiredDeliveries: 1,
    quote: '「夜の街には、だれにも知られていない小さなお仕事があります。」',
    body: [
      '誰もいない夜の住宅街。石畳の通りに、街灯のあたたかい光の輪がぽつぽつと続いています。',
      'その光の輪のなかに、小さな麻袋を抱えた丸い影が立っています。りんごくらいの背たけで、頭の上には小さな芽がちょこんと揺れ、やさしい目だけがぽわっと光っています。',
      'その名前は――「ワスレダマ」。街灯の下の、静かな忘れ物係です。',
    ],
    relicBadge: '芽のタグが付いた布袋',
  },
  {
    id: 'ws_ep2',
    chapter: 2,
    timeLabel: '23:55 — 地面にこぼれた小さな光',
    title: '形のない“忘れ物”たち',
    requiredNotebookLevel: 2,
    requiredDeliveries: 4,
    quote: '「見えなくなっても、消えたわけではありません。」',
    body: [
      'ワスレダマが拾い集めているのは、傘や鍵のような物だけではありません。人が暮らしの中でうっかり落としていった、“物ではない忘れ物”です。',
      '「いつかやりたい」と言いかけてやめた青い夢。守れなかったオレンジ色の約束。心の奥にしまいこんでしまった金色の小さな希望。',
      'ワスレダマはそれらをそっと両手ですくい上げ、大切そうに袋へしまいます。袋のなかでは、拾われた忘れ物たちが星のようにやさしく光っているのです。',
    ],
    relicBadge: '三色のこころの光',
  },
  {
    id: 'ws_ep3',
    chapter: 3,
    timeLabel: '1:20 — 疲れた大人の帰り道',
    title: 'まだ必要な人のそばへ',
    requiredNotebookLevel: 3,
    requiredDeliveries: 8,
    quote: '「それは消えたんじゃない。ただ眠っていただけ。」',
    body: [
      'ワスレダマは仕分け棚の前で光の粒を確かめると、夜道を歩いて「まだ必要な人」のもとへ向かいます。',
      'うつむいて歩く疲れた大人のそばへ、気づかれないように、そっと小さな光を落としていくのです。',
      'すると、ふと足を止めた誰かの心に、あたたかい灯りが戻ります。「あれ……？」――忘れていた大切な何かを、思い出すみたいに。',
    ],
    relicBadge: 'まだ必要な人への仕分け札',
  },
  {
    id: 'ws_ep4',
    chapter: 4,
    timeLabel: '2:40 — 引き出しの奥の古いノート',
    title: 'しょうらいのゆめ',
    requiredNotebookLevel: 4,
    requiredDeliveries: 13,
    quote: '「忘れていたはずなのに。その夢は、まだ心の中で小さく光っていました。」',
    body: [
      'ある日のこと。部屋の引き出しの奥から、表紙の少し擦れた古いノートが見つかりました。',
      'そっとページを開くと、そこには子どものころの丸い字で『しょうらいのゆめ』と書かれていました。「絵本をつくる」「だれかの心をあたたかくしたい」「ぜったい、あきらめない！」',
      '窓の外では、街灯が静かに夜道を照らしています。ノートを見つめる人の口もとに、やわらかな笑顔が浮かびました。',
    ],
    relicBadge: '古いノート『わたしの夢』',
  },
  {
    id: 'ws_ep5',
    chapter: 5,
    timeLabel: '4:50 — 軽くなった袋と次の夜道',
    title: 'きっと、だいじょうぶ。',
    requiredNotebookLevel: 5,
    requiredDeliveries: 20,
    quote: '「今夜もワスレダマは、誰かの夢を返してる。また、巡るように。」',
    body: [
      'たくさんの忘れ物を届け終えた明け方前、ワスレダマの布袋は少しだけ軽くなっています。雨上がりの水たまりに、街灯の光がやわらかく揺れていました。',
      '「きっと、だいじょうぶ。」――ワスレダマは誰にも聞こえない声で小さくつぶやき、頭の上の芽をぴょこんと揺らします。',
      '今夜も常世町のどこかの街灯の下で、丸い影が静かに歩きはじめています。誰かが落とした大切なかけらを拾い、必要な人へそっと返すために。',
    ],
    relicBadge: '常世町の街灯マスター芽',
  },
];

export function getWasuredamaUpgradeCost(
  def: WasuredamaUpgradeDef,
  currentLevel: number
): { lights: number; sprouts: number } {
  const lights = Math.round(def.baseCostLights * Math.pow(def.costScale, currentLevel));
  const sprouts =
    def.baseCostSprouts === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostSprouts * Math.pow(1.48, currentLevel));
  return { lights, sprouts };
}
