// achievements.js - アチーブメント定義（グループ→項目）
// 新規追加は対象グループの items に追記するだけでよい。称号はここで解放済みのIDを参照するだけなので、
// 項目を増やせば自動的に称号の選択肢も増える。
// check(ctx) / progress(ctx) の ctx は achievementManager.js の buildContext() が組み立てる判定用コンテキスト。
import { characterData } from './characterData.js';

export const ACHIEVEMENT_GROUPS = [
    {
        id: 'solo_difficulty', name: 'ソロモード',
        items: [
            { id: 'solo_win_easy', rarity: 'bronze', name: 'はじめての勝利', condition: 'EASY難易度のCPUに勝利する', check: (ctx) => !!ctx.soloWins?.easy },
            { id: 'solo_win_normal', rarity: 'bronze', name: '標準を制す', condition: 'NORMAL難易度のCPUに勝利する', check: (ctx) => !!ctx.soloWins?.normal },
            { id: 'solo_win_hard', rarity: 'silver', name: '強敵を撃破', condition: 'HARD難易度のCPUに勝利する', check: (ctx) => !!ctx.soloWins?.hard },
            { id: 'solo_win_bakatare', rarity: 'gold', name: 'バカタレ討伐', condition: 'BAKATARE難易度のCPUに勝利する', check: (ctx) => !!ctx.soloWins?.bakatare },
            // キャラクター別BAKATARE討伐（characterDataから自動生成。新キャラ追加時に手動転記不要）
            ...characterData.map((c) => ({
                id: `solo_bakatare_${c.charaID}`,
                rarity: 'gold',
                name: `${c.name}で討伐`,
                condition: `「${c.name}」を使ってBAKATARE難易度のCPUに勝利する`,
                check: (ctx) => !!ctx.soloBakatareWins?.[c.charaID],
            })),
            {
                id: 'solo_bakatare_all', rarity: 'legend', name: '全戦士、討伐完了',
                condition: '全キャラクターでBAKATARE難易度に勝利する',
                check: (ctx) => characterData.every((c) => ctx.soloBakatareWins?.[c.charaID]),
                progress: (ctx) => ({
                    current: characterData.filter((c) => ctx.soloBakatareWins?.[c.charaID]).length,
                    target: characterData.length,
                }),
            },
        ],
    },
    {
        id: 'rank', name: 'ランク到達',
        items: [
            { id: 'rank_silver', rarity: 'bronze', name: 'Silverランク到達', condition: 'レート1400以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1400, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1400 }) },
            { id: 'rank_gold', rarity: 'bronze', name: 'Goldランク到達', condition: 'レート1600以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1600, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1600 }) },
            { id: 'rank_platinum', rarity: 'silver', name: 'Platinumランク到達', condition: 'レート1800以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1800, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1800 }) },
            { id: 'rank_diamond', rarity: 'silver', name: 'Diamondランク到達', condition: 'レート2000以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2000, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2000 }) },
            { id: 'rank_legend', rarity: 'gold', name: 'Legendランク到達', condition: 'レート2200以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2200, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2200 }) },
            { id: 'rank_bakata_legend', rarity: 'legend', name: 'Bakata Legendランク到達', condition: 'レート2500以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2500, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2500 }) },
        ],
    },
    {
        id: 'total_wins', name: '累計勝利',
        items: [
            { id: 'win_first', rarity: 'bronze', name: '初勝利', condition: '通常対戦で初勝利する', check: (ctx) => ctx.winCount >= 1, progress: (ctx) => ({ current: ctx.winCount, target: 1 }) },
            { id: 'win_10', rarity: 'bronze', name: '駆け出し戦士', condition: '通常対戦で10勝する', check: (ctx) => ctx.winCount >= 10, progress: (ctx) => ({ current: ctx.winCount, target: 10 }) },
            { id: 'win_50', rarity: 'silver', name: '歴戦の戦士', condition: '通常対戦で50勝する', check: (ctx) => ctx.winCount >= 50, progress: (ctx) => ({ current: ctx.winCount, target: 50 }) },
            { id: 'win_100', rarity: 'gold', name: '百戦錬磨', condition: '通常対戦で100勝する', check: (ctx) => ctx.winCount >= 100, progress: (ctx) => ({ current: ctx.winCount, target: 100 }) },
        ],
    },
    {
        id: 'chara_mastery', name: 'キャラ別勝利',
        // キャラ別の通常対戦（ランクマッチ）勝利数アチーブメント。characterDataから自動生成。
        // charaWinsはレーティングのTransaction（eloRating.js）でのみ更新される値をそのまま参照するだけで、
        // ここから書き込みは行わない（rating/charaWinsの更新経路をachievement側に増やさない）。
        items: characterData.flatMap((c) => [
            {
                id: `chara_win10_${c.charaID}`,
                rarity: 'bronze',
                name: `${c.name}の導き`,
                condition: `「${c.name}」で通常対戦10勝する`,
                check: (ctx) => (ctx.charaWins?.[c.charaID] || 0) >= 10,
                progress: (ctx) => ({ current: Math.min(ctx.charaWins?.[c.charaID] || 0, 10), target: 10 }),
            },
            {
                id: `chara_win50_${c.charaID}`,
                rarity: 'silver',
                name: `${c.name}の絆`,
                condition: `「${c.name}」で通常対戦50勝する`,
                check: (ctx) => (ctx.charaWins?.[c.charaID] || 0) >= 50,
                progress: (ctx) => ({ current: Math.min(ctx.charaWins?.[c.charaID] || 0, 50), target: 50 }),
            },
        ]),
    },
    {
        id: 'ultimate', name: '必殺技',
        items: [
            { id: 'ult_first_use', rarity: 'bronze', name: '初めての必殺技', condition: '必殺技を初めて発動する', check: (ctx) => ctx.ultUsedTotal >= 1 },
            { id: 'ult_seal_win', rarity: 'silver', name: '実力で示す', condition: '必殺技を一度も使わずに通常対戦に勝利する', check: (ctx) => !!ctx.hadSealWin },
            { id: 'ult_double_win', rarity: 'silver', name: '必殺技連発', condition: '1試合中に必殺技を2回以上発動して勝利する', check: (ctx) => !!ctx.hadDoubleUltWin },
        ],
    },
    {
        id: 'match_pattern', name: '決着パターン',
        items: [
            { id: 'straight_win', rarity: 'bronze', name: '圧勝', condition: '通常対戦をストレート(3-0)で勝利する', check: (ctx) => !!ctx.hadStraightWin },
            { id: 'clean_win', rarity: 'bronze', name: '正々堂々', condition: '離脱・タイムアウトのない試合で勝利する', check: (ctx) => !!ctx.hadCleanWin },
            { id: 'comeback_win', rarity: 'gold', name: '掟破りの奇兵', condition: '0-2の劣勢から3-2で逆転勝利する', check: (ctx) => !!ctx.hadComebackWin },
        ],
    },
    {
        id: 'bakatare_challenge', name: 'ばかたれチャレンジ',
        items: [
        ],
    },
];

export const ALL_ACHIEVEMENTS = ACHIEVEMENT_GROUPS.flatMap((g) =>
    g.items.map((a) => ({ ...a, groupId: g.id }))
);

// デバッグ専用アチーブメント。ACHIEVEMENT_GROUPS / ALL_ACHIEVEMENTS には含めない
// （一覧に出さず、解放記録もしない＝何度でもトーストを確認できる）。
// プレイヤー情報画面で名前の末尾に「@debug」をつけて保存すると、このトーストが毎回表示される。
export const DEBUG_ACHIEVEMENT = {
    id: 'debug_test',
    rarity: 'legend',
    name: 'デバッグテスト@debug',
    condition: 'プレイヤー情報画面で名前の末尾に「@debug」をつけて保存する',
};
