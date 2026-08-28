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
    Meta: {
        Version: 'r286'
    },

    History: {
        // 構造化した行動履歴の保持上限。UIの一時ログとは分離してセーブにも保存する。
        MaxEntries: 500
    },

    Main: {
        StartYear: 1560,
        StartMonth: 4,
        System: {
            UseRandomNames: true
        },
        ScenarioSelection: {
            // 実データのシナリオとは分離した、選択不可のレイアウト確認用スロット数。
            PlaceholderSlots: 8
        },
        Gunshi: {
            AdviceLoyalty: 84,
            DangerLoyalty: 74,
            AdviceQuality: {
                IntelligenceWeight: 0.75,
                LoyaltyWeight: 0.15,
                DutyWeight: 0.10
            },
            LoyaltyInsight: {
                DetectIntelligenceMin: 70,
                DetectGapAllowance: 10,
                DetectDutyWeight: 0.10,
                ReliabilityLoyaltyWeight: 0.65,
                ReliabilityDutyWeight: 0.35,
                SoftReportBelow: 45,
                VerySoftReportBelow: 25
            }
        },
        Diplomacy: {
            Marriage: {
                // 婚姻は基本外交状態を上書きせず、両家の関係に重なる恒久的な補正として扱う。
                SentimentFloor: 75,
                SentimentIncrease: 35,
                GoodwillProbBonus: 20,
                AllianceProbBonus: 25,
                DominateProbBonus: 12,
                SubordinateProbBonus: 12,
                ReinforcementProbBonus: 0.15
            },
            FailureSentiment: {
                Alliance: -4,
                Dominate: -7
            }
        },
        ConversationStanding: {
            // 会話上の格差を数値そのものではなく、呼称・敬語・言い回しへ薄く反映するための閾値。
            // 官位で差が付く大名同士は官位を優先し、同格官位または双方無官の時だけ威信を見る。
            PrestigeMildRatio: 1.20,
            PrestigeClearRatio: 1.50,
            // 功績は非公開値なので、同格付近の人物への敬意を匂わせるだけに使う。
            AchievementRespectGap: 300,
            AchievementStrongGap: 700,
            AchievementRenownMin: 700,
            AchievementLegendMin: 1200
        },
        Interview: {
            // 85/75 は軍師警告の境界を正本として導出する。以下は面談内の細分化だけを管理する。
            LoyaltyDangerMin: 60,
            LoyaltyDissatisfiedMin: 40,
            LoyaltySeriousMin: 25,
            KnowledgeBlindBelow: 40,
            KnowledgeConfidentMin: 62,
            ConcealDetectKnowledgeMin: 68,
            ConcealDetectIntelligenceMin: 75,
            ConcealDetectGapAllowance: 10,
            ConcealHighIntelligence: 90,
            ConcealHighBandShift: 2,
            ConcealMidIntelligence: 70,
            ConcealMidBandShift: 1,
            OtherAssessmentBias: {
                AffinityWeight: 1.0,
                InnovationWeight: 0.35,
                AmbitionWeight: 0.35,
                LoyaltyRestraintWeight: 0.40,
                DutyRestraintWeight: 0.35,
                LordAffinityRestraintWeight: 0.25,
                RestraintStrength: 0.85,
                MaxLoyaltyPenalty: 45,
                BlindSlanderMin: 24,
                // 反主君的な聞き手が「近い立場の相手」を庇う偏り。固定忠誠値ではなく段階点で最大2段階まで。
                ProtectionStep1Min: 10,
                ProtectionStep2Min: 16
            },
            PolicyDisclosure: {
                LoyaltyWeight: 0.65,
                DutyWeight: 0.35,
                FullMin: 70,
                PartialMin: 50
            },
            PolicyAdvice: {
                MaxTopics: 2,
                GunshiIntelligenceDominanceRatio: 1.2,
                ReadinessConcernRatio: 0.85,
                IntrigueCandidateMinProb: 0.15
            },
            Rumor: {
                // 「武将の噂」は面談時だけ軽く周辺地域を走査する。武将ごとの経路探索はしない。
                SearchDepth: 2,
                ExtendedSearchDepth: 3,
                // 70以上を「得意分野」として扱い、噂に上がる専門家も同じ最低値を要求する。
                ExpertMinStat: 70,
                CandidateMinStat: 70,
                CandidateBestGap: 5,
                // 専門分野を持たない聞き手向けの総合人材。魅力を除く5能力合計で判定する。
                GeneralFiveStatMinTotal: 300,
                // 適性A/Sは能力条件と別の「噂になる理由」として扱う。
                AptitudeMinLevel: 4
            }
        },
        Kunishu: {
            CaptureRelationDrop: 20,
            IkkoNetwork: {
                HonganjiDaimyoIdMin: 1019000,
                HonganjiDaimyoIdMax: 1019999,
                ReservedIdMin: 10001,
                ReservedIdMax: 19999,
                RegularDynamicIdMin: 20000,
                MonthlyRelationLinkStep: 1,
                CaptureHonganjiRelationDrop: 5,
                SubjugationHonganjiRelationDrop: 10,
                LocalBacklashHonganjiRelationDrop: 1
            }
        },
        Economy: {
            IncomeGoldRate: 1,
            IncomeFluctuation: 0.15,
            ConsumeRicePerSoldier: 0.03,
            // 米相場は「金1で得られる兵糧量」。2.0なら金1＝兵糧2.0。
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
            // 士気は内部データとして120まで保持できる。100超へ上げられるのは戦争由来の増加だけ。
            MaxMoraleInternal: 120,
            // 兵施しなど通常の内政行動で上げられる士気上限。
            MaxMoraleNormal: 100,
            // 拠点UIの士気ゲージを満タンとして扱う基準。数値表示自体は実値（最大120）を表示する。
            MaxMoraleGauge: 100,
            // 訓練も士気と同じ三層仕様。内部データは120まで保持し、100超へ上げられるのは戦争由来の増加だけ。
            MaxTrainingInternal: 120,
            // 通常の訓練コマンドで上げられる上限。
            MaxTrainingNormal: 100,
            // 拠点UIの訓練ゲージを満タンとして扱う基準。数値表示自体は実値（最大120）を表示する。
            MaxTrainingGauge: 100,
            WarMaxRounds: 15,
            DamageSoldierPower: 0.05,
            WallDefenseEffect: 0.5,
            DamageFluctuation: 0.2
        },
        TroopAllocation: {
            GeneralRatio: 1.3,
            EquipmentMinimumRatio: 0.5,
            MaxTeppoUnitRatio: 0.5,
            // 兵科装備の自動割当では能力値を主軸にしつつ、対応適性1段階につきこの値を加点する。
            EquipmentAptitudeWeight: 6
        },
        FieldAI: {
            // 味方の交戦、とくに総大将の直接交戦をターゲット・移動・攻撃の全段階で同じ基準にする。
            Support: {
                GeneralThreatTargetBonus: 100,
                GeneralSelfThreatTargetBonus: 40,
                EngagedTargetBonus: 55,
                ExtraEngagedAllyBonus: 10,
                EngagedUrgency: 0.7,
                GeneralThreatUrgency: 1.0,
                TerrainPreferenceMinScale: 0.2,
                TerrainPreferenceReduction: 0.8,
                CautionMinScale: 0.15,
                CautionReduction: 0.85,
                ProgressBaseBonus: 30,
                ProgressUrgencyBonus: 20,
                NearTargetBonus: 30,
                AttackOpportunityBonus: 220,
                PreferredAttackTargetBonus: 40
            }
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
            AutoWarDamageRate: 1.0,
            // 大名家所属武将の戦争時忠誠加算。内政と同じ √忠誠 × 係数 を攻防能力へ1回だけ加える。
            LoyaltyBonusFactor: 2
        },
        Faction: {
            AffinityFactorBase: 0.5,
            AffinityDivisor: 25,
            MinRecognition: -100,
            MaxRecognition: 100,
            LoyaltyChangeThreshold: 15,
            NaturalDecay: 10,
            RoninLoyaltyThreshold: 30,
            RoninChanceBase: 0.5,
            RoninChanceMultiplier: 0.5,
            AchievementLeader: 500,
            BattleHistoryOverlapBonus: 2,
            JoinThreshold: 35,
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
            BreakAllianceDutyFactor: 0.5,
            VassalIndependence: {
                // 独立意欲は野望を主軸に、対主家戦力・友好度・従属期間を補助要因とする。
                DesireThreshold: 55,
                AmbitionWeight: 0.55,
                PowerParityWeight: 35,
                LowSentimentWeight: 0.20,
                DutyRestraintWeight: 0.15,
                MonthsMaxBonus: 10,
                // 義理が高いほど、直接敵対より親善・対等同盟への移行を優先する。
                PeacefulDutyWeight: 0.60,
                PeacefulSentimentWeight: 0.25,
                PeacefulLowAmbitionWeight: 0.15,
                PeacefulMarriageBonus: 15,
                PeacefulRouteThreshold: 50,
                PeacefulActionBaseChance: 0.25,
                PeacefulActionDesireScale: 0.005,
                DirectBreakDutySuppression: 0.75
            }
        }
    }
};

// 既存コードとの互換窓口。実体はすべて GameConfig 側と同一です。
window.MainParams = window.GameConfig.Main;
window.WarParams = window.GameConfig.War;
window.AIParams = window.GameConfig.AI;
