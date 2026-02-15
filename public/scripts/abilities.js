// abilities.js - 必殺技系の純粋ヘルパー関数

export function getRandomTwoNumbers() {
    const numbers = [2, 3, 4]; // 候補となる列番号
    const result = [];

    while (result.length < 2) {
        const randomIndex = Math.floor(Math.random() * numbers.length); // 配列のランダムなインデックスを取得
        const column = numbers.splice(randomIndex, 1)[0]; // 選ばれた列番号を取得し、候補から削除
        result.push({ column, row: 1 }); // { column, row } 形式で結果リストに追加 (row は 1 固定)
    }

    return result;
}

export function getRandomThreeNumbers() {
    const numbers = [0, 1, 5, 6]; // 候補となる列番号
    const result = [];

    while (result.length < 3) {
        const randomIndex = Math.floor(Math.random() * numbers.length); // 配列のランダムなインデックスを取得
        const column = numbers.splice(randomIndex, 1)[0]; // 選ばれた列番号を取得し、候補から削除
        result.push({ column, row: 1 }); // { column, row } 形式で結果リストに追加 (row は 1 固定)
    }

    return result;
}

// 指定された列で一番上の石を取得するヘルパー関数
export function getTopStoneInColumn(stonesData, column) {
    const rows = Object.keys(stonesData)
        .filter(key => key.startsWith(`${column}_`))
        .map(key => parseInt(key.split('_')[1]))
        .sort((a, b) => a - b);

    return rows.length > 0 ? rows[0] : null; // 一番上の石の行番号を返す（なければnull）
}

export async function getTop2Stones() {
    try {
        const stonesToDelete = []; // 削除対象のキーを格納する配列

        // 列番号は 0 〜 6、行番号は 0 と 1 を対象
        for (let column = 0; column <= 6; column++) {
            for (let row = 0; row <= 2; row++) {
                const key = `${column}_${row}`;
                stonesToDelete.push(key);
            }
        }

        console.log("削除対象のキー（getTop2Stones）:", stonesToDelete);
        return stonesToDelete;
    } catch (error) {
        console.error("getTop2Stones 実行中にエラーが発生しました:", error);
        return [];
    }
}

// ランダムに指定数の要素を取得する関数
export function getRandomElements(array, count) {
    if (array.length < count) {
        console.warn("取得しようとしている数が配列のサイズを超えています。全ての要素を返します。");
        return array;
    }

    const result = [];
    const tempArray = [...array]; // 元の配列をコピー
    while (result.length < count) {
        const randomIndex = Math.floor(Math.random() * tempArray.length);
        result.push(tempArray.splice(randomIndex, 1)[0]);
    }
    return result;
}

// 石の色を逆転する関数
export async function changeStonesColor(stonesData, redChangeStones, yellowChangeStones) {
    // 赤→黄に変更
    redChangeStones.forEach((key) => {
        if (stonesData[key]) {
            stonesData[key].color = "yellow";
        }
    });

    // 黄→赤に変更
    yellowChangeStones.forEach((key) => {
        if (stonesData[key]) {
            stonesData[key].color = "red";
        }
    });
}

// 赤と黄色の変更する石の座標を取得する関数
export async function getStonesToChange(stonesData, count) {
    const redStones = [];
    const yellowStones = [];

    // 石を色別に分類
    for (const [key, stone] of Object.entries(stonesData)) {
        if (stone.color === "red") {
            redStones.push(key);
        } else if (stone.color === "yellow") {
            yellowStones.push(key);
        }
    }

    // ランダムに指定数の石を選択
    const redChangeStones = getRandomElements(redStones, count);
    const yellowChangeStones = getRandomElements(yellowStones, count);

    return [redChangeStones, yellowChangeStones];
}
