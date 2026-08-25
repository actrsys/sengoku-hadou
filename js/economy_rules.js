/**
 * economy_rules.js
 * 収入・交易・装備購入・給金予算など経済計算を一元管理する。
 */
class EconomyRules {
    static calcBaseGoldIncome(castle) {
        const baseGold = (castle.population * 0.01) + (castle.peoplesLoyalty / 2) + (castle.commerce / 4);
        return Math.floor(baseGold * window.MainParams.Economy.IncomeGoldRate);
    }

    static calcBaseRiceIncome(castle) {
        // 以前の計算式
        // const baseRice = (castle.kokudaka + castle.peoplesLoyalty) * (Math.sqrt(castle.peoplesLoyalty) + 2);

        // 新しい計算式：現在石高 × 現在民忠 / 10
        // エラー防止のため、民忠がマイナスになった場合は0として計算する安全対策を入れています
        const safeLoyalty = Math.max(0, castle.peoplesLoyalty);
        const baseRice = castle.kokudaka * safeLoyalty / 10;
        
        return Math.floor(baseRice);
    }

    static getMerchantDiscount(clanId, game) {
        if (!game || !game.kunishuSystem) return 0;
        let maxDiscount = 0;
        const kunishus = game.kunishuSystem.getAliveKunishus();
        
        for (let k of kunishus) {
            if (k.ideology === '商人') {
                const rel = k.getRelation(clanId);
                // 友好度60以上の時だけ割引してくれます
                if (rel >= 60) {
                    // 友好度4につき1%（0.01）割引します
                    const discount = Math.floor((rel - 60) / 4) * 0.01;
                    // 複数の商人と仲が良くても、一番高い割引率1つだけを適用します
                    if (discount > maxDiscount) maxDiscount = discount;
                }
            }
        }
        // 最大でも10%（0.10）までにストップをかけます
        return Math.min(0.10, maxDiscount); 
    }

    static calcBuyEquipEfficiency(daimyo, castellan, itemType) {
        const divisor = itemType === 'horse' ? 150 : 300;
        const daimyoEff = daimyo ? ((daimyo.politics * 1.5) + (daimyo.charm * 1.5)) / divisor : 0;
        const castellanEff = castellan ? ((castellan.politics * 1.5) + (castellan.charm * 1.5)) / divisor : 0;
        let totalEff = daimyoEff + castellanEff;
        return totalEff > 0 ? totalEff : 0.1;
    }

    static isProdCastle(c, itemType, provinces = []) {
        if (!c) return false;
        
        if (itemType === 'horse') {
            // 岩村城(4)、黒川城(61)、塩生城(62)、日野江城(157)、隈本城(158)、岩尾城(159)、蠣崎城(191)、野辺地城(192)、八戸城(193)、三戸城(194)、花輪館(196)、白石城(206)、三春城(211)、須賀川城(212)、杉目城(214)、二本松城(215)、猪苗代城(216)
            if ([4, 61, 62, 157, 158, 159, 191, 192, 193, 194, 196, 206, 211, 212, 214, 215, 216].includes(c.id)) return true;
            // 常陸国(ID15)、淡路国(ID36)、日向国(ID62)、薩摩国(ID63)、大隅国(ID64)、対馬国(ID68)
            if ([15, 36, 62, 63, 64, 68].includes(c.provinceId)) return true; 
            if (provinces) {
                const prov = provinces.find(p => p.id === c.provinceId);
                // 甲信地方(ID3)
                if (prov && prov.regionId === 3) return true;
            }
        } else if (itemType === 'gun') {
            // 石山御坊(ID33)、雑賀城(ID42)、赤尾木城(ID185)、今浜城(ID186)
            if ([33, 42, 185, 186].includes(c.id)) return true;
        }
        return false;
    }

    static isPortCastle(c) {
        if (!c) return false;
        // 港となる拠点のIDを、ここ一箇所だけで管理します
        //春日山城(ID2)、石山御坊(ID33)、松波城(ID72)、尾山御坊(ID74)、北庄城(ID76)、立花山城(ID148)、平戸城(ID155)、内城(ID169)、厳原城(ID174)、湊城(ID219)、安濃津城(ID251)
        const portCastleIds = [2, 33, 72, 74, 76, 148, 155, 169, 174, 219, 251];
        return portCastleIds.includes(c.id);
    }

    static calcBuyEquipUnitPrice(daimyo, castellan, itemType, game) {
        const eff = this.calcBuyEquipEfficiency(daimyo, castellan, itemType);
        let basePrice = itemType === 'horse' ? 2 : 5;
        
        // ★ここから追加：鉄砲伝来による価格変動（1543年：20倍 → 1553年：15倍 → 1573年：1倍）
        if (itemType === 'gun' && game) {
            const y = game.year;
            const m = game.month;
            if (y >= 1543 && y < 1553) {
                // 10年間（120ヶ月）かけて20倍から15倍に緩やかに下がります
                const monthsPassed = (y - 1543) * 12 + (m - 1);
                basePrice *= (20.0 - (5.0 * (monthsPassed / 120)));
            } else if (y >= 1553 && y < 1573) {
                // 20年間（240ヶ月）かけて15倍から1倍にどんどん下がります
                const monthsPassed = (y - 1553) * 12 + (m - 1);
                basePrice *= (15.0 - (14.0 * (monthsPassed / 240)));
            } else if (y <= 1542) {
                // 1542年以前は買えませんが、念のためとんでもなく高い値段にしておきます
                basePrice *= 9999; 
            }
            // 1573年以降は変動なし（1倍）のままになります
        }

        let unitPrice = basePrice / (1 + eff / 10);
        
        let hasProdCastle = false;
        let hasVassalProdCastle = false; // ★追加：支配している勢力が産地を持っているか
        const myClanId = daimyo ? daimyo.clan : (castellan ? castellan.clan : 0);
        
        if (daimyo && game && game.castles) {
            hasProdCastle = game.castles.some(c => c.ownerClan === daimyo.clan && this.isProdCastle(c, itemType, game.provinces));
        } else if (castellan && game && game.castles) {
            const myCastle = game.castles.find(c => c.id === castellan.castleId);
            hasProdCastle = this.isProdCastle(myCastle, itemType, game.provinces);
        } else if (castellan && itemType === 'gun') {
            // 万が一の予備チェック（鉄砲用）
            hasProdCastle = [33, 42, 185, 186].includes(castellan.castleId);
        }
        
        // ★追加：自分が産地を持っていなければ、支配している勢力が産地を持っているか探します
        if (!hasProdCastle && myClanId > 0 && game && game.clans && game.castles) {
            const clans = game.clans.filter(c => c.id !== 0 && c.id !== myClanId && !c.isDestroyed);
            for (let otherClan of clans) {
                const rel = game.getRelation(myClanId, otherClan.id);
                // 自分から見て相手を「支配」している場合
                if (rel && rel.status === '支配') {
                    // その支配勢力が産地を持っているかチェック
                    const vassalHasProd = game.castles.some(c => c.ownerClan === otherClan.id && this.isProdCastle(c, itemType, game.provinces));
                    if (vassalHasProd) {
                        hasVassalProdCastle = true;
                        break; // 1つでも見つかればOK
                    }
                }
            }
        }
        
        // ★ここから今回追加：産地による割引効果の計算
        let prodDiscount = 0.5; // 自領産地の基本割引率（0.5 ＝ 50%オフ ＝ 単価1/2）
        let vassalProdDiscount = 0.25; // 従属産地の基本割引率（0.25 ＝ 25%オフ ＝ 単価3/4）
        let baseDiscountRate = 1.0; // ★追加：年代による効果の出にくさを表す倍率

        if (itemType === 'gun' && game) {
            const y = game.year;
            const m = game.month;
            if (y >= 1543 && y < 1563) {
                // 1543年〜1563年の20年間（240ヶ月）で、割引率が0.2（20%オフ＝単価4/5）から0.5（50%オフ＝単価1/2）へ徐々に増えます
                const monthsPassed = (y - 1543) * 12 + (m - 1);
                prodDiscount = 0.2 + (0.3 * (monthsPassed / 240));
                // 従属勢力はその半分の恩恵とします（0.1 → 0.25 へ徐々に増える）
                vassalProdDiscount = prodDiscount / 2;
                // 本来の50%割引に対して、今どれくらいの倍率で効果が出ているかを計算します
                baseDiscountRate = prodDiscount / 0.5;
            } else if (y <= 1542) {
                // 1542年以前はそもそも鉄砲がないので割引なし
                prodDiscount = 0;
                vassalProdDiscount = 0;
                baseDiscountRate = 0;
            }
        }

        // ★追加：産地諸勢力による割引の計算
        let kunishuProdDiscount = 0;
        if (myClanId > 0 && game && game.kunishuSystem && game.castles) {
            const kunishus = game.kunishuSystem.getAliveKunishus();
            for (let k of kunishus) {
                const castle = game.castles.find(c => c.id === k.castleId);
                // その諸勢力がいる城が、馬や鉄砲の産地かどうかチェック
                if (this.isProdCastle(castle, itemType, game.provinces)) {
                    const rel = k.getRelation(myClanId);
                    if (rel >= 60) {
                        // 友好度60以上の時、友好度2につき1%（0.01）割引します
                        let discount = Math.floor((rel - 60) / 2) * 0.01;
                        discount = Math.min(0.20, discount); // 最大20%まで
                        // 鉄砲伝来初期などの「効果の出にくさ（年代減少）」を諸勢力にも適用します
                        discount = discount * baseDiscountRate;
                        
                        if (discount > kunishuProdDiscount) {
                            kunishuProdDiscount = discount;
                        }
                    }
                }
            }
        }

        // ★変更：自領、従属、諸勢力の中で一番「割引率の高いもの」を優先します！
        let finalProdDiscount = 0;
        if (hasProdCastle) finalProdDiscount = prodDiscount;
        if (hasVassalProdCastle && vassalProdDiscount > finalProdDiscount) finalProdDiscount = vassalProdDiscount;
        if (kunishuProdDiscount > finalProdDiscount) finalProdDiscount = kunishuProdDiscount;

        // 産地割引を単価に適用します
        unitPrice = unitPrice * (1.0 - finalProdDiscount);
        
        // ★追加：商人系諸勢力による割引の計算（産地割引とさらに重複します！）
        if (myClanId > 0) {
            const merchantDiscount = this.getMerchantDiscount(myClanId, game);
            if (merchantDiscount > 0) {
                // 商人と仲が良いと、さらに単価が安くなります！
                unitPrice = unitPrice * (1.0 - merchantDiscount);
            }
        }
        
        return unitPrice;
    }

    static calcBuyEquipCost(amount, daimyo, castellan, itemType, game) {
        const unitPrice = this.calcBuyEquipUnitPrice(daimyo, castellan, itemType, game);
        return Math.ceil(amount * unitPrice);
    }

    static calcBuyEquipAmount(gold, daimyo, castellan, itemType, game) {
        const unitPrice = this.calcBuyEquipUnitPrice(daimyo, castellan, itemType, game);
        return Math.floor(gold / unitPrice);
    }

    static calcBuyHorseEfficiency(daimyo, castellan) { return this.calcBuyEquipEfficiency(daimyo, castellan, 'horse'); }

    static calcBuyHorseUnitPrice(daimyo, castellan, game) { return this.calcBuyEquipUnitPrice(daimyo, castellan, 'horse', game); }

    static calcBuyHorseCost(amount, daimyo, castellan, game) { return this.calcBuyEquipCost(amount, daimyo, castellan, 'horse', game); }

    static calcBuyHorseAmount(gold, daimyo, castellan, game) { return this.calcBuyEquipAmount(gold, daimyo, castellan, 'horse', game); }

    static calcBuyGunEfficiency(daimyo, castellan) { return this.calcBuyEquipEfficiency(daimyo, castellan, 'gun'); }

    static calcBuyGunUnitPrice(daimyo, castellan, game) { return this.calcBuyEquipUnitPrice(daimyo, castellan, 'gun', game); }

    static calcBuyGunCost(amount, daimyo, castellan, game) { return this.calcBuyEquipCost(amount, daimyo, castellan, 'gun', game); }

    static calcBuyGunAmount(gold, daimyo, castellan, game) { return this.calcBuyEquipAmount(gold, daimyo, castellan, 'gun', game); }

    static getBaseRiceRate(castle, provinces) {
        let rate = window.MainParams.Economy.TradeRateBase;
        if (castle && provinces) {
            const province = provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) rate = province.marketRate;
        }
        return rate;
    }

    /**
     * 米相場の表示。marketRate は「金1で得られる兵糧量」を表す。
     * 例: 2.0 なら 金1＝兵糧2.0。
     */
    static formatRiceMarketValue(rate) {
        return Number(rate || 0).toFixed(1);
    }

    static formatRiceMarketRate(rate) {
        return `金1＝兵糧${this.formatRiceMarketValue(rate)}`;
    }

    /**
     * 実取引用の米相場を返す。actualRate / ricePerGold はどちらも
     * 「金1で何兵糧に相当するか」を表す。
     * 商人割引は購入時は同じ金でより多く買え、売却時は同じ米でより多く金を得られる方向に効く。
     */
    static getRiceActualRate(type, castle, provinces, game) {
        const baseRate = this.getBaseRiceRate(castle, provinces);
        const myClanId = castle ? castle.ownerClan : 0;
        const merchantDiscount = this.getMerchantDiscount(myClanId, game);

        let ricePerGold = baseRate;
        if (type === 'buy_rice') {
            ricePerGold = baseRate / (1.0 - merchantDiscount);
        } else if (type === 'sell_rice') {
            ricePerGold = baseRate / (1.0 + merchantDiscount);
        }

        return {
            actualRate: ricePerGold,
            ricePerGold,
            displayRateStr: ricePerGold.toFixed(1)
        };
    }

    static calcMaxTradeAmount(type, castle, daimyo, castellan, provinces, game) {
        if (type === 'buy_rice') {
            const rateInfo = this.getRiceActualRate('buy_rice', castle, provinces, game);
            const ricePerGold = rateInfo.ricePerGold;
            const maxGold = Math.min(castle.gold, castle.tradeLimit || 0);
            let maxBuy = Math.floor(maxGold * ricePerGold);
            while (maxBuy > 0 && Math.ceil(maxBuy / ricePerGold) > maxGold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - castle.rice);
        }
        else if (type === 'sell_rice') {
            const rateInfo = this.getRiceActualRate('sell_rice', castle, provinces, game);
            const ricePerGold = rateInfo.ricePerGold;
            const maxGain = Math.min(99999 - castle.gold, castle.tradeLimit || 0);
            const maxSellByGold = Math.floor(maxGain * ricePerGold);
            return Math.min(castle.rice, maxSellByGold);
        }
        else if (type === 'buy_ammo') {
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10);
            const maxBuy = price > 0 ? Math.floor(castle.gold / price) : 0;
            return Math.min(maxBuy, 99999 - (castle.ammo || 0));
        }
        else if (type === 'buy_horses') {
            let maxBuy = this.calcBuyHorseAmount(castle.gold, daimyo, castellan, game);
            while (maxBuy > 0 && this.calcBuyHorseCost(maxBuy, daimyo, castellan, game) > castle.gold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - (castle.horses || 0));
        }
        else if (type === 'buy_guns') {
            let maxBuy = this.calcBuyGunAmount(castle.gold, daimyo, castellan, game);
            while (maxBuy > 0 && this.calcBuyGunCost(maxBuy, daimyo, castellan, game) > castle.gold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - (castle.guns || 0));
        }
        return 0;
    }

    static calcTradeCostAndRate(type, amount, castle, daimyo, castellan, provinces, game) {
        let cost = 0;
        let rateStr = "0.0";

        if (type === 'buy_rice') {
            const rateInfo = this.getRiceActualRate('buy_rice', castle, provinces, game);
            cost = Math.ceil(amount / rateInfo.ricePerGold);
            rateStr = rateInfo.displayRateStr;
        } else if (type === 'sell_rice') {
            const rateInfo = this.getRiceActualRate('sell_rice', castle, provinces, game);
            cost = Math.floor(amount / rateInfo.ricePerGold); // 売却の場合は利益
            rateStr = rateInfo.displayRateStr;
        } else if (type === 'buy_ammo') {
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10);
            cost = price * amount;
            rateStr = price.toFixed(1);
        } else if (type === 'buy_horses') {
            cost = this.calcBuyHorseCost(amount, daimyo, castellan, game);
            rateStr = this.calcBuyHorseUnitPrice(daimyo, castellan, game).toFixed(1);
        } else if (type === 'buy_guns') {
            cost = this.calcBuyGunCost(amount, daimyo, castellan, game);
            rateStr = this.calcBuyGunUnitPrice(daimyo, castellan, game).toFixed(1);
        }
        return { cost, rateStr };
    }

    static calcPortBonus(castle, game) {
        let portBonus = 0;
        if (this.isPortCastle(castle) && game) {
            const clanCastles = game.castles.filter(c => c.ownerClan === castle.ownerClan);
            const totalClanPopulation = clanCastles.reduce((sum, c) => sum + c.population, 0);
            portBonus = Math.floor((castle.population / 500) + (castle.peoplesLoyalty / 2) + (totalClanPopulation / 1000));
        }
        return portBonus;
    }

    static calcTradeIncomeWithTarget(clanId, targetClanId, game) {
        const clan = game.getClan(clanId);
        const targetClan = game.getClan(targetClanId);
        if (!clan || !targetClan) return 0;
        
        const rel = game.getRelation(clanId, targetClanId);
        if (!rel || !window.DiplomacyRules.isFriendly(rel.status)) return 0;
        
        const myCastles = game.getClanCastles(clanId);
        const targetCastles = game.getClanCastles(targetClanId);
        if (myCastles.length === 0 || targetCastles.length === 0) return 0;
        
        let targetIncome = 0;
        const sentiment = rel.sentiment;
        
        targetCastles.forEach(tc => {
            let isAdjacentToMe = false;
            for (let mc of myCastles) {
                if (MapGraphService.isAdjacent(mc, tc)) {
                    isAdjacentToMe = true;
                    break;
                }
            }
            const baseIncome = Math.sqrt(tc.population) * (sentiment / 200);
            if (isAdjacentToMe) {
                targetIncome += Math.floor(baseIncome);
            } else {
                targetIncome += Math.floor(baseIncome / 3);
            }
        });
        return targetIncome;
    }

    static calcClanTradeIncome(clanId, game) {
        let total = 0;
        game.clans.forEach(targetClan => {
            if (targetClan.id !== 0 && targetClan.id !== clanId && !targetClan.isDestroyed) {
                total += this.calcTradeIncomeWithTarget(clanId, targetClan.id, game);
            }
        });
        return total;
    }

    static calcExpectedGoldIncome(castle, game) {
        let income = this.calcBaseGoldIncome(castle);
        // ★ 新しく作った港ボーナスの計算式を呼び出します
        income += this.calcPortBonus(castle, game);
        
        if (castle.statusEffects && castle.statusEffects.includes('一揆')) {
            income = 0;
        }
        return income;
    }

    static calcCastleSalary(castle, game) {
        if (!game) return 0;
        const bushos = game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b));
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        let consumeGold = 0;
        bushos.forEach(b => {
            consumeGold += b.getSalary(daimyo);
        });
        return consumeGold;
    }

    /** 月初の国別米相場を一括更新する。更新順による差が出ないよう次値を先に計算する。 */
    static updateMonthlyProvinceMarketRates(game) {
        const fluc = window.MainParams.Economy.TradeFluctuation;
        const baseRate = window.MainParams.Economy.TradeRateBase;

        let seasonForce = 0;
        if (game.month === 9) {
            const harvestBoost = (baseRate * 0.5) + (Math.random() * (baseRate * 0.5));
            seasonForce = harvestBoost;
        } else {
            seasonForce = -(baseRate * 0.05);
        }

        const adjProvinces = {};
        game.provinces.forEach(p => { adjProvinces[p.id] = new Set(); });
        game.castles.forEach(castle => {
            if (castle.provinceId <= 0 || !castle.adjacentCastleIds) return;
            castle.adjacentCastleIds.forEach(adjId => {
                const adjCastle = game.getCastle(adjId);
                if (adjCastle && adjCastle.provinceId > 0 && adjCastle.provinceId !== castle.provinceId) {
                    adjProvinces[castle.provinceId].add(adjCastle.provinceId);
                    adjProvinces[adjCastle.provinceId].add(castle.provinceId);
                }
            });
        });

        const nextRates = new Map();
        game.provinces.forEach(province => {
            const change = (Math.random() * (fluc * 2)) - fluc;
            const rubberForce = (baseRate - province.marketRate) * 0.1;
            let neighborForce = 0;
            const neighborIds = adjProvinces[province.id];
            if (neighborIds && neighborIds.size > 0) {
                let neighborTotalRate = 0;
                neighborIds.forEach(nId => {
                    const neighborProvince = game.provinces.find(p => p.id === nId);
                    if (neighborProvince) neighborTotalRate += neighborProvince.marketRate;
                });
                const neighborAverage = neighborTotalRate / neighborIds.size;
                neighborForce = (neighborAverage - province.marketRate) * 0.05;
            }

            let newRate = province.marketRate + change + rubberForce + seasonForce + neighborForce;
            newRate = Math.max(
                window.MainParams.Economy.TradeRateMin,
                Math.min(window.MainParams.Economy.TradeRateMax, newRate)
            );
            nextRates.set(province.id, newRate);
        });

        game.provinces.forEach(province => {
            if (nextRates.has(province.id)) province.marketRate = nextRates.get(province.id);
        });
    }

    /** 月初の金収入。一揆・3月増収・港収入を含む。 */
    static calcMonthlyGoldIncome(castle, game) {
        let income = this.calcBaseGoldIncome(castle);
        income = GameMath.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
        if (game.month === 3) income += income * 3;
        income += this.calcPortBonus(castle, game);
        if (castle.statusEffects && castle.statusEffects.includes('一揆')) income = 0;
        return income;
    }

    static calcMonthlyTradeLimit(castle) {
        return Math.floor((castle.population / 50) + (castle.kokudaka * 4));
    }

    /** 月初イベント後の給金・兵糧維持費を適用し、給金不足かどうかを返す。 */
    static applyMonthlyCastleUpkeep(castle, bushos, daimyo) {
        let consumeGold = 0;
        bushos.forEach(busho => { consumeGold += busho.getSalary(daimyo); });
        const isGoldShort = (castle.gold - consumeGold < 0);

        const consumeRice = Math.floor(castle.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier);
        if (castle.rice - consumeRice < 0) {
            castle.rice = 0;
            castle.soldiers = Math.floor(castle.soldiers * 0.95);
        } else {
            castle.rice -= consumeRice;
        }
        castle.gold = Math.max(0, castle.gold - consumeGold);

        if (castle.soldiers <= 0) {
            castle.soldiers = 0;
            castle.training = 0;
            castle.morale = 0;
        }
        return { isGoldShort, consumeGold, consumeRice };
    }

    static calcAvailableGoldForAI(castle, game) {
        const income = this.calcExpectedGoldIncome(castle, game);
        const salary = this.calcCastleSalary(castle, game);
        
        // (支出 - 収入) に 100 の余裕を足します。
        // もし収入の方が多くてマイナスになっても、念のため最低 100 は手元に残します！
        const requiredSafeGold = Math.max(100, (salary - income) + 100);
        
        // 今の所持金から、残すべき安全なお金を引いた額が「自由に使えるお金」です
        return Math.max(0, castle.gold - requiredSafeGold);
    }
}

window.EconomyRules = EconomyRules;
