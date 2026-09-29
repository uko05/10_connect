// tools/sim/engine.mjs — コネバトの対戦シミュレーター本体(画面・サーバーなし、CPU同士で高速に対戦)
//
// public/scripts/soloLogic.js(CPU戦)のルール・必殺技・CPUの思考をそのまま移植し、
// 「プレイヤー vs CPU」だった処理を「サイドA vs サイドB」のどちらからでも使えるようにしたもの。
// ソロ側の仕様を変えたときは、ここも合わせて直すこと(対応箇所をコメントで書いてある)。
//
// 既知の差: アベンチュリン(008)の必殺技は、オンライン対戦では「相手の思考時間を減らす」だが
// CPU同士では意味を持たないため、ソロモード(通常難易度)と同じ「相手のチャージ-50」で代用している。

import { findFirstLine, firstLineColor, hasLineOfColor, boardFromStones } from '../../public/scripts/winCheck.js';
import { characterData } from '../../public/scripts/characterData.js';

export const ROWS = 6;
export const COLS = 7;
const ABEN_CHARGE_PENALTY = 50; // soloLogic.js と同じ
const ABEN_MAX_USES = 5;
const ULT_COST = 150;
const CHARGE_MAX = 200;
const MAX_ROUNDS = 15; // 引き分けが続いた場合の打ち切り(実戦ではまず起きない)
// 1ラウンドの手数の上限。ナヴィアの「上3段消し」などで盤面が埋まらず、双方が守り切ると
// ラウンドが終わらなくなる(実戦でも起こりうる)。上限に達したら引き分け扱いにして回数を記録する。
const MAX_TURNS_PER_ROUND = 150;
const COLUMN_SEARCH_ORDER = [3, 2, 4, 1, 5, 0, 6];
// 試した結果、撃つ方がこれ以上良いときだけ撃つ(わずかな差なら温存。盤面評価の1窓=数点程度)
const ROLLOUT_ULT_MARGIN = 1;

export const CHARAS = Object.fromEntries(characterData.map((c) => [c.charaID, c]));

// 再現できるように、試合ごとに種(seed)を決めた乱数を使う(mulberry32)
export function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickRandom(rng, array, count) { // soloLogic の getRandomElements 相当
    const pool = [...array];
    const out = [];
    while (out.length < Math.min(count, array.length)) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
}

// ─────────────────────────────────────────────
// 1試合(3本先取)の状態と進行
// ─────────────────────────────────────────────
export class Match {
    constructor(charaA, charaB, { depthA, depthB, rng, tieRandom = false, abilityMode = 'rules', rolloutDepth = 3, rolloutSamples = 4 }) {
        this.rng = rng;
        this.tieRandom = tieRandom; // true: 同点の手をランダムに選ぶ(AI.pickColumnTieRandom)
        // 必殺技を撃つかの判断方法。'rules': ソロCPUと同じキャラ別ルール /
        // 'rollout': 撃った場合と撃たない場合を裏で実際に試して良い方を選ぶ(AI.rolloutDecision)
        this.abilityMode = abilityMode;
        this.rolloutDepth = rolloutDepth;     // 試すときの先読みの深さ(重くなりすぎないよう浅め)
        this.rolloutSamples = rolloutSamples; // ランダム効果の必殺技を何回振り直して平均するか
        this.isRollout = false;               // 試しの対局(コピー)中なら true
        this.sides = {
            A: { key: 'A', color: 'red', chara: CHARAS[charaA], depth: depthA, charge: 0, ultCount: 0, roundWins: 0, ultTurns: [] },
            B: { key: 'B', color: 'yellow', chara: CHARAS[charaB], depth: depthB, charge: 0, ultCount: 0, roundWins: 0, ultTurns: [] },
        };
        this.startingSide = rng() < 0.5 ? 'A' : 'B';
        this.rounds = 0;
        this.draws = 0;
        this.totalTurns = 0;
        this.firstMoverRoundWins = 0; // ラウンド先攻がそのラウンドを取った回数
        this.decidedRounds = 0;
        this.cappedRounds = 0; // 手数上限で打ち切ったラウンド数
    }

    other(s) { return s === 'A' ? 'B' : 'A'; }

    // 試し用のコピー(盤面・チャージ・必殺技の状態をすべて複製し、乱数だけ別系統にする)。
    // 試しの中では、どちらのサイドもキャラ別ルールで判断し、先読みも浅くする(入れ子にしないため)。
    clone(seed) {
        const c = Object.create(Match.prototype);
        Object.assign(c, this);
        c.rng = makeRng(seed);
        c.isRollout = true;
        c.tieRandom = false;
        c.sides = {};
        for (const k of ['A', 'B']) {
            const s = this.sides[k];
            c.sides[k] = { ...s, ultTurns: [...s.ultTurns], depth: Math.min(s.depth, this.rolloutDepth) };
        }
        c.stones = { ...this.stones };
        c.zhongli = { ...this.zhongli, blocked: [...this.zhongli.blocked] };
        c.durin = { ...this.durin };
        c.cerlua = { ...this.cerlua };
        return c;
    }

    // コピー上で「side の今の手番(必殺技を撃つ/撃たないを指定)→相手の応手→自分の次の手」まで進め、
    // side から見た良さを返す(勝ち=+100万 / 負け=-100万 / それ以外は盤面評価)。
    // 自分の次の手まで見るのは、花火の「次の手で勝つ準備」やドゥリンの「次のターンの自動破壊」など、
    // 1手先に効果が出る必殺技も評価できるようにするため。
    rolloutValue(side, useUlt) {
        const judge = () => (this.lastRoundWinner === side ? 1000000 : this.lastRoundWinner ? -1000000 : 0);
        if (this.takeTurn(side, { forceUlt: useUlt, skipPreTurn: true })) return judge();
        if (this.takeTurn(this.other(side))) return judge();
        if (this.takeTurn(side)) return judge();
        return new AI(this, side).evaluate(boardFromStones(this.stones, ROWS, COLS));
    }
    sideOfColor(color) { return this.sides.A.color === color ? 'A' : 'B'; }

    // ── ラウンド開始(soloLogic.startNextRound) ──
    newRound() {
        this.stones = {};
        this.turnCount = 1;
        this.changeStone = 0;
        this.zhongli = { blocked: [], reblockRemaining: 0, caster: null };
        this.durin = { pending: false, caster: null };
        this.cerlua = { active: false, caster: null };
        this.roundStarter = this.startingSide;
        this.rounds++;
    }

    // ── 盤面の基本操作 ──
    dropRow(c) {
        for (let r = ROWS - 1; r >= 0; r--) if (!this.stones[`${c}_${r}`]) return r;
        return -1;
    }
    validColumns() {
        const v = [];
        for (let c = 0; c < COLS; c++) if (this.dropRow(c) >= 0) v.push(c);
        return v;
    }
    isFull() { return this.validColumns().length === 0; }
    drop(c, color) {
        const r = this.dropRow(c);
        if (r < 0) return false;
        this.stones[`${c}_${r}`] = color;
        return true;
    }
    colorSwap(color) { // applyColorSwap(花火の色反転中は置く色が逆になる)
        return this.changeStone > 0 ? (color === 'red' ? 'yellow' : 'red') : color;
    }
    deleteKeys(keys) { [...new Set(keys)].forEach((k) => delete this.stones[k]); }
    gravity(deletedKeys) { // applyGravityLocal
        const affected = new Set(deletedKeys.map((k) => k.split('_')[0]));
        for (const col of affected) {
            const colStones = [];
            for (let r = ROWS - 1; r >= 0; r--) {
                const key = `${col}_${r}`;
                if (this.stones[key]) { colStones.push(this.stones[key]); delete this.stones[key]; }
            }
            colStones.forEach((color, i) => { this.stones[`${col}_${ROWS - 1 - i}`] = color; });
        }
    }
    randomTopStones(count) { // getRandomTopStonesLocal
        const colsWithStones = [...new Set(Object.keys(this.stones).map((k) => k.split('_')[0]))];
        return pickRandom(this.rng, colsWithStones, count).map((colStr) => {
            const col = parseInt(colStr, 10);
            const rows = Object.keys(this.stones).filter((k) => k.startsWith(`${col}_`)).map((k) => parseInt(k.split('_')[1], 10));
            return { column: col, row: Math.min(...rows) };
        });
    }
    keysToDelete(topPositions, rowsToDelete) { // getStonesToDeleteLocal
        const keys = [];
        for (const { column, row } of topPositions) {
            if (rowsToDelete === 6) {
                for (let r = 0; r <= 5; r++) keys.push(`${column}_${r}`);
            } else {
                for (let o = 0; o < rowsToDelete; o++) {
                    const r = row + o;
                    if (r > 5) break;
                    if (this.stones[`${column}_${r}`]) keys.push(`${column}_${r}`);
                }
            }
        }
        return keys;
    }
    zhongliBlocks(side) { // side が封鎖されている列(相手が鍾離を発動した時だけ)
        return this.zhongli.caster === this.other(side) ? this.zhongli.blocked : [];
    }

    // ── 必殺技(soloLogic.abilityAvailable / executeAbility) ──
    abilityAvailable(side) {
        const s = this.sides[side];
        if (s.charge < ULT_COST) return false;
        if (this.turnCount < s.chara.AbilityUseTurn) return false;
        if (s.chara.charaID === '008' && s.ultCount >= ABEN_MAX_USES) return false;
        if (s.chara.charaID === '005' && this.changeStone > 0) return false;
        return true;
    }

    // 戻り値: 'match' (銀狼で試合終了) | null
    executeAbility(side, charaID) {
        const rng = this.rng;
        const me = this.sides[side];
        const opp = this.sides[this.other(side)];
        switch (charaID) {
            case '001': this.deleteKeys(this.keysToDelete(this.randomTopStones(4), 2)); break;
            case '002': this.deleteKeys(this.keysToDelete(this.randomTopStones(3), 1)); break;
            case '003': this.deleteKeys(this.keysToDelete(pickRandom(rng, [2, 3, 4], 2).map((column) => ({ column, row: 1 })), 6)); break;
            case '004': {
                const keys = [];
                for (let c = 0; c < COLS; c++) for (let r = 0; r <= 2; r++) keys.push(`${c}_${r}`);
                this.deleteKeys(keys);
                break;
            }
            case '005': this.changeStone = this.changeStone === 0 ? 2 : 3; break;
            case '006': this.deleteKeys(this.keysToDelete(this.randomTopStones(1), 6)); break;
            case '007': this.deleteKeys(this.keysToDelete(pickRandom(rng, [0, 1, 5, 6], 3).map((column) => ({ column, row: 1 })), 6)); break;
            case '008': opp.charge = Math.max(0, opp.charge - ABEN_CHARGE_PENALTY); break; // ソロ(通常難易度)仕様で代用
            case '009': {
                const v = this.validColumns();
                if (v.length) this.drop(v[Math.floor(rng() * v.length)], this.colorSwap(me.color));
                break;
            }
            case '010': {
                const myColor = this.colorSwap(me.color);
                const oppColor = this.colorSwap(opp.color);
                const oppKeys = Object.keys(this.stones).filter((k) => this.stones[k] === oppColor);
                for (const k of pickRandom(rng, oppKeys, 3)) this.stones[k] = myColor;
                if (this.winLine()) break; // 変換で勝利確定なら破壊しない
                const myKeys = Object.keys(this.stones).filter((k) => this.stones[k] === myColor);
                const del = pickRandom(rng, myKeys, 6);
                this.deleteKeys(del);
                this.gravity(del);
                break;
            }
            case '011': {
                const del = Object.keys(this.stones).filter((k) => k.endsWith('_4'));
                this.deleteKeys(del);
                this.gravity(del);
                break;
            }
            case '012':
                this.zhongli = { blocked: pickRandom(rng, this.validColumns(), 2), reblockRemaining: 2, caster: side };
                break;
            case '013': // サフェル: 相手の必殺技をコピー(相手もサフェルなら不発)
                if (opp.chara.charaID !== '013') return this.executeAbility(side, opp.chara.charaID);
                break;
            case '014': {
                const del = pickRandom(rng, Object.keys(this.stones), 2);
                this.deleteKeys(del);
                this.gravity(del);
                this.durin = { pending: true, caster: side };
                break;
            }
            case '015': this.cerlua = { active: true, caster: side }; break;
            case '016': // 銀狼: 勝利数+1(3勝で即試合終了、それ以外は盤面を維持して続行)
                me.roundWins++;
                if (me.roundWins >= 3) { this.lastRoundWinner = side; return 'match'; }
                break;
        }
        return null;
    }

    useAbility(side) {
        const s = this.sides[side];
        s.charge -= ULT_COST;
        s.ultCount++;
        s.ultTurns.push(this.turnCount);
        return this.executeAbility(side, s.chara.charaID);
    }

    winLine() { return findFirstLine(boardFromStones(this.stones, ROWS, COLS)); }

    // ラウンドの決着を確認(checkGameEnd)。戻り値: 'match' | 'round' | null
    checkEnd() {
        const line = this.winLine();
        if (line) {
            const winner = this.sideOfColor(line.color);
            this.lastRoundWinner = winner;
            this.sides[winner].roundWins++;
            this.decidedRounds++;
            if (winner === this.roundStarter) this.firstMoverRoundWins++;
            if (this.sides[winner].roundWins >= 3) return 'match';
            this.startingSide = this.other(winner); // 負けた側が次ラウンドの先攻
            return 'round';
        }
        if (this.isFull()) {
            this.lastRoundWinner = null;
            this.draws++;
            this.startingSide = this.rng() < 0.5 ? 'A' : 'B';
            return 'round';
        }
        return null;
    }

    // 1手分(soloLogic.cpuTurn を左右どちらでも動くようにしたもの)。戻り値は checkEnd と同じ
    // forceUlt: true/false なら必殺技を撃つかをAIに任せず指定する(試しの対局用)
    // skipPreTurn: ターン開始時の効果を処理済みとして飛ばす(試しの対局は手番の途中からコピーするため)
    takeTurn(side, { forceUlt, skipPreTurn = false } = {}) {
        const me = this.sides[side];
        const oppSide = this.other(side);
        // ターン開始時の効果(鍾離の再封鎖・ドゥリンの自動破壊)
        if (!skipPreTurn && this.zhongli.reblockRemaining > 0 && this.zhongli.caster === side) {
            this.zhongli.reblockRemaining--;
            this.zhongli.blocked = pickRandom(this.rng, this.validColumns(), 2);
        }
        if (!skipPreTurn && this.durin.pending && this.durin.caster === side) {
            this.durin = { pending: false, caster: null };
            const del = pickRandom(this.rng, Object.keys(this.stones), 2);
            this.deleteKeys(del);
            this.gravity(del);
        }
        let end = this.checkEnd();
        if (end) return end;

        const ai = new AI(this, side);
        let useUlt;
        if (forceUlt === undefined) useUlt = ai.shouldUseAbility();
        else {
            useUlt = forceUlt && this.abilityAvailable(side);
            // 花火(サフェルのコピー含む)を撃つなら、ルール版と同じく「次の手で勝てる準備の列」を使う
            if (useUlt && ai.effectiveUltId() === '005') ai.hanabiSetupCol = ai.findHanabiSetupCol();
        }
        if (useUlt) {
            if (this.useAbility(side) === 'match') return 'match';
            end = this.checkEnd();
            if (end) return end;
        }
        const col = ai.hanabiSetupCol >= 0 ? ai.hanabiSetupCol : ai.pickColumn();
        const dropped = this.colorSwap(me.color);
        this.drop(col, dropped);
        me.charge = Math.min(CHARGE_MAX, me.charge + me.chara.charge);

        // ケリュドラ: 相手が発動していたら、同じ列(満杯なら封鎖されていない最初の列)にもう1個
        if (this.cerlua.active && this.cerlua.caster === oppSide) {
            this.cerlua = { active: false, caster: null };
            const blocked = this.zhongliBlocks(side);
            const extra = this.dropRow(col) >= 0 ? col : (this.validColumns().find((c) => !blocked.includes(c)) ?? -1);
            if (extra >= 0) this.drop(extra, dropped);
        }
        if (this.changeStone > 0) this.changeStone--;
        this.turnCount++;
        this.totalTurns++;
        // 鍾離: 封鎖された側が1手打ち終えたら、いったん封鎖を外す(残り回数があれば術者のターン開始時に再封鎖)
        if (this.zhongli.caster === oppSide && (this.zhongli.blocked.length || this.zhongli.reblockRemaining > 0)) {
            this.zhongli.blocked = [];
            if (this.zhongli.reblockRemaining <= 0) this.zhongli.caster = null;
        }
        return this.checkEnd();
    }

    // 3本先取まで進める。戻り値: 'A' | 'B' | 'draw'(ラウンド数上限)
    play() {
        while (this.rounds < MAX_ROUNDS) {
            this.newRound();
            let side = this.startingSide;
            for (let t = 0; ; t++) {
                if (t >= MAX_TURNS_PER_ROUND) {
                    this.cappedRounds++;
                    this.draws++;
                    this.startingSide = this.rng() < 0.5 ? 'A' : 'B';
                    break;
                }
                const end = this.takeTurn(side);
                if (end === 'match') return this.sides.A.roundWins >= 3 ? 'A' : 'B';
                if (end === 'round') break;
                side = this.other(side);
            }
        }
        return 'draw';
    }
}

// ─────────────────────────────────────────────
// CPUの思考(soloLogic の minimax / 評価関数 / 必殺技の判断を、どちらのサイドでも使えるようにしたもの)
// ─────────────────────────────────────────────
export class AI {
    constructor(match, side) {
        this.m = match;
        this.side = side;
        this.me = match.sides[side];
        this.opp = match.sides[match.other(side)];
        this.myColor = this.me.color;
        this.oppColor = this.opp.color;
        this.hanabiSetupCol = -1;
    }

    wouldWin(c, color) {
        const m = this.m;
        const r = m.dropRow(c);
        if (r < 0) return false;
        m.stones[`${c}_${r}`] = color;
        const line = m.winLine();
        delete m.stones[`${c}_${r}`];
        return !!(line && line.color === color);
    }
    hasImmediateThreat(color) { return this.m.validColumns().some((c) => this.wouldWin(c, color)); }
    winInSim(sim) { return hasLineOfColor(boardFromStones(sim, ROWS, COLS), this.myColor); }
    gravitySim(sim) {
        const out = {};
        for (let c = 0; c < COLS; c++) {
            const col = [];
            for (let r = ROWS - 1; r >= 0; r--) if (sim[`${c}_${r}`]) col.push(sim[`${c}_${r}`]);
            col.forEach((v, i) => { out[`${c}_${ROWS - 1 - i}`] = v; });
        }
        return out;
    }

    // 必殺技を撃てばその場で勝てるか(wouldWinAfterAbility)
    wouldWinAfterAbility(charaID) {
        const stones = this.m.stones;
        switch (charaID) {
            case '004': {
                const sim = { ...stones };
                for (let c = 0; c < COLS; c++) for (let r = 0; r < 3; r++) delete sim[`${c}_${r}`];
                return this.winInSim(sim);
            }
            case '006':
                for (let c = 0; c < COLS; c++) {
                    const sim = { ...stones };
                    for (let r = 0; r < ROWS; r++) delete sim[`${c}_${r}`];
                    if (this.winInSim(sim)) return true;
                }
                return false;
            case '003': {
                const mid = [2, 3, 4];
                for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
                    const sim = { ...stones };
                    for (const c of [mid[i], mid[j]]) for (let r = 0; r < ROWS; r++) delete sim[`${c}_${r}`];
                    if (this.winInSim(sim)) return true;
                }
                return false;
            }
            case '007': {
                const outer = [0, 1, 5, 6];
                for (let skip = 0; skip < 4; skip++) {
                    const sim = { ...stones };
                    outer.forEach((c, i) => { if (i !== skip) for (let r = 0; r < ROWS; r++) delete sim[`${c}_${r}`]; });
                    if (this.winInSim(sim)) return true;
                }
                return false;
            }
            case '011': {
                const sim = { ...stones };
                for (let c = 0; c < COLS; c++) delete sim[`${c}_4`];
                return this.winInSim(this.gravitySim(sim));
            }
            case '002': {
                const colsWith = [];
                for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (stones[`${c}_${r}`]) { colsWith.push(c); break; }
                if (colsWith.length < 3) return false;
                for (let i = 0; i < colsWith.length; i++) for (let j = i + 1; j < colsWith.length; j++) for (let k = j + 1; k < colsWith.length; k++) {
                    const sim = { ...stones };
                    for (const c of [colsWith[i], colsWith[j], colsWith[k]]) {
                        for (let r = 0; r < ROWS; r++) if (sim[`${c}_${r}`]) { delete sim[`${c}_${r}`]; break; }
                    }
                    if (this.winInSim(sim)) return true;
                }
                return false;
            }
            default:
                return false;
        }
    }

    findHanabiSetupCol() {
        const m = this.m;
        for (let c = 0; c < COLS; c++) if (this.wouldWin(c, this.myColor)) return -1;
        for (let c = 0; c < COLS; c++) {
            const r = m.dropRow(c);
            if (r <= 0) continue;
            m.stones[`${c}_${r}`] = this.oppColor; // 色反転中なので相手色として置かれる
            const canWinNext = this.wouldWin(c, this.myColor);
            const oppWins = m.winLine()?.color === this.oppColor;
            delete m.stones[`${c}_${r}`];
            if (canWinNext && !oppWins) return c;
        }
        return -1;
    }

    // キャラごとの発動条件(cpuAbilityConditionByID)
    conditionByID(charaID) {
        const stones = this.m.stones;
        const OPP = this.oppColor;
        if (charaID === '015') return false;
        if (charaID === '009' || charaID === '016' || charaID === '008') return true;
        if (charaID === '005') { this.hanabiSetupCol = this.findHanabiSetupCol(); return this.hanabiSetupCol >= 0; }
        if (charaID === '002') {
            let oppTop = 0, occupied = 0;
            for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
                if (stones[`${c}_${r}`]) { occupied++; if (stones[`${c}_${r}`] === OPP) oppTop++; break; }
            }
            return occupied >= 3 && oppTop > occupied / 2;
        }
        if (charaID === '012') return !this.m.validColumns().some((c) => this.wouldWin(c, this.myColor));
        if (charaID === '010') {
            const oppN = Object.values(stones).filter((v) => v === OPP).length;
            const myN = Object.values(stones).filter((v) => v === this.myColor).length;
            return oppN >= 3 && myN >= 6;
        }
        if (charaID === '001') return Object.values(stones).filter((v) => v === OPP).length >= 6;
        if (charaID === '003') return Object.keys(stones).filter((k) => [2, 3, 4].includes(parseInt(k.split('_')[0])) && stones[k] === OPP).length >= 3;
        if (charaID === '004') return Object.keys(stones).filter((k) => parseInt(k.split('_')[1]) <= 2 && stones[k] === OPP).length >= 2;
        if (charaID === '006') {
            for (let c = 0; c < COLS; c++) if (Object.keys(stones).filter((k) => k.startsWith(`${c}_`) && stones[k] === OPP).length >= 3) return true;
            return false;
        }
        if (charaID === '007') return Object.keys(stones).filter((k) => [0, 1, 5, 6].includes(parseInt(k.split('_')[0])) && stones[k] === OPP).length >= 4;
        return this.hasImmediateThreat(OPP) || this.opp.charge > this.me.charge + 30;
    }

    // サフェルは相手の必殺技をコピーするので、実際に発動する効果のID
    effectiveUltId() {
        const id = this.me.chara.charaID;
        return id === '013' ? this.opp.chara.charaID : id;
    }

    // 撃った場合と撃たなかった場合を、コピーした対局で実際に試して比べる
    rolloutDecision() {
        const m = this.m;
        const deterministic = ['004', '005', '011', '015'].includes(this.effectiveUltId()); // 効果にランダム要素がない技
        const samples = deterministic ? 1 : m.rolloutSamples;
        const base = Math.floor(m.rng() * 2 ** 31);
        const avg = (useUlt) => {
            let sum = 0;
            // 撃つ/撃たないで同じ乱数系列を使い、運の差ではなく判断の差を比べる
            for (let k = 0; k < samples; k++) sum += m.clone(base + k).rolloutValue(this.side, useUlt);
            return sum / samples;
        };
        return avg(true) > avg(false) + ROLLOUT_ULT_MARGIN;
    }

    shouldUseAbility() { // cpuShouldUseAbility
        if (!this.m.abilityAvailable(this.side)) return false;
        const id = this.me.chara.charaID;
        if (this.wouldWinAfterAbility(id)) return true;
        if (this.m.abilityMode === 'rollout' && !this.m.isRollout) {
            // 銀狼(勝利+1)・アベンチュリン(相手チャージ減)は盤面評価に表れないが常に得なので、撃てるなら撃つ
            if (id === '013' && this.opp.chara.charaID === '013') return false; // サフェル同士は不発
            const eff = this.effectiveUltId(); // サフェルがコピーする場合も同じ
            if (eff === '016' || eff === '008') return true;
            return this.rolloutDecision();
        }
        if (id === '013') {
            if (this.opp.chara.charaID === '013') return false;
            return this.conditionByID(this.opp.chara.charaID);
        }
        return this.conditionByID(id);
    }

    // ── 盤面評価と先読み ──
    scoreWindow(w) {
        let mine = 0, theirs = 0, empty = 0;
        for (const v of w) { if (v === this.myColor) mine++; else if (v === this.oppColor) theirs++; else if (v === null) empty++; }
        if (mine === 4) return 100000;
        if (theirs === 4) return -100000;
        if (mine === 3 && empty === 1) return 5;
        if (mine === 2 && empty === 2) return 2;
        if (theirs === 3 && empty === 1) return -4;
        if (theirs === 2 && empty === 2) return -1;
        return 0;
    }
    characterBonus(board) {
        const ME = this.myColor, OPP = this.oppColor;
        let bonus = 0;
        switch (this.me.chara.charaID) {
            case '004':
                for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
                    if (board[r][c] === ME) bonus += r >= 3 ? 4 : -2;
                    else if (board[r][c] === OPP) bonus -= r >= 3 ? 1 : 0;
                }
                break;
            case '003':
                for (let r = 0; r < ROWS; r++) for (const c of [2, 3, 4]) { if (board[r][c] === ME) bonus -= 3; else if (board[r][c] === OPP) bonus += 3; }
                break;
            case '007':
                for (let r = 0; r < ROWS; r++) for (const c of [0, 1, 5, 6]) { if (board[r][c] === ME) bonus -= 3; else if (board[r][c] === OPP) bonus += 3; }
                break;
            case '011':
                for (let c = 0; c < COLS; c++) { if (board[4][c] === ME) bonus -= 5; else if (board[4][c] === OPP) bonus += 5; }
                break;
            case '006':
                for (let c = 0; c < COLS; c++) {
                    let own = 0;
                    for (let r = 0; r < ROWS; r++) if (board[r][c] === ME) own++;
                    if (own >= 3) bonus -= (own - 2) * 5;
                }
                break;
        }
        return bonus;
    }
    evaluate(board) {
        let score = 0;
        const center = Math.floor(COLS / 2);
        for (let r = 0; r < ROWS; r++) { if (board[r][center] === this.myColor) score += 3; else if (board[r][center]) score -= 3; }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++) score += this.scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
        for (let c = 0; c < COLS; c++) for (let r = 0; r <= ROWS - 4; r++) score += this.scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
        for (let r = 0; r <= ROWS - 4; r++) for (let c = 0; c <= COLS - 4; c++) score += this.scoreWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
        for (let r = 0; r <= ROWS - 4; r++) for (let c = 3; c < COLS; c++) score += this.scoreWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]]);
        return score + this.characterBonus(board);
    }
    minimax(board, depth, alpha, beta, maximizing) {
        const winner = firstLineColor(board);
        if (winner === this.myColor) return { score: 1000000 + depth };
        if (winner === this.oppColor) return { score: -1000000 - depth };
        const valid = COLUMN_SEARCH_ORDER.filter((c) => dropRowOnBoard(board, c) >= 0);
        if (!valid.length) return { score: 0 };
        if (depth === 0) return { score: this.evaluate(board) };
        let best = valid[0];
        if (maximizing) {
            let value = -Infinity;
            for (const c of valid) {
                const r = dropRowOnBoard(board, c);
                board[r][c] = this.myColor;
                const res = this.minimax(board, depth - 1, alpha, beta, false);
                board[r][c] = null;
                if (res.score > value) { value = res.score; best = c; }
                alpha = Math.max(alpha, value);
                if (alpha >= beta) break;
            }
            return { score: value, column: best };
        }
        let value = Infinity;
        for (const c of valid) {
            const r = dropRowOnBoard(board, c);
            board[r][c] = this.oppColor;
            const res = this.minimax(board, depth - 1, alpha, beta, true);
            board[r][c] = null;
            if (res.score < value) { value = res.score; best = c; }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return { score: value, column: best };
    }
    pickColumn() { // pickAiColumn
        const m = this.m;
        const board = boardFromStones(m.stones, ROWS, COLS);
        if (m.tieRandom) return this.pickColumnTieRandom(board);
        const res = this.minimax(board, this.me.depth, -Infinity, Infinity, true);
        const blocked = m.zhongliBlocks(this.side);
        const ok = m.validColumns().filter((c) => !blocked.includes(c));
        if (!ok.length) return m.validColumns()[0];
        if (res.column !== undefined && !blocked.includes(res.column) && m.dropRow(res.column) >= 0) return res.column;
        return ok[0];
    }

    // 同点の手が複数あるとき、ランダムに選ぶ版(強さは同じで、打ち方にばらつきが出る)。
    // 本来のCPUは同点なら中央寄りの列を必ず選ぶため、同じ局面から毎回同じ試合になりやすい。
    pickColumnTieRandom(board) {
        const m = this.m;
        const blocked = m.zhongliBlocks(this.side);
        const cand = COLUMN_SEARCH_ORDER.filter((c) => dropRowOnBoard(board, c) >= 0 && !blocked.includes(c));
        if (!cand.length) return m.validColumns()[0];
        let bestScore = -Infinity;
        let best = [];
        for (const c of cand) {
            const r = dropRowOnBoard(board, c);
            board[r][c] = this.myColor;
            const score = this.me.depth <= 0 ? this.evaluate(board) : this.minimax(board, this.me.depth - 1, -Infinity, Infinity, false).score;
            board[r][c] = null;
            if (score > bestScore) { bestScore = score; best = [c]; } else if (score === bestScore) best.push(c);
        }
        return best[Math.floor(m.rng() * best.length)];
    }
}

function dropRowOnBoard(board, c) {
    for (let r = ROWS - 1; r >= 0; r--) if (!board[r][c]) return r;
    return -1;
}
