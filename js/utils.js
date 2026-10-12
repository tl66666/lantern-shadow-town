/**
 * 月影城 · 通用小工具
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var U = {};

  /** 把 v 限制在 [a, b] 之间 */
  U.clamp = function (v, a, b) {
    return v < a ? a : (v > b ? b : v);
  };

  /** 线性插值：t=0 返回 a，t=1 返回 b */
  U.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  /** 平滑插值（S 曲线），用于淡入淡出 */
  U.smoothstep = function (e0, e1, x) {
    var t = U.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /** 两点距离（归一化坐标下同样适用） */
  U.dist = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /** 指数移动平均：让抖动的位置变平滑。alpha 越小越平滑但越迟钝 */
  U.ema = function (prev, next, alpha) {
    return prev + (next - prev) * alpha;
  };

  /** 角度转弧度 */
  U.rad = function (deg) {
    return deg * Math.PI / 180;
  };

  /** [a, b) 之间的随机浮点数 */
  U.rand = function (a, b) {
    return a + Math.random() * (b - a);
  };

  /** [a, b] 之间的随机整数 */
  U.randInt = function (a, b) {
    return Math.floor(a + Math.random() * (b - a + 1));
  };

  /** 从数组里随机取一个 */
  U.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  /** 当前时间（秒） */
  U.now = function () {
    return performance.now() / 1000;
  };

  /** 画圆角矩形（兼容不支持 ctx.roundRect 的环境） */
  U.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /** 十六进制颜色转 rgba 字符串 */
  U.rgba = function (hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };

  MYC.U = U;

})(window.MYC);
