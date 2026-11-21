import {
  KagemichiStoryEpisode,
  KagemichiTrackDef,
  KagemichiTrackId,
  KagemichiUpgradeDef,
  MemoryTypeDef,
} from './types';

export const LANE_POSITIONS = [-2.25, 0, 2.25] as const;

export const MEMORY_TYPES: MemoryTypeDef[] = [
  {
    id: 'thanks',
    name: '言えなかった「ありがとう」',
    subtitle: '琥珀の灯火',
    colorHex: 0xffcf82,
    emissiveHex: 0xf59e3d,
    cssColor: '#ffd48f',
    baseValue: 12,
    feverGain: 4.8,
    weight: 32,
  },
  {
    id: 'letter',
    name: '渡せなかった手紙',
    subtitle: '月白の封筒',
    colorHex: 0xeef3ff,
    emissiveHex: 0x9fb8eb,
    cssColor: '#edf2ff',
    baseValue: 16,
    feverGain: 5.5,
    weight: 26,
  },
  {
    id: 'bottle',
    name: 'しまいこんだ気持ち',
    subtitle: '蒼銀の小瓶',
    colorHex: 0x99c2ff,
    emissiveHex: 0x5288e0,
    cssColor: '#a6ccff',
    baseValue: 20,
    feverGain: 6.2,
    weight: 20,
  },
  {
    id: 'warmth',
    name: '消えなかった温度',
    subtitle: '暁桃の星火',
    colorHex: 0xffb39e,
    emissiveHex: 0xe86b52,
    cssColor: '#ffbaa6',
    baseValue: 26,
    feverGain: 7.2,
    weight: 15,
  },
  {
    id: 'ticket',
    name: '再会の夢切符',
    subtitle: '黄金の硬券',
    colorHex: 0xfff099,
    emissiveHex: 0xffc336,
    cssColor: '#fff1a3',
    baseValue: 52,
    feverGain: 12.5,
    weight: 7,
  },
];

export const KAGEMICHI_TRACKS: Record<KagemichiTrackId, KagemichiTrackDef> = {
  dreamy: {
    id: 'dreamy',
    title: 'カゲミチ — Dreamy Ver.',
    shortLabel: '🌙 Dreamy',
    url: './assets/audio/kagemichi_dreamy.mp3',
    bpm: 112.0,
    durationSec: 62,
    runSpeed: 13.8,
    spawnEveryBeats: 1.0,
    obstacleRate: 0.22,
    valueMultiplier: 1.0,
    unlockClockLevel: 0,
  },
  normal: {
    id: 'normal',
    title: 'カゲミチ — 通常版',
    shortLabel: '✨ 通常版',
    url: './assets/audio/kagemichi_normal.mp3',
    bpm: 148.0,
    durationSec: 62,
    runSpeed: 16.8,
    spawnEveryBeats: 1.0,
    obstacleRate: 0.3,
    valueMultiplier: 1.4,
    unlockClockLevel: 1,
  },
  instrumental: {
    id: 'instrumental',
    title: 'カゲミチ — Instrumental',
    shortLabel: '🎹 Inst',
    url: './assets/audio/kagemichi_instrumental.mp3',
    bpm: 149.5,
    durationSec: 62,
    runSpeed: 19.2,
    spawnEveryBeats: 0.75,
    obstacleRate: 0.36,
    valueMultiplier: 1.85,
    unlockClockLevel: 2,
  },
};

export const KAGEMICHI_UPGRADES: KagemichiUpgradeDef[] = [
  {
    id: 'lantern',
    name: '真鍮のランタンを磨く',
    propName: '右手の案内ランタン',
    description: '暖かい灯りの照射範囲が広がり、近くの想いを自動で引き寄せやすくなります。',
    maxLevel: 8,
    baseCostLights: 50,
    baseCostTickets: 0,
    costScale: 1.75,
    effectText: (lv) =>
      `照射・吸引幅 +${(lv * 0.22).toFixed(2)}m / 獲得灯火 ×${(1 + lv * 0.16).toFixed(2)}`,
  },
  {
    id: 'sortingShelf',
    name: '手紙の仕分け棚を整える',
    propName: '詰め所奥の仕分け棚',
    description: '渡せなかった手紙の整理が進み、夢送り時の「夢の切符」報酬とコンボ倍率が増えます。',
    maxLevel: 8,
    baseCostLights: 65,
    baseCostTickets: 1,
    costScale: 1.85,
    effectText: (lv) =>
      `夢送り報酬 +${lv} 切符 / 想い価値 ×${(1 + lv * 0.25).toFixed(2)}`,
  },
  {
    id: 'clock',
    name: 'おわりの駅の時計を合わせる',
    propName: '0:40を指す駅舎時計',
    description: '楽曲バージョン（通常版・Instrumental）を解放し、DREAM EXPRESS 並走時間を延ばします。',
    maxLevel: 5,
    baseCostLights: 95,
    baseCostTickets: 1,
    costScale: 1.95,
    effectText: (lv) => {
      const dur = 14 + lv * 2;
      if (lv === 0) return `EXPRESS ${dur}秒（Lv.1で通常版解放）`;
      if (lv < 2) return `EXPRESS ${dur}秒 / 通常版解放済（Lv.2でInst解放）`;
      return `EXPRESS ${dur}秒 / 全3バージョン解放済！`;
    },
  },
  {
    id: 'jarShelf',
    name: '想いの瓶の棚を灯す',
    propName: '詰め所右壁の感情瓶棚',
    description: '棚の小瓶が夜のビートに共鳴し、4拍ごとに自動で灯火が宿ります（不在中も蓄積）。',
    maxLevel: 6,
    baseCostLights: 75,
    baseCostTickets: 1,
    costScale: 1.8,
    effectText: (lv) =>
      lv === 0 ? '未強化（自動共鳴なし）' : `4拍ごとに +${lv * 8} 灯火 / 放置 +${lv * 20}/分`,
  },
  {
    id: 'streetlamp',
    name: 'ホームの街灯を増やす',
    propName: 'おわりの駅の街灯＆ベンチ',
    description: 'レアな「再会の夢切符」の出現率が上がり、迷い霧を防ぐ光のシールドが付与されます。',
    maxLevel: 5,
    baseCostLights: 90,
    baseCostTickets: 1,
    costScale: 1.9,
    effectText: (lv) =>
      lv === 0 ? '未強化（霧シールドなし）' : `霧ガード ${lv}回 / 夢切符率 +${lv * 5}%`,
  },
  {
    id: 'memoryBox',
    name: '想いの箱と駅員机を整える',
    propName: '蓋の開いた想いの箱',
    description: '第二話『電車の終点に立つ案内人』の記録が順に解放され、全体の獲得倍率が上昇します。',
    maxLevel: 5,
    baseCostLights: 80,
    baseCostTickets: 1,
    costScale: 1.95,
    effectText: (lv) =>
      `終点の記録 ${lv} / 5 解放 / 全灯火 ×${(1 + lv * 0.22).toFixed(2)}`,
  },
];

export const KAGEMICHI_STORIES: KagemichiStoryEpisode[] = [
  {
    id: 'kg_ep1',
    chapter: 1,
    season: '0:40 — 無人駅のホーム',
    title: '終電のあとのもう一人',
    requiredBoxLevel: 1,
    requiredDreamsSent: 1,
    quote: '「こんばんは」',
    body: [
      '終電がいってしまったあとの駅は、しん、と静かです。濡れたホームの遠くに街明かりがにじむころ、だれもいないはずのホームにぽつんと“もう一人”立っていました。',
      'その影の名前は「カゲミチ」。人の影から生まれたような、ふしぎな案内人です。暗い顔の奥で、白い目だけが静かに光っています。',
      '足もとの真鍮ランタンがふっと揺れると、青灰色の詰め所とホームにあたたかい灯りがこぼれました。',
    ],
    ticketName: '終点ホームの入場券',
  },
  {
    id: 'kg_ep2',
    chapter: 2,
    season: '1:05 — 線路の向こう',
    title: '帰れなかった想い',
    requiredBoxLevel: 2,
    requiredDreamsSent: 3,
    quote: '「名前のない痛み、言えなかった言葉たちが、行き先を探している」',
    body: [
      'カゲミチには、だれにも知られていない仕事がありました。それは――“帰れなかった想い”を届けること。',
      '言えなかった「ありがとう」。ポケットの中で震えていた渡せなかった手紙。途中でしまいこんだ気持ち。',
      'カゲミチはホームと線路をゆっくり歩きながら、そんな行き場のない感情をランタンの光でそっと拾い集めます。',
    ],
    ticketName: '言えなかった言葉の切符',
  },
  {
    id: 'kg_ep3',
    chapter: 3,
    season: '2:15 — 見えないレール',
    title: '月をこえて、夢の中へ',
    requiredBoxLevel: 3,
    requiredDreamsSent: 6,
    quote: '「Last train to your dream — 終点の先で、また会える」',
    body: [
      '集めた想いは、ランタンの灯りに包まれて夜の街をゆっくり流れていきます。',
      '見えないレールのその先へ、夢行きの終電列車が静かにすべりだします。月をこえて、眠っている誰かの夢の中へ。',
      'その夜、ある人は夢を見ました。懐かしい声。もう会えない誰かの笑顔。そして――ずっと言えなかった言葉。',
    ],
    ticketName: '月明かりの夢行き急行券',
  },
  {
    id: 'kg_ep4',
    chapter: 4,
    season: '5:30 — 窓辺の朝焼け',
    title: '理由のない涙とあたたかさ',
    requiredBoxLevel: 4,
    requiredDreamsSent: 10,
    quote: '「……なんでだろう」',
    body: [
      '朝になると、その人は理由もなく涙を流しました。けれど窓から差し込む朝焼けの中で、胸の奥が少しだけ軽くなっていることに気づきます。',
      'もしあの日に戻れなくても、言葉は風になって届く。涙のあとに空が晴れるように、消えなかった温度がそっと背中を押してくれるのです。',
    ],
    ticketName: '朝焼けの払い戻し切符',
  },
  {
    id: 'kg_ep5',
    chapter: 5,
    season: '深夜 — おわりの駅',
    title: 'それでいいと、影は笑う',
    requiredBoxLevel: 5,
    requiredDreamsSent: 15,
    quote: '「それでいい」',
    body: [
      'そのころ、終点のホームにはまた小さな灯りが揺れていました。カゲミチは遠くの空を見上げ、静かにうなずきます。',
      '「それでいい」。終電のあと、だれもいない駅には今日も“案内人”が立っています。',
      '帰れなかった想いを、だれかの夢へ届けるために。Good night, see you in your dream.',
    ],
    ticketName: 'おわりの駅の永久定期券',
  },
];

export const LANTERN_CAPACITY = 12;

export function getKagemichiUpgradeCost(
  def: KagemichiUpgradeDef,
  currentLevel: number
): { lights: number; tickets: number } {
  const lights = Math.round(def.baseCostLights * Math.pow(def.costScale, currentLevel));
  const tickets =
    def.baseCostTickets === 0
      ? currentLevel >= 3
        ? currentLevel - 2
        : 0
      : Math.round(def.baseCostTickets * Math.pow(1.5, currentLevel));
  return { lights, tickets };
}
