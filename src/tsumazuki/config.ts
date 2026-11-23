import {
  DroppedItemDef,
  DroppedItemId,
  StumbleSpotDef,
  TsumazukiStoryEpisode,
  TsumazukiTrackDef,
  TsumazukiTrackId,
  TsumazukiUpgradeDef,
  WatchOrderDef,
} from './types';

export const PLAY_AREA_HALF_X = 4.6;
export const PLAY_AREA_MIN_Z = -3.1;
export const PLAY_AREA_MAX_Z = 3.5;
export const RETURN_BASKET_CAPACITY = 12;

export const STUMBLE_SPOTS: StumbleSpotDef[] = [
  {
    id: 0,
    name: '踊り場アーチ窓のまえ',
    shortName: 'アーチ窓前',
    x: 0.0,
    z: -2.15,
    rotY: 0,
    savedLine: '「おっと……！ よかった、転ばずにすんだ！」',
  },
  {
    id: 1,
    name: '上り階段の角ステップ',
    shortName: '上り階段角',
    x: -3.05,
    z: 0.75,
    rotY: 0.55,
    savedLine: '「あれ、コップが手の中に戻ってきた……運がよかった！」',
  },
  {
    id: 2,
    name: '下り階段の手すりぎわ',
    shortName: '下り手すり',
    x: 3.05,
    z: 0.75,
    rotY: -0.55,
    savedLine: '「ひやっとした！ なんだか一瞬ゆっくり見えたな」',
  },
  {
    id: 3,
    name: '踊り場の丸い絨毯ぎわ',
    shortName: '踊り場すみ',
    x: 0.0,
    z: 2.35,
    rotY: Math.PI,
    savedLine: '「ふう、間に合った……いってきます！」',
  },
];

export const DROPPED_ITEM_LIST: DroppedItemDef[] = [
  {
    id: 'cup',
    wordText: 'コップ',
    name: '落ちかけたコップ',
    shortName: 'コップ',
    icon: '🥤',
    colorHex: 0x99e0f2,
    emissiveHex: 0x3a9eb8,
    cssColor: '#a6ebfa',
    baseValue: 18,
    feverGain: 6.0,
    weight: 28,
  },
  {
    id: 'key',
    wordText: 'お部屋のかぎ',
    name: '302号室のかぎ束',
    shortName: 'かぎ束',
    icon: '🔑',
    colorHex: 0xffd778,
    emissiveHex: 0xc98b24,
    cssColor: '#ffdd88',
    baseValue: 20,
    feverGain: 6.4,
    weight: 26,
  },
  {
    id: 'plane',
    wordText: '紙ひこうき',
    name: '朝の紙ひこうき',
    shortName: '紙ひこうき',
    icon: '✈️',
    colorHex: 0xf7eed8,
    emissiveHex: 0x94a8a2,
    cssColor: '#f7f1de',
    baseValue: 23,
    feverGain: 7.0,
    weight: 22,
  },
  {
    id: 'coin',
    wordText: 'コインとボタン',
    name: 'ころがるコイン＆ボタン',
    shortName: 'コイン',
    icon: '🪙',
    colorHex: 0xf29f85,
    emissiveHex: 0xc25b3e,
    cssColor: '#f7ad94',
    baseValue: 25,
    feverGain: 7.5,
    weight: 18,
  },
  {
    id: 'watch',
    wordText: '星砂の懐中時計',
    name: 'ひと秒の懐中時計',
    shortName: '懐中時計',
    icon: '⏳',
    colorHex: 0xb2f5e6,
    emissiveHex: 0x3eb8a2,
    cssColor: '#b8fae9',
    baseValue: 62,
    feverGain: 15.0,
    weight: 6,
  },
];

export const DROPPED_ITEM_MAP: Record<DroppedItemId, DroppedItemDef> = DROPPED_ITEM_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<DroppedItemId, DroppedItemDef>
);

export const WATCH_ORDERS: WatchOrderDef[] = [
  {
    id: 'morning_cup',
    name: '朝のコップをそっと手の中へ',
    residentLabel: '仕事へ急ぐ302号室の人',
    whisperMessage: '「あれ？ 落としたはずのコップが手の中に戻ってきた！」',
    items: ['cup', 'key', 'cup'],
    bonusDrops: 88,
    bonusCharms: 1,
  },
  {
    id: 'school_keys',
    name: 'ポケットから落ちた鍵と紙ひこうき',
    residentLabel: '学校へ向かう小学生',
    whisperMessage: '「よかった、かぎもノートも無事だった！」',
    items: ['key', 'plane', 'key'],
    bonusDrops: 96,
    bonusCharms: 1,
  },
  {
    id: 'stair_coin',
    name: '階段をころがるコインとボタン',
    residentLabel: 'バスに急ぐ4階の住人',
    whisperMessage: '「ちょうど踊り場で止まってくれて助かったな」',
    items: ['coin', 'cup', 'coin'],
    bonusDrops: 108,
    bonusCharms: 1,
  },
  {
    id: 'breeze_plane',
    name: '朝の風に舞う紙ひこうきとメモ',
    residentLabel: '立ち止まって深呼吸した人',
    whisperMessage: '「なんだか今日は、少しだけゆっくり歩けそう」',
    items: ['plane', 'key', 'coin'],
    bonusDrops: 118,
    bonusCharms: 1,
  },
  {
    id: 'lucky_step',
    name: '「運がよかった」朝の小さな奇跡',
    residentLabel: 'つまずきかけた朝の誰か',
    whisperMessage: '「偶然なんて言葉じゃ足りない気がする……ありがとう」',
    items: ['cup', 'plane', 'coin'],
    bonusDrops: 128,
    bonusCharms: 2,
  },
  {
    id: 'slow_second_miracle',
    name: 'ほんのひと秒の踊り場パトロール',
    residentLabel: 'マンションの住人たちみんな',
    whisperMessage: '「だいじょうぶ。ほんの少しだけだからね。」',
    items: ['cup', 'key', 'plane'],
    bonusDrops: 142,
    bonusCharms: 2,
  },
];

export const TSUMAZUKI_TRACKS: Record<TsumazukiTrackId, TsumazukiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'ツマヅキ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/tsumazuki_dreamy.mp3',
    bpm: 75.0,
    durationSec: 62,
    spawnEveryBeats: 1.25,
    rushRate: 0.16,
    spotSlipSpeed: 4.3,
    maxActiveItems: 10,
    valueMultiplier: 1.0,
    unlockWindowLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'ツマヅキ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/tsumazuki_normal.mp3',
    bpm: 114.5,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    rushRate: 0.22,
    spotSlipSpeed: 5.4,
    maxActiveItems: 12,
    valueMultiplier: 1.45,
    unlockWindowLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'ツマヅキ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/tsumazuki_instrumental.mp3',
    bpm: 133.5,
    durationSec: 62,
    spawnEveryBeats: 1.5,
    rushRate: 0.27,
    spotSlipSpeed: 6.3,
    maxActiveItems: 14,
    valueMultiplier: 1.9,
    unlockWindowLevel: 2,
  },
};

export const TSUMAZUKI_UPGRADES: TsumazukiUpgradeDef[] = [
  {
    id: 'hourglasses',
    name: '光る砂時計と時のゆらぎを磨く',
    propName: '黄金の砂時計・時の波紋リング・丸い絨毯',
    description: '時間をゆっくりにする範囲と踏みとどまり速度が広がり、獲得する「時のしずく」が増えます。',
    maxLevel: 8,
    baseCostDrops: 55,
    baseCostCharms: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `ゆらぎ＆見守り +${(lv * 15).toFixed(0)}% / しずく ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'archWindow',
    name: 'アーチ窓の朝灯りと電球ガーランド',
    propName: '朝の光が差すアーチ窓＆壁をめぐる電球ガーランド',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、ひと秒のきせきフィーバー時間を延ばします。',
    maxLevel: 5,
    baseCostDrops: 90,
    baseCostCharms: 1,
    costScale: 1.95,
    effectText: (lv) =>
      lv >= 2
        ? `全3曲解放済 / SLOW SECOND ${14 + lv * 2}秒`
        : lv === 1
          ? `通常版解放済 / 次でInst解放・フィーバー ${14 + lv * 2}秒`
          : 'Lv.1で通常版、Lv.2でInstrumental解放',
  },
  {
    id: 'lostShelf',
    name: '拾い集めた落とし物の棚と鍵フック',
    propName: 'かぎ・コイン・ボタンの箱棚＆302号室フックボード',
    description: 'お返しカゴ発送でもらえる「だいじょうぶの証」とオーダー報酬が増え、しずく倍率も上がります。',
    maxLevel: 6,
    baseCostDrops: 120,
    baseCostCharms: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `お返し発送 +${1 + lv} だいじょうぶの証 / しずく ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'pendulumClock',
    name: '止まりかけの振り子時計と手すり模型',
    propName: 'ゆっくり揺れる振り子時計・階段手すり模型・緑ランプ',
    description: '「ほんのひと秒（TIME SLOW）」のクールダウンを短縮し、時間スローの届く範囲を広げます。',
    maxLevel: 6,
    baseCostDrops: 145,
    baseCostCharms: 1,
    costScale: 1.82,
    effectText: (lv) =>
      `ほんのひと秒 ${Math.max(1.5, 3.1 - lv * 0.22).toFixed(1)}秒 / 範囲 +${lv * 14}%`,
  },
  {
    id: 'tealCloak',
    name: '青緑のフードマントと窓辺のクッション',
    propName: '青緑マント・革かばん・ふかふかクッション＆毛布',
    description: 'あわて足の渦を防ぐ「まもり」を授け、見張り部屋にいなくても自動で時のしずくが蓄わります。',
    maxLevel: 5,
    baseCostDrops: 185,
    baseCostCharms: 2,
    costScale: 2.0,
    effectText: (lv) =>
      `マントのまもり ${lv}回 / 自動しずく +${lv * 4}/秒`,
  },
  {
    id: 'watchJournal',
    name: '見張り日誌と階段の青写真・壁のメモ',
    propName: '見張り日誌・階段の設計図・コルクボード＆壁メモ',
    description: 'レア「ひと秒の懐中時計」出現率と全獲得しずくが大きく伸び、物語がひらきます。',
    maxLevel: 6,
    baseCostDrops: 220,
    baseCostCharms: 2,
    costScale: 2.05,
    effectText: (lv) =>
      `懐中時計率 +${(lv * 3.5).toFixed(1)}% / 全しずく ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export function getTsumazukiUpgradeCost(
  def: TsumazukiUpgradeDef,
  currentLevel: number
): { drops: number; charms: number } {
  const drops = Math.round(def.baseCostDrops * Math.pow(def.costScale, currentLevel));
  const charms =
    def.baseCostCharms === 0
      ? 0
      : Math.round(def.baseCostCharms * Math.pow(1.5, currentLevel));
  return { drops, charms };
}

export const TSUMAZUKI_STORIES: TsumazukiStoryEpisode[] = [
  {
    chapter: 1,
    title: '階段の途中のふしぎな場所',
    subtitle: '人がなぜか、ふっと立ち止まる「踊り場」',
    requiredJournalLevel: 0,
    requiredSaves: 0,
    body: [
      'マンションの階段には、ふしぎな場所があります。それは、「踊り場」。人がなぜか、ふっと立ち止まる場所です。',
      '朝の急いでいる時間。学校へ向かう人。仕事へ向かう人。みんな、足早に階段をのぼり、駆け下りていきます。',
      'その踊り場のすみ――階段の裏にある小さな青緑の扉の奥から、朝の気配をじっと見守っている小さな影があります。',
    ],
  },
  {
    chapter: 2,
    title: '「あっ。」と足がもつれた瞬間',
    subtitle: '小さなフードの影が、そっと手を伸ばす',
    requiredJournalLevel: 1,
    requiredSaves: 4,
    body: [
      '急ぎ足の毎日の中、ときどき――「あっ。」と、足がもつれて転びそうになることがあります。手にしていたコップも、ポケットの鍵も、宙へ飛び出してしまう一瞬。',
      'その瞬間。階段のすみで、小さな青緑フードの影がそっと手を伸ばします。その子の名前は、「ツマヅキ」。',
      'ツマヅキは、人が転ばないように、ほんの少しだけ――時間をゆっくりにするのです。',
    ],
  },
  {
    chapter: 3,
    title: 'ほんのひと秒だけ、時間がほどけた',
    subtitle: '落としたコップも、なぜか手の中に戻ってくる',
    requiredJournalLevel: 2,
    requiredSaves: 10,
    body: [
      'ふわりと青緑と金色の波紋が広がると、飛び散った水しぶきも、落ちかけたコップも、宙にふわりと止まります。',
      'だから、つまずきそうになっても、不思議と踏みとどまれる。落としたはずのコップも、なぜか手の中に戻ってくるのです。',
      '見張り部屋の棚には、そんな朝に拾い集めた鍵やボタン、コインや紙ひこうきが、時間ラベルつきで大切に並べられています。',
    ],
  },
  {
    chapter: 4,
    title: '「運がよかった」の正体',
    subtitle: '誰にも気づかれないまま、がんばっている',
    requiredJournalLevel: 3,
    requiredSaves: 18,
    body: [
      '無事バランスを取り戻した人は、ほっと息をついて笑います。「運がよかった」「たまたまだった」。そう思いながら、また元気に出かけていきます。',
      '振り返ったその瞬間には、もう風だけが通り過ぎる静かな踊り場。けれど、偶然なんて言葉じゃ足りない優しさが、確かにそこにあるのです。',
      '踊り場のすみで、小さな見張り番は日誌にそっと書きこみます。「7:42 よし」「8:05 よし」「8:20 ひやり……だいじょうぶ」。',
    ],
  },
  {
    chapter: 5,
    title: 'だいじょうぶ。ほんの少しだけだからね。',
    subtitle: '静かな階段の途中で、今日も誰かが守られてる',
    requiredJournalLevel: 4,
    requiredSaves: 28,
    body: [
      'アーチ窓から朝の光がやわらかく差し込む見張り部屋。止まりかけの振り子時計が、今日もゆったりと時を刻みます。',
      '今日もまた――階段の途中で、誰かが転びそうになる。すると、時間がふわりと揺れました。',
      '「だいじょうぶ。ほんの少しだけだからね。」小さな声は、誰にも聞こえません。けれど今日も、この世界のすき間で、誰かがそっと守られているのです。',
    ],
  },
];
