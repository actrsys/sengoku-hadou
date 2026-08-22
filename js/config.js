/**
 * config.js
 * ゲーム全体の調整値を一元管理する設定ファイル。
 *
 * ルール:
 * - 調整可能な共通数値は原則ここだけで定義する。
 * - 各システム側では独自の「なければ○○」を持たない。
 * - 既存コード移行中のため MainParams / WarParams / AIParams は
 *   GameConfig 内の同一オブジェクトを参照する互換エイリアスとして残す。
 */
window.GameConfig = {
    Main: {
        StartYear: 1560,
        StartMonth: 4,
        System: {
            UseRandomNames: true
        },
        Gunshi: {
            AdviceLoyalty: 84,
            DangerLoyalty: 74
        },
        Economy: {
            IncomeGoldRate: 1,
            IncomeFluctuation: 0.15,
            ConsumeRicePerSoldier: 0.03,
            TradeRateBase: 2.0,
            TradeRateMin: 1.5,
            TradeRateMax: 2.5,
            TradeFluctuation: 0.5,
            PriceAmmo: 1,
            MaxLoyalty: 100
        },
        CommandCost: {
            Farm: 100,
            Commerce: 100,
            Repair: 100,
            Charity: 200,
            Reward: 100,
            SoldierCharity: 200,
            RewardAll: 3000
        },
        Strategy: {
            InvestigateDifficulty: 50,
            EmploymentDiff: 1.5,
            HeadhuntBaseDiff: 50,
            HeadhuntGoldEffect: 0.01,
            HeadhuntGoldMaxEffect: 15,
            HeadhuntIntWeight: 0.8,
            HeadhuntLoyaltyWeight: 1.0,
            HeadhuntDutyWeight: 0.8,
            RewardBaseEffect: 30,
            RewardDistancePenalty: 0.2,
            AffinityLordWeight: 0.5,
            AffinityNewLordWeight: 0.6,
            AffinityDoerWeight: 0.4
        }
    },

    War: {
        Military: {
            MaxMoraleBase: 120,
            MaxMoraleCharity: 100,
            MaxMorale: 100,
            MaxTraining: 100,
            WarMaxRounds: 15,
            DamageSoldierPower: 0.05,
            WallDefenseEffect: 0.5,
            DamageFluctuation: 0.2
        },
        TroopAllocation: {
            GeneralRatio: 1.3,
            EquipmentMinimumRatio: 0.5,
            MaxTeppoUnitRatio: 0.5
        },
        Reinforcement: {
            SelfSoldierRatio: 0.5,
            MinimumSoldiers: 500,
            TwoBushoThreshold: 1500,
            ThreeBushoThreshold: 2500,
            EquipmentCapRatio: 0.5,
            SelfEquipmentMinimumStockRatio: 0.2,
            AllyRateDivisor: 400,
            KunishuRateDivisor: 200,
            RicePerSoldier: 1
        },
        War: {
            ChargeMultiplier: 1.5,
            ChargeRisk: 1.8,
            ChargeSoldierDmgRate: 1.0,
            ChargeWallDmgRate: 0.1,
            BowMultiplier: 0.6,
            BowRisk: 0.5,
            SiegeMultiplier: 1.0,
            SiegeWallRate: 0.5,
            SiegeRisk: 10.0,
            DefChargeMultiplier: 1.2,
            DefChargeRisk: 2.0,
            DefBowMultiplier: 0.5,
            CounterAtkPowerFactor: 0.05,
            FireSuccessBase: 0.25,
            FireDamageFactor: 0.8,
            ShortWarTurnLimit: 5,
            BaseRecoveryRate: 0.2,
            RetreatRecoveryRate: 0.3,
            DaimyoCaptureReduction: 0.3,
            RetreatResourceLossFactor: 0.2,
            LootingBaseRate: 0.3,
            LootingCharmFactor: 0.002,
            DaimyoCharmWeight: 0.1,
            RiceConsumptionAtk: 0.05,
            BaseStat: 30,
            SubGeneralFactor: 0.2,
            MinDamage: 50,
            StatsLdrWeight: 1.2,
            StatsStrWeight: 0.3,
            StatsIntWeight: 0.5,
            MoraleBase: 50,
            WinStatIncrease: 5,
            CaptureChanceBase: 0.7,
            CaptureStrFactor: 0.002,
            AutoWarDamageRate: 1.0
        },
        Faction: {
            AffinityFactorBase: 0.5,
            AffinityDivisor: 25,
            MinRecognition: -100,
            MaxRecognition: 100,
            LoyaltyChangeThreshold: 20,
            NaturalDecay: 10,
            RoninLoyaltyThreshold: 30,
            RoninChanceBase: 0.5,
            AchievementLeader: 500,
            SolidarityStayTrigger: 12,
            SolidarityStayBase: 9,
            SolidarityStayDiv: 3,
            BattleAchievementBase: 20,
            BattleAchievementLdrFactor: 0.3,
            SameFactionRecognitionDecay: 3,
            SameFactionLoyaltyBoost: 1
        },
        Independence: {
            ThresholdBase: 25,
            ThresholdDutyDiv: 2,
            ThresholdAmbitionDiv: 5,
            ProbLoyaltyFactor: 1,
            ProbAffinityFactor: 0.5
        }
    },

    AI: {
        AI: {
            Difficulty: 'normal',
            AbilityBase: 50,
            AbilitySensitivity: 3.0,
            GunshiBiasFactor: 0.5,
            GunshiFairnessFactor: 0.01,
            DiplomacyChance: 0.3,
            GoodwillThreshold: 69,
            AllianceThreshold: 70,
            BreakAllianceDutyFactor: 0.5
        }
    }
};

// 既存コードとの互換窓口。実体はすべて GameConfig 側と同一です。
window.MainParams = window.GameConfig.Main;
window.WarParams = window.GameConfig.War;
window.AIParams = window.GameConfig.AI;
