/**
 * ai_operation.js - AIの作戦（長期計画）システム
 * 責務: 大名家ごとの作戦（攻撃、防衛、集結、内政）の立案・準備・実行の管理
 */

class AIOperationManager {
    constructor(game) {
        this.game = game;
        // 各大名家の作戦を覚えておく箱です（大名家のIDごとに管理します）
        this.operations = {};
    }

    // --- セーブとロードの魔法 ---
    save() {
        return this.operations;
    }

    load(data) {
        this.operations = data || {};
    }

    // --- 毎月の初めに呼ばれる作戦の更新処理 ---
    processMonthlyOperations() {
        // 全ての大名家を順番に見ていきます
        this.game.clans.forEach(clan => {
            if (clan.id === 0 || clan.id === this.game.playerClanId) return; // 空き地とプレイヤーは飛ばします

            // 作戦を持っていない場合は、新しい作戦を考えます
            if (!this.operations[clan.id]) {
                this.generateOperation(clan.id);
            } else {
                // すでに作戦を持っている場合は、状況を更新します
                this.updateOperation(clan.id);
            }
        });
    }

    // --- 作戦を新しく考える魔法 ---
    generateOperation(clanId) {
        // ※今回は枠組みの作成です。後ほど、ai.jsの計算式をここに組み込んでいきます。
        
        // とりあえず、仮の作戦として「内政」をセットしておきます
        this.operations[clanId] = {
            type: '内政',            // 攻撃 / 防衛 / 集結 / 内政
            targetBase: null,        // 攻撃や防衛の対象となるお城のID
            stagingBase: null,       // 味方が集まるお城のID
            requiredForce: 0,        // 作戦に必要な兵士の数
            assignedUnits: [],       // 参加する武将のIDリスト（今後の拡張用）
            turnsRemaining: 3,       // 準備にかかるターン（今回は3ヶ月）
            maxTurns: 10,            // この作戦を諦めるまでの最大ターン（10ヶ月）
            status: '準備中'         // 準備中 / 実行中 / 完了
        };
        
        console.log(`大名家[${clanId}]が新しい作戦【${this.operations[clanId].type}】を立案しました。`);
    }

    // --- 作戦を進める（更新する）魔法 ---
    updateOperation(clanId) {
        const op = this.operations[clanId];

        // 1. 作戦の期限切れをチェックします
        op.maxTurns--;
        if (op.maxTurns <= 0) {
            console.log(`大名家[${clanId}]の作戦【${op.type}】は長期間未達成のため破棄されました。`);
            delete this.operations[clanId];
            return;
        }

        // 2. 準備中の場合
        if (op.status === '準備中') {
            // ※ここで、武将の移動や戦力が揃ったかの判定を今後追加します。
            // 今回は仮に、毎ターン無条件でカウントダウンを進めます。
            
            const isReady = true; // （仮）戦力が揃ったとみなす

            if (isReady) {
                op.turnsRemaining--;
                if (op.turnsRemaining <= 0) {
                    op.status = '実行中'; // 準備が終わったら実行に移ります
                    console.log(`大名家[${clanId}]の作戦【${op.type}】が実行フェーズに入りました！`);
                }
            }
        } 
        // 3. 実行中の場合
        else if (op.status === '実行中') {
            // ※ここで、実際の攻撃部隊の出陣や、防衛の配置などを行います。
            
            // 実行が終わったら、作戦を「完了」にして箱から消します
            op.status = '完了';
            delete this.operations[clanId];
        }
    }
}