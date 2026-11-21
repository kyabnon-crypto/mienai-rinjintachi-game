import {
  AromaDef,
  AromaId,
  MemoryRecipeDef,
  SusunomiStoryEpisode,
  SusunomiTrackDef,
  SusunomiTrackId,
  SusunomiUpgradeDef,
} from './types';

export const COUNTER_HALF_WIDTH = 4.25;
export const VENT_LANES = [-3.4, -1.7, 0, 1.7, 3.4] as const;

export const AROMA_LIST: AromaDef[] = [
  {
    id: 'fish',
    name: '焼き魚の香ばしさ',
    shortName: '焼き魚',
    icon: '🐟',
    colorHex: 0xff9248,
    emissiveHex: 0xe6641c,
    cssColor: '#ff9a52',
    baseValue: 14,
    feverGain: 5.2,
    weight: 28,
  },
  {
    id: 'curry',
    name: 'カレーのスパイス',
    shortName: 'カレー',
    icon: '🍛',
    colorHex: 0xffd24c,
    emissiveHex: 0xe69c18,
    cssColor: '#ffd75e',
    baseValue: 16,
    feverGain: 5.8,
    weight: 26,
  },
  {
    id: 'bread',
    name: 'パン屋の甘い香り',
    shortName: '焼きたてパン',
    icon: '🥐',
    colorHex: 0xfff0c4,
    emissiveHex: 0xdfba74,
    cssColor: '#fff0c7',
    baseValue: 18,
    feverGain: 6.2,
    weight: 24,
  },
  {
    id: 'miso',
    name: '夕暮れの味噌と出汁',
    shortName: 'あたたか出汁',
    icon: '🍲',
    colorHex: 0xffb38a,
    emissiveHex: 0xc96c44,
    cssColor: '#ffb78f',
    baseValue: 22,
    feverGain: 6.8,
    weight: 16,
  },
  {
    id: 'starlight',
    name: '星灯りの記憶',
    shortName: '星灯り',
    icon: '✨',
    colorHex: 0xffe49e,
    emissiveHex: 0xffa85c,
    cssColor: '#ffebad',
    baseValue: 50,
    feverGain: 13.0,
    weight: 6,
  },
];

export const AROMA_MAP: Record<AromaId, AromaDef> = AROMA_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<AromaId, AromaDef>
);

export const MEMORY_RECIPES: MemoryRecipeDef[] = [
  {
    id: 'twilight_soup',
    name: '夕暮れの帰り道スープ',
    residentThought: '「なんだか今日は、懐かしい気分だな」',
    ingredients: ['fish', 'curry', 'bread'],
    bonusDrops: 75,
    bonusStars: 1,
  },
  {
    id: 'sunday_bakery',
    name: '日曜の朝の焼きたて食卓',
    residentThought: '「子どものころの朝を思い出したよ」',
    ingredients: ['bread', 'bread', 'miso'],
    bonusDrops: 85,
    bonusStars: 1,
  },
  {
    id: 'grandma_kitchen',
    name: 'おばあちゃんの台所鍋',
    residentThought: '「不思議と胸の奥があたたかい」',
    ingredients: ['fish', 'miso', 'fish'],
    bonusDrops: 90,
    bonusStars: 1,
  },
  {
    id: 'rainy_curry',
    name: '雨上がりのカレー夜話',
    residentThought: '「帰ってきたくなる匂いがしたんだ」',
    ingredients: ['curry', 'miso', 'curry'],
    bonusDrops: 95,
    bonusStars: 1,
  },
  {
    id: 'alley_feast',
    name: '路地裏の三つ星シチュー',
    residentThought: '「誰かがそばにいてくれた気がする」',
    ingredients: ['curry', 'bread', 'fish'],
    bonusDrops: 105,
    bonusStars: 2,
  },
  {
    id: 'vent_miracle',
    name: '換気口の奥の星灯り鍋',
    residentThought: '「理由もなく、今日をがんばれそう」',
    ingredients: ['miso', 'bread', 'curry'],
    bonusDrops: 115,
    bonusStars: 2,
  },
];

export const SUSUNOMI_TRACKS: Record<SusunomiTrackId, SusunomiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ススノミ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/susunomi_dreamy.mp3',
    bpm: 103.0,
    durationSec: 62,
    fallSpeed: 2.35,
    spawnEveryBeats: 1.0,
    sootRate: 0.16,
    valueMultiplier: 1.0,
    unlockStoveLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ススノミ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/susunomi_normal.mp3',
    bpm: 126.0,
    durationSec: 62,
    fallSpeed: 2.9,
    spawnEveryBeats: 1.0,
    sootRate: 0.22,
    valueMultiplier: 1.45,
    unlockStoveLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ススノミ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/susunomi_instrumental.mp3',
    bpm: 154.0,
    durationSec: 62,
    fallSpeed: 3.45,
    spawnEveryBeats: 0.75,
    sootRate: 0.28,
    valueMultiplier: 1.9,
    unlockStoveLevel: 2,
  },
};

export const SUSUNOMI_UPGRADES: SusunomiUpgradeDef[] = [
  {
    id: 'copperPot',
    name: '年季の銅鍋を磨く',
    propName: 'コンロの上の大きな銅鍋',
    description: '銅鍋の湯気が広がり、漂う匂いのキャッチ範囲と獲得する香りの雫が増えます。',
    maxLevel: 8,
    baseCostDrops: 55,
    baseCostStars: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `キャッチ幅 +${(lv * 0.18).toFixed(2)}m / 香りの雫 ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'blueStove',
    name: '青いガスコンロを整える',
    propName: '台所の青い炎コンロ',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、ことことフィーバー時間を延ばします。',
    maxLevel: 5,
    baseCostDrops: 90,
    baseCostStars: 1,
    costScale: 1.95,
    effectText: (lv) => {
      const dur = 14 + lv * 2;
      if (lv === 0) return `フィーバー ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 2) return `フィーバー ${dur}秒 / 通常版解放済（Lv.2でInst解放）`;
      return `フィーバー ${dur}秒 / 全3バージョン解放済！`;
    },
  },
  {
    id: 'woodenLadle',
    name: '木べらとおたまを馴染ませる',
    propName: 'ススノミ愛用の木べら',
    description: 'レシピ完成・ことこと仕上げの「記憶の星」報酬が増え、かき混ぜ波の範囲も広がります。',
    maxLevel: 8,
    baseCostDrops: 70,
    baseCostStars: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `料理完成 +${lv} 記憶の星 / かき混ぜ幅 +${(lv * 0.25).toFixed(2)}m`,
  },
  {
    id: 'spiceShelf',
    name: '香り瓶の棚を増やす',
    propName: '壁ぎわの小瓶＆スパイス棚',
    description: '並んだ香り瓶が音楽に合わせて共鳴し、4拍ごとに自動で雫が溜まります（不在中も蓄積）。',
    maxLevel: 6,
    baseCostDrops: 75,
    baseCostStars: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動共鳴なし）' : `4拍ごとに +${lv * 9} 雫 / 放置 +${lv * 22}/分`,
  },
  {
    id: 'ventFan',
    name: '換気扇とランプを掃除する',
    propName: '奥の換気扇＆吊りランタン',
    description: '焦げ煙を防ぐ「換気ガード」が付与され、レアな「星灯りの記憶」が現れやすくなります。',
    maxLevel: 5,
    baseCostDrops: 85,
    baseCostStars: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0 ? '未強化（焦げガードなし）' : `焦げガード ${lv}回 / 星灯り率 +${lv * 5}%`,
  },
  {
    id: 'recipeBook',
    name: '記憶のレシピ帳を綴じる',
    propName: '壁の額縁＆マッチ箱ベッド',
    description: '第一話『換気口の奥の料理人』の物語が順に解放され、全体の獲得雫倍率が上昇します。',
    maxLevel: 5,
    baseCostDrops: 80,
    baseCostStars: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `換気口の記録 ${lv} / 5 解放 / 全雫 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export const SUSUNOMI_STORIES: SusunomiStoryEpisode[] = [
  {
    id: 'ss_ep1',
    chapter: 1,
    timeLabel: '22:15 — 古びたアパートの壁',
    title: '換気口の奥の小さな台所',
    requiredBookLevel: 1,
    requiredDishesServed: 1,
    quote: '「誰も知らないその奥で、小さな誰かが火を灯す」',
    body: [
      'ふるびたアパートの、かべのすみにある小さな換気口。雨上がりの夜にそっと目をこらすと、その奥からオレンジ色のランプの灯りがもれています。',
      'そこには、だれも知らない小さな台所がありました。使い込まれた銅鍋、小瓶のならぶ木の棚、そしてマッチ箱のベッド。',
      '住んでいるのは、すすみたいにまっくろな体と大きな白い目を持つ小さな料理人――「ススノミ」です。',
    ],
    dishBadge: '小さな銅鍋の初火入れ',
  },
  {
    id: 'ss_ep2',
    chapter: 2,
    timeLabel: '23:40 — 夜の路地と配管の上',
    title: '集めるのは、光の“匂い”',
    requiredBookLevel: 2,
    requiredDishesServed: 4,
    quote: '「焼けた魚の香りとか、遠い日のカレーの記憶」',
    body: [
      '夜になると、ススノミは小さなランタンを下げて、配管や電線をつたって町へ出かけます。集めるのは、食べものではありません。“匂い”です。',
      '焼き魚の香ばしいオレンジの煙。カレーの黄金のスパイス。パン屋さんの甘いクリーム色の香り。',
      'ススノミは光の煙になって漂う匂いたちを、ひとつひとつ大切に小瓶へ詰め込んで台所へ持ち帰ります。',
    ],
    dishBadge: '三色の香り小瓶セット',
  },
  {
    id: 'ss_ep3',
    chapter: 3,
    timeLabel: '1:20 — 青い炎と銅鍋',
    title: 'ことこと煮込む「記憶の味」',
    requiredBookLevel: 3,
    requiredDishesServed: 8,
    quote: '「ことこと。ことこと。思い出だけを煮詰めてる」',
    body: [
      '台所へ戻ったススノミは、青いガス火にかけた銅鍋へ集めた匂いをそっと注ぎます。木べらでゆっくり、ことこと、ことこと。',
      'すると鍋の中から、ふしぎな光がふわっと浮かびあがりました。星のように舞う湯気の中に映るのは、子どものころの食卓や、帰り道の夕焼け。',
      'それは、名前もないけれど確かに胸をあたためる「記憶の味」でした。',
    ],
    dishBadge: '星降る記憶のシチュー',
  },
  {
    id: 'ss_ep4',
    chapter: 4,
    timeLabel: '3:50 — 空のお皿',
    title: 'だれにも食べられない料理',
    requiredBookLevel: 4,
    requiredDishesServed: 13,
    quote: '「気づかなくて、それでもいい。それでも、残るもの」',
    body: [
      'けれど、その料理はだれにも食べられません。お皿によそわれた光の料理は、夜の空気にとけて、やがて見えなくなってしまいます。',
      '空のお皿を見つめるススノミの背中は、ほんの少しだけ寂しそう。それでも青い炎を絶やさず、次の夜もまた匂いを煮込みます。',
      '食べられなくても、そのあたたかさはちゃんと換気口の向こう側へ届いていくからです。',
    ],
    dishBadge: '見えない優しさの皿',
  },
  {
    id: 'ss_ep5',
    chapter: 5,
    timeLabel: '6:30 — 朝の光と微笑み',
    title: 'なんだか今日は、懐かしい気分だな',
    requiredBookLevel: 5,
    requiredDishesServed: 20,
    quote: '「今日もどこかで、誰かのためにススノミが笑う」',
    body: [
      '朝になり、窓を開けた部屋の住人がふとつぶやきました。「なんだか今日は、懐かしい気分だな」。',
      'その言葉を聞いた瞬間、壁の換気口の奥で、ススノミはくすりと小さく笑います。',
      '今夜も常世町のどこかで、だれかの心をそっとあたためるため、換気口の奥のランプがゆらゆら揺れています。',
    ],
    dishBadge: '朝焼けの記憶フルコース',
  },
];

export const POT_CAPACITY = 12;

export function getSusunomiUpgradeCost(
  def: SusunomiUpgradeDef,
  currentLevel: number
): { drops: number; stars: number } {
  const drops = Math.round(def.baseCostDrops * Math.pow(def.costScale, currentLevel));
  const stars =
    def.baseCostStars === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostStars * Math.pow(1.48, currentLevel));
  return { drops, stars };
}
