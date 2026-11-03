// news.js - トップ画面の「お知らせ」(2026-11-03)
// 新しいお知らせは NEWS の先頭に足す。データベースは使わない(読み取り数が増えない)。
// 前回見た一番新しいお知らせの id を localStorage に覚えておき、それより新しいものがあれば印を出す。
import { getCurrentLang } from './i18n.js';

export const NEWS = [
    {
        id: '2026-11-03',
        date: '2026-11-03',
        ja: {
            title: 'キャラクターのチャージ修正',
            lines: [
                '下記のキャラのチャージを修正しました。',
                'アルハイゼン（11→12）',
                'ナヴィア（9→10）',
                '花火（9→10）',
                'キャストリス（15→16）',
                '魈（13→11）',
                'ホタル（16→18）',
                'ローエン（8→10）',
                '鍾離（15→16）',
                'フリーナ（12→14）',
                '星神★アッハ（15→14）',
            ],
        },
        en: {
            title: 'Character charge changes',
            lines: [
                'The charge of the following characters has been changed.',
                'Alhaitham (11→12)',
                'Navia (9→10)',
                'Sparkle (9→10)',
                'Castorice (15→16)',
                'Xiao (13→11)',
                'Firefly (16→18)',
                'Lohen (8→10)',
                'Zhongli (15→16)',
                'Furina (12→14)',
                'Aeon ★ Aha (15→14)',
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
            <div class="news-item-body">${tx.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
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
