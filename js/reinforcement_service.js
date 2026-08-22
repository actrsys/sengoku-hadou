/**
 * reinforcement_service.js
 * 援軍の自動編成・資源持ち出しを一元管理する専門サービス。
 *
 * 外交上の「援軍を出すかどうか」は各外交/戦争システムが担当し、
 * 出すと決まった後の兵数・武将数・装備・兵糧・城在庫の減算をここで統一する。
 */
class ReinforcementService {
    constructor(game) {
        this.game = game;
    }

    _getConfig() {
        return window.WarParams.Reinforcement;
    }

    _selectByStrength(availableBushos, soldierCount) {
        const config = this._getConfig();
        const sortedBushos = [...availableBushos].sort((a, b) => b.strength - a.strength);

        let bushoCount = 1;
        if (soldierCount >= config.TwoBushoThreshold) bushoCount = 2;
        if (soldierCount >= config.ThreeBushoThreshold) bushoCount = 3;
        bushoCount = Math.min(bushoCount, sortedBushos.length);
        return sortedBushos.slice(0, bushoCount);
    }

    _selectBushos(helperCastle, soldierCount) {
        const availableBushos = this.game.getCastleBushos(helperCastle.id)
            .filter(busho => busho.clan === helperCastle.ownerClan && busho.status === 'active');
        return this._selectByStrength(availableBushos, soldierCount);
    }

    _calcEquipment(stock, soldierCount, requireMinimumStock = false) {
        const config = this._getConfig();
        const currentStock = stock || 0;
        if (requireMinimumStock && currentStock < soldierCount * config.SelfEquipmentMinimumStockRatio) {
            return 0;
        }
        return Math.min(currentStock, Math.floor(soldierCount * config.EquipmentCapRatio));
    }

    _consumeCastleResources(helperCastle, data) {
        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - data.soldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - data.rice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - data.horses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - data.guns);
    }

    _buildData(helperCastle, soldierCount, { requireMinimumEquipmentStock = false, flags = {} } = {}) {
        const config = this._getConfig();
        const data = {
            castle: helperCastle,
            bushos: this._selectBushos(helperCastle, soldierCount),
            soldiers: soldierCount,
            rice: soldierCount * config.RicePerSoldier,
            horses: this._calcEquipment(helperCastle.horses, soldierCount, requireMinimumEquipmentStock),
            guns: this._calcEquipment(helperCastle.guns, soldierCount, requireMinimumEquipmentStock),
            ...flags,
            morale: helperCastle.morale || 50,
            training: helperCastle.training || 50
        };
        this._consumeCastleResources(helperCastle, data);
        return data;
    }

    createAutoSelfReinforcement(helperCastle, flags = {}) {
        const config = this._getConfig();
        let soldierCount = Math.floor(helperCastle.soldiers * config.SelfSoldierRatio);
        if (soldierCount < config.MinimumSoldiers) soldierCount = config.MinimumSoldiers;
        if (soldierCount > helperCastle.soldiers) soldierCount = helperCastle.soldiers;

        return this._buildData(helperCastle, soldierCount, {
            requireMinimumEquipmentStock: true,
            flags
        });
    }

    createAutoClanReinforcement(helperCastle, relation, helperDaimyo, flags = {}) {
        const config = this._getConfig();
        const duty = helperDaimyo ? helperDaimyo.duty : 50;
        const sentiment = relation ? relation.sentiment : 0;
        const rate = (sentiment + duty) / config.AllyRateDivisor;
        let soldierCount = Math.floor(helperCastle.soldiers * rate);
        soldierCount = Math.max(config.MinimumSoldiers, Math.min(soldierCount, helperCastle.soldiers));

        return this._buildData(helperCastle, soldierCount, {
            requireMinimumEquipmentStock: false,
            flags
        });
    }
    createAutoKunishuReinforcement(kunishu, helperCastle, relationValue, flags = {}) {
        const config = this._getConfig();
        const rate = relationValue / config.KunishuRateDivisor;
        let soldierCount = Math.floor(kunishu.soldiers * rate);
        soldierCount = Math.max(config.MinimumSoldiers, Math.min(soldierCount, kunishu.soldiers));

        const bushos = this._selectByStrength(
            this.game.kunishuSystem.getKunishuMembers(kunishu.id),
            soldierCount
        );
        const data = {
            castle: helperCastle,
            kunishuId: kunishu.id,
            bushos,
            soldiers: soldierCount,
            rice: soldierCount * config.RicePerSoldier,
            horses: 0,
            guns: 0,
            ...flags,
            morale: kunishu.morale || 50,
            training: kunishu.training || 50
        };
        kunishu.soldiers = Math.max(0, kunishu.soldiers - soldierCount);
        return data;
    }

}

window.ReinforcementService = ReinforcementService;
