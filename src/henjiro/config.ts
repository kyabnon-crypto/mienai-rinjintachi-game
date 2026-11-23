import {
  HenjiroStoryEpisode,
  HenjiroTrackDef,
  HenjiroTrackId,
  HenjiroUpgradeDef,
  LetterDeskSpotDef,
  LetterWordDef,
  LetterWordId,
  ReplyOrderDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.6;
export const PLAY_AREA_MIN_Z = -3.1;
export const PLAY_AREA_MAX_Z = 3.6;
export const LETTER_TRAY_CAPACITY = 12;

export const LETTER_DESK_SPOTS: LetterDeskSpotDef[] = [
  {
    id: 0,
    name: '羽ペンとインク壺の机',
    shortName: '羽ペンの机',
    x: 0.0,
    z: -2.15,
    rotY: 0,
    whisperLine: '「ちゃんと届きますように…カリカリ…」',
  },
  {
    id: 1,
    name: 'くしゃくしゃ手紙の山',
    shortName: '手紙の山',
    x: -3.05,
    z: 0.95,
    rotY: 0.55,
    whisperLine: '「くしゃくしゃの想いも、そっと伸ばせば大丈夫」',
  },
  {
    id: 2,
    name: '丸い窓の便箋台',
    shortName: '丸窓の台',
    x: 3.1,
    z: 0.95,
    rotY: -0.55,
    whisperLine: '「窓の向こうの誰かに、そっと灯りがともったよ」',
  },
  {
    id: 3,
    name: '月あかりの物干し下',
    shortName: '物干し下',
    x: 0.0,
    z: 2.35,
    rotY: Math.PI,
    whisperLine: '「乾いた言葉が、やさしい風にゆれている」',
  },
];

export const LETTER_WORD_LIST: LetterWordDef[] = [
  {
    id: 'gomen',
    wordText: 'ごめんね',
    name: '「ごめんね」の折れ手紙',
    shortName: 'ごめんね',
    icon: '💌',
    colorHex: 0xf29086,
    emissiveHex: 0xc94d42,
    cssColor: '#ff9e94',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'arigato',
    wordText: 'ありがとう',
    name: '「ありがとう」のしおり便箋',
    shortName: 'ありがとう',
    icon: '🌿',
    colorHex: 0x8fd6ad,
    emissiveHex: 0x3b8f64,
    cssColor: '#98e2b8',
    baseValue: 20,
    feverGain: 6.4,
    weight: 26,
  },
  {
    id: 'suki',
    wordText: '好きでした',
    name: '「本当は、好きでした」の封筒',
    shortName: '好きでした',
    icon: '✉️',
    colorHex: 0xffd07a,
    emissiveHex: 0xd98a26,
    cssColor: '#ffd485',
    baseValue: 23,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'matane',
    wordText: 'またね',
    name: '「またね」の月色カード',
    shortName: 'またね',
    icon: '🌙',
    colorHex: 0x9ec4ff,
    emissiveHex: 0x4b7cd4,
    cssColor: '#a8ccff',
    baseValue: 25,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'daijoubu',
    wordText: 'だいじょうぶ',
    name: '「だいじょうぶ」の星封蝋レター',
    shortName: 'だいじょうぶ',
    icon: '✨',
    colorHex: 0xfff3c4,
    emissiveHex: 0xf2b544,
    cssColor: '#fff3c4',
    baseValue: 60,
    feverGain: 15.0,
    weight: 6,
  },
];

export const LETTER_WORD_MAP: Record<LetterWordId, LetterWordDef> = LETTER_WORD_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<LetterWordId, LetterWordDef>
);

export const REPLY_ORDERS: ReplyOrderDef[] = [
  {
    id: 'gomen_reply',
    name: '出せなかった「ごめんね」の返事',
    recipientLabel: '眠れない夜の誰か',
    whisperMessage: '「……なんだか急に、あの人を許したくなったな」',
    words: ['gomen', 'arigato', 'gomen'],
    bonusLight: 88,
    bonusSeals: 1,
  },
  {
    id: 'arigato_reply',
    name: '消せなかった「ありがとう」の返事',
    recipientLabel: '窓辺で空を見上げる人',
    whisperMessage: '「あなたのこと、わかってくれてありがとう」',
    words: ['arigato', 'matane', 'arigato'],
    bonusLight: 96,
    bonusSeals: 1,
  },
  {
    id: 'suki_reply',
    name: '折りたたんだ「本当は、好きでした」',
    recipientLabel: '古い手紙をしまった人',
    whisperMessage: '「うまく言えなかったけど、気持ちはちゃんと届いてたんだね」',
    words: ['suki', 'gomen', 'suki'],
    bonusLight: 108,
    bonusSeals: 1,
  },
  {
    id: 'matane_reply',
    name: 'すれ違った夜の「またね」便箋',
    recipientLabel: '遠い街のともだち',
    whisperMessage: '「元気でいてね。それだけで、よかったのに」',
    words: ['matane', 'arigato', 'suki'],
    bonusLight: 116,
    bonusSeals: 1,
  },
  {
    id: 'daijoubu_reply',
    name: '理由なんていらない「大丈夫だよ」',
    recipientLabel: 'うつむいていた誰か',
    whisperMessage: '「何も聞いていないのに、なぜか分かり合えた気がする」',
    words: ['gomen', 'suki', 'matane'],
    bonusLight: 126,
    bonusSeals: 2,
  },
  {
    id: 'moonlight_miracle',
    name: '月あかりのポストの小さな奇跡',
    recipientLabel: '常世町の静かな窓辺みんな',
    whisperMessage: '「届かなかった言葉にも、ちゃんと行き先がある」',
    words: ['arigato', 'suki', 'matane'],
    bonusLight: 140,
    bonusSeals: 2,
  },
];

export const HENJIRO_TRACKS: Record<HenjiroTrackId, HenjiroTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ヘンジロウ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/henjiro_dreamy.mp3',
    bpm: 95.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    blotRate: 0.16,
    spotFadeSpeed: 4.3,
    maxActiveLetters: 10,
    valueMultiplier: 1.0,
    unlockLampLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ヘンジロウ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/henjiro_normal.mp3',
    bpm: 101.5,
    durationSec: 62,
    spawnEveryBeats: 1.25,
    blotRate: 0.22,
    spotFadeSpeed: 5.4,
    maxActiveLetters: 12,
    valueMultiplier: 1.45,
    unlockLampLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ヘンジロウ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/henjiro_instrumental.mp3',
    bpm: 151.0,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    blotRate: 0.27,
    spotFadeSpeed: 6.3,
    maxActiveLetters: 14,
    valueMultiplier: 1.9,
    unlockLampLevel: 2,
  },
};

export const HENJIRO_UPGRADES: HenjiroUpgradeDef[] = [
  {
    id: 'quillDesk',
    name: '羽ペンとインク壺の机を磨く',
    propName: '羽ペン・インク壺・真鍮ベル・書きかけ便箋',
    description: '手紙を伸ばす範囲と返事書きの速さが広がり、獲得する「ことばの灯り」が増えます。',
    maxLevel: 8,
    baseCostLight: 55,
    baseCostSeals: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `伸ばし＆執筆 +${(lv * 15).toFixed(0)}% / 灯り ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'garlandLamp',
    name: '天井ランプと電球ガーランドを灯す',
    propName: '深緑シェードの吊りランプ＆壁をめぐる電球',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、月あかりフィーバー時間を延ばします。',
    maxLevel: 5,
    baseCostLight: 90,
    baseCostSeals: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / 月あかりフィーバー ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'clothesline',
    name: '物干しの紐と木製クリップを増やす',
    propName: '伸ばした手紙がゆれる物干しロープ＆クリップ',
    description: '赤い封蝋発送でもらえる「心の手紙」とオーダー報酬が増え、ことばの灯り倍率も上がります。',
    maxLevel: 6,
    baseCostLight: 120,
    baseCostSeals: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `封蝋発送 +${1 + lv} 心の手紙 / 灯り ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'waxShelf',
    name: '封蝋と切手の棚を整える',
    propName: '赤い封蝋・真鍮スタンプ・切手シート・封筒の束',
    description: '羽ペンひとふり（インク浄化＆一斉伸ばし）のクールダウンを短縮し、範囲を広げます。',
    maxLevel: 6,
    baseCostLight: 145,
    baseCostSeals: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `羽ペンひとふり ${Math.max(1.4, 3.0 - lv * 0.22).toFixed(1)}秒 / 範囲 +${lv * 14}%`,
  },
  {
    id: 'glassesChair',
    name: '丸メガネと小さな帽子＆肘掛け椅子',
    propName: '丸メガネ・紺の帽子・ふかふか肘掛け椅子・鉢植え',
    description: 'ためらいのインク染みを防ぐ「まもり」を授け、書斎にいなくても自動で灯りが蓄わります。',
    maxLevel: 5,
    baseCostLight: 185,
    baseCostSeals: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `インクまもり ${lv}回 / 自動灯り +${lv * 4}/秒`,
  },
  {
    id: 'bookshelfWindow',
    name: '本棚と額縁・丸い窓の町あかり',
    propName: '本棚・切手と葉の額縁・壁時計・丸い窓の夜景',
    description: 'レア「だいじょうぶの星封蝋レター」出現率と全獲得灯りが大きく伸び、物語がひらきます。',
    maxLevel: 6,
    baseCostLight: 220,
    baseCostSeals: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `星封蝋率 +${lv * 3.5}% / 全灯り ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getHenjiroUpgradeCost(
  def: HenjiroUpgradeDef,
  currentLevel: number
): { light: number; seals: number } {
  const light = Math.round(def.baseCostLight * Math.pow(def.costScale, currentLevel));
  const seals =
    def.baseCostSeals === 0
      ? 0
      : Math.round(def.baseCostSeals * Math.pow(1.5, currentLevel));
  return { light, seals };
}

export const HENJIRO_STORIES: HenjiroStoryEpisode[] = [
  {
    chapter: 1,
    title: '月夜の赤いポストで',
    subtitle: 'カサ…カサ…と紙の音がする夜',
    requiredBookshelfLevel: 0,
    requiredRepliesSent: 0,
    body: [
      '夜の町には、だれも知らない小さな仕事があります。月がのぼるころ――赤いポストの中で、カサ…カサ…と、紙の音がするのです。',
      'それは、投函されたまま届かなかった手紙。書こうとして書けなかった返事。「ごめんね」「ありがとう」「本当は、好きでした」。言葉になれなかった気持ちたちが、ポストの奥で静かに息をしています。',
      'そんな夜、ポストの奥で目を覚ますのが「ヘンジロウ」。丸いメガネに、小さな帽子。夜だけ働く、小さな返事書きです。',
    ],
  },
  {
    chapter: 2,
    title: 'くしゃくしゃの想いを伸ばして',
    subtitle: '物干しの紐にゆれる言葉たち',
    requiredBookshelfLevel: 1,
    requiredRepliesSent: 4,
    body: [
      'ヘンジロウは、届かなかった言葉をひとつずつ拾いあつめます。ポケットの中で丸まってしまったメモも、泣きながら折りたたんだ便箋も、どれも大切な気持ちのかけらです。',
      'くしゃくしゃになった想いを、そっと手のひらで伸ばして、物干しの紐に木製クリップで干していきます。消えかけた気持ちに、小さな灯りをともしながら。',
      '天井の投函口から差し込む月あかりに照らされて、「ごめんね」も「ありがとう」も、少しずつやさしい輪郭を取り戻していくのです。',
    ],
  },
  {
    chapter: 3,
    title: 'カリカリ、羽ペンの音',
    subtitle: '「ちゃんと届きますように」を込めて',
    requiredBookshelfLevel: 2,
    requiredRepliesSent: 10,
    body: [
      '深緑のシェードのランプを灯し、ヘンジロウは小さな木の机に向かいます。インク壺に羽ペンをそっと浸すと、静かな書斎に「カリカリ、カリカリ」と心地よい音が響きます。',
      '「ちゃんと届きますように」。その言葉を、ひと文字ずつ丁寧に込めながら、誰かの代わりにやさしい返事を綴っていきます。',
      '書き終えた手紙には、温めた赤い封蝋をぽとりと落として、真鍮のスタンプをそっと押すのです。',
    ],
  },
  {
    chapter: 4,
    title: '手紙なんて届いていないのに',
    subtitle: '心だけがそっと伝わる夜',
    requiredBookshelfLevel: 3,
    requiredRepliesSent: 18,
    body: [
      '赤い封蝋が押された手紙が丸い窓から夜の町へ舞い上がると、不思議なことが起こります。',
      'ある人は突然、「大丈夫だよ」と言いたくなったり。ある人は急に、ずっと言えなかった誰かを許したくなったり。何も聞いていないのに、手紙なんて届いていないのに――それでもなぜか、心だけが伝わる夜があるのです。',
      '理由なんてわからなくていい。気づかない優しさが、見えない手紙のように、今日もどこかで誰かを包んでいます。',
    ],
  },
  {
    chapter: 5,
    title: 'ポストの奥の物語はつづく',
    subtitle: 'うまく言えなくても、大丈夫',
    requiredBookshelfLevel: 4,
    requiredRepliesSent: 28,
    body: [
      '丸い窓の外には、静かな常世町の夜。ぽつり、ぽつりと、あたたかな窓の明かりが増えていきます。ポストの中には、まだたくさんの言葉たちが眠っています。',
      '「うまく言えなくても、大丈夫。想っていた気持ちは、ちゃんと残っているよ。」ヘンジロウは丸メガネを少し直して、今夜も小さな机に向かいます。',
      '月あかりの下、赤いポストの奥で、カリカリと音がします。届かなかった言葉にも、ちゃんと行き先があるから。今夜もヘンジロウは、またひとつ、返事を書いています。',
    ],
  },
];
