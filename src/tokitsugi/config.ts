import {
  BrokenTimeOrderDef,
  FragmentDef,
  FragmentId,
  TokitsugiStoryEpisode,
  TokitsugiTrackDef,
  TokitsugiTrackId,
  TokitsugiUpgradeDef,
} from './types';

export const CLOCK_RADIUS = 2.55;
export const CLOCK_SLOTS = 12;
export const WATCH_CAPACITY = 12;

export const FRAGMENT_LIST: FragmentDef[] = [
  {
    id: 'photo',
    name: '割れた写真立ての記憶',
    shortName: '思い出写真',
    icon: '🖼️',
    colorHex: 0xffb86c,
    emissiveHex: 0xd97d28,
    cssColor: '#ffbe76',
    baseValue: 16,
    feverGain: 5.5,
    weight: 28,
  },
  {
    id: 'word',
    name: '届かなかった「ありがとう」',
    shortName: '言葉の欠片',
    icon: '💌',
    colorHex: 0xff9eab,
    emissiveHex: 0xd95870,
    cssColor: '#ffa6b4',
    baseValue: 18,
    feverGain: 6.0,
    weight: 26,
  },
  {
    id: 'timing',
    name: 'すれ違ったタイミング',
    shortName: '金の歯車',
    icon: '⚙️',
    colorHex: 0xffda6b,
    emissiveHex: 0xd69b1c,
    cssColor: '#ffe07d',
    baseValue: 20,
    feverGain: 6.4,
    weight: 24,
  },
  {
    id: 'promise',
    name: '途切れた約束の欠片',
    shortName: '月夜の約束',
    icon: '🌙',
    colorHex: 0x8fd6ff,
    emissiveHex: 0x3b8fd9,
    cssColor: '#98dbff',
    baseValue: 24,
    feverGain: 7.2,
    weight: 16,
  },
  {
    id: 'dream',
    name: '再会の星砂',
    shortName: '再会の星砂',
    icon: '✨',
    colorHex: 0xfff3ba,
    emissiveHex: 0xffbf52,
    cssColor: '#fff4c2',
    baseValue: 54,
    feverGain: 13.5,
    weight: 6,
  },
];

export const FRAGMENT_MAP: Record<FragmentId, FragmentDef> = FRAGMENT_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<FragmentId, FragmentDef>
);

export const BROKEN_TIME_ORDERS: BrokenTimeOrderDef[] = [
  {
    id: 'lost_photo',
    name: '落として割れた写真立て',
    miracleMessage: '「なくしたはずの写真が、机の奥から見つかったよ」',
    fragments: ['photo', 'timing', 'photo'],
    bonusSands: 80,
    bonusMiracles: 1,
  },
  {
    id: 'unspoken_thanks',
    name: 'あと一歩の「ありがとう」',
    miracleMessage: '「言えなかったはずの『ありがとう』が、ちゃんと届いた」',
    fragments: ['word', 'timing', 'word'],
    bonusSands: 88,
    bonusMiracles: 1,
  },
  {
    id: 'missed_crossing',
    name: 'すれ違った夕暮れの秒針',
    miracleMessage: '「すれ違ったはずのふたりが、同じ角で笑い合った」',
    fragments: ['timing', 'promise', 'timing'],
    bonusSands: 96,
    bonusMiracles: 1,
  },
  {
    id: 'old_promise',
    name: '押し入れの奥の古い約束',
    miracleMessage: '「止まっていた約束の時計が、静かに動き出した」',
    fragments: ['promise', 'photo', 'word'],
    bonusSands: 108,
    bonusMiracles: 1,
  },
  {
    id: 'reunion_dream',
    name: 'もう会えない人の優しい夢',
    miracleMessage: '「夢の中で会えた人が、少し笑って頷いてくれた」',
    fragments: ['promise', 'word', 'photo'],
    bonusSands: 116,
    bonusMiracles: 2,
  },
  {
    id: 'star_pocket_watch',
    name: '常世町の星繋ぎ懐中時計',
    miracleMessage: '「それは偶然じゃない。トキツギが静かに仕事をした証」',
    fragments: ['timing', 'word', 'promise'],
    bonusSands: 128,
    bonusMiracles: 2,
  },
];

export const TOKITSUGI_TRACKS: Record<TokitsugiTrackId, TokitsugiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'トキツギ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/tokitsugi_dreamy.mp3',
    bpm: 106.0,
    durationSec: 62,
    beatsPerRevolution: 12,
    spawnEveryBeats: 1.5,
    riftRate: 0.14,
    pairRate: 0.22,
    valueMultiplier: 1.0,
    unlockClockLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'トキツギ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/tokitsugi_normal.mp3',
    bpm: 140.0,
    durationSec: 62,
    beatsPerRevolution: 12,
    spawnEveryBeats: 1.5,
    riftRate: 0.2,
    pairRate: 0.28,
    valueMultiplier: 1.45,
    unlockClockLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'トキツギ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/tokitsugi_instrumental.mp3',
    bpm: 102.0,
    durationSec: 62,
    beatsPerRevolution: 8,
    spawnEveryBeats: 1.0,
    riftRate: 0.26,
    pairRate: 0.34,
    valueMultiplier: 1.9,
    unlockClockLevel: 2,
  },
};

export const TOKITSUGI_UPGRADES: TokitsugiUpgradeDef[] = [
  {
    id: 'repairKit',
    name: '懐中時計の修復キットを整える',
    propName: '作業台の木箱＆精密工具',
    description: '針合わせのジャスト判定幅が広がり、欠片から得られる「時の砂」が増えます。',
    maxLevel: 8,
    baseCostSands: 55,
    baseCostMiracles: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `ジャスト幅 +${(lv * 3.5).toFixed(1)}° / 時の砂 ×${(1 + lv * 0.18).toFixed(2)}`,
  },
  {
    id: 'grandClock',
    name: '大きな柱時計の振り子を磨く',
    propName: '工房右壁の振り子柱時計',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、黄金の刻（フィーバー）時間を延ばします。',
    maxLevel: 5,
    baseCostSands: 90,
    baseCostMiracles: 1,
    costScale: 1.95,
    effectText: (lv) => {
      const dur = 14 + lv * 2;
      if (lv === 0) return `黄金の刻 ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 2) return `黄金の刻 ${dur}秒 / 通常版解放済（Lv.2でInst解放）`;
      return `黄金の刻 ${dur}秒 / 全3バージョン解放済！`;
    },
  },
  {
    id: 'goldenThread',
    name: '金色の時間の糸を紡ぐ',
    propName: '作業台の金糸ボビン＆針',
    description: '修繕完了時の「小さな奇跡」報酬が増え、巻き戻し浄化の再使用時間も短くなります。',
    maxLevel: 8,
    baseCostSands: 70,
    baseCostMiracles: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `修繕完了 +${lv} 小さな奇跡 / 巻き戻し -${(lv * 0.16).toFixed(2)}秒`,
  },
  {
    id: 'memoryJars',
    name: '思い出の瓶棚を並べる',
    propName: '壁いっぱいの光の小瓶棚',
    description: '並んだ思い出の瓶が4拍ごとに共鳴して自動で「時の砂」を蓄えます（不在中も蓄積）。',
    maxLevel: 6,
    baseCostSands: 75,
    baseCostMiracles: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動共鳴なし）' : `4拍ごとに +${lv * 9} 砂 / 放置 +${lv * 22}/分`,
  },
  {
    id: 'hourglass',
    name: '真鍮の砂時計を澄ませる',
    propName: '作業台の黄金砂時計',
    description: '時のほころびを防ぐ「砂時計ガード」が付与され、レアな「再会の星砂」が現れやすくなります。',
    maxLevel: 5,
    baseCostSands: 85,
    baseCostMiracles: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0 ? '未強化（砂時計ガードなし）' : `砂時計ガード ${lv}回 / 星砂率 +${lv * 5}%`,
  },
  {
    id: 'closetDiary',
    name: '押し入れの記録帳を綴じる',
    propName: '直された写真立て＆小さな灯り',
    description: '第三話『押し入れの奥の時間職人』の物語が順に解放され、全体の獲得砂倍率が上昇します。',
    maxLevel: 5,
    baseCostSands: 80,
    baseCostMiracles: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `押し入れの記録 ${lv} / 5 解放 / 全砂 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export const TOKITSUGI_STORIES: TokitsugiStoryEpisode[] = [
  {
    id: 'tk_ep1',
    chapter: 1,
    timeLabel: '23:10 — 少し開いた押し入れの隙間',
    title: '押し入れの奥の小さな工房',
    requiredDiaryLevel: 1,
    requiredWatchesMended: 1,
    quote: '「どの家の押し入れの奥にも、ほんのわずかな『隙間』がある」',
    body: [
      '静かな夜の和室。少しだけ開いた押し入れの奥をそっとのぞくと、ほんのわずかな隙間の向こうから、あたたかいランタンの光がゆらりとこぼれています。',
      'そこは時間の流れが少しだけゆっくりになる特別な場所。壁いっぱいの引き出し棚と思い出の小瓶、そして静かに時を刻む大きな柱時計に囲まれた小さな工房です。',
      '作業台に座って懐中時計を直しているのが、銀灰色の髪と紺のハンチング帽をかぶった時間職人――「トキツギ」です。',
    ],
    relicBadge: '最初の真鍮懐中時計',
  },
  {
    id: 'tk_ep2',
    chapter: 2,
    timeLabel: '0:35 — 机に並ぶ時間の欠片',
    title: '壊れてしまった“時間”たち',
    requiredDiaryLevel: 2,
    requiredWatchesMended: 4,
    quote: '「止まったままの時計たちが、静かに呼んでる『まだ終わってない』と」',
    body: [
      'トキツギが直しているのは、ただの壊れた時計ではありません。人の暮らしの中でこぼれ落ちてしまった“時間”そのものです。',
      '床に落ちて割れてしまった写真立ての思い出。あと少しで手が届かなかったすれ違いのタイミング。どうしても口にできなかった「ありがとう」の言葉。',
      'トキツギはそんな時間の欠片をひとつひとつ小瓶へ拾い集め、持ち主の想いにそっと耳を澄ませます。',
    ],
    relicBadge: '思い出の小瓶と精密ピンセット',
  },
  {
    id: 'tk_ep3',
    chapter: 3,
    timeLabel: '1:50 — 金色の糸が結ぶ瞬間',
    title: '少しだけ“繋ぎ直す”仕事',
    requiredDiaryLevel: 3,
    requiredWatchesMended: 8,
    quote: '「壊れた時間は消えないけど、優しく縫い直せるなら」',
    body: [
      '壊れてしまった時間を、まったくなかったことにはできません。それでもトキツギは、輝く金色の「時間の糸」を取り出し、ズレてしまった瞬間をほんの少しだけ重ね合わせて縫い直します。',
      'ちく、たく、ちく、たく。精密な歯車がふたたび噛み合った瞬間、懐中時計の文字盤から幻想的な青と金の光がふわっとあふれ出しました。',
      '「大丈夫、ちゃんと届いてるよ。」――トキツギはそっと微笑んで、直した時間を持ち主のもとへ送り出します。',
    ],
    relicBadge: '金色の時間の糸ボビン',
  },
  {
    id: 'tk_ep4',
    chapter: 4,
    timeLabel: '3:15 — 静かな夜の街で起きる奇跡',
    title: 'それは偶然ではない',
    requiredDiaryLevel: 4,
    requiredWatchesMended: 13,
    quote: '「気づかれなくても、確かにある。小さな奇跡の中で」',
    body: [
      'だから時々、私たちの暮らしの中で不思議なことが起きます。ずっと探していたはずの古い写真が、なぜか机の奥からひょっこり見つかったり。',
      'あの日言えなかったはずの「ありがとう」が、ふとした拍子に笑顔でちゃんと伝わったり。もう会えない大切な人が、夢の中で優しく笑ってくれる夜があったり。',
      'それは決して偶然ではありません。誰にも気づかれない押し入れの奥で、トキツギが静かに仕事をした証なのです。',
    ],
    relicBadge: '見つかった写真立てと奇跡の証',
  },
  {
    id: 'tk_ep5',
    chapter: 5,
    timeLabel: '5:05 — 夜明け前の押し入れの灯り',
    title: '壊れた時間のその先で',
    requiredDiaryLevel: 5,
    requiredWatchesMended: 20,
    quote: '「壊れた時間のその先で、また誰かが笑えるなら」',
    body: [
      '夜明けが近づくころ、トキツギは使い終えた道具を几帳面に木箱へしまい、最後の懐中時計を柔らかな布で磨き上げます。',
      '誰かに名前を呼ばれることはなくても、どこかで誰かの物語がもう一度あたたかく繋がっていく――それだけで、トキツギの心は甘いお菓子を食べたときのように満たされるのです。',
      '今夜も常世町のどこかで、少しだけ開いた押し入れの奥から、小さなランタンの灯りがゆらゆら揺れています。',
    ],
    relicBadge: '常世町の星繋ぎマスター時計',
  },
];

export function getTokitsugiUpgradeCost(
  def: TokitsugiUpgradeDef,
  currentLevel: number
): { sands: number; miracles: number } {
  const sands = Math.round(def.baseCostSands * Math.pow(def.costScale, currentLevel));
  const miracles =
    def.baseCostMiracles === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostMiracles * Math.pow(1.48, currentLevel));
  return { sands, miracles };
}
