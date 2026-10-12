/**
 * 月影城 · 鼠标驱动
 * ============================================================
 * 把鼠标（或手指触摸）的位置换算成 0~1 归一化坐标。
 * 开发阶段和摄像头不可用时的备用方案。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function MouseDriver(config) {
    this.config = config;
    this.pos = { x: 0.5, y: 0.5 };
    // 注意：初值必须是"很久以前"，否则页面刚加载时会被误判成"玩家刚移动过"
    this.lastMove = -1e9;
    this._handler = null;
    // 页面刚加载时浏览器可能自动派发一次 pointermove（并非用户操作），
    // 用这两个字段把它过滤掉，保证待机界面能正常出现。
    this._startedAt = 0;
    this._graceMs = 900;         // 加载后多少毫秒内的移动不算"玩家操作"
    this._cumMove = 0;           // 累计移动量
    this._moves = 0;             // 移动事件次数
    this._cumThreshold = 0.02;   // 累计移动超过屏幕的 2% 才算玩家真的在操作
  }

  MouseDriver.prototype.start = function () {
    var self = this;
    this._startedAt = performance.now();

    this._handler = function (e) {
      var x, y;
      if (e.touches && e.touches.length > 0) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else {
        x = e.clientX;
        y = e.clientY;
      }

      var nx = MYC.U.clamp(x / window.innerWidth, 0, 1);
      var ny = MYC.U.clamp(y / window.innerHeight, 0, 1);

      var moved = Math.abs(nx - self.pos.x) + Math.abs(ny - self.pos.y);
      self.pos.x = nx;
      self.pos.y = ny;

      // 刚加载时的自动事件不计入
      if (performance.now() - self._startedAt < self._graceMs) return;

      // 累计移动量达到阈值、且事件次数足够，才算玩家真的在操作
      self._cumMove += moved;
      self._moves += 1;
      if (self._cumMove < self._cumThreshold || self._moves < 3) return;

      self.lastMove = performance.now();
    };

    window.addEventListener('pointermove', this._handler, { passive: true });
    window.addEventListener('touchmove', this._handler, { passive: true });

    return true;
  };

  MouseDriver.prototype.stop = function () {
    if (this._handler) {
      window.removeEventListener('pointermove', this._handler);
      window.removeEventListener('touchmove', this._handler);
    }
  };

  MouseDriver.prototype.getPosition = function () {
    return this.pos;
  };

  /** 最近 800ms 内有移动就算"在操作" */
  MouseDriver.prototype.hasInput = function () {
    return (performance.now() - this.lastMove) < 800;
  };

  MYC.MouseDriver = MouseDriver;

})(window.MYC);
