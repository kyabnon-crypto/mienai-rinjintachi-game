import { StoryEpisode, TearTypeDef, TrackDef, TrackId, UpgradeDef } from './types';

export const TEAR_TYPES: TearTypeDef[] = [
  {
    id: 'sad',
    name: '悲しい涙',
    subtitle: '蒼いしずく',
    colorHex: 0x6ec8ff,
    emissiveHex: 0x2f88ff,
    cssColor: '#7fc8ff',
    baseValue: 10,
    feverGain: 4.5,
    weight: 34,
  },
  {
    id: 'frustrated',
    name: 'くやしい涙',
    subtitle: '紅のしずく',
    colorHex: 0xff7b9c,
    emissiveHex: 0xd93b6b,
    cssColor: '#ff8da8',
    baseValue: 14,
    feverGain: 5.5,
    weight: 24,
  },
  {
    id: 'happy',
    name: 'うれしい涙',
    subtitle: '琥珀のしずく',
    colorHex: 0xffd27d,
    emissiveHex: 0xe69524,
    cssColor: '#ffd78c',
    baseValue: 18,
    feverGain: 6.5,
    weight: 20,
  },
  {
    id: 'farewell',
    name: 'さよならの涙',
    subtitle: '銀のしずく',
    colorHex: 0xcfe6ff,
    emissiveHex: 0x7ea6e0,
    cssColor: '#d9ecff',
    baseValue: 22,
    feverGain: 7.0,
    weight: 15,
  },
  {
    id: 'reunion',
    name: 'また会えた涙',
    subtitle: '金色のしずく',
    colorHex: 0xfff0a6,
    emissiveHex: 0xffbf36,
    cssColor: '#fff1a8',
    baseValue: 45,
    feverGain: 12.0,
    weight: 7,
  },
];

export const TRACKS: Record<TrackId, TrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ナミダビン — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/namidabin_dreamy.mp3',
    bpm: 106.5,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    approachBeats: 2.0,
    valueMultiplier: 1.0,
    feverStartOffsetSec: 0,
    unlockMusicboxLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ナミダビン — Original',
    shortLabel: '✨ 通常版',
    url: './assets/audio/namidabin_normal.mp3',
    bpm: 108.5,
    durationSec: 62,
    spawnEveryBeats: 1.0,
    approachBeats: 1.75,
    valueMultiplier: 1.35,
    feverStartOffsetSec: 0,
    unlockMusicboxLevel: 1,
  },
  remix: {
    id: 'remix',
    title: 'ナミダビン — Digital Math Punk Remix',
    shortLabel: '🔥 Remix',
    url: './assets/audio/namidabin_remix.mp3',
    bpm: 108.5,
    durationSec: 62,
    spawnEveryBeats: 0.5,
    approachBeats: 1.5,
    valueMultiplier: 2.2,
    feverStartOffsetSec: 22,
    unlockMusicboxLevel: 3,
  },
};

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'shelves',
    name: '涙瓶の棚を増やす',
    propName: '両側＆奥の涙瓶棚',
    description: '棚の瓶に青い光が宿り、4拍ごとに自動で涙の結晶が共鳴します。',
    maxLevel: 8,
    baseCostTears: 45,
    baseCostGems: 0,
    costScale: 1.75,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動共鳴なし）' : `4拍ごとに +${lv * 6} 結晶 / 点灯瓶 ${Math.min(100, 22 + lv * 10)}%`,
  },
  {
    id: 'workbench',
    name: '作業台と研磨布を整える',
    propName: '右手の作業台',
    description: '研磨した宝石の輝きが増し、コンボ倍率と宝石獲得量が高まります。',
    maxLevel: 8,
    baseCostTears: 60,
    baseCostGems: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `研磨報酬 +${lv} 宝石 / 結晶価値 ×${(1 + lv * 0.25).toFixed(2)}`,
  },
  {
    id: 'ladder',
    name: '移動はしごを滑らかに',
    propName: '左棚の移動はしご',
    description: 'はしごが棚を巡回し、高所のレアな「また会えた涙」の出現率と自動キャッチ力が上昇します。',
    maxLevel: 6,
    baseCostTears: 90,
    baseCostGems: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0
        ? '未強化（手動採集のみ）'
        : `金色涙の出現率 +${lv * 5}% / 自動回収 ${Math.round((1 - Math.pow(0.84, lv)) * 100)}%`,
  },
  {
    id: 'cart',
    name: '採集の荷車を広げる',
    propName: '左前の木箱の荷車',
    description: '涙蔵を閉じている間も、夜の町から涙瓶を運んでおいてくれます。',
    maxLevel: 6,
    baseCostTears: 80,
    baseCostGems: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（放置収入なし）' : `オフライン採集 +${lv * 18} 結晶 / 分`,
  },
  {
    id: 'desk',
    name: 'ラベルとインクの机を整える',
    propName: '奥の羽ペン机',
    description: '少女の一年間の記憶ラベルが順に解放され、蔵全体のボーナス倍率が上昇します。',
    maxLevel: 5,
    baseCostTears: 70,
    baseCostGems: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `記憶エピソード ${lv} / 5 解放 / 全結晶獲得 ×${(1 + lv * 0.2).toFixed(1)}`,
  },
  {
    id: 'musicbox',
    name: 'オルゴール結晶を磨く',
    propName: '天井の光のオルゴール',
    description: '楽曲アレンジ（通常版・Remix）の常時切替を解放し、CRYSTAL RUSHの時間を延ばします。',
    maxLevel: 5,
    baseCostTears: 100,
    baseCostGems: 2,
    costScale: 2.0,
    effectText: (lv) => {
      const dur = 16 + lv * 2;
      if (lv === 0) return `RUSH ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 3) return `RUSH ${dur}秒 / 通常版解放済（Lv.3でRemix常時解放）`;
      return `RUSH ${dur}秒 / 全3アレンジ常時解放！`;
    },
  },
];

export const STORY_EPISODES: StoryEpisode[] = [
  {
    id: 'ep1',
    chapter: 1,
    season: '春 — 最初のしずく',
    title: 'もう、やめたいな……',
    requiredDeskLevel: 1,
    requiredGemsCrafted: 1,
    quote: '「涙は、心ががんばったしるし。」',
    body: [
      '常世町の地下にある「涙蔵」。今夜もナミダビンは青いローブをまとい、小さな採集瓶を抱えて町を歩きます。',
      'ある春の日、部活動がうまくいかず、部屋でひとり泣いている女の子がいました。「もう、やめたいな……。」',
      'こぼれた一滴は、ふわりと小さな青い結晶になりました。ナミダビンはそれをそっと受け止め、大切に瓶へしまいます。',
    ],
    gemName: '春雨の蒼玉',
  },
  {
    id: 'ep2',
    chapter: 2,
    season: '夏 — くやしさの結晶',
    title: '負けた帰り道',
    requiredDeskLevel: 2,
    requiredGemsCrafted: 3,
    quote: '「悲しい夜も、悔しい日々も、誰かの心に残るもの。」',
    body: [
      '夏の大会の帰り道。誰にも言えずにうつむいた頬から、あたたかい紅色のしずくがこぼれました。',
      'それでも翌朝、彼女はまた靴ひもを結び直していました。',
      '涙蔵の棚には、同じ名前のラベルがついた瓶が、少しずつ並びはじめています。',
    ],
    gemName: '夏夕の紅玉',
  },
  {
    id: 'ep3',
    chapter: 3,
    season: '秋 — 立ち上がる夜',
    title: '何度も、前を向く',
    requiredDeskLevel: 3,
    requiredGemsCrafted: 6,
    quote: '「涙は、弱い人だけが流すものではないから。」',
    body: [
      '秋風が吹くころも、うまくいかない日は何度もありました。泣いては眠り、朝が来ればまた練習へ向かう日々。',
      'ナミダビンは心配しません。瓶の中で静かに眠る結晶たちが、すこしずつ内側から光を帯びはじめているのを知っているからです。',
    ],
    gemName: '秋月の星玉',
  },
  {
    id: 'ep4',
    chapter: 4,
    season: '冬 — 静かな助走',
    title: '白い息と小さな光',
    requiredDeskLevel: 4,
    requiredGemsCrafted: 10,
    quote: '「涙は、前へ進もうとする心の証だから。」',
    body: [
      '凍える冬の夜、手のひらを温めながら繰り返した練習。涙の数は少しずつ減り、代わりに澄んだ銀色のしずくが届くようになりました。',
      '涙蔵の中央台座で、彼女の一年分の瓶が、いまにも目を覚ましそうに脈打っています。',
    ],
    gemName: '冬晴の白晶',
  },
  {
    id: 'ep5',
    chapter: 5,
    season: '一年後 — 大会の日',
    title: '優勝した日の涙の宝石',
    requiredDeskLevel: 5,
    requiredGemsCrafted: 15,
    quote: '「悲しみは、いつか輝きになる。」',
    body: [
      '歓声の中でメダルを抱きしめた瞬間——涙蔵の棚にあった瓶が、きらん、と青く美しい宝石へと変わりました。',
      'ナミダビンはその宝石をそっと磨いて、蔵のいちばん光る中央台座へ飾ります。',
      '「涙は、弱さじゃない。未来へ続く、小さな宝物。」',
    ],
    gemName: '優勝した日の青い宝石',
  },
];

export const BOTTLE_CAPACITY_BASE = 10;

export function getUpgradeCost(def: UpgradeDef, currentLevel: number): { tears: number; gems: number } {
  const tears = Math.round(def.baseCostTears * Math.pow(def.costScale, currentLevel));
  const gems =
    def.baseCostGems === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostGems * Math.pow(1.55, currentLevel));
  return { tears, gems };
}
