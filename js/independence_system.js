/**
 * independence_system.js
 * 城主の独立（謀反）システム
 */

class IndependenceSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * 月末に呼び出されるメイン処理
     */
    async checkIndependence() {
        const potentialRebels = this.game.castles.filter(c => {
            if (c.ownerClan === 0) return false; 
            if (!c.castellanId) return false; 
            const castellan = this.game.getBusho(c.castellanId);
            if (!castellan || castellan.isDaimyo) return false; 
            if (castellan.belongKunishuId > 0) return false;
            const clanCastles = this.game.castles.filter(cl => cl.ownerClan === c.ownerClan);
            if (clanCastles.length <= 1) return false;
            return true;
        });

        const I = window.WarParams.Independence || {};
        const thresholdBase = I.ThresholdBase || 29;
        const dutyDiv = I.ThresholdDutyDiv || 2;
        const ambDiv = I.ThresholdAmbitionDiv || 5;

        for (const castle of potentialRebels) {
            const castellan = this.game.getBusho(castle.castellanId);
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            if (!castellan || !daimyo) continue;
            if (daimyo.factionId !== 0 && castellan.factionId === daimyo.factionId) continue; 

            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);
            if (castellan.loyalty <= threshold) {
                await this.calculateAndExecute(castle, castellan, daimyo, threshold);
            }
        }
    }

    /**
     * 大名の総合ステータスによる補正値の計算 (200~400の範囲で -20~+20)
     */
    calcDaimyoPowerBonus(busho) {
        const total = busho.leadership + busho.strength + busho.politics + busho.diplomacy + busho.intelligence;
        const diff = total - 300;
        const clampedDiff = Math.max(-100, Math.min(100, diff));
        return (clampedDiff / 100) * 20;
    }

    /**
     * ★新機能：新しい主君への忠誠度を相性ベースで動的に計算する
     * 基礎値60 ＋ 相性ボーナス（最大50）で、最大100
     */
    calcNewLoyalty(busho, daimyo) {
        const affDiff = GameSystem.calcAffinityDiff(daimyo.affinity, busho.affinity);
        const loyaltyUp = 50 - affDiff;
        return Math.min(100, 60 + loyaltyUp);
    }

    async calculateAndExecute(castle, castellan, daimyo, threshold) {
        const I = window.WarParams.Independence || {};
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;
        const daimyoBonus = this.calcDaimyoPowerBonus(daimyo);
        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        
        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) - (daimyoBonus * 2);
        
        // 大名と「一門」関係なら、独立する確率をグッと減らすおまじない！
        // 城主(castellan)と大名(daimyo)の家族ID(familyIds)に共通のものがあるか調べます
        const isFamily = castellan.familyIds.some(id => daimyo.familyIds.includes(id));
        if (isFamily) {
            prob = prob * 0.7; // 一門なら、独立する確率を７０％に減らします！
        }
        
        if (prob <= 0) return;
        if (Math.random() * 1000 < prob) {
            // ★変更：いきなり独立するのではなく、お家乗っ取りの作戦会議を開きます！
            await this.planCoupDetatOrRebellion(castle, castellan, daimyo);
        }
    }
    
    async executeRebellion(castle, castellan, oldDaimyo, intention = 'indep') {
        const oldClanId = castle.ownerClan;
        
        // ★追加：複数のお城が同時に寝返ったか調べるために、最初のお城の持ち主を全部メモしておきます！
        const initialClanMap = new Map();
        this.game.castles.forEach(c => initialClanMap.set(c.id, c.ownerClan));
        
        const I = window.WarParams.Independence || {};

        // --- ★追加：派閥主を神輿（みこし）に担ぐ処理 ---
        let rebellionLeader = castellan; // デフォルトは謀反を起こした城主
        let isProxyRebellion = false;    // 神輿担ぎかどうかを覚える旗

        // もし独立を起こす城主が派閥に属していて、なおかつ派閥主ではない場合
        if (castellan.factionId !== 0 && !castellan.isFactionLeader) {
            // 同じ大名家で、同じ派閥のリーダー（派閥主）を探す
            const factionLeader = this.game.bushos.find(b => b.clan === oldClanId && b.factionId === castellan.factionId && b.isFactionLeader && !b.belongKunishuId);
            if (factionLeader) {
                // 派閥主が、今の殿様よりも独立計画に賛同してくれるかを計算
                const { joinScore, stayScore } = this.calculateLoyaltyScores(factionLeader, castellan, oldDaimyo);
                
                // ★追加：派閥主自身も、独立・謀反に踏み切れるだけの野心や不満があるか判定します！
                const I = window.WarParams.Independence || {};
                const thresholdBase = I.ThresholdBase || 29;
                const dutyDiv = I.ThresholdDutyDiv || 2;
                const ambDiv = I.ThresholdAmbitionDiv || 5;
                const probLoyalty = I.ProbLoyaltyFactor || 2;
                const probAffinity = I.ProbAffinityFactor || 0.5;

                const leaderThreshold = thresholdBase + ((50 - factionLeader.duty) / dutyDiv) + ((factionLeader.ambition - 50) / ambDiv);
                
                let leaderProb = 0;
                if (factionLeader.loyalty <= leaderThreshold) {
                    const daimyoBonus = this.calcDaimyoPowerBonus(oldDaimyo);
                    const affinityDiff = GameSystem.calcAffinityDiff(factionLeader.affinity, oldDaimyo.affinity);
                    leaderProb = ((leaderThreshold - factionLeader.loyalty) * probLoyalty) + (affinityDiff * probAffinity) - (daimyoBonus * 2);
                    
                    // 大名と「一門」関係なら確率を下げる魔法です
                    const isFamily = factionLeader.familyIds.some(id => oldDaimyo.familyIds.includes(id));
                    if (isFamily) {
                        leaderProb = leaderProb * 0.7;
                    }
                }

                // スコアで賛同し、かつ派閥主自身の決起確率のサイコロにも成功した場合のみ神輿になる！
                if (joinScore > stayScore && leaderProb > 0 && (Math.random() * 1000 < leaderProb)) {
                    rebellionLeader = factionLeader; // 派閥主が神輿になる！
                    isProxyRebellion = true;
                }
            }
        }

        // ★修正：独立・寝返り処理の途中で役職がリセットされても呼応するように、元の派閥IDを記憶しておきます！
        const leaderOriginalFactionId = rebellionLeader.factionId;

        // --- ★ここから：寝返り先を探す処理 ---
        let targetClanId = null;
        let targetDaimyo = null;
        let bestScore = -1;

        // ★追加：独立志向(indep)でなければ、寝返り先を探します
        if (intention !== 'indep') {
            // ★変更：寝返り前の「今のままの大名家の戦力」を計算します
            const oldClanPower = this.calcClanPower(oldClanId);

            // 相性の計算基準を rebellionLeader（神輿になる人物）に変更
            const oldAffinityDiff = GameSystem.calcAffinityDiff(rebellionLeader.affinity, oldDaimyo.affinity);

            for (const clan of this.game.clans) {
                if (clan.id === 0 || clan.id === oldClanId) continue; 
                const rel = this.game.getRelation(oldClanId, clan.id);
                if (!rel || rel.status !== '敵対') continue;
                
                // その敵対大名が持っている城の中に、ここから「3マス以内」の城があるか探します
                const enemyCastles = this.game.castles.filter(c => c.ownerClan === clan.id);
                let isNear = false; // 最初は「近くない」としておきます
                for (const ec of enemyCastles) {
                    // タテの距離とヨコの距離を足して、何マス離れているか計算します
                    const distance = Math.abs(castle.x - ec.x) + Math.abs(castle.y - ec.y);
                    if (distance <= 3) {
                        isNear = true; // 3マス以内の城が見つかったら「近い！」とメモします
                        break; // 1つでも見つかればOKなので、探すのをやめます
                    }
                }
                // もし3マス以内に城が1つもなかったら、この大名家は遠すぎるので無視（スキップ）します
                if (!isNear) continue; 
                
                const enemyDaimyo = this.game.bushos.find(b => b.clan === clan.id && b.isDaimyo);
                if (!enemyDaimyo) continue;

                // ★変更：寝返り前の「そのままの敵対大名の戦力」を計算します
                let enemyCurrentPower = this.calcClanPower(clan.id);
                
                // 相性の計算基準を rebellionLeader に変更
                const enemyAffinityDiff = GameSystem.calcAffinityDiff(rebellionLeader.affinity, enemyDaimyo.affinity);
                let affinityBonus = 0;
                if (enemyAffinityDiff < oldAffinityDiff) {
                    affinityBonus = oldAffinityDiff - enemyAffinityDiff; 
                }

                // ★変更：「今の敵対大名戦力」 ＞ 「今の元大名戦力」 になるなら候補に入れます
                if ((enemyCurrentPower + affinityBonus) > oldClanPower) {
                    const score = enemyCurrentPower + affinityBonus;
                    if (score > bestScore) {
                        bestScore = score;
                        targetClanId = clan.id;
                        targetDaimyo = enemyDaimyo;
                    }
                }
            }
        }
        
        // ★追加：データが変わってマップの色がフライングで塗り替わるのを防ぐストッパーをかけます！
        this.game.isSuspendingColorUpdate = true;

        let isDefection = false;
        let newClanId;
        let newClanName;
        
        if (targetClanId) {
            isDefection = true;
            newClanId = targetClanId;
            const targetClan = this.game.clans.find(c => c.id === targetClanId);
            newClanName = targetClan ? targetClan.name : "敵対大名";

            // ★追加：大名家が変わるので功績半分！
            if (castellan.clan !== 0 && castellan.clan !== newClanId) {
                castellan.achievementTotal = Math.floor((castellan.achievementTotal || 0) / 2);
            }
            castellan.clan = newClanId;
            castellan.loyalty = this.calcNewLoyalty(castellan, targetDaimyo);
            this.game.castleManager.changeOwner(castle, newClanId);
            
        } else {
            newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
            const newColor = this.generateDistinctColor(castle);
            // ★新大名家の名前は神輿の人物ベース
            const familyName = rebellionLeader.familyName || rebellionLeader.name.split('|')[0] || rebellionLeader.name; 
            newClanName = `${familyName}家`;
            
            // ★新大名家の読み仮名も神輿の人物から取ります！
            const familyYomi = rebellionLeader.familyYomi || rebellionLeader.yomi.split('|')[0] || rebellionLeader.yomi;
            const newClanYomi = familyYomi ? `${familyYomi}け` : "";

            const newClan = new Clan({
                id: newClanId, name: newClanName, yomi: newClanYomi, color: newColor, leaderId: rebellionLeader.id
            });

            const oldClanForDip = this.game.clans.find(c => c.id === oldClanId);
            if (oldClanForDip) {
                this.game.clans.forEach(otherClan => {
                    if (otherClan.id === 0 || otherClan.id === oldClanId) return;
                    
                    const oldRel = this.game.getRelation(oldClanId, otherClan.id);
                    if (oldRel) {
                        let newSentiment = 100 - oldRel.sentiment;
                        newSentiment = Math.max(30, Math.min(70, newSentiment));
                        
                        let newStatus = '普通';
                        if (newSentiment >= 70) newStatus = '友好';
                        if (newSentiment <= 30) newStatus = '敵対';
                        
                        newClan.diplomacyValue[otherClan.id] = {
                            status: newStatus,
                            sentiment: newSentiment,
                            trucePeriod: 0,
                            isMarriage: false
                        };
                        
                        if (!otherClan.diplomacyValue) otherClan.diplomacyValue = {};
                        otherClan.diplomacyValue[newClanId] = {
                            status: newStatus,
                            sentiment: newSentiment,
                            trucePeriod: 0,
                            isMarriage: false
                        };
                    }
                });

                // ★ここから追加：諸勢力との関係値も反転させます！
                if (this.game.kunishuSystem) {
                    const aliveKunishus = this.game.kunishuSystem.getAliveKunishus();
                    aliveKunishus.forEach(kunishu => {
                        const oldRel = kunishu.getRelation(oldClanId);
                        let newSentiment = 100 - oldRel;
                        newSentiment = Math.max(30, Math.min(70, newSentiment));
                        kunishu.setRelation(newClanId, newSentiment);
                    });
                }
                // ★追加ここまで
            }

            this.game.clans.push(newClan);

            rebellionLeader.isDaimyo = true;
            
            // ★追加：新しい大名が住んでいるお城のおまかせ（委任）を解除します
            const daimyoCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
            if (daimyoCastle) {
                daimyoCastle.isDelegated = false;
            }

            // ★大名家が変わる（新設）ので功績半分！
            if (castellan.clan !== 0 && castellan.clan !== newClanId) {
                castellan.achievementTotal = Math.floor((castellan.achievementTotal || 0) / 2);
            }
            castellan.clan = newClanId;
            if (castellan.id === rebellionLeader.id) {
                castellan.loyalty = 100;
            } else {
                castellan.loyalty = this.calcNewLoyalty(castellan, rebellionLeader);
            }
            this.game.castleManager.changeOwner(castle, newClanId);

            const oldClan = this.game.clans.find(c => c.id === oldClanId);
            if (oldClan) oldClan.diplomacyValue[newClanId] = { status: '敵対', sentiment: 0 };
            newClan.diplomacyValue[oldClanId] = { status: '敵対', sentiment: 0 };
        }

        // ★神輿（派閥主）本人の処遇
        if (isProxyRebellion) {
            const leaderCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
            // ★神輿（派閥主）も大名家が変わるので功績半分！
            if (rebellionLeader.clan !== 0 && rebellionLeader.clan !== newClanId) {
                rebellionLeader.achievementTotal = Math.floor((rebellionLeader.achievementTotal || 0) / 2);
            }
            if (rebellionLeader.isCastellan && leaderCastle) {
                // 派閥主がどこかの城主なら、その城も新勢力になる
                this.game.castleManager.changeOwner(leaderCastle, newClanId);
                rebellionLeader.clan = newClanId;
                if (rebellionLeader.isDaimyo) {
                    rebellionLeader.loyalty = 100;
                } else {
                    rebellionLeader.loyalty = this.calcNewLoyalty(rebellionLeader, targetDaimyo);
                }
            } else {
                // 城主でない（どこかの城の部下）なら、脱出して起点の城に合流する
                if (leaderCastle) {
                    leaderCastle.samuraiIds = leaderCastle.samuraiIds.filter(id => id !== rebellionLeader.id);
                    this.game.updateCastleLord(leaderCastle);
                }
                rebellionLeader.clan = newClanId;
                rebellionLeader.castleId = castle.id;
                castle.samuraiIds.push(rebellionLeader.id);
                if (rebellionLeader.isDaimyo) {
                    rebellionLeader.loyalty = 100;
                } else {
                    rebellionLeader.loyalty = this.calcNewLoyalty(rebellionLeader, targetDaimyo);
                }
            }
        }

        // ★先に独立・寝返りのメインメッセージを作り、ログに出力します
        const oldClanName = this.game.clans.find(c => c.id === oldClanId)?.name || "不明";
        let msg = "";
        
        // ★メッセージの出し分け
        if (isProxyRebellion) {
            if (isDefection) {
                msg = `${oldClanName}の${castellan.name}が${rebellionLeader.name}を唆して${newClanName}に寝返りました！`;
            } else {
                msg = `${oldClanName}の${castellan.name}が${rebellionLeader.name}を大名として擁立し、独立を宣言しました！`;
            }
        } else {
            if (isDefection) {
                msg = `${oldClanName}の${castellan.name}が、${castle.name}ごと${newClanName}に寝返りました！`;
            } else {
                msg = `${oldClanName}の${castellan.name}が、${castle.name}にて独立を宣言しました！`;
            }
        }
        
        // ここで一番最初にログに書き込みます！
        this.game.ui.log(msg);

        // 部下たちの去就
        // ★主君の基準を rebellionLeader にする
        // ★修正：記憶しておいた元の派閥ID(leaderOriginalFactionId)を渡して判定させます
        let captiveMsgs = this.resolveSubordinates(castle, rebellionLeader, oldDaimyo, newClanId, oldClanId, leaderOriginalFactionId);

        // ★派閥主が別の城の城主だった場合、その城の部下たちも処遇を決定する
        if (isProxyRebellion && rebellionLeader.isCastellan) {
            const leaderCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
            if (leaderCastle && leaderCastle.id !== castle.id) {
                const extraMsgs = this.resolveSubordinates(leaderCastle, rebellionLeader, oldDaimyo, newClanId, oldClanId, leaderOriginalFactionId);
                if (extraMsgs.length > 0) captiveMsgs = captiveMsgs.concat(extraMsgs);
                this.game.updateCastleLord(leaderCastle);
            }
        }

        // ★基準を rebellionLeader にして派閥全体の呼応を処理
        // ★修正：記憶しておいた元の派閥ID(leaderOriginalFactionId)を渡して判定させます
        this.resolveFactionWideRebellion(rebellionLeader, oldClanId, newClanId, oldDaimyo, leaderOriginalFactionId);
        this.resolveDistantFactionMembers(rebellionLeader, oldClanId, newClanId, oldDaimyo, leaderOriginalFactionId);

        this.game.updateCastleLord(castle);
        
        // ★追加：独立や寝返りで勢力が大きく変わるので、威信を最新に更新しておきます！
        if (window.GameApp) window.GameApp.updateAllClanPrestige();
        
        // ★ここから複数城に対応した演出魔法の始まりです！
        // 今回勢力が変わった城（独立・寝返りに参加した城）のIDをすべて集めます
        const changedCastleIds = [];
        this.game.castles.forEach(c => {
            const oldOwner = initialClanMap.get(c.id);
            if (oldOwner === oldClanId && c.ownerClan === newClanId) {
                changedCastleIds.push(c.id);
            }
        });
        // 万が一見つからなかったら起点のお城だけを入れます
        if (changedCastleIds.length === 0) changedCastleIds.push(castle.id);

        // まずは最初のメッセージを出します
        await this.game.ui.showDialogAsync(msg, false, 0);

        // 画面を勝手に触られないようにバリアを張ります
        if (typeof this.game.ui.showMapGuard === 'function') this.game.ui.showMapGuard();

        // 独立したお城（起点の城）にカメラを移動させます！
        this.game.ui.scrollToActiveCastle(castle, false);
        await new Promise(res => setTimeout(res, 600)); 

        // お城の元の色と、新しい色を調べます
        let oldColor = { r: 255, g: 255, b: 255 };
        let newColorRgb = { r: 255, g: 255, b: 255 };
        const oldClanData = this.game.clans.find(c => c.id === oldClanId);
        if (oldClanData && oldClanData.color && typeof DataManager !== 'undefined') oldColor = DataManager.hexToRgb(oldClanData.color);
        const newClanDataObj = this.game.clans.find(c => c.id === newClanId);
        if (newClanDataObj && newClanDataObj.color && typeof DataManager !== 'undefined') newColorRgb = DataManager.hexToRgb(newClanDataObj.color);

        // 参加したお城をすべて同時にチカチカ点滅させます！
        await this.game.ui.playBattleBlink(changedCastleIds, oldColor, newColorRgb, 1000);

        // ★追加：点滅が終わったらストッパーを外して、新しい色を塗れるようにします！
        this.game.isSuspendingColorUpdate = false;

        // フワッと光るアニメーションと一緒に、色を新しく塗り替えます！
        if (typeof this.game.ui.playCaptureEffect === 'function') {
            await this.game.ui.playCaptureEffect(changedCastleIds, () => {
                if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
                    this.game.ui.renderMap();
                }
            });
        } else {
            if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
                this.game.ui.renderMap();
            }
        }
        // バリアを解除します
        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
        // 追加のメッセージを作ります
        let extraMsg = "";
        if (!isDefection) {
            // 独立して大名になった時だけメッセージを入れます
            extraMsg = `${rebellionLeader.name}が大名となりました！`;
        }
        // 捕虜になった武将たちのお知らせがあれば追加します
        if (captiveMsgs && captiveMsgs.length > 0) {
            if (extraMsg !== "") {
                extraMsg += '\n\n';
            }
            extraMsg += captiveMsgs.join('\n');
        }
        // もし表示する文字が何かあれば、画面にメッセージを出します
        if (extraMsg !== "") {
            await this.game.ui.showDialogAsync(extraMsg, false, 0);
        }

        // ★追加：自分の担当大名家から独立が起きて新大名家が誕生した場合に、どちらを担当するか選べる魔法！
        if (oldClanId === this.game.playerClanId && !isDefection) {
            // 現在の旧勢力の大名（討死して代替わりしている可能性も考慮）を探します
            const currentOldDaimyo = this.game.bushos.find(b => b.clan === oldClanId && b.isDaimyo);
            if (currentOldDaimyo && rebellionLeader) {
                // 名前から「|」を取り除いて綺麗な表示にします
                const oldLeaderName = currentOldDaimyo.name.replace('|', '');
                const newLeaderName = rebellionLeader.name.replace('|', '');

                // ★変更：選んだ大名家のID（番号）を受け取るようにします
                const chosenClanId = await new Promise(resolve => {
                    const showSelectMenu = () => {
                        this.game.ui.showDialog("操作する勢力を選択してください。", false, null, null, {
                            choices: [
                                {
                                    label: oldLeaderName,
                                    className: 'btn-primary', // 緑色のボタン（旧勢力）
                                    onClick: () => confirmSelection(oldClanName, oldClanId)
                                },
                                {
                                    label: newLeaderName,
                                    className: 'btn-danger', // 赤色の警告ボタン（新勢力）
                                    onClick: () => confirmSelection(newClanName, newClanId)
                                }
                            ]
                        });
                    };

                    const confirmSelection = (targetClanName, targetClanId) => {
                        this.game.ui.showDialog(`${targetClanName}を操作します。本当によろしいですか？`, true, 
                            () => {
                                // 「はい」を選んだら担当大名家を決定
                                this.game.playerClanId = targetClanId;
                                
                                // パネルを新しい担当勢力の情報で更新します（メニューの描画は消しました！）
                                if (this.game.ui) {
                                    this.game.ui.updatePanelHeader();
                                }
                                // 選んだIDを外に渡して約束（Promise）を終わらせます
                                resolve(targetClanId);
                            },
                            () => {
                                // 「いいえ」を選んだら最初の選択画面に戻る
                                showSelectMenu();
                            }
                        );
                    };

                    // 最初にメニューを呼び出します
                    showSelectMenu();
                });

                // ★追加：メニューの選択が終わったあとに、ナレーションを表示します！
                if (chosenClanId === oldClanId) {
                    // 旧勢力を選んだ場合
                    await this.game.ui.showDialogAsync(`引き続き${oldClanName}を操作します。`, false, 0);
                } else {
                    // 新勢力を選んだ場合
                    await this.game.ui.showDialogAsync(`これ以降、${newClanName}を操作します。`, false, 0);
                }
            }
        }
    }

    // ★修正：独立処理中に派閥がリセットされても判定できるように、記憶した元の派閥ID(targetFactionId)をオプションで受け取れるようにします
    calculateLoyaltyScores(busho, newDaimyo, oldDaimyo, targetFactionId = null) {
        const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
        const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
        let joinScore = (100 - affNew) * 2.0 + (busho.ambition * 0.5);
        let stayScore = (100 - affOld) * 2.0 + (busho.loyalty * 0.5);

        joinScore += this.calcDaimyoPowerBonus(newDaimyo);
        stayScore += this.calcDaimyoPowerBonus(oldDaimyo);

        if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);
        joinScore += (50 - busho.duty) * 0.4;

        if (busho.factionId !== 0) {
            // ★修正：メモしておいた派閥IDが指定されていればそれを使い、なければ現在のIDを使います
            const leaderFaction = (targetFactionId !== null && targetFactionId !== 0) ? targetFactionId : newDaimyo.factionId;
            if (busho.factionId === leaderFaction) joinScore += 50;
            if (busho.factionId === oldDaimyo.factionId) stayScore += 50;
        }
        return { joinScore, stayScore };
    }

    resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId, leaderOriginalFactionId = null) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.clan === oldClanId && b.status === 'active' && b.id !== newDaimyo.id);
        const captives = [], joiners = [];
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);
        
        subordinates.forEach(busho => {
            // ★修正：記憶しておいた元の派閥IDを渡します
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo, leaderOriginalFactionId);
            if (joinScore > stayScore) {
                // ★大名家が変わるので功績半分！
                if (busho.clan !== 0 && busho.clan !== newClanId) {
                    busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                }
                busho.clan = newClanId;
                busho.loyalty = this.calcNewLoyalty(busho, newDaimyo);
                joiners.push(busho);
            } else {
                if (escapeCastles.length > 0 && busho.duty >= 30) {
                    if ((busho.strength + busho.intelligence) * (Math.random() + 0.5) > (newDaimyo.leadership + newDaimyo.intelligence) * 0.8) {
                        const target = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.moveCastle(busho, target.id);
                        this.game.updateCastleLord(target);
                    } else {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        busho.castleId = 0; captives.push(busho);
                    }
                } else {
                    // ★大名家が変わるので功績半分！
                    if (busho.clan !== 0 && busho.clan !== newClanId) {
                        busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                    }
                    busho.clan = newClanId;
                    busho.loyalty = Math.max(0, Math.min(40, this.calcNewLoyalty(busho, newDaimyo) - 50)); // 消極的合流は低めに設定
                    joiners.push(busho);
                }
            }
        });
        if (joiners.length > 0) this.game.ui.log(`  -> ${castle.name}にて${joiners.length}名が追随しました。`);
        return captives.length > 0 ? this.handleCaptives(captives, oldClanId, newClanId, newDaimyo) : [];
    }

    resolveFactionWideRebellion(leader, oldClanId, newClanId, oldDaimyo, leaderOriginalFactionId = null) {
        // ★修正：記憶しておいた元の派閥IDを基準として使います
        const targetFactionId = (leaderOriginalFactionId !== null && leaderOriginalFactionId !== 0) ? leaderOriginalFactionId : leader.factionId;
        
        const otherCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.castellanId !== 0 && c.castellanId !== leader.id);
        otherCastles.forEach(castle => {
            const busho = this.game.getBusho(castle.castellanId);
            if (busho && busho.clan === oldClanId && busho.status === 'active' && busho.factionId !== 0 && busho.factionId === targetFactionId && !busho.isDaimyo && !busho.isCommander && !busho.isFactionLeader) {
                // ★修正：記憶しておいた元の派閥IDを渡します
                const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, leader, oldDaimyo, leaderOriginalFactionId);
                if (joinScore > stayScore) {
                    this.game.ui.log(`  -> 呼応！${castle.name}城主の${busho.name}が${leader.name}に与しました！`);
                    this.game.castleManager.changeOwner(castle, newClanId);
                    // ★大名家が変わるので功績半分！
                    if (busho.clan !== 0 && busho.clan !== newClanId) {
                        busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                    }
                    busho.clan = newClanId;
                    busho.loyalty = this.calcNewLoyalty(busho, leader);
                    this.resolveSubordinates(castle, leader, oldDaimyo, newClanId, oldClanId, leaderOriginalFactionId);
                    this.game.updateCastleLord(castle);
                }
            }
        });
    }

    resolveDistantFactionMembers(newDaimyo, oldClanId, newClanId, oldDaimyo, leaderOriginalFactionId = null) {
        // ★修正：記憶しておいた元の派閥IDを基準として使います
        const targetFactionId = (leaderOriginalFactionId !== null && leaderOriginalFactionId !== 0) ? leaderOriginalFactionId : newDaimyo.factionId;
        if (!targetFactionId || targetFactionId === 0) return; 
        
        const potential = this.game.bushos.filter(b => b.clan === oldClanId && b.status === 'active' && !b.isCastellan && b.factionId === targetFactionId && !b.isDaimyo && !b.isCommander && !b.isFactionLeader);
        const mainCastle = this.game.castles.find(c => c.castellanId === newDaimyo.id);
        if (!mainCastle) return;

        potential.forEach(busho => {
            // ★修正：記憶しておいた元の派閥IDを渡します
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo, leaderOriginalFactionId);
            if (joinScore > stayScore && Math.random() * 300 < joinScore) {
                const oldCastle = this.game.castles.find(c => c.id === busho.castleId);
                if (oldCastle) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                    this.game.updateCastleLord(oldCastle);
                }
                // ★大名家が変わるので功績半分！
                if (busho.clan !== 0 && busho.clan !== newClanId) {
                    busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                }
                busho.clan = newClanId;
                busho.castleId = mainCastle.id;
                busho.loyalty = this.calcNewLoyalty(busho, newDaimyo);
                mainCastle.samuraiIds.push(busho.id);
                this.game.ui.log(`  -> ${busho.name}が城を脱出し、${newDaimyo.name}の元へ駆けつけました！`);
            }
        });
    }

    handleCaptives(captives, oldClanId, newClanId, newDaimyo) {
        const returnCastles = this.game.castles.filter(c => c.ownerClan === oldClanId);
        let alertMsgs = [];
        captives.forEach(p => {
            if (oldClanId === this.game.playerClanId) {
                if (GameSystem.calcAffinityDiff(p.affinity, newDaimyo.affinity) > 60) {
                    p.status = 'dead'; p.clan = 0;
                    alertMsgs.push(`処断：${p.name} は処断されました。`);
                } else {
                    if (returnCastles.length > 0) {
                        const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                        p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                        this.game.updateCastleLord(target);
                    } else { 
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.becomeRonin(p);
                    }
                    alertMsgs.push(`解放：${p.name} は解放されました。`);
                }
            } else if (newClanId === this.game.playerClanId) {
                // ★プレイヤーの城に寝返った場合、戦争画面ではないので捕虜画面を出さず、逃がしてあげる魔法にします！
                if (returnCastles.length > 0) {
                    const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                    p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                    this.game.updateCastleLord(target);
                } else {
                    // ★逃げる城がなければ浪にします
                    this.game.affiliationSystem.becomeRonin(p);
                }
                alertMsgs.push(`${p.name} は元の主君のもとへ逃げ去りました。`);
            } else {
                if (Math.random() < 0.3) { p.status = 'dead'; p.clan = 0; }
                else if (returnCastles.length > 0) {
                    const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                    p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                    this.game.updateCastleLord(target);
                } else {
                    // ★AIの場合も、逃げる城がなければ浪人になるように安全対策を入れます！
                    this.game.affiliationSystem.becomeRonin(p);
                }
            }
        });
        return alertMsgs;
    }
    
    /**
     * 大名家の総戦力を計算する道具
     */
    calcClanPower(clanId) {
        let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        clanCastles.forEach(c => { 
            pop += c.population; sol += c.soldiers; koku += c.kokudaka; gold += c.gold; rice += c.rice; 
        });
        return Math.floor(pop / 2000) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 50) + Math.floor(rice / 100);
    }

    /**
     * 城単体の戦力を計算する道具
     */
    calcCastlePower(castle) {
        return Math.floor(castle.population / 2000) + Math.floor(castle.soldiers / 20) + Math.floor(castle.kokudaka / 20) + Math.floor(castle.gold / 50) + Math.floor(castle.rice / 100);
    }
    
    // =========================================================================
    // ★ここから追加：お家乗っ取りの作戦会議と、裏での決戦を行う魔法！
    // =========================================================================

    async planCoupDetatOrRebellion(castle, castellan, oldDaimyo) {
        // 1. まずは反乱のリーダー（神輿）を探します。
        let rebellionLeader = castellan;
        const oldClanId = castle.ownerClan;
        
        if (castellan.factionId !== 0 && !castellan.isFactionLeader) {
            const factionLeader = this.game.bushos.find(b => b.clan === oldClanId && b.factionId === castellan.factionId && b.isFactionLeader && !b.belongKunishuId);
            if (factionLeader) {
                const { joinScore, stayScore } = this.calculateLoyaltyScores(factionLeader, castellan, oldDaimyo);
                if (joinScore > stayScore) {
                    rebellionLeader = factionLeader;
                }
            }
        }

        // 2. 勢力内の全員を呼び出して、どっちの味方か振り分けます。
        const allMembers = this.game.bushos.filter(b => b.clan === oldClanId && b.status === 'active');
        const totalMembers = allMembers.length;

        let rebelMembers = [];
        let daimyoMembers = [];

        // 全員が必ずどちらかに属するように、スコアの条件を少しずつ甘くしていくループです
        let thresholdOffset = 0;
        let allAssigned = false;

        while (!allAssigned && thresholdOffset < 100) {
            rebelMembers = [];
            daimyoMembers = [];

            for (const b of allMembers) {
                // 本人たちは確定で自分の陣営へ
                if (b.id === rebellionLeader.id) {
                    rebelMembers.push(b);
                    continue;
                }
                if (b.id === oldDaimyo.id) {
                    daimyoMembers.push(b);
                    continue;
                }

                // すでに派閥に属している場合
                if (b.factionId !== 0) {
                    // リーダーと同じ派閥なら反乱軍、それ以外はすべて主家（大名）軍
                    if (b.factionId === rebellionLeader.factionId) {
                        rebelMembers.push(b);
                    } else {
                        daimyoMembers.push(b);
                    }
                } else {
                    // 無所属の場合は、スコアで判定します（offset分だけ条件を緩和します）
                    const { joinScore, stayScore } = this.calculateLoyaltyScores(b, rebellionLeader, oldDaimyo);
                    if (joinScore + thresholdOffset > stayScore) {
                        rebelMembers.push(b);
                    } else {
                        daimyoMembers.push(b);
                    }
                }
            }

            if (rebelMembers.length + daimyoMembers.length === totalMembers) {
                allAssigned = true;
            } else {
                thresholdOffset += 5; // まだ迷っている人がいたら、条件を甘くして再計算
            }
        }

        // 3. ★改修：謀反・独立・寝返りのスコア計算と性格による判定
        const personality = rebellionLeader.personality || 'balanced';
        
        // 性格が隠遁者（hermit）の場合は野に下ります
        if (personality === 'hermit') {
            this.game.ui.log(`【下野】${rebellionLeader.name}は野に下りました。`);
            this.game.affiliationSystem.becomeRonin(rebellionLeader);
            // もし神輿と城主が違う人物なら、城主も一緒に浪人にします
            if (castellan.id !== rebellionLeader.id && castellan.status === 'active') {
                this.game.affiliationSystem.becomeRonin(castellan);
            }
            return;
        }

        const rebelRatio = rebelMembers.length / totalMembers;
        let canCoup = false;

        // 性格によって、謀反を起こすために必要な味方の割合を変えます
        if (personality === 'aggressive') {
            if (rebelRatio >= 1 / 2) canCoup = true;
        } else if (personality === 'c' || personality === 'cautious') {
            if (rebelRatio >= 4 / 5) canCoup = true;
        } else {
            // balance, balanced など
            if (rebelRatio >= 2 / 3) canCoup = true;
        }

        // 野心と義理の数字を準備します（40より下、100より上は切り捨てます）
        const ambition = Math.max(40, Math.min(100, rebellionLeader.ambition || 70));
        const duty = Math.max(40, Math.min(100, rebellionLeader.duty || 70));

        let coupScore = 50;   // 謀反スコア
        let indepScore = 50;  // 独立スコア
        let defectScore = 50; // 寝返りスコア

        // 【野心による志向の計算】
        if (ambition >= 70) {
            const diff = ambition - 70;
            coupScore += diff;
            indepScore += diff;
            defectScore -= diff;
        } else {
            const diff = 70 - ambition;
            defectScore += diff;
            indepScore += Math.floor(diff / 2); // 独立志向も少しあります
            coupScore -= diff;
        }

        // 【義理による志向の計算】
        if (duty >= 70) {
            const diff = duty - 70;
            indepScore += diff;
            coupScore -= diff;
            defectScore -= diff;
        } else {
            const diff = 70 - duty;
            coupScore += diff;
            defectScore += diff;
            indepScore -= diff;
        }

        // 味方が足りなくて謀反できない場合は、謀反スコアを無くします
        if (!canCoup) {
            coupScore = -9999;
        }

        // 一番点数が高い行動を選びます（同点の場合は 謀反 ＞ 寝返り ＞ 独立 の順で優先します）
        let action = 'indep';
        let maxScore = indepScore;

        if (defectScore >= maxScore) {
            action = 'defect';
            maxScore = defectScore;
        }
        if (coupScore >= maxScore) {
            action = 'coup';
            maxScore = coupScore;
        }
        
        // 決定した行動を実行します
        if (action === 'coup') {
            this.game.ui.log(`【謀反】${rebellionLeader.name}が主君である${oldDaimyo.name}に対し、謀反を起こしました。`);
            await this.game.ui.showDialogAsync(`【謀反】\n${rebellionLeader.name}が主君である${oldDaimyo.name}に対し、謀反を起こしました！`);

            // ★ここから追加：謀反の時もカメラを移動してチカチカさせます！
            // ただし、プレイヤー大名家の場合は野戦画面になるのでチカチカさせません！
            const isPlayerDaimyo = (oldClanId === this.game.playerClanId);
            
            if (!isPlayerDaimyo) {
                if (typeof this.game.ui.showMapGuard === 'function') this.game.ui.showMapGuard();
                
                // お城にカメラを移動します
                this.game.ui.scrollToActiveCastle(castle, false);
                await new Promise(res => setTimeout(res, 600));

                // 謀反に参加する城（反乱軍の城）をすべて集めます
                const rebelCastleIds = [];
                rebelMembers.forEach(b => {
                    if (b.castleId && !rebelCastleIds.includes(b.castleId)) {
                        rebelCastleIds.push(b.castleId);
                    }
                });
                if (rebelCastleIds.length === 0) rebelCastleIds.push(castle.id);

                // 元の色を調べて、謀反軍の仮の色（少し赤っぽく）と交互に点滅させます
                let oldColor = { r: 255, g: 255, b: 255 };
                let rebelColor = { r: 255, g: 100, b: 100 }; 
                const oldClanData = this.game.clans.find(c => c.id === oldClanId);
                if (oldClanData && oldClanData.color && typeof DataManager !== 'undefined') oldColor = DataManager.hexToRgb(oldClanData.color);

                // 反乱軍の城をすべて同時に点滅させます！
                await this.game.ui.playBattleBlink(rebelCastleIds, oldColor, rebelColor, 1000);
                if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
            }
            // ★追加ここまで

            // 裏で野戦を行います！
            const result = await this.executeSecretFieldWar(daimyoMembers, rebelMembers, oldDaimyo, rebellionLeader);

            if (result === 'rebel_win') {
                // 【反乱軍の勝利】
                this.game.ui.log(`【謀反】反乱軍が勝利し、${oldDaimyo.name}は討死しました。`);

                // ★追加：データが変わってマップの色がフライングで塗り替わるのを防ぐストッパーをかけます！
                this.game.isSuspendingColorUpdate = true;

                // 勝手に後継ぎが選ばれて大名が2人にならないように、先に大名の印を外しておきます
                oldDaimyo.isDaimyo = false;

                // 大名死亡処理（life_systemにお任せします）
                await this.game.lifeSystem.executeDeath(oldDaimyo);

                // ★ここから追加：逃亡先の城を探す魔法です
                let escapeCastleId = castle.id; // 万が一見つからなかった時のために、今の城を覚えておきます
                const oldClanData = this.game.clans.find(c => c.id === oldClanId);
                
                if (oldClanData) {
                    let candidateClans = [];
                    // 外交の箱（diplomacyValue）を調べて、敵対していない大名家をリストアップします
                    for (const targetIdStr in oldClanData.diplomacyValue) {
                        const targetId = Number(targetIdStr);
                        if (targetId === oldClanId) continue;
                        
                        const rel = oldClanData.diplomacyValue[targetId];
                        // 敵対していなければ、候補に入れます（仲の良さも一緒にメモします）
                        if (rel && rel.status !== '敵対') {
                            candidateClans.push({ id: targetId, sentiment: rel.sentiment });
                        }
                    }
                    
                    // 仲が良い順に並べ替えます
                    candidateClans.sort((a, b) => b.sentiment - a.sentiment);
                    
                    let targetCastles = [];
                    // 仲が良い大名家から順番に、城を持っているか調べます
                    for (const cClan of candidateClans) {
                        const cList = this.game.castles.filter(c => c.ownerClan === cClan.id);
                        if (cList.length > 0) {
                            targetCastles = cList; // 城が見つかったら、それをターゲットにします
                            break; 
                        }
                    }
                    
                    // もし、仲の良い大名家が一つも城を持っていなかったら…敵以外の誰かの城を探します
                    if (targetCastles.length === 0) {
                        targetCastles = this.game.castles.filter(c => c.ownerClan !== oldClanId && c.ownerClan !== 0);
                    }
                    
                    // ターゲットの城が見つかったら、今の城から「一番近い城」を選びます
                    if (targetCastles.length > 0) {
                        targetCastles.sort((a, b) => {
                            const distA = Math.abs(castle.x - a.x) + Math.abs(castle.y - a.y);
                            const distB = Math.abs(castle.x - b.x) + Math.abs(castle.y - b.y);
                            return distA - distB;
                        });
                        escapeCastleId = targetCastles[0].id;
                    }
                }
                // ★逃亡先探しここまで
                
                // ★変更：主家側として戦って負けた武将たちを全員「浪人」にして、逃亡先に移動させます！（亡くなった大名本人は除外）
                const roninBushos = []; // 後で一門の子どもたちを探すためのメモ帳です
                daimyoMembers.forEach(b => {
                    if (b.id !== oldDaimyo.id) {
                        this.game.affiliationSystem.becomeRonin(b);
                        this.game.affiliationSystem.moveCastle(b, escapeCastleId);
                        roninBushos.push(b);
                    }
                });

                // ★追加：主家や逃げた武将の「一門」で、まだ登場していない子どもたちを処理します！
                const currentYear = this.game.year;
                const unbornFamily = this.game.bushos.filter(b => {
                    if (b.status !== 'unborn') return false; // まだ登場していない人だけを探します
                    
                    // 亡くなった旧大名の一門かチェック
                    const isFamilyOfOldDaimyo = b.familyIds.some(fId => oldDaimyo.familyIds.includes(fId));
                    // 逃げた武将たちの一門かチェック
                    const isFamilyOfRonin = roninBushos.some(ronin => b.familyIds.some(fId => ronin.familyIds.includes(fId)));
                    
                    return isFamilyOfOldDaimyo || isFamilyOfRonin;
                });
                
                unbornFamily.forEach(b => {
                    b.clan = 0; // ★まだ生まれていない武将も含め、大名家IDを0にして浪人として登場するようにします
                    
                    if (b.birthYear <= currentYear) {
                        // すでに生まれているなら、今すぐ元服して一緒に逃げます
                        b.status = 'ronin'; // 浪人にします
                        b.loyalty = 50;
                        b.isCastellan = false;
                        b.isDaimyo = false;
                        b.isGunshi = false;
                        // お引越しセンターの魔法で、安全に逃亡先の城に入れます
                        this.game.affiliationSystem.enterCastle(b, escapeCastleId);
                        
                        // フルネームから「|」を消して綺麗なお名前にします
                        const cleanName = b.name.replace('|', '');
                        this.game.ui.log(`【逃亡】${cleanName}は一門の危機に元服を早め、行動を共にしました。`);
                    }
                });

                // ★安全装置：反乱リーダーが新しい大名になるため、軍団長バッジや派閥などの過去の役職を綺麗にリセットします！
                this.game.affiliationSystem.resetFactionData(rebellionLeader);
                rebellionLeader.isDaimyo = true;
                
                // ★追加：新しい大名が住んでいるお城のおまかせ（委任）を解除します
                const daimyoCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
                if (daimyoCastle) {
                    daimyoCastle.isDelegated = false;
                }

                // 勢力名を変更
                const clan = this.game.clans.find(c => c.id === oldClanId);
                if (clan) {
                    const familyName = rebellionLeader.familyName || rebellionLeader.name.split('|')[0] || rebellionLeader.name;
                    clan.name = `${familyName}家`;
                    
                    // ★読み仮名も一緒に変更します！
                    const familyYomi = rebellionLeader.familyYomi || rebellionLeader.yomi.split('|')[0] || rebellionLeader.yomi;
                    clan.yomi = familyYomi ? `${familyYomi}け` : "";
                    
                    clan.leaderId = rebellionLeader.id;

                    this.game.clans.forEach(otherClan => {
                        if (otherClan.id === 0 || otherClan.id === clan.id) return;
                        
                        const currentRel = this.game.getRelation(clan.id, otherClan.id);
                        if (currentRel) {
                            let newSentiment = 100 - currentRel.sentiment;
                            newSentiment = Math.max(30, Math.min(70, newSentiment));
                            
                            let newStatus = '普通';
                            if (newSentiment >= 70) newStatus = '友好';
                            if (newSentiment <= 30) newStatus = '敵対';
                            
                            currentRel.status = newStatus;
                            currentRel.sentiment = newSentiment;
                            currentRel.trucePeriod = 0;
                            currentRel.isMarriage = false;
                            
                            const oppRel = this.game.getRelation(otherClan.id, clan.id);
                            if (oppRel) {
                                oppRel.status = newStatus;
                                oppRel.sentiment = newSentiment;
                                oppRel.trucePeriod = 0;
                                oppRel.isMarriage = false;
                            }
                        }
                    });

                    // ★ここから追加：諸勢力との関係値も反転させます！
                    if (this.game.kunishuSystem) {
                        const aliveKunishus = this.game.kunishuSystem.getAliveKunishus();
                        aliveKunishus.forEach(kunishu => {
                            const currentRel = kunishu.getRelation(clan.id);
                            let newSentiment = 100 - currentRel;
                            newSentiment = Math.max(30, Math.min(70, newSentiment));
                            kunishu.setRelation(clan.id, newSentiment);
                        });
                    }
                    // ★追加ここまで
                }
                // 勢力情報が変わったので威信を更新
                if (window.GameApp) window.GameApp.updateAllClanPrestige();

                // ★追加：ストッパーを外して、新しい色を塗れるようにします！
                this.game.isSuspendingColorUpdate = false;

                // 謀反成功時は大名家の色がそのまま引き継がれるため、
                // 光るアニメーションは出さずに、マップをそのまま描き直します。
                if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
                    this.game.ui.renderMap();
                }

                // 結果のメッセージを出します！
                await this.game.ui.showDialogAsync(`【謀反】${oldDaimyo.name}は討死しました！\n${rebellionLeader.name}が新たな大名となります！`);

            } else if (result === 'daimyo_win') {
                // 【主家軍の勝利】
                await this.game.ui.showDialogAsync(`【謀反】\n${oldDaimyo.name}が勝利をおさめ、\n首魁の${rebellionLeader.name}は自領に逃亡しました。`);
                this.game.ui.log(`【謀反】${oldDaimyo.name}が勝利をおさめ、首魁の${rebellionLeader.name}は自領に逃亡しました。`);

                // ★追加：後で元に戻せるように、元の功績を覚えておくためのメモ帳を用意します
                const originalAchievements = new Map();

                // 主家軍の功績を一時的に+3000します
                daimyoMembers.forEach(b => {
                    originalAchievements.set(b.id, b.achievementTotal || 0); // 元の数字をメモ！
                    b.achievementTotal = (b.achievementTotal || 0) + 3000;
                });
                
                // 大名様は普段は派閥主になれないので、一時的に「普通の武将」のフリをしてもらって候補に含めます
                oldDaimyo.isDaimyo = false;

                // この特別な状態で、派閥の振り分け直しを行います
                this.game.factionSystem.updateFactions();

                // ★追加：計算が終わったら、すべて元の状態（永続化しないように）に戻します！
                daimyoMembers.forEach(b => {
                    b.achievementTotal = originalAchievements.get(b.id); // メモを見て元通りに！
                });
                oldDaimyo.isDaimyo = true; // 大名様に戻ってもらいます

                // その後、敗れた反乱分子たちは通常の独立処理へ移行
                await this.executeRebellion(castle, castellan, oldDaimyo, 'indep');

            } else {
                // 【引き分け】
                await this.game.ui.showDialogAsync(`【謀反】\n決着は着かず、首魁の${rebellionLeader.name}は自領に逃亡しました。`);
                this.game.ui.log(`【謀反】決着は着かず、首魁の${rebellionLeader.name}は自領に逃亡しました。`);

                // 全員を強制的に追従させるため、一時的に派閥IDを反乱リーダーと同じにします
                const dummyFactionId = rebellionLeader.factionId || 999;
                rebellionLeader.factionId = dummyFactionId;
                rebellionLeader.isFactionLeader = true;
                rebelMembers.forEach(b => {
                    b.factionId = dummyFactionId;
                });

                // 通常の独立処理へ
                await this.executeRebellion(castle, castellan, oldDaimyo, 'indep');
            }

        } else {
            // スコア計算の結果、寝返りか独立に決まった場合の処理です
            await this.executeRebellion(castle, castellan, oldDaimyo, action);
        }
    }

    async executeSecretFieldWar(daimyoMembers, rebelMembers, oldDaimyo, rebellionLeader) {
        // 1. 大名と反乱リーダーを必ず総大将（一番最初）に置いて、残りのメンバーから強い順に4人を選びます
        const sortByStr = (a, b) => (b.leadership + b.strength) - (a.leadership + a.strength);
        
        const otherDaimyoMembers = daimyoMembers.filter(b => b.id !== oldDaimyo.id).sort(sortByStr).slice(0, 4);
        const daimyoTeamBushos = [oldDaimyo, ...otherDaimyoMembers];

        const otherRebelMembers = rebelMembers.filter(b => b.id !== rebellionLeader.id).sort(sortByStr).slice(0, 4);
        const rebelTeamBushos = [rebellionLeader, ...otherRebelMembers];

        // 2. 兵士数を「派閥の人数比」に合わせて、合計10000人を分け合います！
        const totalCount = daimyoMembers.length + rebelMembers.length;
        const daimyoTotalPool = Math.floor(10000 * (daimyoMembers.length / totalCount));
        const rebelTotalPool = 10000 - daimyoTotalPool;

        // 実際に決戦場で戦う5人の部隊に、それぞれの取り分を均等に配ります
        const daimyoPerUnit = Math.floor(daimyoTotalPool / daimyoTeamBushos.length);
        const rebelPerUnit = Math.floor(rebelTotalPool / rebelTeamBushos.length);

        const daimyoAssignments = daimyoTeamBushos.map(b => ({
            busho: b,
            soldiers: daimyoPerUnit,
            troopType: 'ashigaru'
        }));

        const rebelAssignments = rebelTeamBushos.map(b => ({
            busho: b,
            soldiers: rebelPerUnit,
            troopType: 'ashigaru'
        }));

        // 3. 野戦システム(FieldWarManager)に渡すための「ダミーの戦場データ」を作ります
        // ポイント：ownerClan を -1（中立扱い）にすることで、プレイヤーが操作できない「完全なAI戦」になり、画面を隠したまま裏で超高速で戦ってくれます！
        // エラーが起きないように、出発元のお城などのダミーデータもしっかり持たせます！
        const isPlayerDaimyo = (oldDaimyo.clan === this.game.playerClanId);
        const defClanId = isPlayerDaimyo ? oldDaimyo.clan : -1;

        // この時点から、勢力名を「謀反武将の苗字＋家」にしてあげます
        const familyName = rebellionLeader.familyName || rebellionLeader.name.split('|')[0] || rebellionLeader.name; 
        const rebelClanName = `${familyName}家`;

        const fakeWarState = {
            attacker: { 
                ownerClan: -1, 
                name: rebelClanName, 
                soldiers: rebelTotalPool,
                rice: 5000, 
                morale: 70, 
                training: 50,
                isKunishu: false
            },
            defender: { 
                id: 0, 
                ownerClan: defClanId, 
                name: "主家軍", 
                soldiers: daimyoTotalPool,
                morale: 50, 
                training: 50,
                isDelegated: false,
                isKunishu: false
            },
            sourceCastle: {
                id: 0,
                name: "決戦場",
                ownerClan: -1,
                isDelegated: false,
                isKunishu: false
            },
            defFieldRice: 5000,
            atkAssignments: rebelAssignments,
            defAssignments: daimyoAssignments,
            deadSoldiers: { attacker: 0, defender: 0 },
            isKunishuSubjugation: false
        };

        // 4. 本物の野戦システムを呼び出して、見えないマス目の上で戦わせます！
        return new Promise((resolve) => {
            if (!this.game.fieldWarManager) {
                this.game.fieldWarManager = new window.FieldWarManager(this.game);
            }
            
            // プレイヤー大名の場合は通常の野戦画面が表示され、AI大名の場合は一瞬で結果が出ます
            this.game.fieldWarManager.startFieldWar(fakeWarState, (resultType) => {
                // ★追加：謀反の野戦（プレイヤー担当）が終わった時だけ、曲を元に戻します！
                if (window.AudioManager && isPlayerDaimyo) {
                    window.AudioManager.restoreMemorizedBgm();
                }

                // 結果を翻訳して返します
                // attacker = 反乱軍, defender = 主家軍
                if (resultType === 'attacker_win' || resultType === 'defender_retreat') {
                    resolve('rebel_win');
                } else if (resultType === 'attacker_lose' || resultType === 'attacker_retreat') {
                    resolve('daimyo_win');
                } else {
                    resolve('draw');
                }
            });
        });
    }
    
    /**
     * 新大名家用の色を生成する処理
     * （隣接大名家、およびその大名家に隣接する大名家の色から遠く、見やすい色を選択）
     */
    generateDistinctColor(castle) {
        const neighborClanIds = new Set();
        const degree1Clans = new Set();
        
        // 独立元の主家（元の持ち主）も絶対に避ける色として追加しておきます
        if (castle.ownerClan !== 0) {
            neighborClanIds.add(castle.ownerClan);
            degree1Clans.add(castle.ownerClan);
        }
        
        // 1. 独立する城に隣接する城から「第1隣接大名」を取得
        if (castle.adjacentCastleIds) {
            for (const adjId of castle.adjacentCastleIds) {
                const adjCastle = this.game.castles.find(c => c.id === adjId);
                if (adjCastle && adjCastle.ownerClan !== 0) {
                    degree1Clans.add(adjCastle.ownerClan);
                    neighborClanIds.add(adjCastle.ownerClan);
                }
            }
        }
        
        // 2. 「第1隣接大名」が所有するすべての城を起点に、さらに隣接する城の持ち主（第2隣接大名）を取得
        for (const c of this.game.castles) {
            if (degree1Clans.has(c.ownerClan)) {
                if (c.adjacentCastleIds) {
                    for (const adjId of c.adjacentCastleIds) {
                        const adjCastle = this.game.castles.find(c2 => c2.id === adjId);
                        if (adjCastle && adjCastle.ownerClan !== 0) {
                            neighborClanIds.add(adjCastle.ownerClan);
                        }
                    }
                }
            }
        }
        
        // 対象となる周辺大名家の色をリストアップ
        const existingColors = [];
        for (const clanId of neighborClanIds) {
            const clan = this.game.clans.find(c => c.id === clanId);
            if (clan && clan.color) {
                const rgb = this.hexToRgb(clan.color);
                if (rgb) existingColors.push(rgb);
            }
        }
        
        // 周辺に大名家が一つもない場合は、ランダムな色を返します
        if (existingColors.length === 0) {
            const h = Math.random(); 
            const s = 0.5 + Math.random() * 0.4;
            const l = 0.4 + Math.random() * 0.3;
            return this.hslToHex(h, s, l);
        }
        
        let bestColor = "#ffffff";
        let maxMinDistance = -1;
        
        // 運任せにならないように、色相(色合い)を均等に分けた候補を36個(10度ずつ)作って比べます
        for (let i = 0; i < 36; i++) {
            const h = i / 36; // 0から1まで均等に色合いをずらします
            const s = 0.6 + Math.random() * 0.3; // 彩度: 60%〜90%
            const l = 0.4 + Math.random() * 0.2; // 明度: 40%〜60%
            
            const hex = this.hslToHex(h, s, l);
            const rgb = this.hexToRgb(hex);
            
            let minDistance = Infinity;
            for (const exColor of existingColors) {
                // RGBの差を計算します
                const dist = Math.sqrt(Math.pow(rgb.r - exColor.r, 2) + Math.pow(rgb.g - exColor.g, 2) + Math.pow(rgb.b - exColor.b, 2));
                if (dist < minDistance) {
                    minDistance = dist;
                }
            }
            
            if (minDistance > maxMinDistance) {
                maxMinDistance = minDistance;
                bestColor = hex;
            }
        }
        
        return bestColor;
    }

    /**
     * HSLからHEXへの変換
     */
    hslToHex(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l; 
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * HEXからRGBへの変換
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
}