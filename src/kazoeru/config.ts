import {
  KazoeruStoryEpisode,
  KazoeruTrackDef,
  KazoeruTrackId,
  KazoeruUpgradeDef,
  MemoryTokenDef,
  MemoryTokenId,
  TallyOrderDef,
  TallySpotDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.65;
export const PLAY_AREA_MIN_Z = -3.05;
export const PLAY_AREA_MAX_Z = 3.55;
export const NOTEBOOK_PAGE_CAPACITY = 12;

export const TALLY_SPOTS: TallySpotDef[] = [
  {
    id: 0,
    category: 'effort',
    name: '月夜のブランコ下「がんばった」',
    shortName: 'がんばった',
    boardLabel: 'がんばった',
    x: 0.0,
    z: -2.1,
    rotY: 0,
    accentHex: 0xf4b9a4,
    cssColor: '#f6c4b2',
    completedLine: '「えらかったね――だれにも見えなかった努力も、ちゃんと数えたよ」',
  },
  {
    id: 1,
    category: 'smile',
    name: '笑顔の黒板「わらった」',
    shortName: 'わらった',
    boardLabel: 'わらった',
    x: -3.1,
    z: 0.65,
    rotY: 0.55,
    accentHex: 0xf6de84,
    cssColor: '#ffe48a',
    completedLine: '「ふっと笑えた小さな瞬間も、ノートにちゃんと残っているよ」',
  },
  {
    id: 2,
    category: 'tear',
    name: '月光の黒板「かなしかった」',
    shortName: 'かなしかった',
    boardLabel: 'かなしかった',
    x: 3.1,
    z: 0.65,
    rotY: -0.55,
    accentHex: 0x9cd2f5,
    cssColor: '#a8dcff',
    completedLine: '「ひとりで泣いた夜も、カゾエルはちゃんと知っているよ」',
  },
  {
    id: 3,
    category: 'bench',
    name: 'ランタンのベンチ「きょうの証」',
    shortName: 'ベンチノート',
    boardLabel: 'きょうの証',
    x: 0.0,
    z: 2.35,
    rotY: Math.PI,
    accentHex: 0xffc872,
    cssColor: '#ffd488',
    completedLine: '「きみが生きた確かな証――正の字が、またひとつ増えたよ」',
  },
];

export const MEMORY_TOKEN_LIST: MemoryTokenDef[] = [
  {
    id: 'smile',
    wordText: 'ふっと笑った',
    name: 'ふっと笑えた記憶灯り',
    shortName: 'わらった',
    icon: '☀️',
    colorHex: 0xffe082,
    emissiveHex: 0xc98a22,
    cssColor: '#ffe48e',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'tear',
    wordText: '泣いた夜の雫',
    name: 'ひとりで泣いた月の雫',
    shortName: 'かなしかった',
    icon: '💧',
    colorHex: 0x9bd2ff,
    emissiveHex: 0x3b78b8,
    cssColor: '#a6daff',
    baseValue: 20,
    feverGain: 6.4,
    weight: 25,
  },
  {
    id: 'effort',
    wordText: '見えない努力',
    name: 'だれにも見えない頑張り',
    shortName: 'がんばった',
    icon: '✨',
    colorHex: 0xffb7a0,
    emissiveHex: 0xc25d42,
    cssColor: '#ffc2ae',
    baseValue: 23,
    feverGain: 7.0,
    weight: 23,
  },
  {
    id: 'bead',
    wordText: '数えガラス玉',
    name: '書斎の数え小石＆ガラス玉',
    shortName: 'ガラス玉',
    icon: '🔮',
    colorHex: 0x7be0cc,
    emissiveHex: 0x2e8a7b,
    cssColor: '#88ebd7',
    baseValue: 25,
    feverGain: 7.4,
    weight: 18,
  },
  {
    id: 'starTally',
    wordText: '星の正の字',
    name: '月夜の星印「正」',
    shortName: '星の正の字',
    icon: '⭐',
    colorHex: 0xfff3b2,
    emissiveHex: 0xd99b26,
    cssColor: '#fff5be',
    baseValue: 64,
    feverGain: 15.0,
    weight: 6,
  },
];

export const MEMORY_TOKEN_MAP: Record<MemoryTokenId, MemoryTokenDef> = MEMORY_TOKEN_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MemoryTokenId, MemoryTokenDef>
);

export const TALLY_ORDERS: TallyOrderDef[] = [
  {
    id: 'today_smiles',
    name: '今日、ふっと笑えた回数',
    nightLabel: '帰り道に小さく微笑んだ人',
    whisperMessage: '「ふっと笑えたことも、ちゃんと数えているよ」',
    items: ['smile', 'effort', 'smile'],
    bonusMarks: 88,
    bonusStars: 1,
  },
  {
    id: 'lonely_night',
    name: 'ひとりで泣いた夜の記録',
    nightLabel: '誰にも言えず涙をこらえた人',
    whisperMessage: '「ひとりで泣いた夜も、カゾエルは知っているよ」',
    items: ['tear', 'bead', 'tear'],
    bonusMarks: 96,
    bonusStars: 1,
  },
  {
    id: 'unseen_effort',
    name: 'だれにも見えなかった頑張り',
    nightLabel: '褒められなくても歩き続けた人',
    whisperMessage: '「えらかったね。その頑張りは消えていないよ」',
    items: ['effort', 'smile', 'effort'],
    bonusMarks: 108,
    bonusStars: 1,
  },
  {
    id: 'pebble_count',
    name: '小石とガラス玉の夜の数え帳',
    nightLabel: 'ベンチの下の数えもの書斎',
    whisperMessage: '「ノートの中に並ぶ印は、きみが生きた確かな証」',
    items: ['bead', 'smile', 'tear'],
    bonusMarks: 118,
    bonusStars: 1,
  },
  {
    id: 'all_of_today',
    name: '笑った数も、涙の数も、全部',
    nightLabel: '月明かりの公園を歩くきみ',
    whisperMessage: '「気づかれなくても、消えたりしないからね」',
    items: ['smile', 'tear', 'effort'],
    bonusMarks: 130,
    bonusStars: 2,
  },
  {
    id: 'tomorrow_light',
    name: '明日へ続く「えらかったね」の証',
    nightLabel: '夜明けを待つ公園のブランコ',
    whisperMessage: '「だれにも届かないその日々も、明日へ続く光になる」',
    items: ['effort', 'bead', 'effort'],
    bonusMarks: 144,
    bonusStars: 2,
  },
];

export const KAZOERU_TRACKS: Record<KazoeruTrackId, KazoeruTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'カゾエル — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/kazoeru_dreamy.mp3',
    bpm: 74.0,
    durationSec: 62,
    spawnEveryBeats: 1.25,
    gustRate: 0.16,
    spotFadeSpeed: 4.2,
    maxActiveTokens: 10,
    valueMultiplier: 1.0,
    unlockLampLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'カゾエル — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/kazoeru_normal.mp3',
    bpm: 95.5,
    durationSec: 62,
    spawnEveryBeats: 1.35,
    gustRate: 0.22,
    spotFadeSpeed: 5.3,
    maxActiveTokens: 12,
    valueMultiplier: 1.45,
    unlockLampLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'カゾエル — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/kazoeru_instrumental.mp3',
    bpm: 131.5,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    gustRate: 0.27,
    spotFadeSpeed: 6.2,
    maxActiveTokens: 14,
    valueMultiplier: 1.9,
    unlockLampLevel: 2,
  },
};

export const KAZOERU_UPGRADES: KazoeruUpgradeDef[] = [
  {
    id: 'tallyNotebook',
    name: '大きな数えノートと5色そろばん',
    propName: '正の字ノート・カラフルそろばん・真鍮の数取器',
    description: '正の字を刻む速度と集める範囲が広がり、獲得する「ひかりの印」が増えます。',
    maxLevel: 8,
    baseCostMarks: 55,
    baseCostStars: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `数え範囲＆筆記 +${(lv * 15).toFixed(0)}% / 印 ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'parkLamp',
    name: '公園の街灯とガラス玉の数珠',
    propName: 'あたたかな街灯・天井のガラス玉の数珠・赤いランタン',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、満天の数え時間（フィーバー）を延ばします。',
    maxLevel: 5,
    baseCostMarks: 90,
    baseCostStars: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / STARLIGHT TALLY ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'scrollShelf',
    name: 'くるくる巻物の棚と黒板の数え表',
    propName: 'リボン付き巻物棚・3枚の壁黒板・チョーク受け',
    description: '巻物まとめでもらえる「えらかったねの星」とオーダー報酬が増え、印倍率も上がります。',
    maxLevel: 6,
    baseCostMarks: 120,
    baseCostStars: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `巻物まとめ +${1 + lv} えらかったねの星 / 印 ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'swingChain',
    name: 'ブランコの鎖の模型と公園のベンチ',
    propName: '揺れるブランコ模型・木のベンチ＆立て看板・壁時計',
    description: '「数え鳴らし（SWING TALLY）」のクールダウンを短縮し、月光の波紋が届く範囲を広げます。',
    maxLevel: 6,
    baseCostMarks: 145,
    baseCostStars: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `数え鳴らし ${Math.max(1.5, 3.1 - lv * 0.22).toFixed(1)}秒 / 範囲 +${lv * 14}%`,
  },
  {
    id: 'knitScarf',
    name: '青いニット帽と丸い「正」絨毯',
    propName: 'ニット帽＆マフラー掛け・正の字の丸絨毯・黄色スツール',
    description: '忘却の夜風を防ぐ「ぬくもり」を授け、書斎にいなくても自動でひかりの印が蓄わります。',
    maxLevel: 5,
    baseCostMarks: 185,
    baseCostStars: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `ニットのぬくもり ${lv}回 / 自動ひかりの印 +${lv * 4}/秒`,
  },
  {
    id: 'jarCollection',
    name: '小石と豆とガラス玉の瓶棚＆天秤',
    propName: '小石・豆・ガラス玉のガラス瓶・真鍮の天秤・夜の丸窓',
    description: 'レア「月の星印『正』」出現率と全獲得の印が大きく伸び、数えもの日誌がひらきます。',
    maxLevel: 6,
    baseCostMarks: 220,
    baseCostStars: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `星の正の字率 +${(lv * 3.5).toFixed(1)}% / 全印 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getKazoeruUpgradeCost(
  def: KazoeruUpgradeDef,
  currentLevel: number
): { marks: number; stars: number } {
  const marks = Math.round(def.baseCostMarks * Math.pow(def.costScale, currentLevel));
  const stars =
    def.baseCostStars === 0
      ? 0
      : Math.round(def.baseCostStars * Math.pow(1.5, currentLevel));
  return { marks, stars };
}

export const KAZOERU_STORIES: KazoeruStoryEpisode[] = [
  {
    chapter: 1,
    title: '夜の公園、揺れるブランコ',
    subtitle: '風もないのに、きい……こ、と揺れていました',
    requiredJarLevel: 0,
    requiredTallies: 0,
    body: [
      '静かな夜、だれもいない公園で、だれも乗っていないブランコが、きい……こ、と揺れていました。',
      '風もないのに、どうして揺れているんだろう。そう思って月明かりの下を近づくと――ブランコの奥に、小さな影が見えました。',
      'となりの木製ベンチのすぐ下には、煉瓦の塀にひらいた小さな丸い入口。街灯のあたたかな光が、そっと地面を照らしています。',
    ],
  },
  {
    chapter: 2,
    title: 'ベンチの上の小さなだれか',
    subtitle: 'ランタンの灯りで、毎晩ノートを開く「カゾエル」',
    requiredJarLevel: 1,
    requiredTallies: 4,
    body: [
      'ベンチに、青いニット帽とマフラーをまとった小さなだれかが座っていました。それが、「カゾエル」です。',
      'カゾエルは毎晩、ランタンの橙色の灯りの下でノートを開いて、なにかを数えています。ページの中には、鉛筆で丁寧に書かれた「正」の字がびっしり。',
      'ベンチの下の数えもの部屋には、小石と豆とガラス玉の瓶、5色のそろばん、そして数え終わった紙をくるくる巻いた巻物が大切にしまわれています。',
    ],
  },
  {
    chapter: 3,
    title: 'わらった数も、かなしかった数も',
    subtitle: '誰にも見えない、今日という日の記録',
    requiredJarLevel: 2,
    requiredTallies: 10,
    body: [
      '書斎の壁に並んだ三つの黒板には、「わらった」「かなしかった」「がんばった」の数え表が掛かっています。',
      '今日、笑った回数。ふっと笑えたことも、ちゃんと数えます。今日、悲しかった回数。ひとりで泣いた夜も、カゾエルは知っています。',
      'うまくいかないそんな日でも、歩いた分だけノートの中の印は増えていくのです。気づかれなくても、消えたりしないように。',
    ],
  },
  {
    chapter: 4,
    title: 'だれにも見えなかった頑張り',
    subtitle: 'ひとつ残らず数えているよ',
    requiredJarLevel: 3,
    requiredTallies: 18,
    body: [
      'そして――頑張った回数も。だれにも見えなかった努力を、カゾエルはひとつ残らず数えています。',
      'ノートいっぱいの「正」の字が並ぶたび、ベンチのランタンが少しだけ明るくなり、公園のブランコがうれしそうに揺れます。',
      '「えらかったね」。カゾエルは声には出さずに、そっとうなずきました。だれにも褒められなかった日でも、その頑張りは消えていません。',
    ],
  },
  {
    chapter: 5,
    title: 'ベンチの上に増えた、ひとつの「正」',
    subtitle: 'きみの頑張りを、ちゃんと数えている誰かがいる',
    requiredJarLevel: 4,
    requiredTallies: 28,
    body: [
      '帰り道。もう一度ふり返ると、夜の公園のブランコは静かに止まっていました。',
      'ベンチの上には、もうだれもいません。けれど開かれたままのノートの上には――小さな「正」の字が、ひとつ増えていたのです。',
      'だれにも届かないその日々も、明日へ続く光になる。きみの頑張りを、ちゃんと数えている誰かが、今夜もここにいるのです。',
    ],
  },
];
