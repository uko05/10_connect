// rankConfig.js — ランク帯定義（閾値・表示名・CSS・バッジ画像）
// ※ min の降順で定義すること（getRankTier が上から順に判定する）

const BADGE_BASE_PATH = "public/scripts/badges/";

export const RANK_TIERS = [
    { min: 2500, name: "Bakata Legend", cssClass: "rank-bakata",  badge: "badge_bakata.png" },
    { min: 2200, name: "Legend",        cssClass: "rank-legend",  badge: "badge_legend.png" },
    { min: 2000, name: "Diamond",       cssClass: "rank-diamond",  badge: "badge_diamond.png" },
    { min: 1800, name: "Platinum",      cssClass: "rank-platinum",  badge: "badge_platinum.png" },
    { min: 1600, name: "Gold",          cssClass: "rank-gold",    badge: "badge_gold.png" },
    { min: 1400, name: "Silver",        cssClass: "rank-silver",  badge: "badge_silver.png" },
    { min:    0, name: "Bronze",        cssClass: "rank-bronze",  badge: "badge_bronze.png" },
];

// rating → ランク情報オブジェクトを返す
export function getRankByRating(rating) {
    const r = rating ?? 1500;
    for (const tier of RANK_TIERS) {
        if (r >= tier.min) return tier;
    }
    return RANK_TIERS[RANK_TIERS.length - 1]; // フォールバック: Bronze
}

// rating → ランク名（文字列）を返す
export function getRankTier(rating) {
    return getRankByRating(rating).name;
}

// rating → CSSクラス名を返す
export function getRankCssClass(rating) {
    return getRankByRating(rating).cssClass;
}

// rating → バッジ画像パスを返す
export function getRankBadgePath(rating) {
    return BADGE_BASE_PATH + getRankByRating(rating).badge;
}
