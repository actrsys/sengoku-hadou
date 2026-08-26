/**
 * kunishu_system.js
 * 諸勢力（独立地域勢力）システムを管理するクラス
 */

class KunishuSystem {
    constructor(game) {
        this.game = game;
        this.kunishus = [];
    }

    // ゲーム開始時・ロード時にデータをセットする
    setKunishuData(kunishus) {
        this.kunishus = kunishus;
    }

    // ★追加：頭領を自動生成する「共通の魔法（システム）」です！いつでも使い回せます。
    createAutoLeader(kunishu, inheritedAffinity = 50, inheritedInnovation = 0) {
        let maxId = 0;
        this.game.bushos.forEach(b => {
            if (b.id > maxId) maxId = b.id;
        });
        const newId = maxId + 1;
        const currentYear = this.game.year;

        const newLeader = new Busho({
            id: newId,
            name: `|頭領`,
            leadership: 30,
            strength: 30,
            politics: 30,
            diplomacy: 30,
            intelligence: 30,
            charm: 30,
            innovation: inheritedInnovation,
            ambition: 50,
            duty: 50,
            affinity: inheritedAffinity,
            clan: 0,
            belongKunishuId: kunishu.id,
            castleId: kunishu.castleId,
            birthYear: currentYear - 30,
            endYear: 9999,
            startYear: currentYear - 30,
            status: 'active',
            isAutoLeader: true
        });

        this.game.bushos.push(newLeader);
        kunishu.leaderId = newId;

        const castle = this.game.getCastle(kunishu.castleId);
        if (castle) {
            castle.samuraiIds.push(newId);
        }
        
        return newLeader;
    }

    // ★ここから追加：頭領がいない諸勢力に、自動で頭領を配置する魔法です！（共通の魔法を使ってスッキリさせました）
    generateMissingLeaders() {
        this.kunishus.forEach(kunishu => {
            const members = this.getKunishuMembers(kunishu.id);
            const leaderAlive = members.some(b => b.id === kunishu.leaderId);

            if (!leaderAlive) {
                // 初期設定なので、相性50、革新0を引き継いで頭領を作ります
                this.createAutoLeader(kunishu, 50, 0);
            }
        });
    }
    
    getKunishu(id) {
        return this.kunishus.find(k => k.id === id);
    }

    getAliveKunishus() {
        return this.kunishus.filter(k => !k.isDestroyed);
    }

    // 一向宗ネットワークは ideology（宗教）とは別軸で管理します。
    // 他部署は ID や名称を直接見ず、この専門部署の窓口を使います。
    isIkkoNetwork(kunishu) {
        return !!kunishu && kunishu.networkTag === 'ikko';
    }

    // 現在の本願寺家を取得します。
    // 本願寺系IDの武将が大名を務める存続勢力が複数ある場合は、威信最大を宗門の中心とします。
    getHonganjiClan() {
        const params = window.MainParams.Kunishu.IkkoNetwork;
        const candidates = this.game.clans.filter(clan => {
            if (!clan || clan.id === 0 || clan.isDestroyed) return false;
            const daimyo = this.game.getClanDaimyo(clan.id);
            if (!daimyo) return false;
            const daimyoId = Number(daimyo.id);
            return daimyoId >= params.HonganjiDaimyoIdMin && daimyoId <= params.HonganjiDaimyoIdMax;
        });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => {
            const prestigeDiff = Number(b.daimyoPrestige || 0) - Number(a.daimyoPrestige || 0);
            if (prestigeDiff !== 0) return prestigeDiff;
            return Number(a.id) - Number(b.id);
        });
        return candidates[0];
    }

    isHonganjiClan(clanId) {
        const honganji = this.getHonganjiClan();
        return !!honganji && Number(honganji.id) === Number(clanId);
    }

    // ゲーム中の諸勢力関係値を書き換える正規窓口です。
    // Model の setRelation は低レベル保存構造として残し、各Systemはここを経由します。
    setRelation(kunishu, clanId, value) {
        if (!kunishu) return;
        const targetClanId = Number(clanId);
        if (this.isIkkoNetwork(kunishu) && this.isHonganjiClan(targetClanId)) {
            kunishu.setRelation(targetClanId, 100);
            return;
        }
        kunishu.setRelation(targetClanId, value);
    }

    // 一向宗側の加害・摩擦が宗門中央へ波及する唯一の窓口です。
    // 一向宗同士（本願寺家自身）には適用しません。
    applyHonganjiRelationPenalty(clanId, amount) {
        const targetClanId = Number(clanId);
        const drop = Math.max(0, Number(amount) || 0);
        if (targetClanId === 0 || drop === 0) return false;

        const honganji = this.getHonganjiClan();
        if (!honganji || Number(honganji.id) === targetClanId || !this.game.diplomacyManager) return false;

        this.game.diplomacyManager.updateSentiment(targetClanId, honganji.id, -drop);
        return true;
    }

    // 本願寺との関係値は「一向宗諸勢力との友好度の上限」としてのみ働きます。
    // 本願寺より一向宗側が友好的な場合だけ下げ、逆方向の自動回復は行いません。
    applyIkkoNetworkRelationLink() {
        const honganji = this.getHonganjiClan();
        if (!honganji || !this.game.diplomacyManager) return;

        const step = window.MainParams.Kunishu.IkkoNetwork.MonthlyRelationLinkStep;
        const ikkoForces = this.getAliveKunishus().filter(k => this.isIkkoNetwork(k));
        const aliveClans = this.game.clans.filter(c => c && c.id !== 0 && !c.isDestroyed);

        for (const kunishu of ikkoForces) {
            // 宗門中央との関係は常時100。
            this.setRelation(kunishu, honganji.id, 100);

            for (const clan of aliveClans) {
                if (Number(clan.id) === Number(honganji.id)) continue;
                const honganjiRel = this.game.diplomacyManager.getRelation(clan.id, honganji.id);
                if (!honganjiRel) continue;

                const currentRel = kunishu.getRelation(clan.id);
                const ceiling = Number(honganjiRel.sentiment);
                if (currentRel <= ceiling) continue;

                this.setRelation(kunishu, clan.id, Math.max(ceiling, currentRel - step));
            }
        }
    }

    // 城の占領による諸勢力の反発。城の部署は所有権変更だけを担当し、関係処理はここへ集約します。
    applyRelationDropOnCastleCapture(castle, newOwnerClan) {
        const clanId = Number(newOwnerClan);
        if (!castle || clanId === 0) return;

        const params = window.MainParams.Kunishu.IkkoNetwork;
        const honganji = this.getHonganjiClan();
        const isHonganjiOwner = !!honganji && Number(honganji.id) === clanId;
        let ikkoRelationActuallyDropped = false;

        for (const kunishu of this.getKunishusInCastle(castle.id)) {
            if (this.isIkkoNetwork(kunishu) && isHonganjiOwner) {
                this.setRelation(kunishu, clanId, 100);
                continue;
            }

            const currentRel = kunishu.getRelation(clanId);
            if (currentRel > 69) continue;

            const newRel = Math.max(0, currentRel - window.MainParams.Kunishu.CaptureRelationDrop);
            this.setRelation(kunishu, clanId, newRel);
            if (this.isIkkoNetwork(kunishu) && newRel < currentRel) ikkoRelationActuallyDropped = true;

            if (clanId === this.game.playerClanId) {
                this.game.ui.log(`(拠点の支配勢力が変わったため、${kunishu.getName(this.game)}との友好度が低下しました)`, { history: false });
            }
        }

        // 同じ城に願証寺＋一向一揆が複数いても、本願寺への波及は「城の占領」1件につき1回だけ。
        if (ikkoRelationActuallyDropped) {
            this.applyHonganjiRelationPenalty(clanId, params.CaptureHonganjiRelationDrop);
        }
    }

    // 一向一揆討伐開始時の敵対化も専門部署内で一元化します。
    applySubjugationHostility(kunishu, clanId) {
        const targetClanId = Number(clanId);
        if (!kunishu || targetClanId === 0) return;

        if (this.isIkkoNetwork(kunishu) && this.isHonganjiClan(targetClanId)) {
            this.setRelation(kunishu, targetClanId, 100);
            return;
        }

        const currentRel = kunishu.getRelation(targetClanId);
        let nextRel = currentRel;
        if (currentRel >= 60) nextRel = 30;
        else if (currentRel >= 31) nextRel -= 30;
        else nextRel = 0;
        this.setRelation(kunishu, targetClanId, nextRel);

        if (this.isIkkoNetwork(kunishu) && nextRel < currentRel) {
            const params = window.MainParams.Kunishu.IkkoNetwork;
            this.applyHonganjiRelationPenalty(targetClanId, params.SubjugationHonganjiRelationDrop);
        }
    }

    // 一向宗の将来生成用に予約したID帯から、現在空いている最小IDを返します。
    // 空きがない場合は0を返し、呼び出し側は生成を行いません。
    findAvailableIkkoGenerationId() {
        const params = window.MainParams.Kunishu.IkkoNetwork;
        const usedIds = new Set(this.kunishus.map(k => Number(k.id)));
        for (let id = params.ReservedIdMin; id <= params.ReservedIdMax; id++) {
            if (!usedIds.has(id)) return id;
        }
        return 0;
    }

    // 通常の動的諸勢力は一向宗予約帯を使わず、20000以降で採番します。
    allocateRegularDynamicKunishuId() {
        const minId = window.MainParams.Kunishu.IkkoNetwork.RegularDynamicIdMin;
        let maxId = minId - 1;
        for (const kunishu of this.kunishus) {
            const id = Number(kunishu.id);
            if (id >= minId && id > maxId) maxId = id;
        }
        return maxId + 1;
    }

    // 指定した城にいる諸勢力を取得
    getKunishusInCastle(castleId) {
        return this.getAliveKunishus().filter(k => Number(k.castleId) === Number(castleId));
    }

    // 特定の諸勢力に所属している武将一覧を取得
    getKunishuMembers(kunishuId) {
        return this.game.bushos.filter(b => b.belongKunishuId === kunishuId && window.LifeStatusRules.isPresent(b));
    }

    // イデオロギーによる相性計算の補正
    calcIdeologyAffinity(kunishu, targetBusho) {
        if (!targetBusho) return 25;
        let baseAffinity = PersonnelRules.calcAffinityDiff(this.game.getBusho(kunishu.leaderId).affinity, targetBusho.affinity);
        
        if (kunishu.ideology === '宗教') {
            // 宗教：相手の革新が30以上で反発開始。50差（革新80）の時に最大の+25になります
            if (targetBusho.innovation >= 30) {
                let diff = targetBusho.innovation - 30;
                let mod = (diff / 50) * 25;
                baseAffinity += Math.min(25, mod); // 最大で+25まで
            }
        } else if (kunishu.ideology === '地縁') {
            // 地縁：頭領と相手の革新の差を見ます
            const leader = this.game.getBusho(kunishu.leaderId);
            const L = leader ? leader.innovation : 50; // 頭領の革新
            const T = targetBusho.innovation;          // 相手の革新
            
            if (L === 50 && T === 50) {
                // お互い50ちょうどの時は -10
                baseAffinity -= 10;
            } else if ((L >= 50 && T >= 50) || (L <= 50 && T <= 50)) {
                // お互い50を基準に同じ側（同サイド）にいる場合
                let diff = Math.abs(L - T);
                let mod = (diff * 0.5) - 25; // 0差で-25、50差で0になります
                baseAffinity += mod;
            } else {
                // 50を基準に上下反対側にいる場合
                let diff = Math.abs(L - T);
                let mod = ((diff - 2) / 98) * 25; // 2差で0、100差で+25になります
                baseAffinity += mod;
            }
        }
        // 傭兵は革新による補正を行わず、基本の相性をそのまま使います
        
        return Math.max(0, Math.min(50, baseAffinity)); // 結果を0〜50の間に閉じ込めます
    }

    // 月末処理
    async processEndMonth() { // ★追加：async を付けます
        const activeKunishus = this.getAliveKunishus();
        
        for (const kunishu of activeKunishus) {
            // 1. 兵力と防御力の自動回復 (最大値の２．５％)
            if (kunishu.soldiers < kunishu.maxSoldiers) {
                kunishu.soldiers = Math.min(kunishu.maxSoldiers, kunishu.soldiers + Math.floor(kunishu.maxSoldiers * 0.025));
            }
            if (kunishu.defense < kunishu.maxDefense) {
                kunishu.defense = Math.min(kunishu.maxDefense, kunishu.defense + Math.floor(kunishu.maxDefense * 0.025));
            }
            // 馬と鉄砲の自動回復（兵士と同じく最大値の２．５％）
            if (kunishu.horses < kunishu.maxHorses) {
                kunishu.horses = Math.min(kunishu.maxHorses, kunishu.horses + Math.floor(kunishu.maxHorses * 0.025));
            }
            if (kunishu.guns < kunishu.maxGuns) {
                kunishu.guns = Math.min(kunishu.maxGuns, kunishu.guns + Math.floor(kunishu.maxGuns * 0.025));
            }

            // 訓練度と士気の自然変動（毎月1ずつデフォルト値に近づく）
            if (kunishu.training < kunishu.defaultTraining) {
                kunishu.training += 1;
            } else if (kunishu.training > kunishu.defaultTraining) {
                kunishu.training -= 1;
            }

            if (kunishu.morale < kunishu.defaultMorale) {
                kunishu.morale += 1;
            } else if (kunishu.morale > kunishu.defaultMorale) {
                kunishu.morale -= 1;
            }
            
            // 安全のため、0未満や100を超えないようにガードします
            kunishu.training = Math.max(0, Math.min(100, kunishu.training));
            kunishu.morale = Math.max(0, Math.min(100, kunishu.morale));

            // 組織の壊滅チェック（★変更：awaitを付けてダイアログを待ちます）
            await this.checkDestroyed(kunishu);

            // ★変更：スキルマネージャーに旗揚げ（大名復帰）できるスキルを持っていないか聞きに行きます
            if (!kunishu.isDestroyed && typeof SkillManager !== 'undefined') {
                const leader = this.game.getBusho(kunishu.leaderId);
                const myCastle = this.game.getCastle(kunishu.castleId);
                const riseInfo = SkillManager.canKunishuRise(leader, myCastle, this.game);
                
                if (riseInfo && riseInfo.canRise) {
                    await this.executeIndependentRise(kunishu, leader, myCastle, riseInfo.skillName);
                    continue; // 旗揚げしたので、これ以降の諸勢力アクションはスキップ
                }
            }
        }

        // 壊滅していないものを再度取得
        const survivingKunishus = this.getAliveKunishus();

        // 本願寺との関係は一向宗諸勢力の友好度の上限としてのみ連動します。
        // 先に反映することで、この月に0へ到達した一向一揆も通常の蜂起判定へ進めます。
        this.applyIkkoNetworkRelationLink();

        // 同じ城の一向宗勢力が複数いても、本願寺への月次反作用を重複させないための記録です。
        const ikkoBacklashCastleKeys = new Set();

        // 2. 城の所有者（大名）に対するアクション
        // ★変更：forEach をやめて、順番待ちができる for...of に変えます
        for (const kunishu of survivingKunishus) {
            const myCastle = this.game.getCastle(kunishu.castleId);
            
            // ★ここをごっそり変更：商人勢力の場合は、拠点支配にかかわらずアクションの判定をします！
            if (kunishu.ideology === '商人') {
                for (const targetClanId in kunishu.daimyoRelations) {
                    const clanIdNum = Number(targetClanId);
                    if (clanIdNum === 0) continue;

                    const rel = kunishu.daimyoRelations[clanIdNum];
                    // 友好度が70以上（献上してくれるライン）の場合のみ
                    if (rel && rel.sentiment >= 70) {
                        // その大名のいる「居城」を探して、そこにお届け物をします
                        const daimyo = this.game.getClanDaimyo(clanIdNum);
                        if (daimyo && daimyo.castleId) {
                            const targetCastle = this.game.getCastle(daimyo.castleId);
                            // お城が見つかって、毎月10%の確率に当たったらアクション！
                            if (targetCastle && Math.random() < 0.10) {
                                await this.executeActionToLord(kunishu, targetCastle);
                            }
                        }
                    }
                }
            } else {
                // 商人以外の通常の諸勢力は、今まで通り「自分がいるお城の支配者」にだけアクションします
                if (myCastle && myCastle.ownerClan !== 0) {
                    // 毎月末、最大10%の確率で発動
                    if (Math.random() < 0.10) {
                        await this.executeActionToLord(kunishu, myCastle);
                    }
                }
            }
            
            // もし自分のいる城が空き家（所有者なし）なら、自然変動は起きないので次の諸勢力へ
            if (!myCastle || myCastle.ownerClan === 0) continue;
            
            // 毎ターン、相性による友好度の自然変動
            const castellan = this.game.getBusho(myCastle.castellanId);
            // ★ここを変更：商人はビジネスライクなので、城主との相性で勝手に友好度が変動することはありません！
            if (castellan && kunishu.ideology !== '商人') {
                const affinityDiff = this.calcIdeologyAffinity(kunishu, castellan);
                
                // 25を基準にして、どれくらい離れているか（差分）を計算します
                let diff = 25 - affinityDiff;
                
                // どんなに差が大きくても、上も下も「最大25（最小-25）」でストップをかけます！
                diff = Math.max(-25, Math.min(25, diff));
                
                // 最大で ±3 になるように計算する魔法です
                let change = diff * (3 / 25);
                
                // 小数点以下1桁まで残すためのおまじないです（例：1.2）
                change = Math.round(change * 10) / 10;
                
                const currentRel = kunishu.getRelation(myCastle.ownerClan);
                
                // ★追加：友好度が70以上で、かつ減少しようとしている時は、減少をストップする魔法！
                if (currentRel >= 70 && change < 0) {
                    change = 0;
                }
                
                const nextRel = currentRel + change;
                this.setRelation(kunishu, myCastle.ownerClan, nextRel);

                if (change < 0 && this.isIkkoNetwork(kunishu) && !this.isHonganjiClan(myCastle.ownerClan)) {
                    ikkoBacklashCastleKeys.add(`${Number(myCastle.ownerClan)}:${Number(myCastle.id)}`);
                }
            }
        }

        // 現地で実際に関係悪化が起きた城だけ、本願寺にも小さく波及させます。
        // 同一城の複数一向宗勢力は1件として扱います。
        const backlashPenalty = window.MainParams.Kunishu.IkkoNetwork.LocalBacklashHonganjiRelationDrop;
        for (const key of ikkoBacklashCastleKeys) {
            const clanId = Number(key.split(':')[0]);
            this.applyHonganjiRelationPenalty(clanId, backlashPenalty);
        }
    }

    // 城主（大名）へのアクション
    async executeActionToLord(kunishu, castle) {
        const clanId = castle.ownerClan;
        const currentRel = kunishu.getRelation(clanId);
        const castellan = this.game.getBusho(castle.castellanId);
        if (!castellan) return;

        const leader = this.game.getBusho(kunishu.leaderId);
        const clanData = this.game.getClan(clanId);
        if (!leader || !clanData) return;

        // 諸勢力の名前と、大名家の名前を準備します！
        const kunishuName = kunishu.getName(this.game);
        const clanName = clanData.name;
        
        // この城が「プレイヤー（自分）の城」かどうかを調べる魔法です
        const isPlayerCastle = (clanId === this.game.playerClanId);

        // 頭領と城主の相性差を計算します
        const affinityDiff = this.calcIdeologyAffinity(kunishu, castellan);
        
        // プレイヤーに有利な倍率（贈り物用）の魔法
        // 相性差0で2倍、25で1倍、50で0.5倍になるように滑らかに変化させます
        let goodMult = 1.0;
        if (affinityDiff <= 25) {
            goodMult = 2.0 - (affinityDiff / 25);
        } else {
            goodMult = 1.0 - ((affinityDiff - 25) / 50);
        }
        
        // プレイヤーに不利な倍率（略奪・蜂起用）の魔法
        // 相性差0で0.5倍、25で1倍、50で2倍になるように滑らかに変化させます
        let badMult = 1.0;
        if (affinityDiff <= 25) {
            badMult = 0.5 + (affinityDiff / 25) * 0.5;
        } else {
            badMult = 1.0 + ((affinityDiff - 25) / 25);
        }

        // 友好 (70以上)
        if (currentRel >= 70) {
            // 贈り物の基本確率は20%（0.20）。友好度100で+15%（0.15）アップします
            let giftChance = (0.20 + ((currentRel - 70) / 30) * 0.15) * goodMult;
            
            if (Math.random() < giftChance) {
                // 献上 (無から湧く、最大現在兵力÷3、魅力で増加)
                let baseAmount = Math.floor(kunishu.soldiers / 3);
                let bonus = 1.0 + (castellan.charm / 100); // 魅力ボーナス
                let amount = Math.floor(baseAmount * bonus * Math.random());
                if (amount < 10) return;

                if (Math.random() > 0.5) {
                    let maxAdd = 99999 - castle.gold;
                    let actualAmount = Math.min(amount, maxAdd);
                    if (actualAmount > 0) {
                        castle.gold += actualAmount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}に金${actualAmount}を献上しました。`;
                        this.game.ui.log(msg.replace('\n', ''), { clanIds: [clanId], category: 'kunishu', inferCurrentTurn: false });
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                    }
                } else {
                    let maxAdd = 99999 - castle.rice;
                    let actualAmount = Math.min(amount, maxAdd);
                    if (actualAmount > 0) {
                        castle.rice += actualAmount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}に兵糧${actualAmount}を献上しました。`;
                        this.game.ui.log(msg.replace('\n', ''), { clanIds: [clanId], category: 'kunishu', inferCurrentTurn: false });
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                    }
                }
            }
        } 
        // 敵対 (30以下)
        else if (currentRel <= 30) {
            // ★追加：お城のある国が大雪の時は、諸勢力も身動きが取れないので略奪や反乱を起こしません！
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.statusEffects && province.statusEffects.includes('heavySnow')) {
                return; // 大雪なら何もせずにおしまいです
            }

            // ★商人は争いを好まないので、略奪や反乱（蜂起）を起こしません！
            if (kunishu.ideology === '商人') {
                return; // 商人なら何もせずにおしまいです
            }

            let actionDone = false;
            
            // まずは「略奪」の判定から行います！
            // 略奪の基本確率は20%（0.20）。友好度0で+15%（0.15）アップします
            let robChance = (0.20 + ((30 - currentRel) / 30) * 0.15) * badMult;
            
            if (Math.random() < robChance) {
                // 妨害（略奪）: 城から奪う、武力で軽減
                let baseAmount = Math.floor(kunishu.soldiers / 3);
                let reduction = 1.0 - (castellan.strength / 200); // 武力で最大50%軽減
                let amount = Math.floor(baseAmount * reduction * (0.5 + Math.random() * 0.5));
                
                // 奪う量が10以上なら略奪を実行します
                if (amount >= 10) {
                    if (Math.random() > 0.5 && castle.gold > amount) {
                        castle.gold -= amount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}で略奪を働き、金${amount}を奪いました！`;
                        this.game.ui.log(msg.replace('\n', ''), { clanIds: [clanId], category: 'kunishu', inferCurrentTurn: false });
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                        actionDone = true; // 略奪をしたので、目印をつけます
                    } else if (castle.rice > amount) {
                        castle.rice -= amount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}で略奪を働き、兵糧${amount}を奪いました！`;
                        this.game.ui.log(msg.replace('\n', ''), { clanIds: [clanId], category: 'kunishu', inferCurrentTurn: false });
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                        actionDone = true; // 略奪をしたので、目印をつけます
                    }
                }
            }
            
            // 略奪が起きなかった場合で、さらに友好度0の時だけ「蜂起」の判定を行います
            if (!actionDone && currentRel === 0) {
                let uprisingBase = 0;
                if (kunishu.ideology === '傭兵') uprisingBase = 0.30;
                else if (kunishu.ideology === '地縁') uprisingBase = 0.60;
                else if (kunishu.ideology === '宗教') uprisingBase = 1.00;
                
                let uprisingChance = uprisingBase * badMult;
                
                if (Math.random() < uprisingChance && kunishu.soldiers > 500) {
                    await this.executeUprising(kunishu, castle);
                }
            }
        }
    }

    // 蜂起処理 (諸勢力からの城攻め)
    // ★変更：async を付けます
    async executeUprising(kunishu, castle) {
        const atkSoldiers = Math.floor(kunishu.soldiers * 0.5);
        if (atkSoldiers <= 0) return;
        kunishu.soldiers -= atkSoldiers;

        // ★修正: 馬と鉄砲は全部持っていく
        const atkHorses = kunishu.horses || 0;
        kunishu.horses = 0;
        const atkGuns = kunishu.guns || 0;
        kunishu.guns = 0;

        // 兵糧は無から兵数の1.5倍湧く
        const atkRice = Math.floor(atkSoldiers * 1.5);

        // 連れてくる武将は最大5人
        const members = this.getKunishuMembers(kunishu.id).sort((a,b) => b.leadership - a.leadership);
        // リーダーを必ず含める
        let atkBushos = [];
        const leaderIdx = members.findIndex(b => b.id === kunishu.leaderId);
        if (leaderIdx !== -1) {
            atkBushos.push(members.splice(leaderIdx, 1)[0]);
        }
        atkBushos = atkBushos.concat(members.slice(0, 4));

        const kunishuName = kunishu.getName(this.game);
        this.game.ui.log(`【諸勢力蜂起】${castle.name}にて、${kunishuName}が反乱を起こしました！`, { history: false });

        // 諸勢力を専用の一時的な大名(Clan)として扱うためのダミーデータ
        const dummyAttacker = {
            id: kunishu.id, // ★追加：通常の城と同じように扱えるようにIDを持たせます
            name: kunishuName, 
            ownerClan: -1, // 特殊ID
            soldiers: atkSoldiers,
            horses: atkHorses, // ★追加
            guns: atkGuns,     // ★追加
            training: kunishu.training, // ★修正：諸勢力の訓練度を使う
            morale: kunishu.morale,     // ★修正：諸勢力の士気を使う
            rice: atkRice,
            maxRice: atkRice,
            isKunishu: true,
            kunishuId: kunishu.id
        };

        // ==========================================
        // ★ここから修正！：戦争が「完全に」終わるまで見届ける監視カメラの魔法！
        // ==========================================
        let isWarReallyFinished = false;
        const originalCloseWar = this.game.warManager.closeWar;
        
        // closeWar（合戦画面を閉じる最後の処理）が呼ばれたら、監視カメラに「終わったよ！」と報告させます
        this.game.warManager.closeWar = function() {
            if (originalCloseWar) originalCloseWar.call(this); // 元の終了処理をちゃんと実行します
            isWarReallyFinished = true;  // 報告！
        };

        // WarManagerの開始フローに合流（いざ、戦争スタート！）
        this.game.warManager.startWar(dummyAttacker, castle, atkBushos, atkSoldiers, atkRice, atkHorses, atkGuns); 
        
        // 戦争とメッセージ表示が完全に終わるまでじっと待ちます
        let failSafeCounter = 0; 
        
        while (!isWarReallyFinished) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 安全装置：裏でエラーが起きて closeWar が一生呼ばれない場合のためのタイマー
            if (this.game.warManager.state && !this.game.warManager.state.active) {
                let anyModalOpen = false;
                if (this.game.ui) {
                    const isVisible = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
                    if (isVisible('result-modal') || isVisible('dialog-modal') || isVisible('war-modal')) {
                        anyModalOpen = true;
                    }
                    // タップメッセージ等、名前がわからない画面が出ている場合も検知します
                    const overlay = document.querySelector('[class*="tap"], [id*="tap"]');
                    if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
                        anyModalOpen = true;
                    }
                }
                
                if (!anyModalOpen) {
                    failSafeCounter++;
                    // 何の画面も出ていないのに3秒（6回）止まっていたら、エラーとみなして強制的に次へ進めます
                    if (failSafeCounter > 6) {
                        break;
                    }
                } else {
                    failSafeCounter = 0; // 画面が出ている間は大人しく待ちます
                }
            }
        }
        
        // 監視カメラを片付けて、元の状態に綺麗に戻します！
        delete this.game.warManager.closeWar;
        // ==========================================
        // ★修正ここまで
    }

    // 壊滅と継承のチェック（★変更：async を付けます）
    async checkDestroyed(kunishu) {
        if (kunishu.isDestroyed) return;

        const members = this.getKunishuMembers(kunishu.id);
        const leaderAlive = members.some(b => b.id === kunishu.leaderId);

        let unbornFamily = [];
        const leader = this.game.getBusho(kunishu.leaderId);

        // 頭領がいない場合、まだ登場していない親戚の中で、すでに生まれている人を探します
        if (!leaderAlive && leader) {
            const currentYear = this.game.year;
            unbornFamily = this.game.bushos.filter(b => 
                window.LifeStatusRules.isUnborn(b) && 
                leader.familyIds.some(fId => b.familyIds.includes(fId)) && 
                b.birthYear <= currentYear
            );
        }

        // 今いるメンバーと、新しく見つけた親戚を合わせます
        const allCandidates = [...members, ...unbornFamily];

        // 兵力が0になったら壊滅します
        if (kunishu.soldiers <= 0) {
            kunishu.isDestroyed = true;
            kunishu.soldiers = 0;
            
            // 残った武将（今いるメンバーのみ）の行き先を決めます
            members.forEach(b => {
                b.belongKunishuId = 0; // 諸勢力から外れます

                // ★ここを書き換え！：名前ではなく「秘密のシール」が貼ってあるか調べます
                if (b.isAutoLeader) {
                    // 自動で作られた頭領なら「死亡（消滅）」の印をつけます
                    this.game.lifeSystem.setLifeStatusRaw(b, window.GameConstants.BushoStatus.DEAD);
                    
                    // お城の名簿からも、この頭領の名前を消しゴムで消しておきます
                    const castle = this.game.getCastle(b.castleId);
                    if (castle) {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== b.id);
                    }
                } else {
                    // 頭領以外の普通の武将は、今まで通り浪人になります
                    this.game.affiliationSystem.becomeRonin(b);
                }
            });
            const destroyedCastle = this.game.getCastle(kunishu.castleId);
            const destroyedName = kunishu.getName(this.game);
            this.game.ui.log(`【諸勢力壊滅】${destroyedName}${destroyedCastle ? `（${destroyedCastle.name}）` : ''}は壊滅しました。`, {
                clanIds: [], category: 'extinction', inferCurrentTurn: false
            });
            return;
        }

        // 頭領が死亡等で不在になった場合、継承や取込の処理を行います
        if (!leaderAlive) {
            const kunishuName = kunishu.getName(this.game);
            const leaderName = leader ? leader.name.replace('|', '') : "頭領";

            // ★後継ぎ候補が誰もいなくなった場合（モブ生成）
            if (allCandidates.length === 0) {
                const inheritedAffinity = leader ? (leader.affinity ?? 50) : 50;
                const inheritedInnovation = leader ? (leader.innovation || 0) : 0;
                this.createAutoLeader(kunishu, inheritedAffinity, inheritedInnovation);

                // ★ダイアログとログを出します
                const baseMsg = `${kunishuName}の${leaderName}が死亡しました。`;
                this.game.ui.log(`【頭領死亡】${baseMsg}`);
                await this.game.ui.showDialogAsync(baseMsg, false, 0);
                return; 
            }

            const successionMetrics = new Map(allCandidates.map(b => [Number(b.id), {
                isRelative: leader ? leader.familyIds.some(fId => b.familyIds.includes(fId)) : false,
                affinityDiff: leader ? Math.abs((leader.affinity || 0) - (b.affinity || 0)) : 0,
                baseScore: b.leadership + b.intelligence
            }]));

            allCandidates.sort((a, b) => {
                const am = successionMetrics.get(Number(a.id));
                const bm = successionMetrics.get(Number(b.id));
                if (am.isRelative && !bm.isRelative) return -1;
                if (!am.isRelative && bm.isRelative) return 1;
                if (am.isRelative && bm.isRelative && leader) {
                    if (am.affinityDiff !== bm.affinityDiff) return am.affinityDiff - bm.affinityDiff;
                    const aIsYounger = a.birthYear > leader.birthYear;
                    const bIsYounger = b.birthYear > leader.birthYear;
                    if (aIsYounger && !bIsYounger) return -1;
                    if (!aIsYounger && bIsYounger) return 1;
                    if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
                }
                return bm.baseScore - am.baseScore;
            });

            const successor = allCandidates[0];
            let isExternalSuccessor = false;
            let extraMsg = "";

            if (window.LifeStatusRules.isUnborn(successor)) {
                isExternalSuccessor = true;
                this.game.affiliationSystem.setActivityStatusRaw(successor, window.GameConstants.BushoStatus.ACTIVE);
                successor.belongKunishuId = kunishu.id;
                this.game.affiliationSystem.setCastleIdRaw(successor, kunishu.castleId);
                this.game.affiliationSystem.setClanIdRaw(successor, 0); 
                successor.loyalty = 100;
                
                const castle = this.game.getCastle(kunishu.castleId);
                if (castle && !castle.samuraiIds.includes(successor.id)) {
                    castle.samuraiIds.push(successor.id);
                }
                extraMsg = `${successor.name.replace('|','')}が急遽元服し、跡を継ぎました。`;
            }

            kunishu.leaderId = successor.id;
            
            if (isExternalSuccessor) {
                // 1枚目：死亡のメッセージ（ログに残すのはこちらだけです）
                const mainMsg = `${kunishuName}の${leaderName}が死亡しました。`;
                this.game.ui.log(`【頭領交代】${mainMsg}`);
                await this.game.ui.showDialogAsync(mainMsg, false, 0);
                
                // 2枚目：急遽元服のメッセージ
                await this.game.ui.showDialogAsync(extraMsg, false, 0);
            } else {
                // すでにいる武将が継いだ場合は、今まで通り1枚にまとめます
                const mainMsg = `${kunishuName}の${leaderName}が死亡し、${successor.name.replace('|','')}が跡を継ぎました。`;
                this.game.ui.log(`【頭領交代】${mainMsg}`);
                await this.game.ui.showDialogAsync(mainMsg, false, 0);
            }
        }
    }

    // ★追加：スキルによる大名勢力としての旗揚げ（一元化処理）
    async executeIndependentRise(kunishu, leader, castle, skillName) {
        let newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
        const indepSys = this.game.independenceSystem;
        const newColor = indepSys ? indepSys.generateDistinctColor(castle) : "#ff0000";

        const nameChangeInfo = indepSys ? indepSys.applyDaimyoNameChange(leader) : null;

        const familyName = leader.familyName || leader.name.split('|')[0] || leader.name;
        const newClanName = `${familyName}家`;
        const familyYomi = leader.familyYomi || leader.yomi.split('|')[0] || leader.yomi;
        const newClanYomi = familyYomi ? `${familyYomi}け` : "";

        const newClan = new Clan({
            id: newClanId, name: newClanName, yomi: newClanYomi, color: newColor, leaderId: leader.id
        });
        this.game.clans.push(newClan);

        // 新勢力の対外関係も外交専門部署に一元化する。
        // 新Clanを先に世界へ登録してから、既存勢力との中立関係を両方向へ生成する。
        this.game.clans.forEach(otherClan => {
            if (otherClan.id === 0 || otherClan.id === newClanId) return;
            this.game.diplomacyManager.changeStatus(newClanId, otherClan.id, window.GameConstants.DiplomacyStatus.NORMAL, 0);
            this.game.diplomacyManager.setSentimentAbsolute(newClanId, otherClan.id, 50);
        });

        this.game.castleManager.changeOwner(castle, newClanId, true); 
        
        castle.soldiers = Math.min(99999, castle.soldiers + kunishu.soldiers);
        castle.horses = Math.min(99999, (castle.horses || 0) + (kunishu.horses || 0));
        castle.guns = Math.min(99999, (castle.guns || 0) + (kunishu.guns || 0));

        const members = this.getKunishuMembers(kunishu.id);
        members.forEach(b => {
            b.belongKunishuId = 0;
            // joinClanを使うと仕官時の忠誠度再計算が行われる
            this.game.affiliationSystem.joinClan(b, newClanId, castle.id);
        });

        leader.isDaimyo = true;
        leader.isCastellan = false;
        leader.loyalty = 100;
        this.game.updateCastleLord(castle);

        kunishu.isDestroyed = true;
        kunishu.soldiers = 0;

        const info = nameChangeInfo;
        const leaderNameStr = (info && info.isNameChanged) ? info.oldNameStr : leader.name.replace(/\|/g, '');

        const msg = `${kunishu.getName(this.game)}の${leaderNameStr}が${castle.name}を乗っ取り、大名として再び旗揚げしました！`;
        this.game.ui.log(msg);
        await this.game.ui.showDialogAsync(msg);

        if (info && info.isNameChanged) {
            const nameChangeMsg = `大名となるにあたり、${info.oldNameStr}は「${info.newNameStr}」と名を改めました。`;
            this.game.ui.log(nameChangeMsg);
            await this.game.ui.showDialogAsync(nameChangeMsg);
        }

        if (this.game.ui && typeof this.game.ui.updateClanColors === 'function') {
            this.game.ui.updateClanColors();
        }
        if (typeof this.game.updateAllClanPrestige === 'function') this.game.updateAllClanPrestige();
    }

    // ==========================================
    // ★ここから追加：諸勢力コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================
    
    // 諸勢力との親善処理
    executeKunishuGoodwill(doerId, kunishuId, gold) {
        const doer = this.game.getBusho(doerId);
        const kunishu = this.getKunishu(kunishuId);
        if (!kunishu) return;
        
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        castle.gold -= gold;

        // ★修正：元のファイルにあったcalcGoodwillIncrease魔法を直接呼び出します
        const increase = this.game.diplomacyManager.calcGoodwillIncrease(gold, doer);
        
        const currentRel = kunishu.getRelation(this.game.playerClanId);
        this.setRelation(kunishu, this.game.playerClanId, currentRel + increase);
        
        const kunishuName = kunishu.getName(this.game);
        
        doer.isActionDone = true;
        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
        this.game.factionSystem.updateRecognition(doer, 15);

        this.game.ui.showResultModal(`${doer.name}が ${kunishuName} と親善を行いました\n友好度が上昇しました`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
    
    // 諸勢力「取込」の成功率（0～100%）を計算する正本です。
    // 軍師助言と実際の成否判定が必ず同じ式を使うよう、ここへ集約します。
    calcIncorporateProbability(doer, kunishu, clanId = this.game.playerClanId) {
        if (!doer || !kunishu) return 0;

        const myClan = this.game.getClan(clanId);
        const myPrestige = myClan ? myClan.daimyoPrestige : 0;
        const myDaimyo = this.game.getClanDaimyo(clanId);
        const leader = this.game.getBusho(kunishu.leaderId);

        const targetSoldiers = kunishu.soldiers || 1;
        const ratio = myPrestige / (targetSoldiers * 12);
        const baseProb = 70 * ratio;

        const affinityDiff = (myDaimyo && leader)
            ? PersonnelRules.calcAffinityDiff(myDaimyo.affinity, leader.affinity)
            : 25;
        const affinityMod = (25 - affinityDiff) / 25 * 10;
        const diplomacyMod = (doer.diplomacy - 50) / 50 * 10;

        return Math.max(0, Math.min(100, baseProb + affinityMod + diplomacyMod));
    }

    // 諸勢力を自軍に取り込む処理
    executeKunishuIncorporate(doerId, castleId, kunishuId) {
        const doer = this.game.getBusho(doerId);
        const kunishu = this.getKunishu(kunishuId);
        const castle = this.game.getCastle(castleId);
        
        if (!kunishu) return;
        
        const totalProb = this.calcIncorporateProbability(doer, kunishu, this.game.playerClanId);
        const isSuccess = (Math.random() * 100) < totalProb;
        
        if (isSuccess) {
            castle.soldiers = Math.min(99999, castle.soldiers + kunishu.soldiers);
            castle.horses = Math.min(99999, (castle.horses || 0) + (kunishu.horses || 0));
            castle.guns = Math.min(99999, (castle.guns || 0) + (kunishu.guns || 0));
            
            const members = this.getKunishuMembers(kunishuId);
            members.forEach(b => {
                b.belongKunishuId = 0;
                this.game.affiliationSystem.joinClan(b, this.game.playerClanId, castle.id);
            });
            
            kunishu.isDestroyed = true;
            kunishu.soldiers = 0;

            const kunishuName = kunishu.getName(this.game);
            const playerClan = this.game.getClan ? this.game.getClan(this.game.playerClanId) : null;
            if (this.game.historySystem) {
                this.game.historySystem.record(`【諸勢力取込】${playerClan ? playerClan.name : '自家'}は${kunishuName}を傘下に加えました。`, {
                    clanIds: [this.game.playerClanId], category: 'kunishu', inferCurrentTurn: false
                });
            }
            this.game.ui.showResultModal(`${doer.name}の説得により、${kunishuName} が我が傘下に加わりました！`);
            
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.3) + 30;
            this.game.factionSystem.updateRecognition(doer, 30);
        } else {
            const kunishuName = kunishu.getName(this.game);
            this.game.ui.showResultModal(`${doer.name}は ${kunishuName} に合流を提案しましたが、\n丁重に断られてしまいました……`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }

        doer.isActionDone = true;
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }
    
    // 諸勢力を攻めて壊滅させるための処理
    async executeKunishuSubjugate(atkCastle, targetCastleId, atkBushosIds, sendSoldiers, sendRice, sendHorses, sendGuns, kunishu) {
        const atkBushos = atkBushosIds.map(id => this.game.getBusho(id));
        // 鎮圧戦の戦場は出撃元ではなく、諸勢力が実際に紐づく拠点を正本にします。
        // 呼び出し側が古いtargetCastleIdを渡しても演出・援軍判定・戦闘対象がずれないようここで正規化します。
        const actualTargetCastleId = Number(kunishu && kunishu.castleId) || Number(targetCastleId);
        
        // startWarの中で減らす処理が行われるため、ここで兵士や物資を減らす手動処理を消去しました（二重減り防止）

        this.applySubjugationHostility(kunishu, atkCastle.ownerClan);

        // ==========================================
        // ★蜂起(executeUprising)と同じように、startWarに合流させます！
        // ==========================================
        let isWarReallyFinished = false;
        const originalCloseWar = this.game.warManager.closeWar;
        
        // closeWarが呼ばれたら、終わったよと報告させます
        this.game.warManager.closeWar = function() {
            if (originalCloseWar) originalCloseWar.call(this); 
            isWarReallyFinished = true;  
        };

        // 鎮圧戦も通常戦と同じ戦争準備の正規窓口へ必ず合流させます。
        const extraData = { isKunishu: true, kunishuId: kunishu.id };
        this.game.warPreparationController.checkReinforcementAndStartWar(atkCastle, actualTargetCastleId, atkBushos, sendSoldiers, sendRice, sendHorses, sendGuns, extraData);
        
        // 戦争とメッセージ表示が完全に終わるまで待ちます
        let failSafeCounter = 0; 
        
        while (!isWarReallyFinished) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (this.game.warManager.state && !this.game.warManager.state.active) {
                let anyModalOpen = false;
                if (this.game.ui) {
                    const isVisible = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
                    if (isVisible('result-modal') || isVisible('dialog-modal') || isVisible('war-modal')) {
                        anyModalOpen = true;
                    }
                    const overlay = document.querySelector('[class*="tap"], [id*="tap"]');
                    if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
                        anyModalOpen = true;
                    }
                }
                
                if (!anyModalOpen) {
                    failSafeCounter++;
                    if (failSafeCounter > 6) break;
                } else {
                    failSafeCounter = 0; 
                }
            }
        }
        
        delete this.game.warManager.closeWar;
        
        // プレイヤー関与時のUI更新
        const isPlayer = (Number(atkCastle.ownerClan) === Number(this.game.playerClanId) && !atkCastle.isDelegated);
        if (isPlayer && this.game.ui) {
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu();
        }
    }
}