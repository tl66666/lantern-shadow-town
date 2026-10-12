/**
 * 灯影古镇 · 提示系统（五层阶梯，逐关换文案）
 * ============================================================
 * 玩家迟迟没充满时自动给提示，逐层升级，第五层"指路"出现后
 * 进入「灵光不灭」——充能不再衰减，保证任何游客都能通关。
 *
 * 节奏：第一层在 当前关.hintDelay 秒后出现，之后每 15 秒升一层。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function Hints(config) {
    this.config = config;
    this.elapsed = 0;   // 进入本关后经过的时间
    this.level = -1;    // 当前展示的提示层（-1 = 还没出过）
    this.fired = 0;     // 已经出过的提示层数
    this._hints = [];
    this._startDelay = 20;
  }

  /** 切关时换文案 + 起始时间 */
  Hints.prototype.setLevel = function (level) {
    this.reset();
    this._hints = (level && level.hints) || [];
    this._startDelay = (level && level.hintDelay) || 20;
  };

  Hints.prototype.reset = function () {
    this.elapsed = 0;
    this.level = -1;
    this.fired = 0;
  };

  /**
   * 每帧调用
   * @returns {{changed:boolean, text?:string, level?:number}}
   */
  Hints.prototype.update = function (dt) {
    this.elapsed += dt;

    var start = this._startDelay;
    var idx = this.elapsed < start
      ? -1
      : Math.floor((this.elapsed - start) / this.config.HINT_INTERVAL);

    if (idx >= this.fired && this.fired < this._hints.length) {
      this.level = this.fired;
      this.fired++;
      return { changed: true, text: this._hints[this.level], level: this.level };
    }
    return { changed: false };
  };

  /** 已经用了多少层提示（用于评分：0 表示全程无提示） */
  Hints.prototype.count = function () {
    return this.fired;
  };

  /** 五层全部出完 → 灵光不灭（充能不再衰减） */
  Hints.prototype.eternal = function () {
    return this.fired >= this._hints.length && this._hints.length > 0;
  };

  MYC.Hints = Hints;

})(window.MYC);
