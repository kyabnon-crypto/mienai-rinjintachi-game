import {
  AshitayobiStoryEpisode,
  AshitayobiTrackDef,
  AshitayobiTrackId,
  AshitayobiUpgradeDef,
  DawnDeliveryOrderDef,
  DawnLightTokenDef,
  DawnLightTokenId,
  DawnWindowSpotDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.55;
export const PLAY_AREA_MIN_Z = -3.05;
export const PLAY_AREA_MAX_Z = 3.45;
export const SATCHEL_CAPACITY = 12;

export const DAWN_WINDOW_SPOTS: DawnWindowSpotDef[] = [
  {
    id: 0,
    theme: 'hospital',
    name: '病院の小さな男の子の窓辺',
    shortName: '病院の窓辺',
    tagLabel: '特別な朝焼けを届ける',
    x: 0.0,
    z: -2.08,
    rotY: 0,
    accentHex: 0xffa858,
    cssColor: '#ffbe78',
    completedLine: '「今日は、なんだかいい日になりそう！ 男の子の笑顔が空へ届いたよ」',
    morningsDelivered: 4,
  },
  {
    id: 1,
    theme: 'tearful',
    name: '泣きながら眠った人の窓辺',
    shortName: '泣いた夜の窓辺',
    tagLabel: 'やさしい桃色の朝を',
    x: -3.15,
    z: 0.58,
    rotY: 0.52,
    accentHex: 0xff98b8,
    cssColor: '#ffb6ce',
    completedLine: '「涙の跡の向こうに、やさしい桃色の朝焼けがそっと灯ったよ」',
    morningsDelivered: 3,
  },
  {
    id: 2,
    theme: 'stumbled',
    name: '失敗してしまった人の窓辺',
    shortName: '失敗した夜の窓辺',
    tagLabel: '勇気のオレンジ色を',
    x: 3.15,
    z: 0.58,
    rotY: -0.52,
    accentHex: 0xff8a46,
    cssColor: '#ffa66a',
    completedLine: '「今日は、なんだか頑張れそう。勇気の朝焼けが窓辺を包んだよ」',
    morningsDelivered: 3,
  },
  {
    id: 3,
    theme: 'lonely',
    name: 'さみしい夜を過ごした人の窓辺',
    shortName: 'さみしい夜の窓辺',
    tagLabel: 'もっと明るい金色を',
    x: 0.0,
    z: 2.28,
    rotY: Math.PI,
    accentHex: 0xffdc68,
    cssColor: '#ffe68c',
    completedLine: '「ひとりじゃないよ。金色のあたたかい朝が静かに部屋を満たしたよ」',
    morningsDelivered: 4,
  },
];

export const DAWN_TOKEN_LIST: DawnLightTokenDef[] = [
  {
    id: 'courageDawn',
    wordText: '勇気の朝焼け',
    name: '頑張った人へ届けるオレンジ色の勇気',
    shortName: '勇気の橙光',
    icon: '🧡',
    colorHex: 0xff9648,
    emissiveHex: 0xd95b18,
    cssColor: '#ffad6a',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'gentleDawn',
    wordText: 'やさしさの朝焼け',
    name: '泣いた人を包む桃色のやさしさ',
    shortName: '優しさの桃光',
    icon: '🌸',
    colorHex: 0xff9ec0,
    emissiveHex: 0xc84d78,
    cssColor: '#ffb6d0',
    baseValue: 21,
    feverGain: 6.5,
    weight: 26,
  },
  {
    id: 'smileDawn',
    wordText: '笑顔の朝焼け',
    name: '笑った人をもっと明るく照らす金色',
    shortName: '笑顔の金光',
    icon: '✨',
    colorHex: 0xffdc68,
    emissiveHex: 0xd4961a,
    cssColor: '#ffe892',
    baseValue: 23,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'wishDawn',
    wordText: '一番星のあけぼの',
    name: '夜と朝の境目にきらめく群青と茜の希望',
    shortName: 'あけぼの星光',
    icon: '🌠',
    colorHex: 0xaec8ff,
    emissiveHex: 0x5274d8,
    cssColor: '#c4d8ff',
    baseValue: 26,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'specialDawn',
    wordText: '特別な朝焼け',
    name: '朝焼け鞄の奥に大切にしまっていた奇跡の朝焼け',
    shortName: '特別な朝焼け',
    icon: '🌅',
    colorHex: 0xfff0c4,
    emissiveHex: 0xff8a3c,
    cssColor: '#fff2cc',
    baseValue: 68,
    feverGain: 15.0,
    weight: 6,
  },
];

export const DAWN_TOKEN_MAP: Record<DawnLightTokenId, DawnLightTokenDef> =
  DAWN_TOKEN_LIST.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<DawnLightTokenId, DawnLightTokenDef>
  );

export const DAWN_DELIVERY_ORDERS: DawnDeliveryOrderDef[] = [
  {
    id: 'hospital_boy_window',
    name: '病院の窓の向こうで眠る、小さな男の子へ',
    windowLabel: '病院の窓辺',
    whisperMessage: '「今日は、なんだかいい日になりそう！」男の子の笑顔に、空の上でアシタヨビもにっこり笑いました。',
    items: ['courageDawn', 'gentleDawn', 'smileDawn'],
    bonusGlow: 96,
    bonusBottles: 1,
  },
  {
    id: 'courage_for_hard_worker',
    name: '頑張った人へ届ける、勇気のオレンジ色',
    windowLabel: '勇気の配達便',
    whisperMessage: '「今日は、なんだか頑張れそう。」世界にひとつだけの勇気の色が窓辺に届きました。',
    items: ['courageDawn', 'wishDawn', 'courageDawn'],
    bonusGlow: 105,
    bonusBottles: 1,
  },
  {
    id: 'gentle_for_tearful_night',
    name: '泣きながら眠った人へ、やさしい桃色の朝',
    windowLabel: 'やさしさの配達便',
    whisperMessage: '「涙の跡の向こうに、小さな希望を灯すよ。大丈夫、新しい朝が来たからね。」',
    items: ['gentleDawn', 'smileDawn', 'gentleDawn'],
    bonusGlow: 116,
    bonusBottles: 1,
  },
  {
    id: 'bright_gold_for_smiles',
    name: 'また笑える日のための、もっと明るい金色',
    windowLabel: '笑顔の配達便',
    whisperMessage: '「明日は奇跡じゃなくても、少し笑えるように。」金色の光が部屋を明るく染めました。',
    items: ['smileDawn', 'courageDawn', 'smileDawn'],
    bonusGlow: 128,
    bonusBottles: 1,
  },
  {
    id: 'after_stumble_restart',
    name: '失敗してしまった夜の果てに描く新しい空',
    windowLabel: '再出発の配達便',
    whisperMessage: '「昨日の傷も消えない痛みも抱いたままで、また歩き出せる朝を届けよう。」',
    items: ['wishDawn', 'courageDawn', 'gentleDawn'],
    bonusGlow: 140,
    bonusBottles: 2,
  },
  {
    id: 'tomorrow_will_come',
    name: '「また頑張ろう」の気持ちと一緒に届く朝',
    windowLabel: '東門の特別便',
    whisperMessage: '「明日は希望そのものじゃなくても、希望を届けることはできるんだ。」',
    items: ['courageDawn', 'gentleDawn', 'wishDawn'],
    bonusGlow: 155,
    bonusBottles: 2,
  },
];

export const ASHITAYOBI_TRACKS: Record<AshitayobiTrackId, AshitayobiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'アシタヨビ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/ashitayobi_dreamy.mp3',
    bpm: 94.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    gloomRate: 0.16,
    windowDrainSpeed: 4.0,
    maxActiveTokens: 10,
    valueMultiplier: 1.0,
    unlockArchLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'アシタヨビ — Melodic Core Ver.',
    shortLabel: '🌅 通常版',
    url: './assets/audio/ashitayobi_normal.mp3',
    bpm: 98.0,
    durationSec: 62,
    spawnEveryBeats: 1.3,
    gloomRate: 0.22,
    windowDrainSpeed: 4.9,
    maxActiveTokens: 12,
    valueMultiplier: 1.45,
    unlockArchLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'アシタヨビ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/ashitayobi_instrumental.mp3',
    bpm: 100.0,
    durationSec: 62,
    spawnEveryBeats: 1.15,
    gloomRate: 0.27,
    windowDrainSpeed: 5.7,
    maxActiveTokens: 14,
    valueMultiplier: 1.9,
    unlockArchLevel: 2,
  },
};

export const ASHITAYOBI_UPGRADES: AshitayobiUpgradeDef[] = [
  {
    id: 'sortingBench',
    name: '中央の仕分け台と3色の朝焼け小瓶',
    propName: '3列36本の朝焼けガラス小瓶・封蝋付きの届け先封筒・日の出模様の丸ラグ',
    description: '朝焼けの光をすくう範囲と窓辺へ朝を届ける速度が広がり、集まる「朝焼けの光」が増えます。',
    maxLevel: 8,
    baseCostGlow: 55,
    baseCostBottles: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `配達範囲＆速度 +${(lv * 15).toFixed(0)}% / 朝焼けの光 ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'sunriseArch',
    name: '大アーチ窓と東門の発着バルコニー',
    propName: '東の空を望む大アーチ窓・鉄柵の発着バルコニー・天井の5色朝焼けランタン',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、「夜明けの特別配達」フィーバーを延ばします。',
    maxLevel: 5,
    baseCostGlow: 90,
    baseCostBottles: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / GOLDEN DAYBREAK ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'dawnSatchel',
    name: '太陽と雲の紋章の大きな朝焼け鞄',
    propName: '右奥の鞄掛けフック・太陽と雲の紋章入り革鞄・出発まえチェック表',
    description: '朝焼け鞄を空へ送り出したときの「あしたの小瓶」と便報酬が増え、獲得光倍率も上がります。',
    maxLevel: 6,
    baseCostGlow: 120,
    baseCostBottles: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `鞄の出発 +${1 + lv} あしたの小瓶 / 朝焼けの光 ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'dawnDrawers',
    name: '三色の朝焼け引き出し棚と木製はしご',
    propName: '「勇気の色」「やさしい色」「もっと明るい色」の119引き出し棚＆はしご',
    description: '「特別な朝焼け（DAWN DELIVERY）」のクールダウンを短縮し、朝焼け光波の範囲を広げます。',
    maxLevel: 6,
    baseCostGlow: 145,
    baseCostBottles: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `特別な朝焼け ${Math.max(1.6, 3.3 - lv * 0.24).toFixed(1)}秒 / 光波範囲 +${lv * 14}%`,
  },
  {
    id: 'mixingDesk',
    name: '朝焼けの調合台と真鍮の光天秤',
    propName: '光を量る真鍮天秤・6色ガラスパレット・光の粉のすり鉢・空のグラデーション見本',
    description: '眠れぬ夜霧を防ぐ「大丈夫のぬくもり」を授け、不在中も自動で朝焼けの光が蓄わります。',
    maxLevel: 5,
    baseCostGlow: 185,
    baseCostBottles: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `大丈夫のぬくもり ${lv}回 / 自動朝焼け光 +${lv * 4}/秒`,
  },
  {
    id: 'loadingLedger',
    name: '窓前の積み込み台と今日の届け先黒板',
    propName: '18通の封蝋封筒が並ぶ積み込み台・「今日の届け先」黒板・「朝焼けのいろ」案内板',
    description: 'レア「特別な朝焼け」出現率と全獲得の朝焼け光が大きく伸び、物語がひらきます。',
    maxLevel: 6,
    baseCostGlow: 220,
    baseCostBottles: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `特別な朝焼け率 +${(lv * 3.5).toFixed(1)}% / 全朝焼け光 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getAshitayobiUpgradeCost(
  def: AshitayobiUpgradeDef,
  currentLevel: number
): { glow: number; bottles: number } {
  const glow = Math.round(def.baseCostGlow * Math.pow(def.costScale, currentLevel));
  const bottles =
    def.baseCostBottles === 0
      ? 0
      : Math.round(def.baseCostBottles * Math.pow(1.5, currentLevel));
  return { glow, bottles };
}

export const ASHITAYOBI_STORIES: AshitayobiStoryEpisode[] = [
  {
    chapter: 1,
    title: '夜と朝のあいだ、静かに開く東門',
    subtitle: '朝はどうして来るのでしょう――常世町のもうひとつの理由',
    requiredLedgerLevel: 0,
    requiredMorningsDelivered: 0,
    body: [
      '朝は、どうして来るのでしょう。地球が回るから。それも、本当です。でも――常世町には、もうひとつ理由があります。',
      '夜と朝のあいだ。空がまだ、青くなる前。静かに、常世町の東門が開きます。',
      'そこから飛び出してくる小さな配達人。名前は――アシタヨビ。背中には大きな朝焼け鞄を背負い、今日も元気いっぱいです。',
    ],
  },
  {
    chapter: 2,
    title: '世界にひとつだけの、三色の朝焼け',
    subtitle: '勇気の色、やさしい色、もっと明るい色',
    requiredLedgerLevel: 1,
    requiredMorningsDelivered: 4,
    body: [
      'アシタヨビの背中の大きな朝焼け鞄には、オレンジ色、桃色、金色――いろいろな朝焼けが大切に入っています。',
      '朝焼けは、みんな同じではありません。頑張った人には、勇気の色。泣いた人には、やさしい色。笑った人には、もっと明るい色。',
      '東門の朝焼け配達所の引き出し棚や調合台で、ひとりひとり違う、世界にひとつだけの朝焼けを小瓶につめていくのです。',
    ],
  },
  {
    chapter: 3,
    title: '眠っている窓辺へ、そっと置く希望',
    subtitle: '「今日は、なんだか頑張れそう。」',
    requiredLedgerLevel: 2,
    requiredMorningsDelivered: 10,
    body: [
      'アシタヨビのお仕事は、「明日」を届けること。まだ眠っている町へ、静かに、やさしく希望を運びます。',
      '失敗してしまった人。泣きながら眠った人。さみしい夜を過ごした人。そんな人の窓辺へ、朝焼けの小瓶をそっと置いていきます。',
      'だから朝になると、「今日は、なんだか頑張れそう。」――そんな気持ちになる人がいるのです。',
    ],
  },
  {
    chapter: 4,
    title: '病院の窓の向こうと、特別な朝焼け',
    subtitle: '「今日は、なんだかいい日になりそう！」',
    requiredLedgerLevel: 3,
    requiredMorningsDelivered: 18,
    body: [
      'ある夜、アシタヨビは足を止めました。病院の窓の向こうで、小さな男の子が眠っています。「どんな朝を届けたらいいんだろう。」',
      'アシタヨビは朝焼け鞄を見つめ、ずっと大切にしまっていた「特別な朝焼け」を取り出しました。ふわりとオレンジ色の光が窓いっぱいに広がり、男の子の夢の中へやさしく届いていきました。',
      '次の日の朝。男の子は窓の外を見て言いました。「今日は、なんだかいい日になりそう！」その笑顔を見て、空の上でアシタヨビもにっこり笑いました。',
    ],
  },
  {
    chapter: 5,
    title: '誰かの「また頑張ろう」と一緒に届く朝',
    subtitle: '新しい朝は、あなたのところへもやってきます',
    requiredLedgerLevel: 4,
    requiredMorningsDelivered: 28,
    body: [
      '明日は、希望そのものではありません。でも――希望を届けることはできる。それが、アシタヨビのお仕事です。',
      '今日も夜と朝のあいだを飛びながら、アシタヨビは世界中へ朝を届けています。だから明日も、きっと大丈夫。新しい朝は、あなたのところへもやってきます。',
      '「朝は、空が運んでくるだけじゃない。誰かの“また頑張ろう”という気持ちも、一緒に届いている。」',
    ],
  },
];
