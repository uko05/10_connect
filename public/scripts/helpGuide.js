// helpGuide.js — 右上「あそびかた」の中身(2026-11-08 作り直し)
// 以前は説明画像8枚(public/font/rule1〜8.png)だったが、画面が古くなったので、スクショ+文字のスライドにした。
// 各ページ(トップ・キャラ選択・対戦・CPU戦)の #helpModal .slider-images の中身をここで差し替える。
// 開く・閉じる・前後の切り替えは、今まで通り各ページのスクリプト(.slide の active を切り替える)が行う。
// このファイルは各ページのスクリプトから import するので、それらが .slide を探すより先に動く。
import { getCurrentLang } from './i18n.js';

const IMG = 'public/help/';
const IMGV = '?v=1.80.2'; // 画像を撮り直したら上げる(同じファイル名なので古い画像が残らないように)
const BADGE = 'public/scripts/badges/';

// layout: 'wide' = 画像が上・文字が下 / 'tall' = 画像が左・文字が右
// 画像の赤枠・赤文字の補足は tools/help_screenshots.py で描いている(説明文を変えたらそちらも合わせる)
const SLIDES = [
  {
    img: 'battle.jpg', layout: 'wide',
    ja: {
      title: '原壊：コネクトバトルとは',
      body: [
        'ボードゲーム「コネクトフォー（4目並べ）」がもとになった対戦ゲームです。',
        '交代で石を上から落として、縦・横・斜めのどれかに自分の石を<b>4つ並べる</b>と1ポイント。盤面がリセットされて次のラウンドが始まります。',
        '<b>先に3ポイント</b>取ったほうが勝ちです。',
        'キャラごとに違う<b>必殺技</b>があり、不利な盤面をひっくり返したり、一気に勝負を決めたりできます。',
      ],
    },
    en: {
      title: 'What is GK: Connect Battle?',
      body: [
        'A battle game based on the board game Connect Four.',
        'Take turns dropping stones from the top. Line up <b>4 of your stones</b> vertically, horizontally or diagonally to score 1 point. The board then resets for the next round.',
        'The first player to score <b>3 points</b> wins.',
        'Each character has its own <b>Ultimate</b> that can turn a bad board around or win the game in one go.',
      ],
    },
  },
  {
    img: 'hub.jpg', imgEn: true, layout: 'wide',
    ja: {
      title: 'トップ画面',
      body: [
        '<b>マッチング対戦</b>：ほかのプレイヤーとオンラインで戦います（ランク戦）。',
        '<b>CPU対戦</b>：CPUと1人で練習できます。キャラの解放もここで。レートは変わりません。',
        '<b>設定・プレイヤー情報</b>：ランク・戦績・アチーブメント・デザイン変更・各種設定。',
        '<b>NEWS</b>：キャラ調整などのお知らせです。新しいお知らせがあると赤い点が付きます。',
      ],
    },
    en: {
      title: 'Top screen',
      body: [
        '<b>Online Match</b>: fight other players online (ranked).',
        '<b>CPU Battle</b>: practice alone against the CPU. This is also where you unlock characters. Your rating does not change.',
        '<b>Settings &amp; Player Info</b>: rank, record, achievements, design and settings.',
        '<b>NEWS</b>: notices such as character balance changes. A red dot means there is something new.',
      ],
    },
  },
  {
    img: 'select.jpg', imgEn: true, layout: 'tall',
    ja: {
      title: 'キャラ選択',
      body: [
        '右の一覧からキャラを選ぶと、左にキャラの情報が出ます。',
        '<b>CT（チャージ量）</b>：石を1つ落とすたびに、必殺技のゲージがこの数だけたまります。',
        '<b>必殺技</b>：必殺技の名前と効果です。「○ターン目から発動可能」とあるものは、それより前には使えません。',
        'まだ使えないキャラもいます。アチーブメントや挑戦モードなどで解放できます。',
      ],
    },
    en: {
      title: 'Character select',
      body: [
        'Pick a character from the list on the right to see its info on the left.',
        '<b>CT (charge)</b>: each stone you drop fills your Ultimate gauge by this amount.',
        '<b>Ultimate</b>: the name and effect of the character’s Ultimate. Some can only be used from a certain turn on.',
        'Some characters are locked at first. Unlock them through achievements, challenge modes and more.',
      ],
    },
  },
  {
    img: 'match.jpg', imgEn: true, layout: 'tall',
    ja: {
      title: 'マッチング対戦',
      body: [
        '名前を入れてキャラを選び、<b>マッチング</b>を押すと相手を探します。',
        '勝つとレートが上がり、負けると下がります。',
        '<b>合言葉</b>：同じ合言葉を入れた人どうしで対戦できます。友達と遊ぶときに使ってください。合言葉の対戦ではレートは変わりません。',
      ],
    },
    en: {
      title: 'Online Match',
      body: [
        'Enter your name, pick a character and press <b>Match</b> to look for an opponent.',
        'Winning raises your rating and losing lowers it.',
        '<b>Passphrase</b>: players who enter the same passphrase are matched together. Use it to play with friends. Passphrase matches do not change your rating.',
      ],
    },
  },
  {
    img: 'challenge.jpg', layout: 'tall',
    ja: {
      title: 'CPU対戦と挑戦モード',
      body: [
        '<b>難易度</b>：EASY・NORMAL・HARD・BAKATARE の4段階です。',
        '<b>自分を選ぶ／相手を選ぶ</b>：一覧を押したときに、自分と相手のどちらのキャラを選ぶか切り替えます。<b>おまかせ</b>にすると相手はランダムです。',
        '<b>◀ ▶</b>：ボタンの左右の矢印で<b>挑戦モード</b>に切り替えられます。何人も続けて勝ち抜くモードで、クリアすると新しいキャラが解放されます。くわしくは ⓘ ボタンで見られます。',
      ],
    },
    en: {
      title: 'CPU Battle &amp; challenges',
      body: [
        '<b>Difficulty</b>: EASY, NORMAL, HARD and BAKATARE.',
        '<b>You / Opponent</b>: choose whether clicking the list sets your character or the CPU\'s. With <b>Random</b> the opponent is chosen at random.',
        '<b>◀ ▶</b>: the arrows next to the button switch to <b>challenge modes</b>, where you must win many matches in a row. Clearing one unlocks a new character. Press ⓘ for details.',
      ],
    },
  },
  {
    img: 'battle_ui.jpg', imgEn: true, layout: 'wide',
    ja: {
      title: '対戦画面',
      body: [
        '左が自分、右が相手です。名前の下の ◇◇◇ が取ったポイントで、1ポイント取るごとに ◆ になります。',
        '石を落としたい列をクリックすると、その列に石が落ちます（光っている列が今選んでいる列）。設定で「2クリックで落とす（列選択→確定）」にも変えられます。',
        'マッチング対戦は1ターン100秒です。時間切れになるとランダムな列に石が落ちて相手の番になり、<b>2回時間切れになると負け</b>です。',
      ],
    },
    en: {
      title: 'Battle screen',
      body: [
        'You are on the left and your opponent is on the right. The ◇◇◇ under each name shows points; each point turns one into ◆.',
        'Click a column to drop a stone there (the glowing column is the one you are pointing at). In settings you can switch to two clicks (select, then confirm).',
        'In online matches each turn has 100 seconds. If time runs out, a stone drops in a random column and the turn passes. <b>Running out of time twice is a loss.</b>',
      ],
    },
  },
  {
    img: 'standby.jpg', imgEn: true, layout: 'wide',
    ja: {
      title: '必殺技',
      body: [
        'キャラの横のゲージは、石を落とすたびにCTの分だけたまります（最大200）。<b>150以上</b>たまるとゲージが赤くなり、必殺技が使えます。',
        '自分の番に<b>自分のキャラのアイコン</b>をクリックすると、盤面の上に<b>「必殺技発動」</b>ボタンが出ます。押すと必殺技が発動します。必殺技待機状態を解除するときは、もう一度アイコンをクリックします。',
        '発動すると必殺技の効果が適用されます。その後、通常通り石を投下できます。必殺技を使ったターンは、ゲージはたまりません。',
        '相手のゲージや必殺技も見ながら戦いましょう。',
      ],
    },
    en: {
      title: 'Ultimates',
      body: [
        'The gauge next to your character fills by your CT each time you drop a stone (max 200). At <b>150 or more</b> it turns red and your Ultimate is ready.',
        'On your turn, click <b>your character icon</b> and a <b>"Use Ultimate"</b> button appears above the board. Press it to use your Ultimate. To cancel the Ultimate standby, click the icon again.',
        'When used, the Ultimate’s effect is applied. After that, you can drop a stone as usual. The gauge does not fill on the turn you use your Ultimate.',
        'Keep an eye on your opponent\'s gauge and Ultimate too.',
      ],
    },
  },
  {
    layout: 'text',
    ja: {
      title: 'そのほかのルール',
      body: [
        '1ラウンド目の先攻はランダムです。2ラウンド目からは、前のラウンドで負けたほうが先攻になります。',
        '盤面が石で全部埋まったときは、ランダムな縦1列の石がすべて消えます。',
        '必殺技などで2人同時に4つ並んだときは、2人とも1ポイントです。2人同時に3ポイントになったら引き分けです。',
      ],
    },
    en: {
      title: 'Other rules',
      body: [
        'Who goes first in round 1 is random. From round 2 on, the loser of the previous round goes first.',
        'If the board fills up completely, all stones in one random column are cleared.',
        'If both players line up 4 at the same time (for example through an Ultimate), both score 1 point. If both reach 3 points at once, the match is a draw.',
      ],
    },
  },
  {
    layout: 'rank',
    ja: {
      title: 'ランクとレート',
      body: [
        'レートは<b>1500</b>（Silver）から始まります。マッチング対戦で勝つと上がり、負けると下がります。',
        'CPU対戦と合言葉の対戦では、レートは変わりません。',
      ],
    },
    en: {
      title: 'Rank &amp; rating',
      body: [
        'Your rating starts at <b>1500</b> (Silver). It goes up when you win online matches and down when you lose.',
        'CPU matches and passphrase matches do not change your rating.',
      ],
    },
  },
  {
    img: 'playerinfo.jpg', imgEn: true, layout: 'tall',
    ja: {
      title: '設定・プレイヤー情報',
      body: [
        '<b>基本設定</b>：音量・クリック操作・言語。',
        '<b>デザイン変更</b>：石のデザイン・背景・タイトル画面のキャラを変えられます。',
        '<b>アチーブメント</b>：条件を満たすと解放されます。「新キャラ解放！」の付いたものを解放すると、新しいキャラが使えるようになります。解放したアチーブメントは、名前の下に2つまで表示できます。',
        '<b>戦績</b>：ランク戦・CPU戦・挑戦モードの成績です。',
      ],
    },
    en: {
      title: 'Settings &amp; Player Info',
      body: [
        '<b>Settings</b>: volume, click controls and language.',
        '<b>Design</b>: change your stone design, background and title-screen character.',
        '<b>Achievements</b>: unlocked by meeting their conditions. Ones marked "New Character!" unlock a new character. You can show up to 2 unlocked achievements under your name.',
        '<b>Records</b>: your results in ranked, CPU and challenge matches.',
      ],
    },
  },
];

const RANKS = [
  { name: '？？？', min: null, badge: null },
  { name: 'Legend', min: 2200, badge: 'badge_legend.png' },
  { name: 'Diamond', min: 2000, badge: 'badge_diamond.png' },
  { name: 'Platinum', min: 1800, badge: 'badge_platinum.png' },
  { name: 'Gold', min: 1600, badge: 'badge_gold.png' },
  { name: 'Silver', min: 1400, badge: 'badge_silver.png' },
  { name: 'Bronze', min: 0, badge: 'badge_bronze.png' },
];

function rankTable(lang) {
  const rows = RANKS.map((r) => {
    const icon = r.badge ? `<img src="${BADGE}${r.badge}" alt="" loading="lazy">` : '<span class="help-rank-unknown">?</span>';
    const range = r.min === null ? (lang === 'en' ? '???' : '？？？') : (r.min === 0 ? (lang === 'en' ? 'under 1400' : '1400未満') : `${r.min}〜`);
    return `<li>${icon}<span class="help-rank-name">${r.name}</span><span class="help-rank-min">${range}</span></li>`;
  }).join('');
  return `<ul class="help-rank-list">${rows}</ul>`;
}

function slideHtml(s, i, total) {
  const parts = ['ja', 'en'].map((lang) => {
    const d = s[lang];
    const text = `<h3 class="help-title">${d.title}</h3><ul class="help-body">${d.body.map((b) => `<li>${b}</li>`).join('')}</ul>`;
    let media = '';
    if (s.img) {
      // imgEn: 赤文字の補足が入った画像。英語版は xxx_en.jpg(tools/help_screenshots.py が作る)
      const src = lang === 'en' && s.imgEn ? s.img.replace('.jpg', '_en.jpg') : s.img;
      media = `<div class="help-media"><img src="${IMG}${src}${IMGV}" alt="" loading="lazy">${s.img2 ? `<img src="${IMG}${s.img2}${IMGV}" alt="" loading="lazy">` : ''}</div>`;
    } else if (s.layout === 'rank') {
      media = `<div class="help-media">${rankTable(lang)}</div>`;
    }
    return `<div class="help-lang" data-help-lang="${lang}"${lang === 'ja' ? '' : ' hidden'}>${media}<div class="help-text">${text}</div></div>`;
  }).join('');
  return `<div class="slide help-slide help-${s.layout}${i === 0 ? ' active' : ''}" data-help-index="${i}">${parts}<div class="help-page">${i + 1} / ${total}</div></div>`;
}

function applyLang(root) {
  const lang = getCurrentLang() === 'en' ? 'en' : 'ja';
  root.querySelectorAll('[data-help-lang]').forEach((n) => { n.hidden = n.getAttribute('data-help-lang') !== lang; });
}

function setup() {
  const modal = document.getElementById('helpModal');
  const box = modal?.querySelector('.slider-images');
  if (!box) return;
  modal.classList.add('help-modal');
  box.innerHTML = SLIDES.map((s, i) => slideHtml(s, i, SLIDES.length)).join('');
  applyLang(box);
  // 言語は設定画面で変えられるので、開くたびに合わせる(各ページの「開く」処理より先に動くよう capture で受ける)
  document.getElementById('helpButton')?.addEventListener('click', () => applyLang(box), true);
}

setup();
