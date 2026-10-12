/**
 * 灯影古镇 · 成功演出与终幕特效
 * ============================================================
 * 四种成功演出（每关一种）+ 补天终幕，全部 Canvas 绘制，零素材成本：
 *
 *   lotus    梦鹿：满河莲灯次第亮起，顺水流向桥洞
 *   firework 神马：金色"福"字烟花升空炸开
 *   petal    李白：桃花雨飘落，水中月亮化开成满溪光斑
 *   frame    萌莎：金色画框光环收缩罩住她
 *   skyMend  终幕（电影式时间线，秒）：
 *              0~1.4   夜幕落下，星空与明月渐显，天幕裂痕隐现
 *              0.8~2.0 四印石座在下方依次点亮（梦/福/诗/画）
 *              2.3~4.7 四色光束依次升空，人间灯火随之升腾
 *              4.5~5.4 四光汇聚成五色石光核，冲击波扩散
 *              5.8~8.8 金线自中心向两侧缝合裂痕，四色织线穿梭
 *              8.6~9.6 石座与光束功成身退，星尘开始飘落
 *              9.6+    光痕长明（终幕面板此时浮现）
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var U = MYC.U;
  var TAU = Math.PI * 2;

  var FOUR_COLORS = ['#3FBFB0', '#E0533F', '#F0C040', '#EAE6DA'];

  function Effects(config) {
    this.config = config;
    this.active = null;      // 当前演出 { type, t, anchor, ... }
    this.skyMend = null;     // 终幕
    this.particles = [];
    this.flashes = [];
  }

  Effects.prototype.reset = function () {
    this.active = null;
    this.skyMend = null;
    this.particles = [];
    this.flashes = [];
  };

  /* ============================================================
     注册表：按演出名启动
     ============================================================ */
  Effects.prototype.play = function (name, anchor, light) {
    this.reset();
    var a = { x: (anchor && anchor.x) || 0.5, y: (anchor && anchor.y) || 0.5 };
    if (light) { a.x = light.x; a.y = light.y; }

    var fx = { type: name, t: 0, anchor: a };

    if (name === 'lotus') this._initLotus(fx);
    else if (name === 'firework') this._initFirework(fx);
    else if (name === 'petal') this._initPetal(fx);
    else if (name === 'frame') { /* 无粒子，纯描边动画 */ }

    this.active = fx;
  };

  /* ============================================================
     补天终幕：初始化（所有随机量在此定死，重播一致）
     ============================================================ */
  Effects.prototype.playSkyMend = function () {
    this.reset();

    var i;

    // 星空（只铺上半屏，避开底部终幕面板）
    var stars = [];
    for (i = 0; i < 96; i++) {
      stars.push({
        x: U.rand(0.02, 0.98),
        y: U.rand(0.02, 0.58),
        size: U.rand(0.6, 2.2),
        ph: U.rand(0, TAU),
        tw: U.rand(1.2, 3.6),
        big: U.rand(0, 1) < 0.06   // 少数亮星带十字光芒
      });
    }

    // 天幕裂痕（缝合线）：x 0.08→0.92，弧形 + 抖动
    var crack = [], n = 18;
    for (i = 0; i <= n; i++) {
      var k = i / n;
      crack.push({
        x: U.lerp(0.08, 0.92, k),
        y: 0.165 + Math.sin(k * Math.PI) * 0.05 + U.rand(-0.014, 0.014)
      });
    }

    this.skyMend = {
      t: 0,
      stars: stars,
      crack: crack,
      sparks: [],   // 人间灯火（升腾的暖光点）
      drops: []     // 星尘（缝合后飘落）
    };
  };

  /** 裂痕上 x 处的 y（线性查表） */
  function crackY(crack, x) {
    if (x <= crack[0].x) return crack[0].y;
    for (var i = 0; i < crack.length - 1; i++) {
      if (x >= crack[i].x && x <= crack[i + 1].x) {
        var k = (x - crack[i].x) / (crack[i + 1].x - crack[i].x);
        return U.lerp(crack[i].y, crack[i + 1].y, k);
      }
    }
    return crack[crack.length - 1].y;
  }

  /* ---------------- 演出初始化 ---------------- */

  /** 满河莲灯：从埠头向两岸扩散 */
  Effects.prototype._initLotus = function (fx) {
    var a = fx.anchor;
    fx.lamps = [];
    var N = 26;
    for (var i = 0; i < N; i++) {
      var side = i % 2 === 0 ? -1 : 1;
      var rank = Math.floor(i / 2);
      fx.lamps.push({
        x: U.clamp(a.x + side * (0.05 + rank * 0.055) + U.rand(-0.02, 0.02), 0.02, 0.98),
        y: U.clamp(a.y + U.rand(-0.10, 0.13) + rank * 0.012, 0.03, 0.97),
        delay: 0.15 + rank * 0.22 + U.rand(0, 0.12),
        drift: U.rand(0.008, 0.02),      // 随流向桥洞（向左）漂
        size: U.rand(0.008, 0.013),
        hue: U.pick(['#ffd88a', '#ffb45c', '#ffe8b8', '#ff9a5c'])
      });
    }
  };

  /** 福字烟花：一发光点升空 + 金色炸裂 + "福"字显现 */
  Effects.prototype._initFirework = function (fx) {
    var a = fx.anchor;
    fx.rocket = { x: a.x, y: a.y, t: 0, riseT: 1.05, top: U.clamp(a.y - 0.38, 0.06, 0.35) };
    fx.burstAt = null;
    fx.charT = -1;
  };

  /** 桃花雨：全屏花瓣 + 水面月光斑 */
  Effects.prototype._initPetal = function (fx) {
    fx.petals = [];
    for (var i = 0; i < 34; i++) {
      fx.petals.push({
        x: U.rand(0, 1),
        y: U.rand(-0.5, 0),
        vy: U.rand(0.05, 0.11),
        sway: U.rand(0.02, 0.06),
        swayF: U.rand(0.8, 2.0),
        rot: U.rand(0, TAU),
        vr: U.rand(-2.5, 2.5),
        size: U.rand(0.006, 0.012),
        tint: U.pick(['rgba(255,183,197,', 'rgba(255,158,180,', 'rgba(255,205,215,'])
      });
    }
    fx.spots = [];
    for (var s = 0; s < 7; s++) {
      fx.spots.push({
        x: 0.30 + s * 0.065 + U.rand(-0.02, 0.02),
        y: 0.80 + U.rand(-0.04, 0.04),
        r: U.rand(0.03, 0.06),
        delay: U.rand(0.2, 1.2),
        ph: U.rand(0, TAU)
      });
    }
  };

  /* ============================================================
     每帧推进
     ============================================================ */
  Effects.prototype.update = function (dt) {
    if (this.active) this.active.t += dt;
    if (this.skyMend) this.skyMend.t += dt;

    for (var i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t > this.flashes[i].life) this.flashes.splice(i, 1);
    }

    var fx = this.active;
    if (fx) {
      // 烟花火箭与炸裂
      if (fx.type === 'firework') {
        var r = fx.rocket;
        if (!fx.burstAt) {
          r.t += dt;
          if (r.t >= r.riseT) {
            var k = U.smoothstep(0, 1, Math.min(1, r.t / r.riseT));
            var bx = r.x + Math.sin(r.t * 3) * 0.015;
            var by = U.lerp(r.y, r.top, k);
            fx.burstAt = { x: bx, y: by, t: 0 };
            fx.charT = 0;
            this._spawnBurst(bx, by);
          }
        } else {
          fx.burstAt.t += dt;
        }
      }
    }

    // 终幕：人间灯火升腾 + 星尘飘落
    var sm = this.skyMend;
    if (sm) {
      var t = sm.t;

      // 灯火：面板出现前 44 盏、之后减为 20 盏细水长流
      var target = t > 9.6 ? 20 : 44;
      while (t > 2.6 && sm.sparks.length < target) {
        sm.sparks.push({
          x: U.rand(0.02, 0.98), y: 1.02,
          v: U.rand(0.028, 0.075),
          sway: U.rand(0.006, 0.02),
          ph: U.rand(0, TAU),
          size: U.rand(1.0, 2.6)
        });
      }
      for (var s = sm.sparks.length - 1; s >= 0; s--) {
        var sp = sm.sparks[s];
        sp.y -= sp.v * dt;
        if (sp.y < 0.26) sm.sparks.splice(s, 1);   // 升到天幕附近化作星光
      }

      // 星尘：缝合开始后从光痕飘落
      if (t > 6.4 && Math.random() < dt * 11) {
        sm.drops.push({
          x: U.rand(0.09, 0.91), y: crackY(sm.crack, U.rand(0.09, 0.91)) + 0.01,
          v: U.rand(0.05, 0.13),
          ph: U.rand(0, TAU),
          size: U.rand(1.0, 2.6),
          tint: U.pick(['255,246,222', '255,246,222', '63,191,176', '224,83,63', '240,192,64'])
        });
      }
      for (var d = sm.drops.length - 1; d >= 0; d--) {
        var dr = sm.drops[d];
        dr.y += dr.v * dt;
        dr.x += Math.sin(t * 2.2 + dr.ph) * 0.03 * dt;
        if (dr.y > 0.72) sm.drops.splice(d, 1);
      }
    }
  };

  Effects.prototype._spawnBurst = function (x, y) {
    for (var i = 0; i < 42; i++) {
      var a = U.rand(0, TAU);
      var sp = U.rand(0.06, 0.26);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.9,
        life: U.rand(0.9, 1.8),
        maxLife: 1.8,
        size: U.rand(1.5, 3.6),
        tint: U.pick(['255,214,120', '255,236,180', '255,180,90'])
      });
    }
    this.flashes.push({ x: x, y: y, t: 0, life: 0.5, type: 'ring' });
  };

  /* ============================================================
     绘制
     ============================================================ */
  Effects.prototype.draw = function (ctx, view, time) {
    this._drawParticles(ctx, view);
    if (this.active) this._drawActive(ctx, view, time);
    if (this.skyMend) this._drawSkyMend(ctx, view, time);
  };

  /* ---------------- 通用粒子（烟花碎屑） ---------------- */
  Effects.prototype._drawParticles = function (ctx, view) {
    if (!this.particles.length) return;
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.vy += 0.09 * 0.016;
      p.life -= 0.016;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      var a = U.clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = 'rgba(' + p.tint + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(view.px(p.x), view.py(p.y), p.size, 0, TAU);
      ctx.fill();
    }
  };

  /* ---------------- 各演出 ---------------- */
  Effects.prototype._drawActive = function (ctx, view, time) {
    var fx = this.active;
    var t = fx.t;

    if (fx.type === 'lotus') this._drawLotus(ctx, view, fx, time);
    else if (fx.type === 'firework') this._drawFirework(ctx, view, fx, time);
    else if (fx.type === 'petal') this._drawPetal(ctx, view, fx, time);
    else if (fx.type === 'frame') this._drawFrame(ctx, view, fx, time);

    // 演出本体 4.5 秒后自然淡出（结算板已接管画面）
    if (t > 4.5) this.active = null;
  };

  /** 满河莲灯 */
  Effects.prototype._drawLotus = function (ctx, view, fx, time) {
    var t = fx.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < fx.lamps.length; i++) {
      var L = fx.lamps[i];
      var k = U.smoothstep(L.delay, L.delay + 0.8, t);
      if (k <= 0) continue;
      var x = L.x - L.drift * Math.min(t - L.delay, 3);
      var y = L.y + Math.sin(time * 1.6 + i * 1.3) * 0.004;
      var px = view.px(x), py = view.py(y);
      var R = view.w * L.size * (0.6 + 0.4 * k);

      // 灯芯光晕
      var g = ctx.createRadialGradient(px, py, 0, px, py, R * 4);
      g.addColorStop(0, U.rgba(L.hue, 0.85 * k));
      g.addColorStop(0.4, U.rgba(L.hue, 0.28 * k));
      g.addColorStop(1, U.rgba(L.hue, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, R * 4, 0, TAU); ctx.fill();

      // 莲灯轮廓（简笔：外圈花瓣）
      ctx.strokeStyle = U.rgba(L.hue, 0.9 * k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, R, 0.2, Math.PI - 0.2);          // 下半圆（灯体）
      ctx.stroke();
      for (var pt = 0; pt < 5; pt++) {                   // 上缘花瓣
        var pa = Math.PI * (1.08 + pt * 0.21);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(pa) * R * 0.92, py + Math.sin(pa) * R * 0.92);
        ctx.lineTo(px + Math.cos(pa) * R * 0.92, py + Math.sin(pa) * R * 0.92 - R * 0.5);
        ctx.stroke();
      }

      // 水面倒影
      ctx.fillStyle = U.rgba(L.hue, 0.16 * k);
      ctx.beginPath();
      ctx.ellipse(px, py + R * 2.4, R * 1.6, R * 0.5, 0, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  };

  /** 福字烟花 */
  Effects.prototype._drawFirework = function (ctx, view, fx, time) {
    var r = fx.rocket;
    ctx.save();

    // 上升的光点 + 拖尾
    if (!fx.burstAt) {
      var k = U.smoothstep(0, 1, r.t / r.riseT);
      var x = r.x + Math.sin(r.t * 3) * 0.015;
      var y = U.lerp(r.y, r.top, k);
      var px = view.px(x), py = view.py(y);

      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(px, py, 0, px, py, 26);
      g.addColorStop(0, 'rgba(255,240,190,0.95)');
      g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 26, 0, TAU); ctx.fill();

      ctx.strokeStyle = 'rgba(255,210,120,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(view.px(r.x + Math.sin((r.t - 0.1) * 3) * 0.015), view.py(U.lerp(r.y, r.top, Math.max(0, k - 0.12))));
      ctx.stroke();
    } else {
      // 炸开后的"福"字
      var bt = fx.burstAt.t;
      var charA = U.smoothstep(0.55, 1.3, bt) * (1 - U.smoothstep(3.2, 4.4, bt));
      if (charA > 0) {
        var bx = view.px(fx.burstAt.x), by = view.py(fx.burstAt.y);
        var size = view.w * 0.085 * (0.8 + 0.2 * U.smoothstep(0.55, 1.1, bt));

        ctx.globalCompositeOperation = 'lighter';
        var cg = ctx.createRadialGradient(bx, by, 0, bx, by, size * 1.4);
        cg.addColorStop(0, 'rgba(255,214,120,' + (0.4 * charA).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(255,180,70,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(bx, by, size * 1.4, 0, TAU); ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,240,200,' + charA.toFixed(3) + ')';
        ctx.font = '600 ' + Math.round(size) + 'px "KaiTi", "STKaiti", "SimSun", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,200,100,' + (0.9 * charA).toFixed(3) + ')';
        ctx.shadowBlur = 24;
        ctx.fillText('福', bx, by);
        ctx.shadowBlur = 0;
      }
    }

    // 扩散光环
    for (var i = 0; i < this.flashes.length; i++) {
      var f = this.flashes[i];
      if (f.type !== 'ring') continue;
      var p = f.t / f.life;
      var fr = 30 + p * view.w * 0.16;
      ctx.strokeStyle = 'rgba(255,226,150,' + ((1 - p) * 0.7).toFixed(3) + ')';
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(view.px(f.x), view.py(f.y), fr, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  };

  /** 桃花雨 + 月光斑 */
  Effects.prototype._drawPetal = function (ctx, view, fx, time) {
    var t = fx.t;
    ctx.save();

    // 花瓣
    for (var i = 0; i < fx.petals.length; i++) {
      var p = fx.petals[i];
      var fall = Math.min(1, t / 2.6);
      var y = (p.y + p.vy * t * fall) % 1.15;
      if (y > 1.05) continue;
      var x = p.x + Math.sin(t * p.swayF + i) * p.sway;
      var px = view.px(x), py = view.py(y);
      var s = view.w * p.size;
      var rot = p.rot + p.vr * t;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.fillStyle = p.tint + '0.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.tint + '0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 水面月光光斑（下半屏）
    ctx.globalCompositeOperation = 'lighter';
    for (var s2 = 0; s2 < fx.spots.length; s2++) {
      var sp = fx.spots[s2];
      var k = U.smoothstep(sp.delay, sp.delay + 1.0, t);
      if (k <= 0) continue;
      var sx = view.px(sp.x + Math.sin(time * 0.9 + sp.ph) * 0.006);
      var sy = view.py(sp.y + Math.cos(time * 0.7 + sp.ph) * 0.004);
      var sr = view.w * sp.r;
      var gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      gg.addColorStop(0, 'rgba(255,244,214,' + (0.5 * k).toFixed(3) + ')');
      gg.addColorStop(0.5, 'rgba(255,234,190,' + (0.18 * k).toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * 0.45, 0, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  };

  /** 金色画框光环 */
  Effects.prototype._drawFrame = function (ctx, view, fx, time) {
    var t = fx.t;
    var a = fx.anchor;

    // 从大到小收缩：0~1.1s
    var shrink = 1 - U.smoothstep(0, 1.1, t);
    var hold = t < 1.1 ? 0 : U.smoothstep(1.1, 1.6, t);

    var w0 = view.w * 0.85, h0 = view.w * 0.55;
    var w1 = view.w * 0.24, h1 = view.w * 0.15;
    var w = U.lerp(w1, w0, shrink);
    var h = U.lerp(h1, h0, shrink);

    var cx = view.px(a.x), cy = view.py(a.y);
    var alpha = 1 - U.smoothstep(3.6, 4.5, t);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.75);
    g.addColorStop(0, 'rgba(255,226,170,' + (0.22 + 0.18 * hold).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.75, 0, TAU); ctx.fill();
    ctx.restore();

    // 画框（圆角矩形描边，双线）
    var glowA = 0.55 + 0.4 * Math.sin(time * 3);
    ctx.strokeStyle = 'rgba(255,226,150,' + glowA.toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255,206,110,0.9)';
    ctx.shadowBlur = 18;
    U.roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.12);
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255,244,210,0.75)';
    ctx.lineWidth = 1.2;
    U.roundRect(ctx, cx - w / 2 + 7, cy - h / 2 + 7, w - 14, h - 14, Math.min(w, h) * 0.09);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 四角饰点（收缩到位后点亮）
    if (hold > 0) {
      ctx.fillStyle = 'rgba(255,248,220,' + hold.toFixed(3) + ')';
      var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (var i = 0; i < 4; i++) {
        var kx = cx + corners[i][0] * (w / 2 - 3);
        var ky = cy + corners[i][1] * (h / 2 - 3);
        var tw = 0.7 + 0.3 * Math.sin(time * 4 + i * 1.6);
        ctx.beginPath();
        ctx.arc(kx, ky, 5 * tw, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  /* ============================================================
     补天终幕绘制：夜幕 → 星空明月 → 裂痕 → 四印石座 → 光束 →
     五色石光核 → 金线缝合 + 四色织线 → 灯火升腾 → 星尘
     ============================================================ */
  Effects.prototype._drawSkyMend = function (ctx, view, time) {
    var sm = this.skyMend;
    if (!sm) return;
    var t = sm.t;

    var fade = 1 - U.smoothstep(46, 48, t);
    if (fade <= 0) { this.skyMend = null; return; }

    var nightK = U.smoothstep(0, 1.4, t);
    var starK  = U.smoothstep(0.5, 1.9, t);
    var moonK  = U.smoothstep(0.8, 2.0, t);
    var crackK = U.smoothstep(1.6, 2.6, t);
    var coreK  = U.smoothstep(4.4, 5.4, t);
    var weave  = U.smoothstep(5.8, 8.8, t);
    var groundFade = 1 - U.smoothstep(8.6, 9.8, t);   // 石座/光束功成身退
    var captionA = weave * (1 - U.smoothstep(9.0, 9.7, t));

    ctx.save();
    ctx.globalAlpha = fade;

    /* ---------- 1) 夜幕落下 ---------- */
    if (nightK > 0) {
      var ng = ctx.createLinearGradient(0, view.y, 0, view.y + view.h);
      ng.addColorStop(0, 'rgba(3, 5, 14,' + (0.92 * nightK).toFixed(3) + ')');
      ng.addColorStop(0.55, 'rgba(6, 9, 20,' + (0.86 * nightK).toFixed(3) + ')');
      ng.addColorStop(1, 'rgba(2, 4, 10,' + (0.95 * nightK).toFixed(3) + ')');
      ctx.fillStyle = ng;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }

    /* ---------- 2) 星空 + 明月 ---------- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < sm.stars.length; i++) {
      var st = sm.stars[i];
      var tw = 0.45 + 0.55 * Math.sin(time * st.tw + st.ph);
      var sa = starK * tw;
      var sx = view.px(st.x), sy = view.py(st.y);
      ctx.fillStyle = 'rgba(226, 236, 255,' + (sa * 0.9).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, st.size, 0, TAU);
      ctx.fill();
      if (st.big && sa > 0.55) {
        ctx.strokeStyle = 'rgba(226, 236, 255,' + ((sa - 0.55) * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 1;
        var fl = st.size * 4.5;
        ctx.beginPath();
        ctx.moveTo(sx - fl, sy); ctx.lineTo(sx + fl, sy);
        ctx.moveTo(sx, sy - fl); ctx.lineTo(sx, sy + fl);
        ctx.stroke();
      }
    }
    if (moonK > 0) {
      var mx = view.px(0.84), my = view.py(0.085);
      var mr = view.w * 0.032;
      var halo = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 5);
      halo.addColorStop(0, 'rgba(255, 246, 214,' + (0.30 * moonK).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(255, 246, 214,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, TAU); ctx.fill();
      var mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, 'rgba(255, 252, 238,' + (0.98 * moonK).toFixed(3) + ')');
      mg.addColorStop(0.75, 'rgba(248, 238, 208,' + (0.92 * moonK).toFixed(3) + ')');
      mg.addColorStop(1, 'rgba(226, 214, 182,' + (0.55 * moonK).toFixed(3) + ')');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    }
    ctx.restore();

    /* ---------- 3) 天幕裂痕（待补的缝） ---------- */
    if (crackK > 0) {
      var riftA = crackK * (0.62 * (1 - weave * 0.85) + 0.09);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var c = 0; c < sm.crack.length; c++) {
        var cp = sm.crack[c];
        if (c === 0) ctx.moveTo(view.px(cp.x), view.py(cp.y));
        else ctx.lineTo(view.px(cp.x), view.py(cp.y));
      }
      ctx.strokeStyle = 'rgba(30, 16, 48,' + riftA.toFixed(3) + ')';
      ctx.lineWidth = view.w * 0.0075;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(8, 4, 16,' + (riftA * 0.9).toFixed(3) + ')';
      ctx.lineWidth = view.w * 0.0032;
      ctx.stroke();
      ctx.restore();
    }

    /* ---------- 4) 人间灯火升腾 ---------- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var s2 = 0; s2 < sm.sparks.length; s2++) {
      var sp = sm.sparks[s2];
      var riseFade = U.clamp((sp.y - 0.26) / 0.12, 0, 1);
      var flick = 0.72 + 0.28 * Math.sin(time * 5 + sp.ph);
      var spx = view.px(sp.x + Math.sin(time * 0.9 + sp.ph) * sp.sway);
      var spy = view.py(sp.y);
      var srr = sp.size * 3.2;
      var sg = ctx.createRadialGradient(spx, spy, 0, spx, spy, srr);
      sg.addColorStop(0, 'rgba(255, 208, 130,' + (0.85 * flick * riseFade).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(spx, spy, srr, 0, TAU); ctx.fill();
    }
    ctx.restore();

    /* ---------- 5) 四印石座 ---------- */
    var bases = [0.20, 0.40, 0.60, 0.80];
    var glyphs = ['梦', '福', '诗', '画'];
    var pedY = 0.885;

    for (var b = 0; b < 4; b++) {
      var gk = U.smoothstep(0.8 + b * 0.28, 1.5 + b * 0.28, t) * groundFade;
      if (gk <= 0.01) continue;
      var rgb = hexRgbStr(FOUR_COLORS[b]);
      var bx = view.px(bases[b]);
      var by = view.py(pedY);
      var discR = view.w * 0.030;

      ctx.save();
      var dg = ctx.createRadialGradient(bx - discR * 0.3, by - discR * 0.35, discR * 0.1, bx, by, discR);
      dg.addColorStop(0, 'rgba(46, 44, 58,' + (0.92 * gk).toFixed(3) + ')');
      dg.addColorStop(1, 'rgba(14, 14, 24,' + (0.92 * gk).toFixed(3) + ')');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(bx, by, discR, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.75 * gk).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      var breathe = 0.8 + 0.2 * Math.sin(time * 2 + b * 1.4);
      var glow2 = ctx.createRadialGradient(bx, by, 0, bx, by, discR * 3.4);
      glow2.addColorStop(0, 'rgba(' + rgb + ',' + (0.30 * gk * breathe).toFixed(3) + ')');
      glow2.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = glow2;
      ctx.beginPath(); ctx.arc(bx, by, discR * 3.4, 0, TAU); ctx.fill();

      ctx.font = '600 ' + Math.round(discR * 1.05) + 'px "KaiTi","STKaiti","SimSun",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(' + rgb + ',0.95)';
      ctx.shadowBlur = 16 * breathe;
      ctx.fillStyle = 'rgba(255, 252, 242,' + gk.toFixed(3) + ')';
      ctx.fillText(glyphs[b], bx, by + 1);
      ctx.shadowBlur = 0;

      var lp = (t - (0.8 + b * 0.28)) / 0.7;
      if (lp > 0 && lp < 1) {
        ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - lp) * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 2.5 * (1 - lp) + 0.5;
        ctx.beginPath(); ctx.arc(bx, by, discR * (1 + lp * 2.6), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------- 6) 四色光束升空 ---------- */
    var apex = { x: 0.5, y: 0.165 };
    var beamFade = 1 - U.smoothstep(8.8, 10.4, t);

    for (var m = 0; m < 4; m++) {
      var bk = U.clamp((t - (2.3 + m * 0.32)) / 1.2, 0, 1);
      if (bk <= 0 || beamFade <= 0.01) continue;
      var rgb2 = hexRgbStr(FOUR_COLORS[m]);
      var sx0 = view.px(bases[m]);
      var sy0 = view.py(pedY - 0.028);
      var ex = view.px(apex.x);
      var ey = view.py(apex.y);
      var ke = Math.pow(bk, 0.85);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      for (var q = 1; q <= 18; q++) {
        var kk = (q / 18) * ke;
        var cxp = U.lerp(sx0, ex, kk) + Math.sin(kk * 6.2 + m * 1.7) * view.w * 0.016 * (1 - kk);
        var cyp = U.lerp(sy0, ey, kk);
        ctx.lineTo(cxp, cyp);
      }
      ctx.strokeStyle = 'rgba(' + rgb2 + ',' + (0.20 * beamFade).toFixed(3) + ')';
      ctx.lineWidth = view.w * 0.020;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb2 + ',' + (0.55 * beamFade).toFixed(3) + ')';
      ctx.lineWidth = view.w * 0.007;
      ctx.shadowColor = 'rgba(' + rgb2 + ',0.9)';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (bk < 1) {
        var headX = U.lerp(sx0, ex, ke) + Math.sin(ke * 6.2 + m * 1.7) * view.w * 0.016 * (1 - ke);
        var headY = U.lerp(sy0, ey, ke);
        var hg2 = ctx.createRadialGradient(headX, headY, 0, headX, headY, view.w * 0.026);
        hg2.addColorStop(0, 'rgba(255, 255, 248, 0.95)');
        hg2.addColorStop(0.35, 'rgba(' + rgb2 + ',0.8)');
        hg2.addColorStop(1, 'rgba(' + rgb2 + ',0)');
        ctx.fillStyle = hg2;
        ctx.beginPath(); ctx.arc(headX, headY, view.w * 0.026, 0, TAU); ctx.fill();

        if (Math.random() < 0.4) {
          this.particles.push({
            x: (headX - view.x) / view.w,
            y: (headY - view.y) / view.h,
            vx: U.rand(-0.02, 0.02), vy: U.rand(-0.03, 0.02),
            life: U.rand(0.4, 0.9), maxLife: 0.9,
            size: U.rand(1.2, 2.6), tint: rgb2
          });
        }
      }
      ctx.restore();
    }

    /* ---------- 7) 五色石光核（汇聚） ---------- */
    if (coreK > 0) {
      var ax = view.px(apex.x), ay = view.py(apex.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      var flashK = U.smoothstep(4.4, 4.55, t) * (1 - U.smoothstep(4.55, 5.1, t));
      if (flashK > 0) {
        var fg2 = ctx.createRadialGradient(ax, ay, 0, ax, ay, view.w * 0.34);
        fg2.addColorStop(0, 'rgba(255, 253, 244,' + (0.85 * flashK).toFixed(3) + ')');
        fg2.addColorStop(1, 'rgba(255, 250, 230,0)');
        ctx.fillStyle = fg2;
        ctx.beginPath(); ctx.arc(ax, ay, view.w * 0.34, 0, TAU); ctx.fill();
      }

      var pulse = 0.82 + 0.18 * Math.sin(time * 2.1);
      var coreR = view.w * 0.040 * pulse;
      var cg2 = ctx.createRadialGradient(ax, ay, 0, ax, ay, coreR * 2.6);
      cg2.addColorStop(0, 'rgba(255, 253, 242,' + (0.95 * coreK).toFixed(3) + ')');
      cg2.addColorStop(0.35, 'rgba(255, 238, 200,' + (0.55 * coreK).toFixed(3) + ')');
      cg2.addColorStop(1, 'rgba(255, 220, 160,0)');
      ctx.fillStyle = cg2;
      ctx.beginPath(); ctx.arc(ax, ay, coreR * 2.6, 0, TAU); ctx.fill();

      for (var o = 0; o < 4; o++) {
        var oa = time * 0.9 + o * Math.PI / 2;
        var ox = ax + Math.cos(oa) * coreR * 1.55;
        var oy = ay + Math.sin(oa) * coreR * 0.62;
        var orgb = hexRgbStr(FOUR_COLORS[o]);
        var og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7);
        og.addColorStop(0, 'rgba(' + orgb + ',0.95)');
        og.addColorStop(1, 'rgba(' + orgb + ',0)');
        ctx.fillStyle = og;
        ctx.beginPath(); ctx.arc(ox, oy, 7, 0, TAU); ctx.fill();
      }

      for (var wv = 0; wv < 2; wv++) {
        var wt = t - (4.5 + wv * 0.5);
        if (wt > 0 && wt < 1.5) {
          var wp = wt / 1.5;
          ctx.strokeStyle = 'rgba(255, 240, 205,' + ((1 - wp) * 0.45).toFixed(3) + ')';
          ctx.lineWidth = 3 * (1 - wp) + 0.6;
          ctx.beginPath();
          ctx.ellipse(ax, ay, view.w * (0.03 + wp * 0.30), view.w * (0.012 + wp * 0.12), 0, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---------- 8) 金线缝合 + 四色织线 ---------- */
    if (weave > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      var half = weave * 0.5;
      var breath = weave >= 1 ? (0.72 + 0.28 * Math.sin(time * 1.5)) : 1;

      ctx.strokeStyle = 'rgba(255, 218, 128,' + (0.9 * breath).toFixed(3) + ')';
      ctx.lineWidth = view.w * 0.0062;
      ctx.shadowColor = 'rgba(255, 206, 110, 0.9)';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      var started = false;
      for (var c2 = 0; c2 < sm.crack.length; c2++) {
        var u = c2 / (sm.crack.length - 1);
        if (Math.abs(u - 0.5) > half + 0.001) { started = false; continue; }
        var cpt = sm.crack[c2];
        if (!started) { ctx.moveTo(view.px(cpt.x), view.py(cpt.y)); started = true; }
        else ctx.lineTo(view.px(cpt.x), view.py(cpt.y));
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (weave < 1) {
        for (var dir = -1; dir <= 1; dir += 2) {
          var ux = 0.5 + dir * half;
          var hx2 = U.lerp(sm.crack[0].x, sm.crack[sm.crack.length - 1].x, ux);
          var hy2 = crackY(sm.crack, hx2);
          var hpx = view.px(hx2), hpy = view.py(hy2);
          var hgr = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, view.w * 0.016);
          hgr.addColorStop(0, 'rgba(255, 253, 240, 0.95)');
          hgr.addColorStop(1, 'rgba(255, 220, 150,0)');
          ctx.fillStyle = hgr;
          ctx.beginPath(); ctx.arc(hpx, hpy, view.w * 0.016, 0, TAU); ctx.fill();
        }
      }

      for (var th = 0; th < 4; th++) {
        var trgb = hexRgbStr(FOUR_COLORS[th]);
        ctx.strokeStyle = 'rgba(' + trgb + ',' + (0.42 * weave).toFixed(3) + ')';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        var begun = false;
        for (var c3 = 0; c3 <= 40; c3++) {
          var uu = c3 / 40;
          if (Math.abs(uu - 0.5) > half + 0.001) { begun = false; continue; }
          var xx = U.lerp(sm.crack[0].x, sm.crack[sm.crack.length - 1].x, uu);
          var yy = crackY(sm.crack, xx) + Math.sin(uu * 13 + time * (1.1 + th * 0.22) + th * 1.7) * 0.016;
          if (!begun) { ctx.moveTo(view.px(xx), view.py(yy)); begun = true; }
          else ctx.lineTo(view.px(xx), view.py(yy));
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---------- 9) 星尘飘落 ---------- */
    if (sm.drops.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var d2 = 0; d2 < sm.drops.length; d2++) {
        var dd = sm.drops[d2];
        var da = U.clamp(1 - (dd.y - 0.2) / 0.5, 0, 1) * 0.85;
        ctx.fillStyle = 'rgba(' + dd.tint + ',' + da.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(view.px(dd.x), view.py(dd.y), dd.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ---------- 10) 演出字幕 ---------- */
    if (captionA > 0) {
      ctx.save();
      ctx.globalAlpha = fade * captionA;
      ctx.font = '500 ' + Math.round(view.w * 0.024) + 'px "KaiTi","STKaiti","SimSun",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(255, 240, 205, 0.95)';
      ctx.fillText('四印归一 · 灵光织天', view.px(0.5), view.py(0.315));
      ctx.restore();
    }

    ctx.restore();
  };

  function hexRgbStr(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  MYC.Effects = Effects;

})(window.MYC);
