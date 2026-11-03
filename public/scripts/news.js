// news.js - トップ画面の「お知らせ」(2026-11-03)
// 新しいお知らせは NEWS の先頭に足す。データベースは使わない(読み取り数が増えない)。
// 前回見た一番新しいお知らせの id を localStorage に覚えておき、それより新しいものがあれば印を出す。
import { getCurrentLang } from './i18n.js';

export const NEWS = [
    {
        id: '2026-11-03',
        date: '2026-11-03',
        ja: {
            title: 'キャラクターの調整とCPUの打ち方の変更',
            items: [
                '必殺技ゲージのたまる速さを調整しました。',
                '上がったキャラ: アルハイゼン(11→12)、ナヴィア(9→10)、花火(9→10)、キャストリス(15→16)、ホタル(16→18)、ローエン(8→10)、鍾離(15→16)、フリーナ(12→14)',
                '下がったキャラ: 魈(13→11)、星神★アッハ(15→14)',
                'CPUの星神★アッハが、ひっくり返したあと次の1手で勝てる形のときにも必殺技を使うようになり、強くなりました(そのぶんゲージのたまる速さを少し下げています)。',
                'CPUがキャラごとに打ち方のクセを持つようになりました(必殺技に合わせた置き方、攻め寄り・守り寄りなど)。',
                'CPUが毎回同じ手を打たないよう、手にばらつきを持たせました。ときどき少し甘い手も打ちます。',
                'プレイヤーが花火の必殺技を使った直後、CPUが自分でプレイヤーの4つ並びを完成させてしまう不具合を直しました。',
                '「設定・プレイヤー情報」に「戦績」タブを追加しました。ランク戦・CPU戦のキャラ別の勝敗などが見られます。',
            ],
        },
        en: {
            title: 'Character balance and CPU play changes',
            items: [
                'Adjusted how fast the special-ability gauge fills.',
                'Up: Alhaitham (11→12), Navia (9→10), Sparkle (9→10), Castorice (15→16), Firefly (16→18), Lohen (8→10), Zhongli (15→16), Furina (12→14)',
                'Down: Xiao (13→11), Aeon ★ Aha (15→14)',
                'The CPU Aeon ★ Aha now also uses its ability when the flipped board lets it win on the next move, making it stronger (its gauge fills a little slower to balance this).',
                'The CPU now has a play style for each character (placing stones to suit their ability, offense- or defense-leaning, and so on).',
                'The CPU no longer plays the same move every time, and sometimes makes a slightly weaker move.',
                'Fixed a bug where, right after the player used Sparkle\'s ability, the CPU completed the player\'s four-in-a-row by itself.',
                'Added a "Records" tab to Settings / Player Info, with win/loss records by character for ranked and CPU matches.',
            ],
        },
    },
];

const SEEN_KEY = 'connectNewsSeen';

function readSeen() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
}
function writeSeen(id) {
    try { localStorage.setItem(SEEN_KEY, id); } catch { /* 保存できなくても表示はできる */ }
}

function textOf(n) {
    return n[getCurrentLang()] || n.ja;
}

function formatDate(date) {
    const [y, m, d] = date.split('-');
    return `${y}/${m}/${d}`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// buttonId: トップ画面のお知らせの行、modalId: 一覧を出すモーダル
export function setupNews(buttonId, modalId) {
    const btn = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    if (!btn || !modal || !NEWS.length) return;
    const latest = NEWS[0];

    btn.querySelector('.hub-news-date').textContent = formatDate(latest.date);
    btn.querySelector('.hub-news-title').textContent = textOf(latest).title;
    const dot = btn.querySelector('.hub-news-dot');
    dot.hidden = readSeen() >= latest.id;
    btn.hidden = false;

    modal.querySelector('.news-list').innerHTML = NEWS.map((n) => {
        const tx = textOf(n);
        return `<article class="news-item">
            <div class="news-item-date">${formatDate(n.date)}</div>
            <h3 class="news-item-title">${escapeHtml(tx.title)}</h3>
            <ul>${tx.items.map((it) => `<li>${escapeHtml(it)}</li>`).join('')}</ul>
        </article>`;
    }).join('');

    const close = () => { modal.style.display = 'none'; };
    btn.addEventListener('click', () => {
        modal.style.display = 'block';
        writeSeen(latest.id);
        dot.hidden = true;
    });
    modal.querySelector('.close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
