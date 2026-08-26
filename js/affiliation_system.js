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
     * 軍師役職の解除窓口。
     * 軍師は大名家に属する役職なので、所属変更・国主/城主/大名就任などで外す時はここを使う。
     */
    clearGunshiRole(busho) {
        if (!busho) return false;
        const wasGunshi = busho.isGunshi === true;
        busho.isGunshi = false;
        return wasGunshi;
    }

    /**
     * 一勢力一軍師を保証する唯一の任命窓口。
     * 既存軍師が複数いた場合も全員の役職を外してから、指定した一人だけを任命する。
     */
    appointClanGunshi(clanId, busho) {
        const numericClanId = Number(clanId) || 0;
        if (!busho || numericClanId <= 0 || Number(busho.clan) !== numericClanId) return false;
        if (busho.isDaimyo || busho.isCommander || busho.isCastellan) return false;
        if (window.BushoStatusRules && !window.BushoStatusRules.isActive(busho)) return false;

        const members = Array.isArray(this.game && this.game.bushos) ? this.game.bushos : [];
        const previousGunshi = members.find(member => Number(member.clan) === numericClanId && member.isGunshi) || null;
        members.forEach(member => {
            if (Number(member.clan) === numericClanId && member.isGunshi) this.clearGunshiRole(member);
        });
        busho.isGunshi = true;
        if ((!previousGunshi || Number(previousGunshi.id) !== Number(busho.id))
            && this.game.phase === 'game' && !this.game.isRestoringSave && this.game.historySystem) {
            const clan = this.game.getClan ? this.game.getClan(numericClanId) : null;
            const clanName = clan ? clan.name : '大名家';
            this.game.historySystem.record(`【軍師任命】${clanName}は${busho.fullName || busho.name}を軍師に任命しました。`, {
                clanIds: [numericClanId], category: 'appointment', inferCurrentTurn: false
            });
        }
        return true;
    }

    /**
     * 低レベル所属書換API。特殊イベントや独立処理など、周辺処理を呼び出し側が
     * すでに管理している場合だけ使用します。通常は joinClan / becomeRonin を使用してください。
     * busho.clan の直接代入はこのクラス以外では行いません。
     */
    setClanIdRaw(busho, newClanId) {
        if (!busho) return;
        const nextClanId = Number(newClanId) || 0;
        const oldClanId = Number(busho.clan) || 0;
        if (oldClanId !== nextClanId && busho.isGunshi) {
            // 軍師は「人物の属性」ではなく所属大名家での役職。別家へ持ち越さない。
            this.clearGunshiRole(busho);
        }
        busho.clan = nextClanId;
    }

    /**
     * 低レベル配置書換API。城内名簿の同期まで必要な通常移動では moveCastle を使用してください。
     * busho.castleId の直接代入はこのクラス以外では行いません。
     */
    setCastleIdRaw(busho, newCastleId) {
        if (!busho) return;
        busho.castleId = Number(newCastleId) || 0;
    }

    /**
     * 低レベル活動状態書換API。active / ronin は所属・活動状態としてこの部署が所有します。
     * dead / unborn は LifeSystem の責務です。
     */
    setActivityStatusRaw(busho, newStatus) {
        if (!busho) return;
        const S = window.GameConstants.BushoStatus;
        if (newStatus !== S.ACTIVE && newStatus !== S.RONIN) {
            console.warn('AffiliationSystem: activity status 以外の書換要求を拒否しました', newStatus, busho.id);
            return;
        }
        busho.status = newStatus;
    }

    /**
     * ① 浪人から仕官したり、敵から寝返ったりして「新しい大名家」に入る時の魔法
     * @param {object} busho - お引越しする武将
     * @param {number} newClanId - 新しい大名家のID
     * @param {number} newCastleId - 新しく入るお城のID
     * @param {number|null} forceLoyalty - イベント専用の固定忠誠度（指定がなければ相性計算）
     * @param {boolean} keepAchievement - ★追加：イベント等で功績を半分にしたくない場合に true を指定します
     */
    joinClan(busho, newClanId, newCastleId, forceLoyalty = null, keepAchievement = false) {
        const oldClanId = busho.clan;

        // 1. 今いるお城から出ます
        this.leaveCastle(busho);

        // 2. もし元々どこかの大名家にいて、別の大名家に移るなら、功績を半分にします！
        // ★修正：keepAchievement が true の場合は功績をそのまま維持します！
        if (oldClanId !== 0 && oldClanId !== newClanId && !keepAchievement) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 3. 前の派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 4. 新しい大名家の所属にします
        this.setClanIdRaw(busho, newClanId);
        
        // ★修正：死亡や未登場の武将は状態を強制的に変えないようにします
        if (window.LifeStatusRules.isPresent(busho)) {
            this.setActivityStatusRaw(busho, window.GameConstants.BushoStatus.ACTIVE);
        }
        
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isCommander = false; // ★ここを追加：国主のバッジも外します

        // 5. 新しい殿様との相性を計算して、最初の忠誠度を決めます！
        // ★追加：イベント専用などで忠誠度が指定されている場合は、相性計算をスキップして固定します
        if (forceLoyalty !== null) {
            busho.loyalty = forceLoyalty;
        } else {
            this.updateLoyaltyForNewLord(busho, newClanId);
        }

        // 6. 新しいお城に入ります
        this.enterCastle(busho, newCastleId);

        // 7. 既婚武将の妻は夫の所属へ追従させる。
        // 人質は現行仕様が別途未確定なので、外交婚姻フラグの張替えだけは行わない。
        this.syncSpousesForClanChange(busho, oldClanId, newClanId, {
            refreshDiplomacy: busho.isHostage !== true
        });

        // ★軽量化：所属が変化した大名家だけ派閥を再編します。
        // 派閥は大名家ごとに独立しているため、全国全勢力を作り直す必要はありません。
        if (this.game && this.game.factionSystem) {
            if (oldClanId !== 0 && oldClanId !== newClanId) this.game.factionSystem.updateFactions(oldClanId);
            if (newClanId !== 0) this.game.factionSystem.updateFactions(newClanId);
        }

        // 画面の絵をすぐに描き直す魔法！
        this.updateUI();
    }

    /**
     * ② 追放されたり、下野（自分から辞める）して「浪人」になる時の魔法
     * @param {object} busho - 浪人になる武将
     * @param {string} reason - 浪人になる理由（'banish': 追放, 'desertion': 自発的出奔など）
     */
    becomeRonin(busho, reason = 'desertion') {
        // ★ここから追加：最強の関所！自動で作られた頭領は浪人になれず、ここで消滅します！
        if (busho.isAutoLeader) {
            this.setClanIdRaw(busho, 0);
            this.game.lifeSystem.setLifeStatusRaw(busho, window.GameConstants.BushoStatus.DEAD); // 浪人ではなく、死亡（消滅）扱い
            busho.isCastellan = false;
            busho.isDaimyo = false;
            busho.isCommander = false; // ★ここを追加：国主のバッジも外します
            busho.belongKunishuId = 0; // 諸勢力からも外します
            this.leaveCastle(busho); // お城から綺麗にいなくなります
            return; // これ以上下の「浪人になる処理」には進ませません！
        }

        const oldClanId = busho.clan;

        // ★後で「元々の家臣」と判定できるように、所属をメモしておきます
        busho._lastClanId = oldClanId;

        // ★大名家が滅亡したかどうかのチェック（元いた大名家の城が0個なら滅亡と判断します）
        const isClanDestroyed = (oldClanId !== 0) && (this.game.getClanCastles(oldClanId).length === 0);
        
        // ★変更：スキルマネージャーに滅亡時の生存（諸勢力化）スキルがないか聞きに行きます
        // （プレイヤー大名の場合はこの魔法は使わずに通常のゲームオーバーへ進ませます！）
        if (isClanDestroyed && oldClanId !== this.game.playerClanId && typeof SkillManager !== 'undefined') {
            const survivalInfo = SkillManager.getExtinctionSurvivalInfo(busho, this.game);
            
            // 自分が生存スキルを持っている場合、スキルマネージャーからの情報をもとに諸勢力を結成する
            if (survivalInfo && survivalInfo.isSurvive) {
                this._createSurvivalKunishu(busho, oldClanId, survivalInfo);
                return; // 浪人にはならずに終了
            }
            
            // 自分が持っていなくても、すでに生存スキルによる諸勢力が結成されていればそこに合流する
            if (this.game && this.game.kunishuSystem) {
                const survivalKunishu = this.game.kunishuSystem.kunishus.find(k => k._survivalClanId === oldClanId && !k.isDestroyed);
                if (survivalKunishu) {
                    this._joinSurvivalKunishu(busho, survivalKunishu);
                    return; // 浪人にはならずに終了
                }
            }
        }

        // 1. 大名家を抜けるので、功績を半分にします！
        if (oldClanId !== 0) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 2. 派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 3. 浪人になるので、肩書きを外します
        this.setClanIdRaw(busho, 0);
        
        // ★修正：死亡や未登場の武将は状態を強制的に変えないようにします
        if (window.LifeStatusRules.isPresent(busho)) {
            this.setActivityStatusRaw(busho, window.GameConstants.BushoStatus.RONIN);
            busho.loyalty = 50; // ★浪人になったので、忠誠度を50にします！
        }
        
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isCommander = false; // ★ここを追加：国主のバッジも外します

        // 4. 既婚武将の妻は無所属へ移し、通常の出奔では外交婚姻も再評価する。
        // 人質は現行仕様が別途未確定なので、外交婚姻フラグの張替えだけは行わない。
        this.syncSpousesForClanChange(busho, oldClanId, 0, {
            refreshDiplomacy: busho.isHostage !== true
        });

        // 5. お城から出ます
        this.leaveCastle(busho);
        
        // ★追加：大名家が滅亡したわけではない場合（追放や出奔）、元主君を宿敵として記録します
        if (oldClanId !== 0 && !isClanDestroyed) {
            const daimyo = this.game.getClanDaimyo(oldClanId);
            if (daimyo && busho.id !== daimyo.id && !busho.nemesisIds.includes(daimyo.id)) {
                const nemesisCount = (reason === 'banish') ? 180 : 60;
                busho.nemesisList.push({ id: daimyo.id, count: nemesisCount });
                busho.nemesisIds.push(daimyo.id);
            }
        }

        // ★新しい処理：滅亡した場合はそのまま留まり、自ら出奔した場合は近いお城を探します
        if (busho.castleId) {
            const currentCastle = this.game.getCastle(busho.castleId);
            let targetCastle = null;

            // 滅亡ではなく、自ら出奔した場合のみ、お引越し先を探します
            if (oldClanId !== 0 && !isClanDestroyed && currentCastle) {
                // --- 波紋のように道を辿って、一番近いお城を探す魔法（幅優先探索） ---
                let queue = [{ castle: currentCastle, steps: 0 }];
                let visited = new Set([currentCastle.id]);
                let foundCandidates = [];
                let maxSearchSteps = 15; // 念のため、15歩以上遠くは探さないようにします

                while (queue.length > 0) {
                    let { castle, steps } = queue.shift();
                    
                    // すでに一番近い階層の候補が見つかっていて、さらに遠い階層を見ようとしているなら探索終了！
                    if (foundCandidates.length > 0 && steps > foundCandidates[0].steps) break;
                    if (steps > maxSearchSteps) break;

                    // 候補の条件：自分以外 ＆ 空城じゃない ＆ 前いた家じゃない
                    if (castle.id !== currentCastle.id && castle.ownerClan !== 0 && castle.ownerClan !== oldClanId) {
                        let lord = this.game.getBusho(castle.castellanId);
                        if (!lord) {
                            lord = this.game.getClanDaimyo(castle.ownerClan); // ★高速化：索引を使って一瞬で見つけます
                        }
                        let affDiff = 50;
                        if (lord) {
                            const diff = Math.abs(busho.affinity - lord.affinity);
                            affDiff = Math.min(diff, 100 - diff);
                        }
                        foundCandidates.push({ castle, steps, affDiff });
                    }

                    // 隣接するお城（お隣さん）を次の調査リスト（キュー）に入れます
                    if (castle.adjacentCastleIds) {
                        for (let adjId of castle.adjacentCastleIds) {
                            if (!visited.has(adjId)) {
                                visited.add(adjId);
                                let adjC = this.game.getCastle(adjId);
                                if (adjC) queue.push({ castle: adjC, steps: steps + 1 });
                            }
                        }
                    }
                }

                if (foundCandidates.length > 0) {
                    // 「道なりに一番近いお城たち」の中で、一番相性が良い城を選びます
                    foundCandidates.sort((a, b) => a.affDiff - b.affDiff);
                    const bestAffDiff = foundCandidates[0].affDiff;
                    const bestGroup = foundCandidates.filter(c => c.affDiff === bestAffDiff);
                    targetCastle = bestGroup[Math.floor(Math.random() * bestGroup.length)].castle;
                }
            }

            // 新しい行き先が見つかっていればそこへ、見つからなければ（滅亡時など）元のお城の周辺にとどまります
            const nextCastleId = targetCastle ? targetCastle.id : busho.castleId;
            this.enterCastle(busho, nextCastleId);
        }

        // ★軽量化：抜けた元大名家だけ派閥を再編します。
        if (this.game && this.game.factionSystem && oldClanId !== 0) {
            this.game.factionSystem.updateFactions(oldClanId);
        }

        // ★ここから追加：画面の絵をすぐに描き直す魔法！
        this.updateUI();
    }

    // ★追加：スキルマネージャーの情報をもとに諸勢力を結成
    _createSurvivalKunishu(busho, oldClanId, survivalInfo) {
        // 大名家を抜ける処理
        busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        this.resetFactionData(busho);
        
        this.setClanIdRaw(busho, 0);
        this.setActivityStatusRaw(busho, window.GameConstants.BushoStatus.ACTIVE);
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isCommander = false;
        
        const newKunishuId = this.game.kunishuSystem.allocateRegularDynamicKunishuId();
        
        let familyName = busho.familyName || busho.name.split('|')[0] || busho.name;
        let familyYomi = busho.familyYomi || busho.yomi.split('|')[0] || busho.yomi;
        
        // スキルマネージャーから渡された数値をそのままセットします
        const newKunishu = new Kunishu({
            id: newKunishuId,
            name: familyName + "家",
            yomi: familyYomi + "け",
            castleId: busho.castleId,
            leaderId: busho.id,
            maxSoldiers: survivalInfo.maxSoldiers,
            soldiers: survivalInfo.soldiers,
            training: survivalInfo.training,
            defaultTraining: survivalInfo.defaultTraining,
            morale: survivalInfo.morale,
            defaultMorale: survivalInfo.defaultMorale,
            horses: survivalInfo.horses,
            maxHorses: survivalInfo.maxHorses,
            guns: survivalInfo.guns,
            maxGuns: survivalInfo.maxGuns,
            defense: survivalInfo.defense,
            maxDefense: survivalInfo.maxDefense,
            ideology: survivalInfo.ideology
        });
        newKunishu._survivalClanId = oldClanId; // 残党である目印

        // ★追加：自分たちを滅ぼした勢力を探して、関係値を0（敵対）にします
        const myCastle = this.game.getCastle(busho.castleId);
        let enemyClanId = 0;
        if (myCastle && myCastle.lastAttackerClanId > 0 && !myCastle.lastAttackerIsKunishu) {
            // 最後に攻撃してきたのが大名家なら、それを敵とみなします
            enemyClanId = myCastle.lastAttackerClanId;
        } else if (myCastle && myCastle.ownerClan > 0 && myCastle.ownerClan !== oldClanId) {
            // 万が一記録が取れなかった時の保険として、今お城を奪っている大名家を敵とみなします
            enemyClanId = myCastle.ownerClan;
        }
        
        // 敵が見つかったら、関係値を0にして箱にしまいます
        if (enemyClanId > 0) {
            this.game.kunishuSystem.setRelation(newKunishu, enemyClanId, 0);
        }
        
        this.game.kunishuSystem.kunishus.push(newKunishu);
        busho.belongKunishuId = newKunishuId;
        
        // 妻の所属・旧家の姫名簿・外交婚姻を、通常の所属変更と同じ窓口で同期する。
        this.syncSpousesForClanChange(busho, oldClanId, 0, {
            refreshDiplomacy: busho.isHostage !== true
        });
        
        // 最後にいた拠点に入る
        this.leaveCastle(busho);
        this.enterCastle(busho, newKunishu.castleId);
        
        this.game.ui.log(`【${survivalInfo.skillName}】${busho.name}は滅亡を逃れ、${this.game.getCastle(newKunishu.castleId).name}周辺に潜伏し抗戦を続けるようです。`);

        // すでに浪人化された旧家臣を回収する
        this.game.bushos.forEach(b => {
            if (window.BushoStatusRules.isRonin(b) && b._lastClanId === oldClanId && b.id !== busho.id) {
                this._joinSurvivalKunishu(b, newKunishu);
            }
        });

        if (this.game && this.game.factionSystem && oldClanId !== 0) this.game.factionSystem.updateFactions(oldClanId);
        
        // 画面の絵をすぐに描き直す魔法！
        this.updateUI();
    }

    // ★追加：旧家臣が生存スキルの諸勢力に合流する処理
    _joinSurvivalKunishu(busho, kunishu) {
        const oldClanId = Number(busho.clan) || 0;
        this.resetFactionData(busho);
        this.setClanIdRaw(busho, 0);
        
        // ★修正：死亡や未登場の武将は状態を強制的に変えないようにします
        if (window.LifeStatusRules.isPresent(busho)) {
            this.setActivityStatusRaw(busho, window.GameConstants.BushoStatus.ACTIVE);
        }
        
        busho.isCastellan = false;
        busho.isDaimyo = false;
        busho.isCommander = false;
        busho.belongKunishuId = kunishu.id;
        
        // すでに浪人化済みなら oldClanId=0 なので何もせず、旧家から直接合流する時だけ同期する。
        this.syncSpousesForClanChange(busho, oldClanId, 0, {
            refreshDiplomacy: busho.isHostage !== true
        });

        this.leaveCastle(busho);
        this.enterCastle(busho, kunishu.castleId);
    }

    /**
     * ③ 同じ大名家の中で、別のお城に「移動」する時の魔法
     * @param {object} busho - 移動する武将
     * @param {number} newCastleId - 移動先のお城のID
     */
    moveCastle(busho, newCastleId, options = {}) {
        // 1. 今のお城から出ます。戦後の一括移動などでは城主再選を最後まで保留できます。
        this.leaveCastle(busho, options);
        
        // 2. 新しいお城に入る前にバッジを外します
        busho.isCastellan = false; 
        
        // ★修正：国主が自分の担当する軍団「以外」の城に移動する場合のみ、国主バッジを外して軍団を解散させます
        if (busho.isCommander) {
            const newCastle = this.game.getCastle(newCastleId);
            let keepCommander = false;
            let myLegion = null;

            // 自分の担当している軍団を探します
            if (this.game && this.game.legions) {
                myLegion = this.game.legions.find(l => Number(l.commanderId) === Number(busho.id));
                // 軍団番号は家ごとに重複するため、移動先が「同じ家の同じ軍団」の城かまで確認します。
                if (newCastle && myLegion
                    && Number(myLegion.clanId) === Number(busho.clan)
                    && Number(newCastle.ownerClan) === Number(busho.clan)
                    && Number(newCastle.legionId) === Number(myLegion.legionNo)) {
                    keepCommander = true;
                }
            }

            // 国主を維持しない（別の軍団や直轄地への移動）場合は、バッジを外して解散します
            if (!keepCommander) {
                if (myLegion && this.game && this.game.castleManager) {
                    this.game.castleManager.disbandLegion(myLegion.id);
                } else {
                    // Legion側に正本がない異常状態だけ、実行時キャッシュを直接掃除します。
                    busho.isCommander = false;
                }
            }
        }
        
        // 3. 新しいお城に入ります
        this.enterCastle(busho, newCastleId, options);

        // ★ここから追加：画面の絵をすぐに描き直す魔法！
        if (options.deferUI !== true) this.updateUI();
    }

    // 城の所有者変更は CastleManager.changeOwner() に一元化しました。

    /**
     * （共通の道具）お城から出る時の処理
     */
    leaveCastle(busho, options = {}) {
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
                if (options.deferCastleLordUpdate !== true) this.updateCastleLord(oldCastle);
            }
        }
    }

    /**
     * （共通の道具）お城に入る時の処理
     */
    enterCastle(busho, newCastleId, options = {}) {
        this.setCastleIdRaw(busho, newCastleId);
        const newCastle = this.game.getCastle(newCastleId);
        if (newCastle) {
            // ★修正：死亡や未登場の武将はお城のリストには入れないようにします
            if (window.LifeStatusRules.isPresent(busho)) {
                // お城のリストに自分がいなければ、名前を書きます
                if (!newCastle.samuraiIds.some(id => Number(id) === Number(busho.id))) {
                    newCastle.samuraiIds.push(Number(busho.id));
                }
            }
            if (options.deferCastleLordUpdate !== true) this.updateCastleLord(newCastle);
        }
    }

    /**
     * 通常の別家移籍に伴う妻（姫）の所属と外交婚姻を同期する。
     * 独立・謀反は DiplomacyManager.reorganizeRelationsAfterRebellion() が正本なので、
     * その経路からはこの処理を呼ばない。
     */
    syncSpousesForClanChange(busho, oldClanId, newClanId, { refreshDiplomacy = true } = {}) {
        if (!busho || !this.game || !Array.isArray(busho.wifeIds) || busho.wifeIds.length === 0) return;
        const oldId = Number(oldClanId) || 0;
        const newId = Number(newClanId) || 0;
        if (oldId === newId) return;

        const oldClan = oldId > 0 ? this.game.getClan(oldId) : null;
        const newClan = newId > 0 ? this.game.getClan(newId) : null;
        if (oldClan && Array.isArray(oldClan.princessIds)) {
            oldClan.princessIds = oldClan.princessIds.filter(id => !busho.wifeIds.some(wId => Number(wId) === Number(id)));
        }
        if (newClan) {
            if (!Array.isArray(newClan.princessIds)) newClan.princessIds = [];
            busho.wifeIds.forEach(wId => {
                if (!newClan.princessIds.some(id => Number(id) === Number(wId))) newClan.princessIds.push(Number(wId));
            });
        }

        // 全妻の所属を先に更新してから外交婚姻を再評価する。
        // 同じ実家の妻が複数いる場合も、途中状態で旧婚姻を残さないため順序を分ける。
        const touchedPairs = new Map();
        busho.wifeIds.forEach(wId => {
            const wife = Array.isArray(this.game.princesses)
                ? this.game.princesses.find(p => Number(p.id) === Number(wId))
                : null;
            if (!wife) return;
            const originId = Number(wife.originalClanId) || 0;
            wife.currentClanId = newId;
            if (!refreshDiplomacy || !this.game.diplomacyManager || originId <= 0) return;
            [[originId, oldId], [originId, newId]].forEach(([a, b]) => {
                if (a <= 0 || b <= 0 || a === b) return;
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                if (!touchedPairs.has(key)) touchedPairs.set(key, [a, b]);
            });
        });
        if (refreshDiplomacy && this.game.diplomacyManager) {
            touchedPairs.forEach(([a, b]) => this.game.diplomacyManager.refreshMarriageRelation(a, b));
        }
    }

    /**
     * 平和的な勢力吸収で、武将移籍後も旧家に残る未婚姫を吸収先へ移す。
     */
    transferUnmarriedPrincesses(oldClanId, newClanId) {
        if (!this.game || !Array.isArray(this.game.princesses)) return;
        const oldId = Number(oldClanId) || 0;
        const newId = Number(newClanId) || 0;
        if (oldId <= 0 || newId <= 0 || oldId === newId) return;
        const oldClan = this.game.getClan(oldId);
        const newClan = this.game.getClan(newId);
        if (!newClan) return;
        if (!Array.isArray(newClan.princessIds)) newClan.princessIds = [];

        this.game.princesses.forEach(princess => {
            if (!princess || Number(princess.currentClanId) !== oldId) return;
            if (princess.status !== 'unmarried' || Number(princess.husbandId || 0) > 0) return;
            princess.currentClanId = newId;
            if (oldClan && Array.isArray(oldClan.princessIds)) {
                oldClan.princessIds = oldClan.princessIds.filter(id => Number(id) !== Number(princess.id));
            }
            if (!newClan.princessIds.some(id => Number(id) === Number(princess.id))) {
                newClan.princessIds.push(Number(princess.id));
            }
        });
    }

    /**
     * 周辺処理を呼び出し側が管理する別家移籍用の共通窓口。
     * 旧派閥・承認欲求は必ず破棄し、必要な通常移籍だけ妻/婚姻も同期する。
     */
    transferClanRaw(busho, newClanId, { syncSpouses = false } = {}) {
        if (!busho) return 0;
        const oldClanId = Number(busho.clan) || 0;
        const nextClanId = Number(newClanId) || 0;
        if (oldClanId === nextClanId) return oldClanId;
        this.resetFactionData(busho);
        this.setClanIdRaw(busho, nextClanId);
        if (syncSpouses) this.syncSpousesForClanChange(busho, oldClanId, nextClanId, { refreshDiplomacy: true });
        return oldClanId;
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
        busho.factionName = "";
        busho.factionYomi = "";
        busho.belongKunishuId = 0;

        // ★修正：もし軍団の国主だった場合、城の管理システムにお願いして軍団ごと解散させます！
        if (this.game && this.game.legions && this.game.castleManager) {
            const myLegion = this.game.legions.find(l => Number(l.commanderId) === Number(busho.id));
            if (myLegion) {
                this.game.castleManager.disbandLegion(myLegion.id);
            }
        }
    }

    /**
     * （共通の道具）新しい殿様との相性で忠誠度を決める処理
     */
    updateLoyaltyForNewLord(busho, clanId) {
        // 新しい殿様（大名）を探します
        const daimyo = this.game.getClanDaimyo(clanId) || { affinity: 50 };
        
        // 殿様との相性の「ズレ（差）」を計算します（0〜50の数字になります）
        const affDiff = PersonnelRules.calcAffinityDiff(daimyo.affinity, busho.affinity);
        
        // ズレが0（ピッタリ）なら50アップ、ズレが50（真逆）なら0アップにします
        const loyaltyUp = 50 - affDiff;
        
        // 基本の50にアップ分を足して、最高100までにします
        busho.loyalty = Math.min(100, 50 + loyaltyUp);
    }

    /**
     * （共通の道具）画面の絵をすぐに描き直す魔法！
     */
    updateUI(forceDuringAI = false) {
        if (!this.game || !this.game.ui) return;

        // ★最重要安定化：
        // AI思考中の武将移動・登用・下野のたびに renderMap() を呼ぶと、
        // 城DOM再生成＋雪レイヤー＋領土色ImageData更新が短時間に何度も重なります。
        // AI中は内部データだけ更新し、次に通常画面を描くタイミングまで延期します。
        if (this.game.isProcessingAI && !forceDuringAI) {
            this.game._aiDeferredMapRefresh = true;
            return;
        }

        try {
            this.game.ui.renderMap();
            this.game._aiDeferredMapRefresh = false;
            // パネルが開いている（お城が選択されている）時だけ更新するように安全対策をします
            if (this.game.ui.currentCastle && typeof this.game.ui.updatePanelHeader === 'function') {
                this.game.ui.updatePanelHeader();
            }
        } catch (e) {
            console.warn("UI更新をスキップしました", e);
        }
    }
    
    /**
     * ========================================================
     * ★ここからは「人事部」の魔法です！★
     * ========================================================
     */

    /**
     * ① AI大名の軍師任命
     */
    appointAIGunshi(castle, castellan) {
        if (castellan.isDaimyo && Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
            const currentGunshi = this.game.getClanGunshi(castle.ownerClan);
            if (!currentGunshi) {
                const daimyoFactionId = castellan.factionId;
                // ★軽量化：全国4000人を走査せず、当家の持ち城名簿だけから集めます。
                const myClanBushos = [];
                this.game.getClanCastles(castle.ownerClan).forEach(c => {
                    this.game.getCastleBushos(c.id).forEach(b => {
                        if (b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b)) myClanBushos.push(b);
                    });
                });

                let candidates = myClanBushos.filter(b => 
                    !b.isDaimyo && 
                    !b.isCommander &&
                    !b.isCastellan && 
                    b.factionId === daimyoFactionId
                );

                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        if (b.intelligence !== a.intelligence) return b.intelligence - a.intelligence; 
                        const aDiff = PersonnelRules.calcAffinityDiff(a.affinity, castellan.affinity);
                        const bDiff = PersonnelRules.calcAffinityDiff(b.affinity, castellan.affinity);
                        if (aDiff !== bDiff) return aDiff - bDiff; 
                        const aAchieve = a.achievementTotal || 0;
                        const bAchieve = b.achievementTotal || 0;
                        if (bAchieve !== aAchieve) return bAchieve - aAchieve; 
                        return Math.random() - 0.5;
                    });
                    const newGunshi = candidates[0];
                    this.appointClanGunshi(castle.ownerClan, newGunshi);
                }
            }
        }
    }

    /**
     * 城側の正本が別の城主へ切り替わる時、以前の城主バッジだけを確実に掃除する。
     * 城内全員へ影響を広げず、castle.castellanId が指していた人物だけを対象にする。
     */
    _clearPreviousCastellanFlag(castle, nextCastellanId = 0) {
        const previousId = Number(castle && castle.castellanId) || 0;
        const nextId = Number(nextCastellanId) || 0;
        if (previousId <= 0 || previousId === nextId || !this.game || typeof this.game.getBusho !== 'function') return;
        const previous = this.game.getBusho(previousId);
        if (previous) previous.isCastellan = false;
    }

    /**
     * ② 城主の自動決定と更新
     */
    updateCastleLord(castle) {
        if (!castle || castle.ownerClan === 0) {
            if (castle) {
                this._clearPreviousCastellanFlag(castle, 0);
                castle.castellanId = 0;
            }
            return;
        }

        const bushos = this.game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b));
        if (bushos.length === 0) {
            this._clearPreviousCastellanFlag(castle, 0);
            castle.castellanId = 0;
            return;
        }
        
        const daimyo = bushos.find(b => b.isDaimyo);
        if (daimyo) {
            this._clearPreviousCastellanFlag(castle, daimyo.id);
            bushos.forEach(b => { 
                b.isCastellan = false; 
            });
            daimyo.isCastellan = true; 
            castle.castellanId = daimyo.id;
            castle.isDelegated = false;
            if (daimyo.isGunshi) this.clearGunshiRole(daimyo);
            return;
        }
        
        const commander = bushos.find(b => b.isCommander);
        if (commander) {
            this._clearPreviousCastellanFlag(castle, commander.id);
            bushos.forEach(b => { 
                b.isCastellan = false; 
            });
            commander.isCastellan = true; 
            castle.castellanId = commander.id;
            if (commander.isGunshi) this.clearGunshiRole(commander);
            return;
        }

        // 城内にいる城主バッジを持っている武将のリストを作成します
        const lords = bushos.filter(b => b.isCastellan);
        
        if (lords.length >= 2) {
            // 城主が２人以上いる場合は、その複数の中から新しい城主を決めます
            this.electCastellan(castle, lords);
        } else if (lords.length === 1) {
            // 城主が１人だけなら、元々の城主をそのまま維持します
            this._clearPreviousCastellanFlag(castle, lords[0].id);
            castle.castellanId = lords[0].id;
            if (lords[0].isGunshi) this.clearGunshiRole(lords[0]);
        } else {
            // 城主が誰もいない場合は、城内の全武将から新しい城主を決めます
            this.electCastellan(castle, bushos);
        }
    }

    electCastellan(castle, bushos) {
        const previousCastellanId = Number(castle && castle.castellanId) || 0;
        // 国主が存在する城では、城主の再任命ロジックを走らせないようにガードします
        if (bushos && bushos.some(b => b.isCommander)) return;

        if (castle.ownerClan === this.game.playerClanId) {
            const currentLord = bushos.find(b => b.id === castle.castellanId);
            if (currentLord) {
                bushos.forEach(b => b.isCastellan = false);
                currentLord.isCastellan = true;
                return; 
            }
        }

        // 忠誠度による候補の絞り込み（元々城主の場合は除外して常に候補に含める）
        let candidates = [];
        const loyal90 = bushos.filter(b => b.loyalty >= 90 || b.isCastellan);
        if (loyal90.length > 0) {
            candidates = loyal90;
        } else {
            const loyal80 = bushos.filter(b => b.loyalty >= 80 || b.isCastellan);
            if (loyal80.length > 0) {
                candidates = loyal80;
            } else {
                const loyal70 = bushos.filter(b => b.loyalty >= 70 || b.isCastellan);
                if (loyal70.length > 0) {
                    candidates = loyal70;
                } else {
                    candidates = bushos;
                }
            }
        }
        
        const daimyo = this.game.getClanDaimyo(castle.ownerClan); // ★高速化：索引を使って一瞬で見つけます
        const innovation = daimyo ? daimyo.innovation : 50;
        const abilityFactor = innovation / 100;
        const meritFactor = (100 - innovation) / 100;

        const scoredCandidates = candidates.map(b => {
            const leadScore = Math.min(b.leadership, 80) * 0.8 + Math.max(b.leadership - 80, 0) * 0.8 * 0.3;
            const strScore = Math.min(b.strength, 50) * 0.5 + Math.max(b.strength - 50, 0) * 0.5 * 0.3;
            const polScore = Math.min(b.politics, 80) * 0.8 + Math.max(b.politics - 80, 0) * 0.8 * 0.3;
            const dipScore = Math.min(b.diplomacy, 60) * 0.6 + Math.max(b.diplomacy - 60, 0) * 0.6 * 0.3;
            const intScore = Math.min(b.intelligence, 60) * 0.6 + Math.max(b.intelligence - 60, 0) * 0.6 * 0.3;
            const charmScore = Math.min(b.charm, 70) * 0.8 + Math.max(b.charm - 70, 0) * 0.8 * 0.3;
            const abilityScore = leadScore + strScore + polScore + dipScore + intScore + charmScore;
            const meritScore = Math.sqrt((b.achievementTotal || 0) * 64);
            let score = (abilityScore * abilityFactor) + (meritScore * meritFactor);

            if (b.isCastellan) score += Math.floor(Math.random() * 41) + 80;
            if (b.isFactionLeader) score += 10000;
            if (b.isRetired) score -= 50000;
            if (b.isGunshi) score -= 100000;
            return { busho: b, score };
        });

        scoredCandidates.sort((a, b) => b.score - a.score);
        const best = scoredCandidates[0].busho;

        this._clearPreviousCastellanFlag(castle, best.id);
        bushos.forEach(b => b.isCastellan = false);
        best.isCastellan = true;
        
        if (best.isGunshi) {
            this.clearGunshiRole(best);
        }
        
        castle.castellanId = best.id;
        if (Number(best.id) !== previousCastellanId && this.game.phase === 'game' && !this.game.isRestoringSave && this.game.historySystem) {
            const clan = this.game.getClan ? this.game.getClan(castle.ownerClan) : null;
            const clanName = clan ? clan.name : '大名家';
            this.game.historySystem.record(`【城主任命】${clanName}は${best.fullName || best.name}を${castle.name}城主に任命しました。`, {
                clanIds: [castle.ownerClan], category: 'appointment', inferCurrentTurn: false
            });
        }
    }

    updateAllCastlesLords() {
        this.game.castles.forEach(c => this.updateCastleLord(c));
    }
    
    /**
     * 月初の浪人移動処理
     */
     processRoninMovements() {
        // 全武将から「浪人」かつ「諸勢力に所属していない（IDが0または未定義）」武将を抽出
        const ronins = this.game.bushos.filter(b => window.BushoStatusRules.isRonin(b) && !b.belongKunishuId);
        
        ronins.forEach(r => {
            const currentC = this.game.getCastle(r.castleId); 
            if(!currentC) return; 
            
            // 隣接する城のリストを作る
            const neighbors = this.game.castles.filter(c => MapGraphService.isAdjacent(currentC, c)); 
            
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