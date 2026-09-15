/**
 * loyalty_insight_rules.js
 * 忠誠の段階・本人の偽装を一元管理する専門ルール。
 * 面談と軍師所見はここで同じ「表向きの忠誠」を共有する。
 */
class LoyaltyInsightRules {
    static getBands() {
        return ['critical', 'serious', 'dissatisfied', 'danger', 'warning', 'stable'];
    }

    static getBand(loyalty) {
        const value = Math.max(0, Math.min(100, Number(loyalty) || 0));
        const stableMin = Number(window.MainParams.Gunshi.AdviceLoyalty) + 1;
        const warningMin = Number(window.MainParams.Gunshi.DangerLoyalty) + 1;
        const I = window.MainParams.Interview;

        if (value >= stableMin) return 'stable';
        if (value >= warningMin) return 'warning';
        if (value >= I.LoyaltyDangerMin) return 'danger';
        if (value >= I.LoyaltyDissatisfiedMin) return 'dissatisfied';
        if (value >= I.LoyaltySeriousMin) return 'serious';
        return 'critical';
    }


    static getBandMinimum(band) {
        const I = window.MainParams.Interview;
        const stableMin = Number(window.MainParams.Gunshi.AdviceLoyalty) + 1;
        const warningMin = Number(window.MainParams.Gunshi.DangerLoyalty) + 1;
        return {
            critical: 0,
            serious: Number(I.LoyaltySeriousMin),
            dissatisfied: Number(I.LoyaltyDissatisfiedMin),
            danger: Number(I.LoyaltyDangerMin),
            warning: warningMin,
            stable: stableMin
        }[band] ?? 0;
    }

    static shiftBand(band, steps) {
        const bands = this.getBands();
        const index = bands.indexOf(band);
        if (index < 0) return band;
        const shift = Math.floor(Number(steps) || 0);
        const next = Math.max(0, Math.min(bands.length - 1, index + shift));
        return bands[next];
    }

    static getBandSeverity(band) {
        const index = this.getBands().indexOf(band);
        return index < 0 ? 0 : Math.max(0, this.getBands().length - 1 - index);
    }

    static getAlertLevel(band) {
        if (band === 'warning') return 'orange';
        if (['danger', 'dissatisfied', 'serious', 'critical'].includes(band)) return 'red';
        return 'none';
    }

    static getConcealmentProfile(busho) {
        const I = window.MainParams.Interview;
        const actualLoyalty = Math.max(0, Math.min(100, Number(busho && busho.loyalty) || 0));
        const intelligence = Math.max(0, Math.min(100, Number(busho && busho.intelligence) || 0));
        const actualBand = this.getBand(actualLoyalty);
        let requestedShift = 0;

        if (intelligence >= I.ConcealHighIntelligence) {
            requestedShift = I.ConcealHighBandShift;
        } else if (intelligence >= I.ConcealMidIntelligence) {
            requestedShift = I.ConcealMidBandShift;
        }

        const perceivedBand = this.shiftBand(actualBand, requestedShift);
        const perceivedLoyalty = requestedShift > 0
            ? Math.max(actualLoyalty, this.getBandMinimum(perceivedBand))
            : actualLoyalty;
        const bands = this.getBands();
        const actualIndex = bands.indexOf(actualBand);
        const perceivedIndex = bands.indexOf(perceivedBand);
        const bandShift = Math.max(0, perceivedIndex - actualIndex);

        return {
            actualLoyalty,
            actualBand,
            perceivedBand,
            perceivedLoyalty,
            bandShift,
            isConcealing: bandShift > 0,
            level: bandShift >= 2 ? 'strong' : (bandShift === 1 ? 'moderate' : 'none')
        };
    }
}

window.LoyaltyInsightRules = LoyaltyInsightRules;
