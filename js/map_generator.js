/**
 * map_generator.js
 * 野戦用のHEXマップを毎回ランダムに生成する専用の工場です。
 */

class HexMapGenerator {
    constructor() {
        // 地形ごとの情報（今回は生成だけなのでデータとして持っておきます）
        this.terrains = {
            plain: { id: 'plain', cost: 1, name: '平地' },
            forest: { id: 'forest', cost: 2, name: '森' },
            river: { id: 'river', cost: 3, name: '川' },
            mountain: { id: 'mountain', cost: 3, name: '山' }
        };
    }

    // サイコロを振る魔法（最小値〜最大値の間でランダムな数字を出します）
    rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // マップを作るメインの魔法
    generate() {
        // 1. マップの広さをランダムに決める（横10〜20、縦6〜12）
        const cols = this.rand(10, 20);
        const rows = this.rand(6, 12);
        const totalHexes = cols * rows;

        // 2. 地形の割合（ノルマ）を決める
        // 平地は最低40%。ここでは「40%〜60%」を平地にします。
        const plainPercent = this.rand(40, 60);
        const remainHexes = Math.floor(totalHexes * (100 - plainPercent) / 100);

        // 平地以外の残りマスを、森(3~6) : 川(1~3) : 山(1~3) の割合で分けます
        const wForest = this.rand(3, 6);
        const wRiver = this.rand(0, 3); // 川が出ないこともある
        const wMountain = this.rand(1, 3);
        const wTotal = wForest + wRiver + wMountain;

        let targetForest = Math.floor(remainHexes * (wForest / wTotal));
        let targetRiver = Math.floor(remainHexes * (wRiver / wTotal));
        let targetMountain = Math.floor(remainHexes * (wMountain / wTotal));

        // 3. マップの土台（すべて平地）を用意する
        let map = [];
        for (let y = 0; y < rows; y++) {
            let row = [];
            for (let x = 0; x < cols; x++) {
                row.push({ x: x, y: y, terrain: 'plain' });
            }
            map.push(row);
        }

        // 4. 川を生成する（線を描き、段差のように曲がる）
        this._generateRivers(map, cols, rows, targetRiver);

        // 5. 山を生成する（塊になるように配置）
        this._generateClusters(map, cols, rows, 'mountain', targetMountain, 2, 4);

        // ★重要：山でマップが分断されていないかチェック＆修正する
        this._ensureConnectivity(map, cols, rows);

        // 6. 森を生成する（塊になるように配置）
        this._generateClusters(map, cols, rows, 'forest', targetForest, 3, 6);

        // 完成したマップのデータを返します！
        return {
            cols: cols,
            rows: rows,
            grid: map
        };
    }

    // 川を作る魔法（上から下へ、クネクネと線を引きます）
    _generateRivers(map, cols, rows, targetCount) {
        let currentCount = 0;
        let maxRivers = 3; 
        
        // ★修正: 川のスタート位置が右に偏らないように、「左・中・右」の候補地を用意してシャッフルします！
        let startXCandidates = [
            this.rand(1, Math.floor(cols / 3)),                          // 左側
            this.rand(Math.floor(cols / 3), Math.floor(cols * 2 / 3)),   // 真ん中
            this.rand(Math.floor(cols * 2 / 3), cols - 2)                // 右側
        ];
        startXCandidates.sort(() => Math.random() - 0.5); // 順番をランダムに！

        for (let i = 0; i < maxRivers; i++) {
            if (currentCount >= targetCount) break;
            
            // 用意した候補地からスタート
            let x = startXCandidates[i];
            let y = 0;

            while (y < rows && currentCount < targetCount) {
                if (map[y][x].terrain === 'plain') {
                    map[y][x].terrain = 'river';
                    currentCount++;
                }

                let dirs = [];
                const isEven = (x % 2 === 0);
                if (isEven) dirs = [ [0, 1], [-1, 0], [1, 0] ];  
                else        dirs = [ [0, 1], [-1, 1], [1, 1] ];  

                let d = dirs[this.rand(0, 2)];
                x += d[0];
                y += d[1];

                if (x < 0) x = 0;
                if (x >= cols) x = cols - 1;
            }
        }
    }

    // 森や山の「塊」を作る魔法
    _generateClusters(map, cols, rows, terrainType, targetCount, minSize, maxSize) {
        let currentCount = 0;
        let attempts = 0; // 無限ループ防止用

        while (currentCount < targetCount && attempts < 1000) {
            attempts++;
            // 塊の種となるスタート地点をランダムに選ぶ
            let startX = this.rand(0, cols - 1);
            let startY = this.rand(0, rows - 1);

            // 平地じゃなければやり直し
            if (map[startY][startX].terrain !== 'plain') continue;

            let clusterSize = this.rand(minSize, maxSize);
            let queue = [{ x: startX, y: startY }];
            let clustered = 0;

            while (queue.length > 0 && clustered < clusterSize && currentCount < targetCount) {
                // 配列からランダムに取り出すことで、いびつで自然な塊にします
                let idx = this.rand(0, queue.length - 1);
                let pos = queue.splice(idx, 1)[0];

                if (map[pos.y][pos.x].terrain === 'plain') {
                    map[pos.y][pos.x].terrain = terrainType;
                    currentCount++;
                    clustered++;

                    // 隣のマスを候補に入れる
                    let neighbors = this._getNeighbors(pos.x, pos.y, cols, rows);
                    for (let n of neighbors) {
                        if (map[n.y][n.x].terrain === 'plain') {
                            queue.push(n);
                        }
                    }
                }
            }
        }
    }

    // HEXの隣のマス（最大6個）を計算する魔法
    _getNeighbors(x, y, cols, rows) {
        const isEven = (x % 2 === 0);
        let dirs = isEven 
            ? [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]]
            : [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
        
        let neighbors = [];
        for (let d of dirs) {
            let nx = x + d[0];
            let ny = y + d[1];
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                neighbors.push({ x: nx, y: ny });
            }
        }
        return neighbors;
    }

    // 山でマップが完全に分断されないようにする魔法
    _ensureConnectivity(map, cols, rows) {
        // 「塗りつぶし」の要領で、左端から右端まで「山以外」を通って行けるか調べます
        let visited = Array.from({ length: rows }, () => Array(cols).fill(false));
        let queue = [];
        
        for (let y = 0; y < rows; y++) {
            if (map[y][0].terrain !== 'mountain') {
                queue.push({ x: 0, y: y });
                visited[y][0] = true;
            }
        }

        let canReachRight = false;
        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.x === cols - 1) {
                canReachRight = true;
                break;
            }
            let neighbors = this._getNeighbors(curr.x, curr.y, cols, rows);
            for (let n of neighbors) {
                if (!visited[n.y][n.x] && map[n.y][n.x].terrain !== 'mountain') {
                    visited[n.y][n.x] = true;
                    queue.push(n);
                }
            }
        }

        // もし山で分断されていたら、真ん中あたりに強引に「平地のトンネル」を開通させます！
        if (!canReachRight) {
            let tunnelY = Math.floor(rows / 2);
            for (let x = 0; x < cols; x++) {
                if (map[tunnelY][x].terrain === 'mountain') {
                    map[tunnelY][x].terrain = 'plain';
                }
            }
        }
    }
}