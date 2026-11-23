import {
  MomentTokenDef,
  MomentTokenId,
  PreservationOrderDef,
  TimeSpotDef,
  TomerunStoryEpisode,
  TomerunTrackDef,
  TomerunTrackId,
  TomerunUpgradeDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.6;
export const PLAY_AREA_MIN_Z = -3.0;
export const PLAY_AREA_MAX_Z = 3.5;
export const JAR_SHELF_CAPACITY = 12;

export const TIME_SPOTS: TimeSpotDef[] = [
  {
    id: 0,
    theme: 'dining',
    name: '終わってほしくない食卓',
    shortName: 'あたたかな食卓',
    tagLabel: 'おいしかったね',
    x: 0.0,
    z: -2.05,
    rotY: 0,
    accentHex: 0xffd280,
    cssColor: '#ffd98e',
    savedLine: '「スープの湯気も笑顔も、あと少しだけ、ここに残しておいたよ」',
    secondsAdded: 18,
  },
  {
    id: 1,
    theme: 'tonight',
    name: 'もう少しだけ一緒にいたい夜',
    shortName: '一緒にいたい夜',
    tagLabel: 'もう少し',
    x: -3.15,
    z: 0.65,
    rotY: 0.55,
    accentHex: 0xa6dcff,
    cssColor: '#b4e4ff',
    savedLine: '「楽しかった夜ほど早いから――時間のネジを、そっとゆるめたよ」',
    secondsAdded: 15,
  },
  {
    id: 2,
    theme: 'father',
    name: '帰りの遅い父の食卓',
    shortName: 'おかえりの食卓',
    tagLabel: 'おかえり',
    x: 3.15,
    z: 0.65,
    rotY: -0.55,
    accentHex: 0xffbc88,
    cssColor: '#ffc89a',
    savedLine: '「冷めかけの唐揚げも『おかえり』の声も、ぬくもりのまま守ったよ」',
    secondsAdded: 15,
  },
  {
    id: 3,
    theme: 'lastFamily',
    name: 'さいごの家族の時間',
    shortName: 'さいごの時間',
    tagLabel: 'おわらないで',
    x: 0.0,
    z: 2.3,
    rotY: Math.PI,
    accentHex: 0xffe4a8,
    cssColor: '#ffebb8',
    savedLine: '「あと3分だけ――この大切な時間が、優しく続きますように」',
    secondsAdded: 24,
  },
];

export const MOMENT_TOKEN_LIST: MomentTokenDef[] = [
  {
    id: 'soup',
    wordText: 'スープの湯気',
    name: 'あたたかなスープの湯気',
    shortName: 'スープ湯気',
    icon: '🍲',
    colorHex: 0xffce82,
    emissiveHex: 0xc97d28,
    cssColor: '#ffd796',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'laughter',
    wordText: '笑い声の余韻',
    name: '食卓の笑い声の余韻',
    shortName: '笑い声',
    icon: '✨',
    colorHex: 0xffe896,
    emissiveHex: 0xc99628,
    cssColor: '#fff0aa',
    baseValue: 20,
    feverGain: 6.5,
    weight: 26,
  },
  {
    id: 'karaage',
    wordText: '唐揚げのぬくもり',
    name: '少し冷めた唐揚げの灯り',
    shortName: '唐揚げ',
    icon: '🍽️',
    colorHex: 0xffb67e,
    emissiveHex: 0xc2622e,
    cssColor: '#ffc594',
    baseValue: 22,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'winterBreath',
    wordText: '冬の夜の吐息',
    name: '窓の外の冬の匂いと霜粒',
    shortName: '冬の霜粒',
    icon: '❄️',
    colorHex: 0x9edcff,
    emissiveHex: 0x3b84c2,
    cssColor: '#b0e4ff',
    baseValue: 25,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'goldenSand',
    wordText: '永遠のひと粒',
    name: '砂時計の黄金のひと粒',
    shortName: '黄金の砂',
    icon: '⏳',
    colorHex: 0xfff5c0,
    emissiveHex: 0xdea22a,
    cssColor: '#fff7cc',
    baseValue: 64,
    feverGain: 15.0,
    weight: 6,
  },
];

export const MOMENT_TOKEN_MAP: Record<MomentTokenId, MomentTokenDef> = MOMENT_TOKEN_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MomentTokenId, MomentTokenDef>
);

export const PRESERVATION_ORDERS: PreservationOrderDef[] = [
  {
    id: 'warm_table',
    name: '終わってほしくない食卓の湯気',
    shelfLabel: 'スープと笑顔の食卓',
    whisperMessage: '「湯気の向こうにある笑顔を、だれも忘れないように」',
    items: ['soup', 'laughter', 'soup'],
    bonusSands: 88,
    bonusJars: 1,
  },
  {
    id: 'stay_a_little',
    name: 'もう少しだけ一緒にいたい夜',
    shelfLabel: 'あと3分の願いごと',
    whisperMessage: '「もう少しだけ、このままでいて――そっと抱きしめるように」',
    items: ['laughter', 'winterBreath', 'laughter'],
    bonusSands: 96,
    bonusJars: 1,
  },
  {
    id: 'late_father',
    name: '帰りの遅い父の椅子と唐揚げ',
    shelfLabel: 'おかえりの食卓棚',
    whisperMessage: '「少し冷めた唐揚げにも、まだあたたかな魔法が残ってるよ」',
    items: ['karaage', 'soup', 'karaage'],
    bonusSands: 108,
    bonusJars: 1,
  },
  {
    id: 'winter_miracle',
    name: '窓の向こう、ありふれた奇跡の途中',
    shelfLabel: 'すりガラス窓の冬夜',
    whisperMessage: '「母が笑って、子どもが眠る。その一瞬の温度を消さないように」',
    items: ['winterBreath', 'soup', 'laughter'],
    bonusSands: 120,
    bonusJars: 1,
  },
  {
    id: 'before_goodbye',
    name: '最後の「おやすみ」のまえに',
    shelfLabel: 'さいごの家族の時間瓶',
    whisperMessage: '「さよならなんてまだ言わないで。思い出になるには早すぎるから」',
    items: ['soup', 'karaage', 'winterBreath'],
    bonusSands: 132,
    bonusJars: 2,
  },
  {
    id: 'precious_extra_night',
    name: '少しだけ伸びた、宝物の夜',
    shelfLabel: '冷蔵庫の奥の秘密の棚',
    whisperMessage: '「大丈夫。大切な時間は、ちゃんと守られてるよ。」',
    items: ['laughter', 'karaage', 'laughter'],
    bonusSands: 146,
    bonusJars: 2,
  },
];

export const TOMERUN_TRACKS: Record<TomerunTrackId, TomerunTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'トメルン — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/tomerun_dreamy.mp3',
    bpm: 68.0,
    durationSec: 62,
    spawnEveryBeats: 1.15,
    hurryRate: 0.16,
    spotDrainSpeed: 4.1,
    maxActiveTokens: 10,
    valueMultiplier: 1.0,
    unlockLanternLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'トメルン — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/tomerun_normal.mp3',
    bpm: 96.0,
    durationSec: 62,
    spawnEveryBeats: 1.35,
    hurryRate: 0.22,
    spotDrainSpeed: 5.1,
    maxActiveTokens: 12,
    valueMultiplier: 1.45,
    unlockLanternLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'トメルン — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/tomerun_instrumental.mp3',
    bpm: 128.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    hurryRate: 0.27,
    spotDrainSpeed: 6.0,
    maxActiveTokens: 14,
    valueMultiplier: 1.9,
    unlockLanternLevel: 2,
  },
};

export const TOMERUN_UPGRADES: TomerunUpgradeDef[] = [
  {
    id: 'hourglassValve',
    name: '大きな砂時計と真鍮のバルブ',
    propName: '中央丸机の大砂時計・真鍮の緩めバルブ・光る砂柱',
    description: '時間を保存する速度と引き寄せ範囲が広がり、獲得する「時の砂」が増えます。',
    maxLevel: 8,
    baseCostSands: 55,
    baseCostJars: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `保存速度＆範囲 +${(lv * 15).toFixed(0)}% / 時の砂 ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'timeLantern',
    name: '天井の時間ランタンと冷蔵庫の灯り',
    propName: '回る六角時間ランタン・開いた冷蔵庫の青白い光柱',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、黄金の棚時間（フィーバー）を延ばします。',
    maxLevel: 5,
    baseCostSands: 90,
    baseCostJars: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / ETERNAL SHELF ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'diningJars',
    name: '奥テーブルの「食卓のジオラマ瓶」',
    propName: 'ふたりの食卓・にぎやかな食卓・さいごの家族の時間の瓶',
    description: '秘密の棚へ瓶詰めしたときの「宝物の時間瓶」とオーダー報酬が増え、時の砂倍率も上がります。',
    maxLevel: 6,
    baseCostSands: 120,
    baseCostJars: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `棚へ瓶詰め +${1 + lv} 宝物の時間瓶 / 時の砂 ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'expiryTags',
    name: '賞味期限のタグ飾りと真鍮プレート',
    propName: '天井ワイヤーの願いタグ・奥壁ボード・「時間、すこし止めます。」看板',
    description: '「バルブ回し（TIME PAUSE）」のクールダウンを短縮し、時間停止の波紋範囲を広げます。',
    maxLevel: 6,
    baseCostSands: 145,
    baseCostJars: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `バルブ回し ${Math.max(1.6, 3.3 - lv * 0.24).toFixed(1)}秒 / 波紋範囲 +${lv * 14}%`,
  },
  {
    id: 'blueBlanket',
    name: '青いふわふわの毛布と卓上砂時計',
    propName: '手前左の青い毛布クッション・霜よけフリル・ミニ砂時計',
    description: '急ぎ足の秒針渦を防ぐ「毛布のぬくもり」を授け、不在中も自動で時の砂が蓄わります。',
    maxLevel: 5,
    baseCostSands: 185,
    baseCostJars: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `毛布のぬくもり ${lv}回 / 自動時の砂 +${lv * 4}/秒`,
  },
  {
    id: 'diaryDesk',
    name: '羽ペンとノートの机・霜の窓＆はしご',
    propName: '保存記録ノート・青いシェードランプ・すりガラス窓・白はしご',
    description: 'レア「永遠のひと粒」出現率と全獲得の時の砂が大きく伸び、時間保存日誌がひらきます。',
    maxLevel: 6,
    baseCostSands: 220,
    baseCostJars: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `永遠のひと粒率 +${(lv * 3.5).toFixed(1)}% / 全砂 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getTomerunUpgradeCost(
  def: TomerunUpgradeDef,
  currentLevel: number
): { sands: number; jars: number } {
  const sands = Math.round(def.baseCostSands * Math.pow(def.costScale, currentLevel));
  const jars =
    def.baseCostJars === 0
      ? 0
      : Math.round(def.baseCostJars * Math.pow(1.5, currentLevel));
  return { sands, jars };
}

export const TOMERUN_STORIES: TomerunStoryEpisode[] = [
  {
    chapter: 1,
    title: '夜の冷蔵庫の、もうひとつの棚',
    subtitle: '少しだけ開いた扉のすきまから、青白い灯りがもれていました',
    requiredDeskLevel: 0,
    requiredMomentsSaved: 0,
    body: [
      '夜の台所。ミントグリーンの冷蔵庫の扉が、ほんの少しだけ開いています。牛乳、卵、ジャム――いつもの棚のいちばん奥に、だれも知らない「もうひとつの棚」があるのです。',
      '青白く光る小さなアーチをくぐると、ひんやりした霜のついた秘密の時間保存室が広がっています。',
      'そこには、ふわふわの青い帽子とコートをまとった小さな時間保存士「トメルン」が住んでいます。「こんばんは。今日は、どんな時間かな。」',
    ],
  },
  {
    chapter: 2,
    title: '食べものにも、気持ちにもある賞味期限',
    subtitle: '“腐りそうな時間”を、ほんの少しだけ止めるお仕事',
    requiredDeskLevel: 1,
    requiredMomentsSaved: 4,
    body: [
      'トメルンのお仕事は、“腐りそうな時間”をほんの少しだけ止めること。食べものだけじゃありません。人の気持ちにも、賞味期限があるのです。',
      '賞味期限のラベルより先に消えてしまうもの。言葉になれなかった気持ちが、冷たい棚の奥のガラス瓶でやさしく光っています。',
      '棚には「もう少し」「あと3分」「ありがとう」「おいしかったね」と小さなタグが結ばれ、天井から下がる時間ランタンが黄金色にゆっくり回っています。',
    ],
  },
  {
    chapter: 3,
    title: '終わってほしくない食卓と、一緒にいたい夜',
    subtitle: '湯気の向こうにある笑顔を、だれかが忘れないように',
    requiredDeskLevel: 2,
    requiredMomentsSaved: 10,
    body: [
      'たとえば――「もう少しだけ一緒にいたい夜」。楽しかった時間ほど、終わるのが早いから。',
      'たとえば――「終わってほしくない食卓」。あたたかなスープの湯気、帰りの遅い父の椅子と少し冷めた唐揚げ、笑い声の余韻。',
      'たとえば――「さいごの家族の時間」。言葉にできない気持ちが部屋いっぱいに広がる夜、トメルンは小さな手で真鍮のバルブをそっと回します。',
    ],
  },
  {
    chapter: 4,
    title: 'カチ、コチ、カチ… あと少しだけ',
    subtitle: '時間のネジをゆるめて、砂時計の砂をそっと留める',
    requiredDeskLevel: 3,
    requiredMomentsSaved: 18,
    body: [
      '「あと少しだけ。この時間が、続きますように。」――トメルンが時間ランタンを回すと、カチ、コチ、カチ… と時間が少しだけゆっくり流れはじめます。',
      '中央の丸机に乗った大きな砂時計の砂も、まるで宙に浮いたみたいに、ゆっくり、ゆっくり落ちていきます。',
      '「終わってほしくない」その想いだけで、時間は少しだけ延びて、奥のテーブルの「食卓の瓶」に湯気のまま大切に閉じ込められるのです。',
    ],
  },
  {
    chapter: 5,
    title: 'そろそろ、すすめようか',
    subtitle: '少しだけ伸びた時間は、かけがえのない宝物になる',
    requiredDeskLevel: 4,
    requiredMomentsSaved: 28,
    body: [
      'でも、トメルンが止められる時間はほんの少しだけ。永遠じゃない。窓の外が少し明るくなり、時間はまた動き出します。',
      '「そろそろ、すすめようか。」――トメルンはそっとバルブを戻します。だからこそ、少しだけ伸びた夜は宝物になり、「ちゃんと一緒に笑えた」記憶が心をあたため続けるのです。',
      'もし夜に、冷蔵庫の灯りが少しだけやさしく見えたなら――それはきっと、トメルンがあなたの大切な時間を守っているからです。',
    ],
  },
];
