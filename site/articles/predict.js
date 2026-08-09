/*
 * Recursivo Politics - browser inference engine.
 * A faithful port of recursivo_politics/engine.py. Pure client-side: load
 * rates.json once, then forecast() any race with no backend.
 *
 *   const rp = await RecursivoPolitics.load("rates.json");
 *   rp.forecast({ office: "governador", leadPP: 8, days: 45, incumbent: 1, regime: "right" });
 */
(function (global) {
  "use strict";

  function leadBin(x) {
    if (x <= -10) return "L_lt_-10";
    if (x <= -5) return "L_-10_-5";
    if (x <= 0) return "L_-5_0";
    if (x <= 5) return "L_0_5";
    if (x <= 10) return "L_5_10";
    if (x <= 20) return "L_10_20";
    return "L_gt_20";
  }

  function daysBin(d) {
    if (d <= 7) return "D_leq_7";
    if (d <= 14) return "D_leq_14";
    if (d <= 30) return "D_leq_30";
    if (d <= 60) return "D_leq_60";
    if (d <= 90) return "D_leq_90";
    if (d <= 180) return "D_leq_180";
    return "D_gt_180";
  }

  // erf via Abramowitz & Stegun 7.1.26 (max error 1.5e-7).
  function erf(x) {
    var s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x);
    return s * y;
  }

  function linzer(leadPP, days) {
    var sigma = 4.0 + 0.04 * Math.max(0, days);
    var z = leadPP / Math.max(sigma, 1.0);
    return 0.5 * (1.0 + erf(z / Math.sqrt(2.0)));
  }

  function Model(payload) {
    this.rates = payload.rates;
    this.meta = payload.meta;
    this.nTrain = payload.n_train;
    this.global = payload.meta.global[0];
    this.shrink = payload.meta.shrink;
    this.wCohort = payload.meta.w_cohort;
  }

  Model.prototype.cohort = function (ev) {
    var full = [ev.office, daysBin(ev.days), leadBin(ev.leadPP), ev.incumbent, ev.regime].join("|");
    var cd = ["_cd", ev.office, daysBin(ev.days)].join("|");
    var c = ["_c", ev.office].join("|");
    var p, n, tier;
    if (this.rates[full]) {
      p = this.rates[full][0]; n = this.rates[full][1]; tier = "full";
    } else if (this.rates[cd]) {
      p = this.rates[cd][0]; n = this.rates[cd][1]; tier = "cargo_days";
    } else if (this.rates[c]) {
      p = this.rates[c][0]; n = this.rates[c][1]; tier = "cargo";
    } else {
      p = this.global; n = 0; tier = "global";
    }
    var shrunk = (1 - this.shrink) * p + this.shrink * this.global;
    return { p: shrunk, n: n, tier: tier };
  };

  Model.prototype.forecast = function (ev) {
    var office = ev.office || "presidente";
    var leadPP = +ev.leadPP || 0;
    var days = Math.max(0, +ev.days || 0);
    var incumbent = ev.incumbent ? 1 : 0;
    var regime = ev.regime || "center";
    var coh = this.cohort({ office: office, leadPP: leadPP, days: days, incumbent: incumbent, regime: regime });
    var pl = linzer(leadPP, days);
    var p = (1 - this.wCohort) * pl + this.wCohort * coh.p;
    return {
      pWin: p,
      pLinzer: pl,
      pCohort: coh.p,
      cohortTier: coh.tier,
      cohortN: coh.n,
    };
  };

  var RecursivoPolitics = {
    leadBin: leadBin,
    daysBin: daysBin,
    linzer: linzer,
    Model: Model,
    load: function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("failed to load rates: " + r.status);
        return r.json();
      }).then(function (payload) {
        return new Model(payload);
      });
    },
    fromPayload: function (payload) {
      return new Model(payload);
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = RecursivoPolitics;
  else global.RecursivoPolitics = RecursivoPolitics;
})(typeof window !== "undefined" ? window : this);
