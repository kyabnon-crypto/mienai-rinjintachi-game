import {
  ConstellationOrderDef,
  HoshihakobiStoryEpisode,
  HoshihakobiTrackDef,
  HoshihakobiTrackId,
  HoshihakobiUpgradeDef,
  StarSpotDef,
  WishStarTokenDef,
  WishStarTokenId,
} from './types';

export const PLAY_AREA_HALF_X = 4.6;
export const PLAY_AREA_MIN_Z = -3.0;
export const PLAY_AREA_MAX_Z = 3.5;
export const STAR_CRATE_CAPACITY = 12;

export const STAR_SPOTS: StarSpotDef[] = [
  {
    id: 0,
    theme: 'shooting',
    name: '流れ星が見える夜',
    shortName: '流れ星の空',
    tagLabel: 'わあ！流れ星！',
    x: 0.0,
    z: -2.05,
    rotY: 0,
    accentHex: 0xffe28a,
    cssColor: '#ffe79c',
    completedLine: '「悲しい夜に流れ星が見えるように、そっと空を撫でたよ」',
    starsAligned: 3,
  },
  {
    id: 1,
    theme: 'wish',
    name: '願いが叶う夜',
    shortName: '願いが叶う空',
    tagLabel: '願いが届くよ',
    x: -3.15,
    z: 0.65,
    rotY: 0.55,
    accentHex: 0xaed8ff,
    cssColor: '#bce2ff',
    completedLine: '「どんなに小さな願いも、ちゃんと空へ運んでおいたよ」',
    starsAligned: 4,
  },
  {
    id: 2,
    theme: 'timing',
    name: 'タイミングが重なる夜',
    shortName: '重なる時の空',
    tagLabel: '時計が動き出す',
    x: 3.15,
    z: 0.65,
    rotY: -0.55,
    accentHex: 0xffc69e,
    cssColor: '#ffd2b2',
    completedLine: '「偶然みたいに見えるけど、ほんの少し星座を動かしたんだ」',
    starsAligned: 3,
  },
  {
    id: 3,
    theme: 'reunion',
    name: '誰かと会える夜',
    shortName: '再会の星空',
    tagLabel: 'もうすぐ届くよ',
    x: 0.0,
    z: 2.3,
    rotY: Math.PI,
    accentHex: 0xbef5d8,
    cssColor: '#ccfae2',
    completedLine: '「寂しい夜に離れた心が出会えるよう、光の糸を結んだよ」',
    starsAligned: 5,
  },
];

export const WISH_STAR_TOKEN_LIST: WishStarTokenDef[] = [
  {
    id: 'wishStar',
    wordText: 'ねがい星',
    name: '遠くで眠る小さな願い星',
    shortName: 'ねがい星',
    icon: '⭐',
    colorHex: 0xffe184,
    emissiveHex: 0xd99b26,
    cssColor: '#ffe89c',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'shootingTail',
    wordText: 'ながれ星の尾',
    name: '悲しい夜を照らす流れ星',
    shortName: 'ながれ星',
    icon: '🌠',
    colorHex: 0xaad8ff,
    emissiveHex: 0x3f7ed6,
    cssColor: '#bde4ff',
    baseValue: 21,
    feverGain: 6.5,
    weight: 26,
  },
  {
    id: 'timingGear',
    wordText: '重なる時の星',
    name: '止まった時計を動かす星',
    shortName: '時の星',
    icon: '🕰️',
    colorHex: 0xffc49c,
    emissiveHex: 0xc96c38,
    cssColor: '#ffd2b4',
    baseValue: 23,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'reunionGlow',
    wordText: '再会のあかり',
    name: '言えなかった言葉を繋ぐ星',
    shortName: '再会星',
    icon: '✨',
    colorHex: 0xbaf6d6,
    emissiveHex: 0x3da878,
    cssColor: '#ccfbe2',
    baseValue: 26,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'milkyWayStar',
    wordText: '天の川の極星',
    name: '奇跡の星座を結ぶ黄金極星',
    shortName: '天の川極星',
    icon: '🌟',
    colorHex: 0xfff8cc,
    emissiveHex: 0xe6ae2e,
    cssColor: '#fffad6',
    baseValue: 66,
    feverGain: 15.0,
    weight: 6,
  },
];

export const WISH_STAR_TOKEN_MAP: Record<WishStarTokenId, WishStarTokenDef> =
  WISH_STAR_TOKEN_LIST.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<WishStarTokenId, WishStarTokenDef>
  );

export const CONSTELLATION_ORDERS: ConstellationOrderDef[] = [
  {
    id: 'sad_night_meteor',
    name: '悲しい夜に落ちる、ひとすじの流れ星',
    skyLabel: 'ながれ星ライン',
    whisperMessage: '「泣きそうな帰り道――見上げた空で、流れ星がそっと笑うよ」',
    items: ['wishStar', 'shootingTail', 'wishStar'],
    bonusStardust: 90,
    bonusMiracles: 1,
  },
  {
    id: 'unspoken_sorry',
    name: '言えなかった「ごめんね」の星座',
    skyLabel: 'ことばの星座',
    whisperMessage: '「届かないと思っていた言葉の欠片も、空はちゃんと覚えてる」',
    items: ['shootingTail', 'reunionGlow', 'wishStar'],
    bonusStardust: 100,
    bonusMiracles: 1,
  },
  {
    id: 'clock_moves_again',
    name: '止まっていた時計が、また動き出す夜',
    skyLabel: '重なる時の星図',
    whisperMessage: '「タイミングが重なる夜、ほんの少しだけ星座が動いたんだ」',
    items: ['timingGear', 'wishStar', 'timingGear'],
    bonusStardust: 112,
    bonusMiracles: 1,
  },
  {
    id: 'chance_reunion',
    name: '会えないはずの人に会える、偶然の星座',
    skyLabel: '再会の星空',
    whisperMessage: '「寂しい夜には誰かと会えるように、星を並べておいたよ」',
    items: ['reunionGlow', 'timingGear', 'reunionGlow'],
    bonusStardust: 124,
    bonusMiracles: 1,
  },
  {
    id: 'fading_dream',
    name: '消えそうな夢の続きを照らす星図',
    skyLabel: 'あしたの星図',
    whisperMessage: '「君の願いは、ちゃんと見てるよ。だから、あきらめないで」',
    items: ['wishStar', 'timingGear', 'shootingTail'],
    bonusStardust: 136,
    bonusMiracles: 2,
  },
  {
    id: 'not_by_chance',
    name: '偶然じゃない未来へつづく、天の川の道',
    skyLabel: '奇跡の天の川',
    whisperMessage: '「だいじょうぶ。願いは、ちゃんと空へ届くよ。」',
    items: ['shootingTail', 'reunionGlow', 'timingGear'],
    bonusStardust: 150,
    bonusMiracles: 2,
  },
];

export const HOSHIHAKOBI_TRACKS: Record<HoshihakobiTrackId, HoshihakobiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ホシハコビ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/hoshihakobi_dreamy.mp3',
    bpm: 91.0,
    durationSec: 62,
    spawnEveryBeats: 1.55,
    cloudRate: 0.16,
    spotDrainSpeed: 4.1,
    maxActiveTokens: 10,
    valueMultiplier: 1.0,
    unlockSkylightLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ホシハコビ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/hoshihakobi_normal.mp3',
    bpm: 94.0,
    durationSec: 62,
    spawnEveryBeats: 1.38,
    cloudRate: 0.22,
    spotDrainSpeed: 5.0,
    maxActiveTokens: 12,
    valueMultiplier: 1.45,
    unlockSkylightLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ホシハコビ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/hoshihakobi_instrumental.mp3',
    bpm: 136.0,
    durationSec: 62,
    spawnEveryBeats: 1.65,
    cloudRate: 0.27,
    spotDrainSpeed: 5.9,
    maxActiveTokens: 14,
    valueMultiplier: 1.9,
    unlockSkylightLevel: 2,
  },
};

export const HOSHIHAKOBI_UPGRADES: HoshihakobiUpgradeDef[] = [
  {
    id: 'starWorkbench',
    name: '星のならべかえ台と星明かりの杖',
    propName: '中央の丸作業台・黄金の星図盤・真鍮の虫めがねとピンセット',
    description: '星座を並べ替える速度と星の引き寄せ範囲が広がり、集まる「星くず」が増えます。',
    maxLevel: 8,
    baseCostStardust: 55,
    baseCostMiracles: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `並べ替え速度＆範囲 +${(lv * 15).toFixed(0)}% / 星くず ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'skylightLantern',
    name: '天窓の月明かりと吊りランタン',
    propName: '夜空へひらく天窓・六角真鍮ランタン・ゆっくり回る星のモビール',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、満天の奇跡時間（フィーバー）を延ばします。',
    maxLevel: 5,
    baseCostStardust: 90,
    baseCostMiracles: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / STARLIGHT MIRACLE ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'starCrateBackpack',
    name: '星を背負う木箱と仕分け木箱',
    propName: '壁掛けの背負い木箱・「ながれ星・ねがい星」木箱・今夜の星ボード',
    description: '星の箱を空へ放ったときの「奇跡の流星」とオーダー報酬が増え、星くず倍率も上がります。',
    maxLevel: 6,
    baseCostStardust: 120,
    baseCostMiracles: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `空へ放つ +${1 + lv} 奇跡の流星 / 星くず ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'constellationMap',
    name: '奥壁の大きな星図と真鍮望遠鏡',
    propName: '「ほしのちず」額装・願いごと付箋・丸窓をのぞく真鍮望遠鏡',
    description: '「星の並べ替え（STAR SHIFT）」のクールダウンを短縮し、星明かりの波紋範囲を広げます。',
    maxLevel: 6,
    baseCostStardust: 145,
    baseCostMiracles: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `星の並べ替え ${Math.max(1.6, 3.3 - lv * 0.24).toFixed(1)}秒 / 波紋範囲 +${lv * 14}%`,
  },
  {
    id: 'fluffyBed',
    name: '斜め天井の下のふかふかベッド',
    propName: 'パッチワーク毛布のベッド・枕元の星ナイトライト・星の瓶棚',
    description: '星曇りの雲を防ぐ「星守りのやすらぎ」を授け、不在中も自動で星くずが蓄わります。',
    maxLevel: 5,
    baseCostStardust: 185,
    baseCostMiracles: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `星守りのやすらぎ ${lv}回 / 自動星くず +${lv * 4}/秒`,
  },
  {
    id: 'starLogDesk',
    name: '星の記録帳の机と羽ペン',
    propName: '星運び記録帳・インク壺と羽ペン・シェードランプ・壁の星瓶棚',
    description: 'レア「天の川の極星」出現率と全獲得の星くずが大きく伸び、星運びの記録帳がひらきます。',
    maxLevel: 6,
    baseCostStardust: 220,
    baseCostMiracles: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `天の川極星率 +${(lv * 3.5).toFixed(1)}% / 全星くず ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getHoshihakobiUpgradeCost(
  def: HoshihakobiUpgradeDef,
  currentLevel: number
): { stardust: number; miracles: number } {
  const stardust = Math.round(def.baseCostStardust * Math.pow(def.costScale, currentLevel));
  const miracles =
    def.baseCostMiracles === 0
      ? 0
      : Math.round(def.baseCostMiracles * Math.pow(1.5, currentLevel));
  return { stardust, miracles };
}

export const HOSHIHAKOBI_STORIES: HoshihakobiStoryEpisode[] = [
  {
    chapter: 1,
    title: '夜の屋根の上を、とことこ歩く光',
    subtitle: '小さな星の箱を背負って、毎晩、空を旅しています',
    requiredDeskLevel: 0,
    requiredMiraclesSent: 0,
    body: [
      '夜になると、眠った町の屋根の上を――とことこ、とことこ。街灯より淡く優しい光が歩いています。',
      'その子の名前は「ホシハコビ」。青い星模様の帽子とコートをまとい、小さな星の入った木箱を背負って、毎晩、屋根から屋根へと旅をしているのです。',
      '屋根のむこうの小さな出入り口をくぐると、斜めの天井に天窓がひらく「星の仕分け工房」があり、丸い作業台やたくさんの星の瓶が静かに輝いています。',
    ],
  },
  {
    chapter: 2,
    title: 'ほんの少しだけ、星の場所を動かすお仕事',
    subtitle: '「あの子の願いが、ちゃんと届きますように。」',
    requiredDeskLevel: 1,
    requiredMiraclesSent: 4,
    body: [
      'ホシハコビのお仕事は、星を運ぶこと。でも、ただ運ぶだけではありません。星明かりの杖を使って、ほんの少しだけ――星の場所を動かしているのです。',
      '悲しい夜には、見上げた空に流れ星が見えるように。寂しい夜には、会えないはずの誰かと出会えるように。',
      '「もうすぐ、届くよ。」ホシハコビは空を見上げながらつぶやき、今夜も星のかけらをひとつずつ丁寧に並べ替えます。',
    ],
  },
  {
    chapter: 3,
    title: '流れ星と、叶った願いと、動き出す時計',
    subtitle: 'たった一秒の奇跡でも、誰かの未来を変えるから',
    requiredDeskLevel: 2,
    requiredMiraclesSent: 10,
    body: [
      'だから、ときどき――「わあ！ 流れ星！」そんな奇跡が、泣きそうな帰り道に起こります。',
      'だから、ときどき――「願いが叶った！」そんな日が、消えそうな夢の続きにやってきます。',
      'だから、ときどき――「こんな偶然、あるんだ。」止まっていた時計の針が、タイミングの重なる夜に静かにまた動き出すこともあるのです。',
    ],
  },
  {
    chapter: 4,
    title: 'むかし、星に名前を与えた夜空の地図',
    subtitle: '「君の願いは、ちゃんと見てるよ。だから、あきらめないで。」',
    requiredDeskLevel: 3,
    requiredMiraclesSent: 18,
    body: [
      'むかし、夜空がまだ寂しくて星たちが迷っていたとき、ホシハコビがひとつひとつの星に名前を与え、夜空の地図「ほしのちず」をつくったと言われています。',
      '工房の奥の壁にはその大きな星図がかかり、「ねがい」「あした」「げんき」「ありがとう」と書かれた小さなメモが貼られています。',
      '争いの気配や曇ってしまった星をそっと晴らしながら、ホシハコビは誰も見ていない屋根の上で、誰かの小さな願いを聞き続けています。',
    ],
  },
  {
    chapter: 5,
    title: 'それは、空の偶然ではないのです',
    subtitle: '夜空を見上げたとき、もし流れ星を見つけたら――',
    requiredDeskLevel: 4,
    requiredMiraclesSent: 28,
    body: [
      'けれど、ホシハコビを見た人はほとんどいません。みんなが眠っているころ、静かな屋根の上を歩いているからです。',
      '今夜もホシハコビは、小さな星を手に取ります。きらり。その光は、誰かの明日へと続いていました。「だいじょうぶ。願いは、ちゃんと空へ届くよ。」',
      '夜空を見上げたとき、もし流れ星を見つけたら――それはきっと、ホシハコビが近くにいるしるし。それは、空の偶然ではないのです。',
    ],
  },
];
