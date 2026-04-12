/**
 * affiliation_system.js
 * 武将の「所属変更（お引越し）」をすべて一元管理するお引越しセンターです！
 * 城主や軍師の任命などの人事もここで行います。
 */

class AffiliationSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * ① 浪人から仕官したり、敵から寝返ったりして「新しい大名家」に入る時の魔法
     * @param {object} busho - お引越しする武将
     * @param {number} newClanId - 新しい大名家のID
     * @param {number} newCastleId - 新しく入るお城のID
     */
    joinClan(busho, newClanId, newCastleId) {
        const oldClanId = busho.clan;

        // 1. 今いるお城から出ます
        this.leaveCastle(busho);

        // 2. もし元々どこかの大名家にいて、別の大名家に移るなら、功績を半分にします！
        if (oldClanId !== 0 && oldClanId !== newClanId) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 3. 前の派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 4. 新しい大名家の所属にして、状態を「活動中(active)」にします
        busho.clan = newClanId;
        busho.status = 'active';
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isGunshi = false; // ★ここを書き足します！軍師のバッジを外します

        // 5. 新しい殿様との相性を計算して、最初の忠誠度を決めます！
        this.updateLoyaltyForNewLord(busho, newClanId);

        // 6. 新しいお城に入ります
        this.enterCastle(busho, newCastleId);

        // ★ここから追加：人が増えたり減ったりしたので、派閥を新しく組み直す魔法を呼び出します！
        if (this.game && this.game.factionSystem) {
            this.game.factionSystem.updateFactions();
        }

        // ★ここから追加：画面の絵をすぐに描き直す魔法！
        if (this.game && this.game.ui) {
            this.game.ui.renderMap();
            this.game.ui.updatePanelHeader();
        }
    }

    /**
     * ② 追放されたり、下野（自分から辞める）して「浪人」になる時の魔法
     * @param {object} busho - 浪人になる武将
     */
    becomeRonin(busho) {
        // ★ここから追加：最強の関所！自動で作られた頭領は浪人になれず、ここで消滅します！
        if (busho.isAutoLeader) {
            busho.clan = 0;
            busho.status = 'dead'; // 浪人ではなく、死亡（消滅）扱いにします
            busho.isCastellan = false;
            busho.isDaimyo = false;
            busho.isGunshi = false; // ★念のためここにも書き足します！
            busho.belongKunishuId = 0; // 諸勢力からも外します
            this.leaveCastle(busho); // お城から綺麗にいなくなります
            return; // これ以上下の「浪人になる処理」には進ませません！
        }
        // ★追加ここまで！

        const oldClanId = busho.clan;

        // 1. 大名家を抜けるので、功績を半分にします！
        if (oldClanId !== 0) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 2. 派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 3. 浪人になるので、肩書きを外します
        busho.clan = 0;
        busho.status = 'ronin';
        busho.loyalty = 50; // ★浪人になったので、忠誠度を50にします！
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isGunshi = false; // ★ここを書き足します！軍師のバッジを外します

        // 4. お城から出ます
        this.leaveCastle(busho);
        
        // ★大名家が滅亡したかどうかのチェック（元いた大名家の城が0個なら滅亡と判断します）
        const isClanDestroyed = (oldClanId !== 0) && (this.game.castles.filter(c => c.ownerClan === oldClanId).length === 0);
        
        // ★新しい処理：滅亡した場合はそのまま留まり、自ら出奔した場合は近いお城を探します
        if (busho.castleId) {
            const currentCastle = this.game.getCastle(busho.castleId);
            let targetCastle = null;

            // 滅亡ではなく、自ら出奔した場合のみ、お引越し先を探します
            if (!isClanDestroyed && currentCastle) {
                // 自分のもともといた大名家（oldClanId）ではなく、かつ誰かの持ち物であるお城だけを集めます
                const otherCastles = this.game.castles.filter(c => c.ownerClan !== oldClanId && c.ownerClan !== 0);

                if (otherCastles.length > 0) {
                    // 集めたお城について、距離と城主との相性を計算して記録します
                    const candidates = otherCastles.map(c => {
                        // 今いるお城からの直線距離を計算します
                        const dist = Math.sqrt(Math.pow(c.x - currentCastle.x, 2) + Math.pow(c.y - currentCastle.y, 2));
                        
                        // そのお城の城主を探します（城主がいなければ大名を探します）
                        let lord = this.game.getBusho(c.castellanId);
                        if (!lord) {
                            lord = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
                        }

                        // 相性のズレを計算します（0から50の間で、数字が小さいほど相性が良いです）
                        let affDiff = 50; 
                        if (lord) {
                            const diff = Math.abs(busho.affinity - lord.affinity);
                            affDiff = Math.min(diff, 100 - diff);
                        }

                        return { castle: c, dist: dist, affDiff: affDiff };
                    });

                    // 距離が近い順番に並べ替えます
                    candidates.sort((a, b) => a.dist - b.dist);

                    // 近くにあるお城の中から、上位10個だけを「近い範囲」として選び出します
                    const nearCandidates = candidates.slice(0, 10);

                    // 選ばれた近いお城の中で、一番相性が良い（ズレが小さい）順番に並べ替えます
                    nearCandidates.sort((a, b) => a.affDiff - b.affDiff);

                    // 一番相性が良いお城が複数ある場合に備えて、一番良い点数と同じお城だけを集めます
                    const bestAffDiff = nearCandidates[0].affDiff;
                    const bestGroup = nearCandidates.filter(c => c.affDiff === bestAffDiff);
                    
                    // その中からランダムで1つだけ選びます
                    targetCastle = bestGroup[Math.floor(Math.random() * bestGroup.length)].castle;
                }
            }

            // 新しい行き先が見つかっていればそこへ、見つからなければ（滅亡時など）元のお城の周辺にとどまります
            const nextCastleId = targetCastle ? targetCastle.id : busho.castleId;
            this.enterCastle(busho, nextCastleId);
        }

        // ★ここから追加：人が減ったので、派閥を新しく組み直す魔法を呼び出します！
        if (this.game && this.game.factionSystem) {
            this.game.factionSystem.updateFactions();
        }

        // ★ここから追加：画面の絵をすぐに描き直す魔法！
        if (this.game && this.game.ui) {
            this.game.ui.renderMap();
            this.game.ui.updatePanelHeader();
        }
    }

    /**
     * ③ 同じ大名家の中で、別のお城に「移動」する時の魔法
     * @param {object} busho - 移動する武将
     * @param {number} newCastleId - 移動先のお城のID
     */
    moveCastle(busho, newCastleId) {
        // 1. 今のお城から出ます
        this.leaveCastle(busho);
        
        // 2. 新しいお城に入る前にバッジを外します
        busho.isCastellan = false; 
        
        // 3. 新しいお城に入ります
        this.enterCastle(busho, newCastleId);

        // ★ここから追加：画面の絵をすぐに描き直す魔法！
        if (this.game && this.game.ui) {
            this.game.ui.renderMap();
            this.game.ui.updatePanelHeader();
        }
    }

    /**
     * ④ お城の「所属（持ち主の大名家）」が変わる時の魔法
     * 引き抜きや独立、戦争での落城などで使います！
     * @param {object} castle - 所属が変わるお城
     * @param {number} newClanId - 新しい大名家のID
     */
    changeCastleOwner(castle, newClanId) {
        if (!castle) return;
        
        // お城の持ち主のデータを書き換えます
        castle.ownerClan = newClanId;

        // 画面の絵をすぐに描き直す魔法！
        if (this.game && this.game.ui) {
            this.game.ui.renderMap();
            this.game.ui.updatePanelHeader();
        }
    }

    /**
     * （共通の道具）お城から出る時の処理
     */
    leaveCastle(busho) {
        if (busho.castleId) {
            const oldCastle = this.game.getCastle(busho.castleId);
            if (oldCastle) {
                // お城のリストから自分を消します
                oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => Number(id) !== Number(busho.id));
                
                // もし自分が城主だったら、城主を空っぽにします
                if (Number(oldCastle.castellanId) === Number(busho.id)) {
                    oldCastle.castellanId = 0;
                    busho.isCastellan = false;
                }
                this.updateCastleLord(oldCastle);
            }
        }
    }

    /**
     * （共通の道具）お城に入る時の処理
     */
    enterCastle(busho, newCastleId) {
        busho.castleId = newCastleId;
        const newCastle = this.game.getCastle(newCastleId);
        if (newCastle) {
            // お城のリストに自分がいなければ、名前を書きます
            if (!newCastle.samuraiIds.some(id => Number(id) === Number(busho.id))) {
                newCastle.samuraiIds.push(Number(busho.id));
            }
            this.updateCastleLord(newCastle);
        }
    }

    /**
     * （共通の道具）派閥や承認欲求のデータをまっさらにリセットする処理
     */
    resetFactionData(busho) {
        busho.factionId = 0;
        busho.isFactionLeader = false;
        busho.recognitionNeed = 0;
        busho.factionSeikaku = "無所属";
        busho.factionHoshin = "無所属";
        busho.belongKunishuId = 0;
    }

    /**
     * （共通の道具）新しい殿様との相性で忠誠度を決める処理
     */
    updateLoyaltyForNewLord(busho, clanId) {
        // 新しい殿様（大名）を探します
        const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo) || { affinity: 50 };
        
        // 殿様との相性の「ズレ（差）」を計算します（0〜50の数字になります）
        const affDiff = GameSystem.calcAffinityDiff(daimyo.affinity, busho.affinity);
        
        // ズレが0（ピッタリ）なら50アップ、ズレが50（真逆）なら0アップにします
        const loyaltyUp = 50 - affDiff;
        
        // 基本の50にアップ分を足して、最高100までにします
        busho.loyalty = Math.min(100, 50 + loyaltyUp);
    }
    
    /**
     * ========================================================
     * ★ここから下は、新しく設立された「人事部」の魔法です！★
     * ========================================================
     */

    /**
     * ① AI大名のお引越し（特殊な移動処理）
     */
    relocateDaimyoAI(castle, castellan) {
        // ※AI大名のお引越しは ai_staffing.js の新しい人事部に移管されたため、ここは空っぽになりました！
        return false;
    }

    /**
     * ② AI大名の軍師任命
     */
    appointAIGunshi(castle, castellan) {
        if (castellan.isDaimyo && Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
            const currentGunshi = this.game.getClanGunshi(castle.ownerClan);
            if (!currentGunshi) {
                const daimyoFactionId = castellan.factionId;
                const myClanBushos = this.game.bushos.filter(b => b.clan === castle.ownerClan && b.status === 'active');
                
                let candidates = myClanBushos.filter(b => 
                    !b.isDaimyo && 
                    !b.isCastellan && 
                    b.factionId === daimyoFactionId
                );

                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        if (b.intelligence !== a.intelligence) return b.intelligence - a.intelligence; 
                        const aDiff = GameSystem.calcAffinityDiff(a.affinity, castellan.affinity);
                        const bDiff = GameSystem.calcAffinityDiff(b.affinity, castellan.affinity);
                        if (aDiff !== bDiff) return aDiff - bDiff; 
                        const aAchieve = a.achievementTotal || 0;
                        const bAchieve = b.achievementTotal || 0;
                        if (bAchieve !== aAchieve) return bAchieve - aAchieve; 
                        return Math.random() - 0.5;
                    });
                    const newGunshi = candidates[0];
                    newGunshi.isGunshi = true;
                }
            }
        }
    }

    /**
     * ③ 城主の自動決定と更新
     */
    updateCastleLord(castle) {
        if (!castle || castle.ownerClan === 0) {
            if (castle) castle.castellanId = 0;
            return;
        }

        const bushos = this.game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && b.status === 'active');
        if (bushos.length === 0) {
            castle.castellanId = 0;
            return;
        }

        const daimyo = bushos.find(b => b.isDaimyo);
        if (daimyo) {
            bushos.forEach(b => { 
                b.isCastellan = false; 
            });
            daimyo.isCastellan = true; 
            castle.castellanId = daimyo.id;
            castle.isDelegated = false;
            return;
        }

        // 城内にいる城主バッジを持っている武将のリストを作成します
        const lords = bushos.filter(b => b.isCastellan);

        if (lords.length >= 2) {
            // 城主が２人以上いる場合は、その複数の中から新しい城主を決めます
            this.electCastellan(castle, lords);
        } else if (lords.length === 1) {
            // 城主が１人だけなら、元々の城主をそのまま維持します
            castle.castellanId = lords[0].id;
        } else {
            // 城主が誰もいない場合は、城内の全武将から新しい城主を決めます
            this.electCastellan(castle, bushos);
        }
    }

    electCastellan(castle, bushos) {
        if (castle.ownerClan === this.game.playerClanId) {
            const currentLord = bushos.find(b => b.id === castle.castellanId);
            if (currentLord) {
                bushos.forEach(b => b.isCastellan = false);
                currentLord.isCastellan = true;
                return; 
            }
        }
        
        const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const innovation = daimyo ? daimyo.innovation : 50; 
        const abilityFactor = innovation / 100;
        const meritFactor = (100 - innovation) / 100;

        bushos.forEach(b => {
            const leadScore = Math.min(b.leadership, 80) * 0.8 + Math.max(b.leadership - 80, 0) * 0.8 * 0.3;
            const strScore = Math.min(b.strength, 50) * 0.5 + Math.max(b.strength - 50, 0) * 0.5 * 0.3;
            const polScore = Math.min(b.politics, 80) * 0.8 + Math.max(b.politics - 80, 0) * 0.8 * 0.3;
            const dipScore = Math.min(b.diplomacy, 60) * 0.6 + Math.max(b.diplomacy - 60, 0) * 0.6 * 0.3;
            const intScore = Math.min(b.intelligence, 60) * 0.6 + Math.max(b.intelligence - 60, 0) * 0.6 * 0.3;
            const charmScore = Math.min(b.charm, 70) * 0.8 + Math.max(b.charm - 70, 0) * 0.8 * 0.3;
            
            const abilityScore = leadScore + strScore + polScore + dipScore + intScore + charmScore;
            const meritScore = Math.sqrt((b.achievementTotal || 0) * 64);
            
            b._lordScore = (abilityScore * abilityFactor) + (meritScore * meritFactor);

            if (b.isCastellan) {
                b._lordScore += Math.floor(Math.random() * 41) + 80;
            }

            if (b.isFactionLeader) {
                b._lordScore += 10000; 
            }
            if (b.isGunshi) {
                b._lordScore -= 100000; 
            }
        });

        bushos.sort((a, b) => b._lordScore - a._lordScore);
        const best = bushos[0];

        bushos.forEach(b => b.isCastellan = false);
        best.isCastellan = true;
        
        if (best.isGunshi) {
            best.isGunshi = false;
        }
        
        castle.castellanId = best.id;
    }

    updateAllCastlesLords() {
        this.game.castles.forEach(c => this.updateCastleLord(c));
    }
    
    /**
     * 月初の浪人移動処理
     */
     processRoninMovements() {
        // 全武将から「浪人」かつ「諸勢力に所属していない（IDが0または未定義）」武将を抽出
        const ronins = this.game.bushos.filter(b => b.status === 'ronin' && !b.belongKunishuId);
        
        ronins.forEach(r => {
            const currentC = this.game.getCastle(r.castleId); 
            if(!currentC) return; 
            
            // 隣接する城のリストを作る
            const neighbors = this.game.castles.filter(c => GameSystem.isAdjacent(currentC, c)); 
            
            // 隣に城があって、かつ5%の確率(サイコロ)に当たったらお引越しする
            if (neighbors.length > 0 && Math.random() < 0.05) {
                // クジ引きで移動先の城を「1つだけ」決める
                const targetCastle = neighbors[Math.floor(Math.random() * neighbors.length)];
                
                // お引越しセンター自身の魔法を使います！
                this.moveCastle(r, targetCastle.id);
            }
        }); 
    }

}