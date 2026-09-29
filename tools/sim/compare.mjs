// tools/sim/compare.mjs — 2つのシミュレーション結果(例: キャラ別ルール版 と 試して判断版)を並べて比較する
//
// 使い方(10_connect フォルダで実行):
//   node tools/sim/compare.mjs <結果1.json> <結果2.json> [出力.md]
// 総合勝率と1試合あたりの必殺技回数を、キャラごとに横並びにした表を作る。

import fs from 'node:fs';

const [fileA, fileB, out] = process.argv.slice(2);
if (!fileA || !fileB) {
    console.error('使い方: node tools/sim/compare.mjs <結果1.json> <結果2.json> [出力.md]');
    process.exit(1);
}
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const A = load(fileA);
const B = load(fileB);
const label = (d) => `先読み${d.depth}手・${d.rollout ? '試して判断' : 'キャラ別ルール'}${d.tieRandom ? '・同点ランダム' : ''}`;
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const byId = (d) => Object.fromEntries(d.ranking.map((r) => [r.id, r]));
const a = byId(A);
const b = byId(B);

const rows = B.ranking.map((r) => {
    const x = a[r.id];
    return { name: r.name, rateA: x.rate, rateB: r.rate, diff: r.rate - x.rate, ultA: x.ults / x.games, ultB: r.ults / r.games };
});

let md = `# シミュレーション結果の比較\n\n- 左: ${label(A)}(1組み合わせ${A.games}試合)\n- 右: ${label(B)}(1組み合わせ${B.games}試合)\n\n`;
md += `| 順位(右) | キャラ | 勝率(左) | 勝率(右) | 差 | 必殺技/試合(左) | 必殺技/試合(右) |\n|---|---|---|---|---|---|---|\n`;
rows.forEach((r, i) => {
    const sign = r.diff >= 0 ? '+' : '';
    md += `| ${i + 1} | ${r.name} | ${pct(r.rateA)} | ${pct(r.rateB)} | ${sign}${(r.diff * 100).toFixed(1)} | ${r.ultA.toFixed(2)} | ${r.ultB.toFixed(2)} |\n`;
});
md += `\n差が大きいキャラは「CPUの必殺技の使い方」で勝率が変わっていたキャラ。差が小さいキャラは、使い方に関係なくその強さ。\n`;

if (out) fs.writeFileSync(out, md);
console.log(md);
