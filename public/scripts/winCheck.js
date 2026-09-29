// winCheck.js - 4つ並びの勝利判定(オンライン対戦 gameLogic.js / CPU戦 soloLogic.js 共通)
//
// 以前は同じ判定が4か所(checkWin / checkWinLocal / checkWinOnBoard / checkWinInSim)に
// 別々に書かれていたのを1つにまとめたもの。呼び出し側の挙動(返り値の形・勝利マスの
// ハイライト順)は変えていない。
//
// board は board[row][col] = 'red' | 'yellow' | null の2次元配列(row 0 = 一番上)。

// 横・縦・右下がり・左下がり。この順番は「どの並びを先に見つけるか」と
// ハイライト順に影響するので変えないこと。
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// stones(キー "col_row") から board を作る。値は色文字列(CPU戦)でも { color }(オンライン)でもよい。
export function boardFromStones(stones, rows, cols) {
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const key in stones) {
        const [c, r] = key.split('_').map(Number);
        const v = stones[key];
        board[r][c] = (v && typeof v === 'object') ? v.color : v;
    }
    return board;
}

function inside(board, r, c) {
    return r >= 0 && r < board.length && c >= 0 && c < board[0].length;
}

// (r, c) から (dr, dc) 方向へ、同じ色が何個続くか(自分を含む)
function runLength(board, r, c, dr, dc, color) {
    let n = 1;
    while (inside(board, r + n * dr, c + n * dc) && board[r + n * dr][c + n * dc] === color) n++;
    return n;
}

// 盤面を上の行・左の列から順に見て、最初に見つかった4つ以上の並びを返す。
// 戻り値: { color, positions: [[row, col], ...] } または null
export function findFirstLine(board) {
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
            const color = board[r][c];
            if (!color) continue;
            for (const [dr, dc] of DIRECTIONS) {
                const n = runLength(board, r, c, dr, dc, color);
                if (n >= 4) {
                    const positions = [];
                    for (let i = 0; i < n; i++) positions.push([r + i * dr, c + i * dc]);
                    return { color, positions };
                }
            }
        }
    }
    return null;
}

// 最初に見つかった並びの色だけを返す(CPUの先読み用。配列を作らないので速い)
export function firstLineColor(board) {
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
            const color = board[r][c];
            if (!color) continue;
            for (const [dr, dc] of DIRECTIONS) {
                if (runLength(board, r, c, dr, dc, color) >= 4) return color;
            }
        }
    }
    return null;
}

// 指定した色に4つ以上の並びがあるか
export function hasLineOfColor(board, color) {
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
            if (board[r][c] !== color) continue;
            for (const [dr, dc] of DIRECTIONS) {
                if (runLength(board, r, c, dr, dc, color) >= 4) return true;
            }
        }
    }
    return false;
}

// 両方の色について、4つ以上の並びに含まれるマスを全部集める(オンライン対戦用)。
// 必殺技で両者が同時に4つ並ぶこともあるので、赤・黄それぞれ返す。
// 戻り値: { red: [[row, col], ...] | null, yellow: [[row, col], ...] | null }
// マスの並び順は勝利ハイライトの順番になる(以前の checkWin と同じ順)。
export function collectWinPositions(board) {
    const found = { red: new Set(), yellow: new Set() };
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
            const color = board[r][c];
            if (!color) continue;
            for (const [dr, dc] of DIRECTIONS) {
                // 前後両方向に伸ばした並び(後ろ側から順に)
                const back = runLength(board, r, c, -dr, -dc, color);
                const fwd = runLength(board, r, c, dr, dc, color);
                if (back + fwd - 1 < 4) continue;
                if (color !== 'red' && color !== 'yellow') continue;
                for (let i = back - 1; i >= -(fwd - 1); i--) {
                    found[color].add(`${r - i * dr},${c - i * dc}`);
                }
            }
        }
    }
    const toList = (set) => (set.size >= 4 ? Array.from(set).map((p) => p.split(',').map(Number)) : null);
    return { red: toList(found.red), yellow: toList(found.yellow) };
}
