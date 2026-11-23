import {
  DreamLightTokenDef,
  DreamLightTokenId,
  DreamPedestalDef,
  DreamReturnOrderDef,
  YumeatsumeStoryEpisode,
  YumeatsumeTrackDef,
  YumeatsumeTrackId,
  YumeatsumeUpgradeDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.55;
export const PLAY_AREA_MIN_Z = -3.05;
export const PLAY_AREA_MAX_Z = 3.45;
export const SATCHEL_CAPACITY = 12;

export const DREAM_PEDESTALS: DreamPedestalDef[] = [
  {
    id: 0,
    theme: 'music',
    name: '二十年前の音楽の夢',
    shortName: '音楽の夢',
    tagLabel: 'おかえり、ギター！',
    x: 0.0,
    z: -2.08,
    rotY: 0,
    accentHex: 0xffd88a,
    cssColor: '#ffe09c',
    completedLine: '「二十年前のメロディが、指先で静かに目を覚ましたよ」',
    dreamsAwakened: 3,
  },
  {
    id: 1,
    theme: 'patissier',
    name: 'パティシエになりたかった夢',
    shortName: 'パティシエの夢',
    tagLabel: '甘い夢が目を覚ます',
    x: -3.15,
    z: 0.58,
    rotY: 0.52,
    accentHex: 0xffb8d0,
    cssColor: '#ffc6da',
    completedLine: '「甘い香りの小さな夢、まだ賞味期限なんて切れてないよ」',
    dreamsAwakened: 3,
  },
  {
    id: 2,
    theme: 'astronaut',
    name: '宇宙飛行士になりたかった夢',
    shortName: '宇宙飛行士の夢',
    tagLabel: '星空へ飛び立つよ',
    x: 3.15,
    z: 0.58,
    rotY: -0.52,
    accentHex: 0xb8d4ff,
    cssColor: '#c8dfff',
    completedLine: '「宇宙を見上げた幼い瞳の光、いつでもここから始められるよ」',
    dreamsAwakened: 4,
  },
  {
    id: 3,
    theme: 'painter',
    name: '絵描きになりたかった夢',
    shortName: '絵描きの夢',
    tagLabel: '描きかけの続きへ',
    x: 0.0,
    z: 2.28,
    rotY: Math.PI,
    accentHex: 0x9fe8d4,
    cssColor: '#b4f5e2',
    completedLine: '「描きかけのキャンバスも、消えてなんかいないんだ」',
    dreamsAwakened: 4,
  },
];

export const DREAM_TOKEN_LIST: DreamLightTokenDef[] = [
  {
    id: 'cakeDream',
    wordText: '甘い夢の光',
    name: 'パティシエになりたかった日々',
    shortName: 'パティシエ光',
    icon: '🍰',
    colorHex: 0xffb8d0,
    emissiveHex: 0xd4628c,
    cssColor: '#ffc8dc',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'astroDream',
    wordText: '星見の夢の光',
    name: '宇宙を見上げた幼い瞳',
    shortName: '宇宙の夢光',
    icon: '🚀',
    colorHex: 0xb6d2ff,
    emissiveHex: 0x4876cc,
    cssColor: '#c8dfff',
    baseValue: 21,
    feverGain: 6.5,
    weight: 26,
  },
  {
    id: 'painterDream',
    wordText: '彩りの夢の光',
    name: '描きかけのキャンバスの光',
    shortName: '絵描きの夢光',
    icon: '🎨',
    colorHex: 0x9de8d4,
    emissiveHex: 0x2f9c82,
    cssColor: '#b2f4e2',
    baseValue: 23,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'musicDream',
    wordText: '音色の夢の光',
    name: '二十年前のギターのメロディ',
    shortName: '音楽の夢光',
    icon: '🎸',
    colorHex: 0xffd98a,
    emissiveHex: 0xd48d24,
    cssColor: '#ffe3a4',
    baseValue: 26,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'cottonDream',
    wordText: '綿菓子のきせき夢',
    name: '賞味期限のないふわふわ奇跡の夢',
    shortName: '綿菓子きせき',
    icon: '🍭',
    colorHex: 0xfff0d4,
    emissiveHex: 0xf29ab8,
    cssColor: '#fff2db',
    baseValue: 66,
    feverGain: 15.0,
    weight: 6,
  },
];

export const DREAM_TOKEN_MAP: Record<DreamLightTokenId, DreamLightTokenDef> =
  DREAM_TOKEN_LIST.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<DreamLightTokenId, DreamLightTokenDef>
  );

export const DREAM_RETURN_ORDERS: DreamReturnOrderDef[] = [
  {
    id: 'twenty_year_guitar',
    name: '二十年前の古いギターの夢、おかえり',
    vaultLabel: '音楽の保管瓶',
    whisperMessage: '「二十年前のメロディが、指先で静かに目を覚ますよ。おかえり。」',
    items: ['musicDream', 'cakeDream', 'musicDream'],
    bonusDrops: 92,
    bonusJars: 1,
  },
  {
    id: 'patissier_days',
    name: 'パティシエになりたかった甘い日々',
    vaultLabel: 'お菓子の保管瓶',
    whisperMessage: '「甘い夢の香りは、ガラス瓶の中でずっと待っていたんだ」',
    items: ['cakeDream', 'painterDream', 'cakeDream'],
    bonusDrops: 102,
    bonusJars: 1,
  },
  {
    id: 'young_astronaut',
    name: '宇宙を見上げた幼い瞳のきらめき',
    vaultLabel: '星空の保管瓶',
    whisperMessage: '「遅すぎるなんて、誰も決められない。また空を見上げよう」',
    items: ['astroDream', 'cakeDream', 'astroDream'],
    bonusDrops: 114,
    bonusJars: 1,
  },
  {
    id: 'unfinished_canvas',
    name: '描きかけのキャンバスの、その続き',
    vaultLabel: '彩りの保管瓶',
    whisperMessage: '「描きかけのキャンバスも、まだ消えてなんかいないよ」',
    items: ['painterDream', 'astroDream', 'painterDream'],
    bonusDrops: 126,
    bonusJars: 1,
  },
  {
    id: 'detour_to_future',
    name: '遠回りした時間さえ、未来へ続く道',
    vaultLabel: '道しるべの瓶',
    whisperMessage: '「涙の数だけ遠回りしても、願いはまだここで生きているよ」',
    items: ['musicDream', 'astroDream', 'painterDream'],
    bonusDrops: 138,
    bonusJars: 2,
  },
  {
    id: 'no_expiration_dream',
    name: '夢には、賞味期限なんてない',
    vaultLabel: '永遠の保管瓶',
    whisperMessage: '「持ち主が迎えに来る日まで、ここで静かに待っているだけなんだ。」',
    items: ['cakeDream', 'musicDream', 'astroDream'],
    bonusDrops: 152,
    bonusJars: 2,
  },
];

export const YUMEATSUME_TRACKS: Record<YumeatsumeTrackId, YumeatsumeTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ユメアツメ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/yumeatsume_dreamy.mp3',
    bpm: 93.0,
    durationSec: 62,
    spawnEveryBeats: 1.52,
    mistRate: 0.16,
    pedestalDrainSpeed: 4.0,
    maxActiveTokens: 10,
    valueMultiplier: 1.0,
    unlockDomeLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ユメアツメ — Melodic Core Ver.',
    shortLabel: '🎸 通常版',
    url: './assets/audio/yumeatsume_normal.mp3',
    bpm: 97.0,
    durationSec: 62,
    spawnEveryBeats: 1.32,
    mistRate: 0.22,
    pedestalDrainSpeed: 4.9,
    maxActiveTokens: 12,
    valueMultiplier: 1.45,
    unlockDomeLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ユメアツメ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/yumeatsume_instrumental.mp3',
    bpm: 98.0,
    durationSec: 62,
    spawnEveryBeats: 1.16,
    mistRate: 0.27,
    pedestalDrainSpeed: 5.7,
    maxActiveTokens: 14,
    valueMultiplier: 1.9,
    unlockDomeLevel: 2,
  },
};

export const YUMEATSUME_UPGRADES: YumeatsumeUpgradeDef[] = [
  {
    id: 'bottlingBench',
    name: '夢の瓶詰め作業台と真鍮漏斗',
    propName: '左奥の木製作業台・真鍮の漏斗・コルク栓皿・見本の夢ガラス瓶',
    description: '夢の光をすくう範囲と瓶を目覚めさせる速度が広がり、集まる「夢のしずく」が増えます。',
    maxLevel: 8,
    baseCostDrops: 55,
    baseCostJars: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `目覚め速度＆範囲 +${(lv * 15).toFixed(0)}% / 夢のしずく ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'glassDome',
    name: 'ガラス温室の天蓋と夢の光オーブ',
    propName: '鉄骨ガラス屋根・天井から吊るされた6色の夢オーブ・温室の灯り',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、「賞味期限のない夜」フィーバーを延ばします。',
    maxLevel: 5,
    baseCostDrops: 90,
    baseCostJars: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / NO EXPIRATION ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'dreamSatchel',
    name: '夢の瓶を入れる革鞄と保管棚',
    propName: '星チャーム付きの革鞄・壁一面の4色夢ガラス瓶棚・金の台座飾り',
    description: '鞄の夢を送り出したときの「おかえりの瓶」とオーダー報酬が増え、夢のしずく倍率も上がります。',
    maxLevel: 6,
    baseCostDrops: 120,
    baseCostJars: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `鞄の送り出し +${1 + lv} おかえりの瓶 / 夢のしずく ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'slidingLadder',
    name: '高い棚の移動はしごとガラス瓶標本',
    propName: '鉄レール付き移動はしご・ギター／ケーキ／宇宙服／絵筆の標本瓶',
    description: '「おかえり（LID OPEN）」のクールダウンを短縮し、目覚めの光波範囲を広げます。',
    maxLevel: 6,
    baseCostDrops: 145,
    baseCostJars: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `ふた開け ${Math.max(1.6, 3.3 - lv * 0.24).toFixed(1)}秒 / 光波範囲 +${lv * 14}%`,
  },
  {
    id: 'cottonCandyNook',
    name: 'ふわふわ綿菓子と温室のつる草鉢',
    propName: 'ユメアツメ好物のピンク綿菓子・テラコッタ鉢植え・吊りつる草',
    description: 'ため息の霧を防ぐ「綿菓子のやすらぎ」を授け、不在中も自動で夢のしずくが蓄わります。',
    maxLevel: 5,
    baseCostDrops: 185,
    baseCostJars: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `綿菓子のやすらぎ ${lv}回 / 自動夢のしずく +${lv * 4}/秒`,
  },
  {
    id: 'receiptDesk',
    name: '受け取りのノートと羽ペン机',
    propName: '深緑表紙の受け取りノート・インク壺と羽ペン・真鍮ランプ・荷札',
    description: 'レア「綿菓子のきせき夢」出現率と全獲得の夢のしずくが大きく伸び、物語がひらきます。',
    maxLevel: 6,
    baseCostDrops: 220,
    baseCostJars: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `綿菓子きせき率 +${(lv * 3.5).toFixed(1)}% / 全しずく ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getYumeatsumeUpgradeCost(
  def: YumeatsumeUpgradeDef,
  currentLevel: number
): { drops: number; jars: number } {
  const drops = Math.round(def.baseCostDrops * Math.pow(def.costScale, currentLevel));
  const jars =
    def.baseCostJars === 0
      ? 0
      : Math.round(def.baseCostJars * Math.pow(1.5, currentLevel));
  return { drops, jars };
}

export const YUMEATSUME_STORIES: YumeatsumeStoryEpisode[] = [
  {
    chapter: 1,
    title: '常世町の西の丘に灯る、ガラスの温室',
    subtitle: '人が諦めてしまった夢は、どこへ行くのでしょう',
    requiredDeskLevel: 0,
    requiredDreamsReturned: 0,
    body: [
      '人が諦めてしまった夢は、どこへ行くのでしょう。実はその夢は、消えてしまうわけではありません。',
      '常世町の西の丘には、大きな温室のような建物があります。その名前は――「夢の保管庫」。',
      '高い天井まで続く棚には、たくさんのガラス瓶が並び、瓶の中では小さな夢の光がきらきらと静かに眠っています。',
    ],
  },
  {
    chapter: 2,
    title: '夢の保管係、ユメアツメの夜歩き',
    subtitle: '「夢には、賞味期限なんてない。」',
    requiredDeskLevel: 1,
    requiredDreamsReturned: 4,
    body: [
      'その保管庫で働いているのが、夢の保管係「ユメアツメ」です。夢には賞味期限がないと、誰よりも信じています。',
      '夜になると、ユメアツメは夢の瓶を入れる革鞄を肩にかけ、誰にも気づかれないように静かな町へ出かけます。',
      '人が「もう無理だよ」とつぶやいて夢を諦めたとき、胸の奥からふわりとこぼれる小さな光をやさしく拾い上げ、ガラス瓶へ入れて持ち帰るのです。',
    ],
  },
  {
    chapter: 3,
    title: '棚の中で眠る、たくさんの憧れ',
    subtitle: 'パティシエ、宇宙飛行士、絵描き――どれも消えていない',
    requiredDeskLevel: 2,
    requiredDreamsReturned: 10,
    body: [
      '保管庫のガラス瓶の中には、パティシエになりたかった夢。宇宙飛行士になりたかった夢。絵描きになりたかった夢。たくさんの夢が静かに息をしています。',
      '作業台で拾った光を瓶へうつし、受け取りのノートに羽ペンで記したら、移動はしごを使っていちばん似合う棚へ大切に並べておくのです。',
      'ときどきピンクの綿菓子をほおばりながら、ユメアツメは瓶の光たちをやさしく見守っています。',
    ],
  },
  {
    chapter: 4,
    title: '二十年前の古いギターと、「おかえり」の声',
    subtitle: 'その瞬間、保管庫の瓶がぱっと明るく光った',
    requiredDeskLevel: 3,
    requiredDreamsReturned: 18,
    body: [
      'ある夜。四十代の男性が、長いあいだしまっていた古いギターを手に取りました。それは、二十年前に諦めた音楽の夢でした。',
      'その瞬間。夢の保管庫の真ん中の台座に置かれた瓶が、ぱっとまぶしく光り出したのです。',
      'ユメアツメは微笑み、「おかえり」と言って、そっと瓶のふたを開けました。あふれる光はガラス屋根を抜けて、夜空へ舞い上がっていきました。',
    ],
  },
  {
    chapter: 5,
    title: '忘れていた夢は、また歩き始める',
    subtitle: '持ち主が迎えに来る日まで、静かに待っているだけ',
    requiredDeskLevel: 4,
    requiredDreamsReturned: 28,
    body: [
      '翌朝。男性は理由もわからないまま、自然と楽器店へ向かって歩いていました。忘れていた夢が、もう一度歩き始めたのです。',
      '今日もどこかで、誰かが夢を諦め、誰かが夢を思い出します。ユメアツメは小さな光を抱きしめながら、静かに微笑みます。',
      '「夢には、賞味期限なんてない。」――夢は、なくなるのではありません。持ち主が迎えに来る日まで、ここで静かに待っているだけなのです。',
    ],
  },
];
