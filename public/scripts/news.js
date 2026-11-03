// news.js - トップ画面の「お知らせ」(2026-11-03)
// 新しいお知らせは NEWS の先頭に足す。データベースは使わない(読み取り数が増えない)。
// 前回見た一番新しいお知らせの id を localStorage に覚えておき、それより新しいものがあれば印を出す。
import { getCurrentLang, getCharaText } from './i18n.js';
import { characterData, isCharaUnlocked } from './characterData.js';

// charges: チャージを変えたキャラ。名前は characterData から出し、見ている人がまだ解放していない隠しキャラは「？？？」にする
export const NEWS = [
    {
        id: '2026-11-20',
        date: '2026-11-20',
        ja: { title: 'メンテナンスのお知らせ（テスト）', intro: 'テスト用のお知らせです。11/21 2:00〜3:00 にメンテナンスを行います。' },
        en: { title: 'Maintenance (test)', intro: 'This is a test announcement.' },
    },
    {
        id: '2026-11-17',
        date: '2026-11-17',
        ja: { title: 'キャラクターのチャージ修正（テスト）', intro: '下記のキャラのチャージを修正しました。' },
        en: { title: 'Character charge changes (test)', intro: 'The charge of the following characters has been changed.' },
        charges: [['001', 14, 15], ['002', 15, 14], ['006', 10, 11], ['013', 14, 13], ['018', 16, 15]],
    },
    {
        id: '2026-11-14',
        date: '2026-11-14',
        ja: { title: '新しいアチーブメント追加（テスト）', intro: 'テスト用のお知らせです。長めの文章がどう折り返されるかを確認するため、少し長く書いています。新しいアチーブメントを5つ追加しました。' },
        en: { title: 'New achievements (test)', intro: 'This is a test announcement.' },
    },
    {
        id: '2026-11-10',
        date: '2026-11-10',
        ja: { title: '新キャラクター追加（テスト）', intro: 'テスト用のお知らせです。キャラの行がない形の表示確認。' },
        en: { title: 'New character (test)', intro: 'This is a test announcement.' },
    },
    {
        id: '2026-11-05',
        date: '2026-11-05',
        ja: { title: 'キャラクターのチャージ修正（テスト）', intro: '下記のキャラのチャージを修正しました。' },
        en: { title: 'Character charge changes (test)', intro: 'The charge of the following characters has been changed.' },
        charges: [['008', 11, 10], ['016', 8, 9]],
    },
    {
        id: '2026-11-03',
        date: '2026-11-03',
        ja: { title: 'キャラクターのチャージ修正', intro: '下記のキャラのチャージを修正しました。' },
        en: { title: 'Character charge changes', intro: 'The charge of the following characters has been changed.' },
        charges: [
            ['003', 11, 12], ['004', 9, 10], ['005', 9, 10], ['007', 15, 16], ['008', 13, 11],
            ['009', 16, 18], ['011', 8, 10], ['012', 15, 16], ['019', 12, 14], ['020', 15, 14],
        ],
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

function charaLabel(id, achievements) {
    const c = characterData.find((x) => x.charaID === id);
    if (!c || !isCharaUnlocked(c, achievements)) return '？？？';
    return getCharaText(id, 'name') || c.name;
}

function renderList(achievements) {
    const ja = getCurrentLang() === 'ja';
    return NEWS.map((n) => {
        const tx = textOf(n);
        const lines = (n.charges || []).map(([id, from, to]) =>
            `<p class="news-chara">${escapeHtml(charaLabel(id, achievements))}${ja ? `（${from}→${to}）` : ` (${from}→${to})`}</p>`);
        return `<article class="news-item">
            <div class="news-item-date">${formatDate(n.date)}</div>
            <h3 class="news-item-title">${escapeHtml(tx.title)}</h3>
            <div class="news-item-body"><p>${escapeHtml(tx.intro)}</p>${lines.join('')}</div>
        </article>`;
    }).join('');
}

// buttonId: トップ画面のお知らせの行、modalId: 一覧を出すモーダル
// userDataPromise: トップ画面で読んでいるプレイヤー情報(解放済みアチーブの判定に使う。追加の読み取りはしない)
export function setupNews(buttonId, modalId, userDataPromise) {
    const btn = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    if (!btn || !modal || !NEWS.length) return;
    const latest = NEWS[0];

    btn.querySelector('.hub-news-date').textContent = formatDate(latest.date);
    btn.querySelector('.hub-news-title').textContent = textOf(latest).title;
    const dot = btn.querySelector('.hub-news-dot');
    dot.hidden = readSeen() >= latest.id;
    btn.hidden = false;

    let achievements = new Set();
    Promise.resolve(userDataPromise).then((d) => { achievements = new Set(d?.achievements || []); }).catch(() => {});

    const close = () => { modal.style.display = 'none'; };
    btn.addEventListener('click', () => {
        modal.querySelector('.news-list').innerHTML = renderList(achievements);
        modal.style.display = 'block';
        writeSeen(latest.id);
        dot.hidden = true;
    });
    modal.querySelector('.close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
