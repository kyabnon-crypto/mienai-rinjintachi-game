import {
  BenchSpotDef,
  NukumoriStoryEpisode,
  NukumoriTrackDef,
  NukumoriTrackId,
  NukumoriUpgradeDef,
  WarmthItemDef,
  WarmthItemId,
  WarmthOrderDef,
} from './types';

export const PLAY_AREA_HALF_X = 5.4;
export const PLAY_AREA_MIN_Z = -3.0;
export const PLAY_AREA_MAX_Z = 4.5;
export const CAN_RACK_CAPACITY = 12;

export const BENCH_SPOTS: BenchSpotDef[] = [
  {
    id: 0,
    name: '自販機わきの石段ベンチ',
    shortName: '自販機わき',
    x: -3.5,
    z: -1.35,
    rotY: 0.42,
    visitorLine: '「あったか〜い缶、ちょうどほしかったんだ」',
  },
  {
    id: 1,
    name: '街灯下の公園ベンチ',
    shortName: '公園ベンチ',
    x: -2.4,
    z: 2.35,
    rotY: 0.25,
    visitorLine: '「……あれ？ 今日は、なんだか凍えないな」',
  },
  {
    id: 2,
    name: '雪の並木道ベンチ',
    shortName: '並木道ベンチ',
    x: 2.45,
    z: 2.35,
    rotY: -0.25,
    visitorLine: '「ふぅ……白い息まで、なんだかやさしい」',
  },
  {
    id: 3,
    name: '終バスの待合ベンチ',
    shortName: 'バス停ベンチ',
    x: 3.55,
    z: -1.3,
    rotY: -0.42,
    visitorLine: '「もう少し待てそう。ほっとしたなあ」',
  },
];

export const WARMTH_ITEM_LIST: WarmthItemDef[] = [
  {
    id: 'can',
    name: 'あったか〜い缶',
    shortName: 'あったか缶',
    icon: '🥫',
    colorHex: 0xff8c4a,
    emissiveHex: 0xd94b1e,
    cssColor: '#ff9658',
    baseValue: 18,
    feverGain: 6.0,
    weight: 29,
  },
  {
    id: 'steam',
    name: 'ふわり湯気玉',
    shortName: 'ふわり湯気',
    icon: '♨️',
    colorHex: 0xffd28a,
    emissiveHex: 0xe68b2e,
    cssColor: '#ffd48e',
    baseValue: 20,
    feverGain: 6.4,
    weight: 26,
  },
  {
    id: 'breath',
    name: 'やさしい白い息',
    shortName: '白い息',
    icon: '🫧',
    colorHex: 0xcbe4ff,
    emissiveHex: 0x6ea6e8,
    cssColor: '#cfe6ff',
    baseValue: 22,
    feverGain: 6.8,
    weight: 23,
  },
  {
    id: 'scarf',
    name: '赤い毛糸のぬくもり',
    shortName: '赤い毛糸',
    icon: '🧣',
    colorHex: 0xf06258,
    emissiveHex: 0xb82b24,
    cssColor: '#ff7a70',
    baseValue: 26,
    feverGain: 7.6,
    weight: 16,
  },
  {
    id: 'starsteam',
    name: 'ほっと星湯気',
    shortName: '星湯気',
    icon: '✨',
    colorHex: 0xfff3be,
    emissiveHex: 0xffb84a,
    cssColor: '#fff2ba',
    baseValue: 58,
    feverGain: 14.5,
    weight: 6,
  },
];

export const WARMTH_ITEM_MAP: Record<WarmthItemId, WarmthItemDef> = WARMTH_ITEM_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<WarmthItemId, WarmthItemDef>
);

export const WARMTH_ORDERS: WarmthOrderDef[] = [
  {
    id: 'commuter_bench',
    name: '仕事帰りの女の人のベンチ',
    recipientLabel: '帰り道の人',
    whisperMessage: '「……あれ？ 今日は、なんだか凍えないな」',
    items: ['steam', 'breath', 'steam'],
    bonusWarmth: 86,
    bonusBottles: 1,
  },
  {
    id: 'vending_corner',
    name: '自販機前のほかほか差し入れ',
    recipientLabel: '深夜の帰宅者',
    whisperMessage: '「あったか〜いコーンスープ、手先までじんわりする」',
    items: ['can', 'steam', 'can'],
    bonusWarmth: 94,
    bonusBottles: 1,
  },
  {
    id: 'last_bus_stop',
    name: '終バス待ちの赤いマフラー',
    recipientLabel: 'バスを待つ学生',
    whisperMessage: '「風がやんだのかな？ ほっとして眠くなりそう」',
    items: ['scarf', 'breath', 'scarf'],
    bonusWarmth: 106,
    bonusBottles: 1,
  },
  {
    id: 'white_breath_night',
    name: '白い息がほどける並木道',
    recipientLabel: '急ぎ足の人たち',
    whisperMessage: '「見えない誰かがそっと、温度を整えてくれたみたい」',
    items: ['breath', 'can', 'steam'],
    bonusWarmth: 114,
    bonusBottles: 1,
  },
  {
    id: 'otsukaresama_mug',
    name: '「おつかれさまです」の湯気',
    recipientLabel: '残業帰りの誰か',
    whisperMessage: '「今日もおつかれさま。この街はまだあたたかいね」',
    items: ['can', 'scarf', 'steam'],
    bonusWarmth: 124,
    bonusBottles: 2,
  },
  {
    id: 'tokoyo_winter_miracle',
    name: '真冬の夜のちいさな奇跡',
    recipientLabel: '凍える夜の街みんな',
    whisperMessage: '「誰にも知られないまま、この街はやさしく息をしてる」',
    items: ['scarf', 'can', 'breath'],
    bonusWarmth: 138,
    bonusBottles: 2,
  },
];

export const NUKUMORI_TRACKS: Record<NukumoriTrackId, NukumoriTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ヌクモリ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/nukumori_dreamy.mp3',
    bpm: 129.5,
    durationSec: 62,
    spawnEveryBeats: 2.0,
    frostRate: 0.16,
    benchCoolSpeed: 4.4,
    maxActiveItems: 10,
    valueMultiplier: 1.0,
    unlockLampLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ヌクモリ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/nukumori_normal.mp3',
    bpm: 86.5,
    durationSec: 62,
    spawnEveryBeats: 1.25,
    frostRate: 0.22,
    benchCoolSpeed: 5.5,
    maxActiveItems: 12,
    valueMultiplier: 1.45,
    unlockLampLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ヌクモリ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/nukumori_instrumental.mp3',
    bpm: 132.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    frostRate: 0.27,
    benchCoolSpeed: 6.4,
    maxActiveItems: 14,
    valueMultiplier: 1.9,
    unlockLampLevel: 2,
  },
};

export const NUKUMORI_UPGRADES: NukumoriUpgradeDef[] = [
  {
    id: 'thermostat',
    name: '古い温度調整機を磨く',
    propName: '真鍮ダイヤル＆寒さを測る温度計の列',
    description: 'ベンチをじんわり温める速さと拾い範囲が広がり、獲得する「ぬくもり」が増えます。',
    maxLevel: 8,
    baseCostWarmth: 55,
    baseCostBottles: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `温め＆拾い +${(lv * 15).toFixed(0)}% / ぬくもり ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'hangingLamp',
    name: '裸電球と「おんどばん」看板を灯す',
    propName: '軒下の吊り看板＆あたたかな裸電球',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、ぽかぽかフィーバー時間を延ばします。',
    maxLevel: 5,
    baseCostWarmth: 90,
    baseCostBottles: 1,
    costScale: 1.95,
    effectText: (lv) => {
      const dur = 14 + lv * 2;
      if (lv === 0) return `ぽかぽかフィーバー ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 2) return `ぽかぽかフィーバー ${dur}秒 / 通常版解放済（Lv.2でInst解放）`;
      return `ぽかぽかフィーバー ${dur}秒 / 全3バージョン解放済！`;
    },
  },
  {
    id: 'stoveKettle',
    name: 'だるまストーブと銅やかんを焚く',
    propName: 'しゅんしゅん湯気のだるまストーブ＆銅やかん',
    description: '差し入れ＆ベンチ温め時の「白い息の小瓶」報酬が増え、「湯気ウェーブ」の再使用時間が短くなります。',
    maxLevel: 8,
    baseCostWarmth: 70,
    baseCostBottles: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `差し入れ +${lv} 白い息の小瓶 / 湯気ウェーブ -${(lv * 0.18).toFixed(2)}秒`,
  },
  {
    id: 'canWarmer',
    name: 'ほかほか缶ウォーマーを並べる',
    propName: '木箱の缶ウォーマー＆あったか〜い缶たち',
    description: '缶ウォーマーのぬくもりが4拍ごとに共鳴して自動で「ぬくもり」を蓄えます（不在中も蓄積）。',
    maxLevel: 6,
    baseCostWarmth: 75,
    baseCostBottles: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動保温なし）' : `4拍ごとに +${lv * 10} ぬくもり / 放置 +${lv * 24}/分`,
  },
  {
    id: 'redScarfBed',
    name: '赤いマフラーと毛布のベッドを整える',
    propName: '赤いマフラー＆チェック柄毛布・銅湯たんぽ',
    description: '凍える北風を防ぐ「マフラーのまもり」が付与され、レアな「ほっと星湯気」が現れやすくなります。',
    maxLevel: 5,
    baseCostWarmth: 85,
    baseCostBottles: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0 ? '未強化（マフラーのまもりなし）' : `マフラーのまもり ${lv}回 / 星湯気率 +${lv * 5}%`,
  },
  {
    id: 'breathJars',
    name: '白い息の小瓶とマグカップを並べる',
    propName: '右壁の白い息の小瓶棚＆「おつかれさまです」マグ',
    description: '第五話『自動販売機の裏の温度番』の物語が順に解放され、全体の獲得ぬくもり倍率が上昇します。',
    maxLevel: 5,
    baseCostWarmth: 80,
    baseCostBottles: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `温度番の記録 ${lv} / 5 解放 / 全ぬくもり ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export const NUKUMORI_STORIES: NukumoriStoryEpisode[] = [
  {
    id: 'nk_ep1',
    chapter: 1,
    timeLabel: '22:15 — 凍った道路と白い息',
    title: '自動販売機の裏の湯気',
    requiredJarsLevel: 1,
    requiredBenchesWarmed: 2,
    quote: '「真冬の街には、誰にも知られていない“温度番”がいる。」',
    body: [
      '夜になると、街はしずかに冷えていきます。白い息、凍った道路、コートの襟を立てて歩く急ぎ足の人たち。',
      'そんな冬の夜、古い自動販売機の裏から、ふわり、と小さな湯気が立っていました。',
      'そこに住んでいるのが「ヌクモリ」。白くてもこもこの体に、赤いマフラーを巻いた小さな温度番です。',
    ],
    relicBadge: '「おんどばん」の吊り看板',
  },
  {
    id: 'nk_ep2',
    chapter: 2,
    timeLabel: '23:30 — ことこと動く真鍮ダイヤル',
    title: '古い温度調整機と五本の温度計',
    requiredJarsLevel: 2,
    requiredBenchesWarmed: 6,
    quote: '「今日は少し冷えすぎかなあ」',
    body: [
      'ヌクモリは毎晩、壁に並んだ温度計を見つめながら街の“寒さ”を見回っています。',
      '「さむい」の方へ針が傾くと、古い温度調整機の真鍮つまみを、ことことやさしく回すのです。',
      'だるまストーブの上では銅やかんがしゅんしゅん鳴り、木箱の缶ウォーマーには「あったか〜い」缶がずらりと並んでいます。',
    ],
    relicBadge: '古い温度調整機の真鍮つまみ',
  },
  {
    id: 'nk_ep3',
    chapter: 3,
    timeLabel: '0:45 — 公園のベンチにそっと手を置いて',
    title: 'じんわり、ほんの少しだけ',
    requiredJarsLevel: 3,
    requiredBenchesWarmed: 12,
    quote: '「寒すぎる夜には、公園のベンチへ向かう。」',
    body: [
      '北風がとくに冷たい夜、ヌクモリは赤いマフラーをきゅっと結び直し、雪の舞う公園のベンチへ向かいます。',
      'そして、冷え切った木のベンチにそっと両手を置きました。すると――じんわり。',
      '熱すぎず、凍えもしない、ほんの少しだけのあたたかさが、木の座面にやさしく染み込んでいくのです。',
    ],
    relicBadge: 'ベンチの模型とぬくもりの波紋',
  },
  {
    id: 'nk_ep4',
    chapter: 4,
    timeLabel: '1:50 — 仕事帰りの女の人の笑顔',
    title: '今日は、なんだか凍えないな',
    requiredJarsLevel: 4,
    requiredBenchesWarmed: 20,
    quote: '「……あれ？ 今日は、なんだか凍えないな」',
    body: [
      '仕事帰りの女の人が、ため息まじりにそのベンチへ腰かけました。冷たいはずなのに、なぜか凍えるほど寒くありません。',
      '女の人は白い息を吐きながら、ふっとやさしく笑いました。「今日は、なんだか凍えないな」',
      'その言葉を聞いて、ヌクモリは自動販売機の裏で「おつかれさまです」のマグカップを抱え、小さくほっとしたのです。',
    ],
    relicBadge: '「おつかれさまです」マグカップ',
  },
  {
    id: 'nk_ep5',
    chapter: 5,
    timeLabel: '4:35 — 誰にも知られない見えない優しさ',
    title: '自動販売機の裏で揺れる湯気',
    requiredJarsLevel: 5,
    requiredBenchesWarmed: 32,
    quote: '「冷たい夜の中には、見えない優しさがある。」',
    body: [
      '誰にも気づかれない場所で。誰にも名前を呼ばれないまま。それでもヌクモリは、今日も街をあたためます。',
      '右の壁の棚には、ほっとした人たちの「はぁ」「ふぅ」「ほっ」という白い息の小瓶が、星のようにやわらかく光っています。',
      '真冬の夜。自動販売機の裏では今日も、小さな湯気が静かに揺れているのです。',
    ],
    relicBadge: '常世町の温度番・赤いマフラー',
  },
];

export function getNukumoriUpgradeCost(
  def: NukumoriUpgradeDef,
  currentLevel: number
): { warmth: number; bottles: number } {
  const warmth = Math.round(def.baseCostWarmth * Math.pow(def.costScale, currentLevel));
  const bottles =
    def.baseCostBottles === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostBottles * Math.pow(1.48, currentLevel));
  return { warmth, bottles };
}
