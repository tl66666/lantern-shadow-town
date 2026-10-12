/**
 * 灯影古镇 · 充能判定（v5 充能制）
 * ============================================================
 * 规则：
 *   1. 光圈照住目标 → 充能进度上涨（速率 = 当前关 charge.rate）
 *      连击加成：连续稳照越久涨得越快——
 *        照住 0~1s 基础速率；1~2s ×1.3；>2s ×1.55（跟手奖励）
 *   2. 照不住（或照到别人）→ 进度快速回落（速率 = 当前关 charge.decay）
 *   3. 「灵光不灭」激活后（第五层提示出现）→ 进度不再衰减，照一点攒一点
 *   4. 进度充满（≥1）→ 本关成功
 * 标称充满时间（稳照）：四关统一约 1.5s，连击加成后实际更快。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var RAMP = [
    { hold: 0,  mul: 1.0 },
    { hold: 1,  mul: 1.3 },
    { hold: 2,  mul: 1.55 }
  ];

  function Success(config) {
    this.config = config;
    this.charge = 0;      // 0~1
    this.covered = false;
    this.eternal = false; // 灵光不灭（第五层提示后）
    this.holdTime = 0;   // 本轮连续照住时长
    this._level = null;
  }

  /** 切关时重置（充能归零、灵光不灭关闭） */
  Success.prototype.reset = function () {
    this.charge = 0;
    this.covered = false;
    this.eternal = false;
    this.holdTime = 0;
  };

  Success.prototype.setLevel = function (level) {
    this._level = level;
    this.reset();
  };

  function rampMul(holdTime) {
    var mul = 1.0;
    for (var i = 0; i < RAMP.length; i++) {
      if (holdTime >= RAMP[i].hold) mul = RAMP[i].mul;
    }
    return mul;
  }

  /** 目标不在场（未登场/已离场）时照着谁都不涨 */
  Success.prototype.update = function (lightPos, targetPos, dt) {
    var level = this._level;
    if (!level) {
      return { covered: false, charge: 0, success: false };
    }

    var capR = level.radius * this.config.CAPTURE_RADIUS_SCALE;
    var covered = false;
    if (lightPos && targetPos) {
      covered = MYC.U.dist(lightPos.x, lightPos.y, targetPos.x, targetPos.y) <= capR;
    }
    this.covered = covered;

    if (covered) {
      this.holdTime += dt;
      this.charge += level.charge.rate * rampMul(this.holdTime) * dt;
    } else {
      this.holdTime = 0;
      if (!this.eternal) {
        this.charge -= level.charge.decay * dt;
      }
    }
    this.charge = MYC.U.clamp(this.charge, 0, 1);

    return {
      covered: covered,
      charge: this.charge,
      success: this.charge >= 1
    };
  };

  MYC.Success = Success;

})(window.MYC);
