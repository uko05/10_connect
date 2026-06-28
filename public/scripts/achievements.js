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
                id: 'solo_bakatare_all', rarity: 'legend', name: 'チート？使ってないよ？',
                condition: '合計9キャラでBAKATARE難易度のCPUに勝利する',
                check: (ctx) => Object.values(ctx.soloBakatareWins || {}).filter(Boolean).length >= 9,
                progress: (ctx) => ({
                    current: Math.min(Object.values(ctx.soloBakatareWins || {}).filter(Boolean).length, 9),
                    target: 9,
                }),
            },
        ],
    },
    {
        id: 'rank', name: 'ランク到達',
        items: [
            { id: 'rank_silver', rarity: 'bronze', name: 'Silver', condition: 'レート1400以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1400, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1400 }) },
            { id: 'rank_gold', rarity: 'bronze', name: 'Gold', condition: 'レート1600以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1600, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1600 }) },
            { id: 'rank_platinum', rarity: 'silver', name: 'Platinum', condition: 'レート1800以上に到達する', check: (ctx) => ctx.maxRatingReached >= 1800, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 1800 }) },
            { id: 'rank_diamond', rarity: 'silver', name: 'Diamond', condition: 'レート2000以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2000, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2000 }) },
            { id: 'rank_legend', rarity: 'gold', name: 'Legend', condition: 'レート2200以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2200, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2200 }) },
            { id: 'rank_bakata_legend', rarity: 'legend', name: 'Bakata Legend', condition: 'レート2500以上に到達する', check: (ctx) => ctx.maxRatingReached >= 2500, progress: (ctx) => ({ current: ctx.maxRatingReached, target: 2500 }) },
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
            { id: 'ult_five_win', rarity: 'gold', name: '法の皇帝であり、盤上の支配者', condition: '1試合中に必殺技を5回以上発動して勝利する', check: (ctx) => !!ctx.hadFiveUltWin },
        ],
    },
    {
        id: 'match_pattern', name: '決着パターン',
        items: [
            { id: 'straight_win',   rarity: 'bronze', name: '圧勝１', condition: '通常対戦をストレート(3-0)で1回勝利する',  check: (ctx) => !!ctx.hadStraightWin },
            { id: 'straight_win_5', rarity: 'silver', name: '圧勝２', condition: '通常対戦をストレート(3-0)で5回勝利する',  check: (ctx) => (ctx.straightWinCount || 0) >= 5,  progress: (ctx) => ({ current: Math.min(ctx.straightWinCount || 0, 5),  target: 5  }) },
            { id: 'straight_win_10', rarity: 'gold',  name: '圧勝３', condition: '通常対戦をストレート(3-0)で10回勝利する', check: (ctx) => (ctx.straightWinCount || 0) >= 10, progress: (ctx) => ({ current: Math.min(ctx.straightWinCount || 0, 10), target: 10 }) },
            { id: 'clean_win', rarity: 'bronze', name: '正々堂々', condition: '離脱・タイムアウトのない試合で勝利する', check: (ctx) => !!ctx.hadCleanWin },
            { id: 'comeback_win', rarity: 'gold', name: '掟破りの奇兵', condition: '0-2の劣勢から3-2で逆転勝利する', check: (ctx) => !!ctx.hadComebackWin },
        ],
    },
    {
        id: 'bakatare_challenge', name: 'ばかたれチャレンジ',
        items: [
            { id: 'cerylua_ult5_win', rarity: 'gold', name: '支配者の風格', condition: 'ケリュドラの必殺技を1試合中に5回使用して勝利する', hiddenCharaId: '015', check: (ctx) => !!ctx.hadCeryluaUlt5Win },
            { id: 'bakatare_tester', rarity: 'gold', name: 'ばかたれの同志', condition: 'プレイヤー情報画面で名前の先頭に「ばかたれ@」をつけて保存する', hidden: true, check: () => false },
            { id: 'debug_test', rarity: 'legend', name: 'デバッグテスト@debug', condition: 'プレイヤー情報画面で名前の末尾に「@debug」をつけて保存する', hidden: true, check: () => false },
        ],
    },
];

export const ALL_ACHIEVEMENTS = ACHIEVEMENT_GROUPS.flatMap((g) =>
    g.items.map((a) => ({ ...a, groupId: g.id }))
);

// debug_test は ALL_ACHIEVEMENTS に含まれているため、IDの参照用にエクスポートする
export const DEBUG_ACHIEVEMENT = ALL_ACHIEVEMENTS.find(a => a.id === 'debug_test');
