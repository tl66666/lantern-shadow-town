/**
 * 灯影古镇 · 渲染器（核心视觉效果）
 * ============================================================
 * 这一层负责把"沉睡的古镇"和"灯照亮的活镇"合成到一张画布上：
 *
 *   1. 底：静止首帧 → 压暗 + 深蓝染色 + 暗角 = 沉睡的灯影古镇
 *   2. 中：梦灯内的圆形区域 → 画当前视频帧（满亮度、本关灵色）
 *   3. 上：羽化过渡 + 灵色光晕 + 灯圈细边 + 星尘
 *   4. 「灵光」充能环：灯圈外缘一圈，照住目标点亮上涨、失照快速黯淡
 *   5. 最上：成功特效、调试标记
 *
 * "灯一照，古镇就活了"的观感，来自第 1 层和第 2 层的冷暖对比。
 * 梦灯颜色逐关变化（青碧→赤红→明黄→月白），第四关灯缩小 20%。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var U = MYC.U;
  var TAU = Math.PI * 2;

  // 兜底光色（关卡未注入时用暖金，保证任何时刻都能画）
  var DEFAULT_STYLE = {
    color: '#ffd88a',
    core: '255, 236, 190',
    glow: ['rgba(255, 216, 138, 0.28)', 'rgba(255, 186, 88, 0.13)', 'rgba(255, 160, 50, 0)'],
    ring: 'rgba(255, 224, 158, 0.38)',
    scale: 1
  };

  function Renderer(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;

    // 光圈指针画布：盖在 UI/弹窗之上。光圈是指针——弹窗打开时
    // 也必须看得见（主画布会被弹窗遮罩压暗，指针不能跟着被遮没）。
    this.cursorCanvas = document.getElementById('cursor');
    this.cursorCtx = this.cursorCanvas ? this.cursorCanvas.getContext('2d') : null;

    this.lightStyle = DEFAULT_STYLE;
    // 光色渐变过渡（切关时 1 秒内从旧色渐变到新色）
    this._styleBlend = null;

    this.dpr = 1;
    this.screenW = 0;
    this.screenH = 0;

    // 视野：把世界（16:9）等比放进屏幕，可能上下或左右留黑边
    this.view = { x: 0, y: 0, w: 0, h: 0 };
    var self = this;
    this.view.px = function (nx) { return self.view.x + nx * self.view.w; };
    this.view.py = function (ny) { return self.view.y + ny * self.view.h; };

    // 压暗后的静态底图（屏幕尺寸，缓存）
    this.darkBase = document.createElement('canvas');
    this.darkBaseCtx = this.darkBase.getContext('2d');
    this.staticSource = null;
    this.staticVersion = 0;
    this.darkBaseVersion = -1;

    this.dust = [];
    this._initDust();

    this.resize();
  }

  /* ---------------- 尺寸 ---------------- */
  Renderer.prototype.resize = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.screenW = window.innerWidth;
    this.screenH = window.innerHeight;

    this.canvas.width = Math.round(this.screenW * this.dpr);
    this.canvas.height = Math.round(this.screenH * this.dpr);
    this.canvas.style.width = this.screenW + 'px';
    this.canvas.style.height = this.screenH + 'px';

    if (this.cursorCanvas) {
      this.cursorCanvas.width = Math.round(this.screenW * this.dpr);
      this.cursorCanvas.height = Math.round(this.screenH * this.dpr);
    }

    var aspect = this.config.WORLD_W / this.config.WORLD_H;
    var screenAspect = this.screenW / this.screenH;
    var w, h;
    if (screenAspect > aspect) {
      h = this.screenH;
      w = h * aspect;
    } else {
      w = this.screenW;
      h = w / aspect;
    }
    this.view.w = w;
    this.view.h = h;
    this.view.x = (this.screenW - w) / 2;
    this.view.y = (this.screenH - h) / 2;

    this.darkBase.width = Math.round(this.screenW * this.dpr);
    this.darkBase.height = Math.round(this.screenH * this.dpr);
    this.darkBaseVersion = -1;
  };

  /** 设置静止首帧来源（画布 / 图片 / 视频都行） */
  Renderer.prototype.setStaticSource = function (source) {
    this.staticSource = source;
    this.staticVersion++;
    this.darkBaseVersion = -1;
  };

  /** 设置当前关的梦灯样式（LEVEL_INTRO 时调用，随关卡渐变换色） */
  Renderer.prototype.setLightStyle = function (style) {
    if (!style) return;
    this._styleBlend = {
      from: this._currentStyle(),
      to: style,
      t: 0
    };
  };

  Renderer.prototype._currentStyle = function () {
    return this.lightStyle;
  };

  /** 每帧推进光色渐变 */
  Renderer.prototype._updateStyleBlend = function (dt) {
    var b = this._styleBlend;
    if (!b) return;
    b.t += dt;
    var k = U.smoothstep(0, 1, b.t);
    if (k >= 1) {
      this.lightStyle = b.to;
      this._styleBlend = null;
      return;
    }
    this.lightStyle = blendStyle(b.from, b.to, k);
  };

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixRgb(a, b, k) {
    return Math.round(a + (b - a) * k);
  }

  function blendStyle(a, b, k) {
    var ca = hexToRgb(a.color), cb = hexToRgb(b.color);
    var pa = a.core.split(',').map(Number), pb = b.core.split(',').map(Number);
    return {
      color: 'rgb(' + mixRgb(ca[0], cb[0], k) + ',' + mixRgb(ca[1], cb[1], k) + ',' + mixRgb(ca[2], cb[2], k) + ')',
      core: mixRgb(pa[0], pb[0], k) + ',' + mixRgb(pa[1], pb[1], k) + ',' + mixRgb(pa[2], pb[2], k),
      glow: b.glow,   // 光晕直接切（三层渐变插值成本高、视觉差异小）
      ring: b.ring,
      scale: a.scale + (b.scale - a.scale) * k
    };
  }

  /* ---------------- 构建压暗底图 ---------------- */
  Renderer.prototype._buildDarkBase = function () {
    var ctx = this.darkBaseCtx;
    var dpr = this.dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.screenW, this.screenH);

    // 1) 静止首帧
    if (this.staticSource) {
      try {
        ctx.drawImage(this.staticSource, this.view.x, this.view.y, this.view.w, this.view.h);
      } catch (e) {
        ctx.fillStyle = '#0d1424';
        ctx.fillRect(this.view.x, this.view.y, this.view.w, this.view.h);
      }
    } else {
      ctx.fillStyle = '#0d1424';
      ctx.fillRect(this.view.x, this.view.y, this.view.w, this.view.h);
    }

    // 2) 夜间压暗 + 深蓝染色（关键：让灯外的古镇"睡着"）
    var tint = this.config.NIGHT_TINT;
    var dim = this.config.NIGHT_DIM;
    ctx.fillStyle = 'rgba(' + tint + ',' + dim + ')';
    ctx.fillRect(this.view.x, this.view.y, this.view.w, this.view.h);

    // 3) 暗角：四周更暗，把注意力聚到中间
    var cx = this.view.x + this.view.w / 2;
    var cy = this.view.y + this.view.h / 2;
    var maxR = Math.sqrt(cx * cx + cy * cy);
    var vg = ctx.createRadialGradient(cx, cy, this.view.w * 0.25, cx, cy, maxR);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.screenW, this.screenH);

    // 4) 屏幕留黑边区域填成纯黑
    ctx.fillStyle = '#05070d';
    if (this.view.x > 0) {
      ctx.fillRect(0, 0, this.view.x, this.screenH);
      ctx.fillRect(this.view.x + this.view.w, 0, this.view.x + 1, this.screenH);
    }
    if (this.view.y > 0) {
      ctx.fillRect(0, 0, this.screenW, this.view.y);
      ctx.fillRect(0, this.view.y + this.view.h, this.screenW, this.view.y + 1);
    }

    this.darkBaseVersion = this.staticVersion;
  };

  /* ---------------- 星尘 ---------------- */
  Renderer.prototype._initDust = function () {
    this.dust = [];
    for (var i = 0; i < 70; i++) {
      this.dust.push({
        a: U.rand(0, TAU),          // 相对灯圈的角度
        r: U.rand(0.55, 1.45),      // 相对灯圈的半径倍数
        spin: U.rand(-0.35, 0.35),  // 绕圈速度
        size: U.rand(0.8, 2.4),
        alpha: U.rand(0.15, 0.7),
        phase: U.rand(0, TAU)
      });
    }
  };

  Renderer.prototype._drawDust = function (ctx, lx, ly, lr, time, core) {
    ctx.save();
    for (var i = 0; i < this.dust.length; i++) {
      var d = this.dust[i];
      var a = d.a + time * d.spin;
      var r = lr * d.r;
      var x = lx + Math.cos(a) * r;
      var y = ly + Math.sin(a) * r * 0.92;
      var tw = 0.6 + 0.4 * Math.sin(time * 3 + d.phase);
      ctx.fillStyle = 'rgba(' + core + ',' + (d.alpha * tw).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, d.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ============================================================
     主渲染
     ============================================================ */
  Renderer.prototype.render = function (city, light, effects, debug, dt) {
    var ctx = this.ctx;
    var cfg = this.config;
    var time = performance.now() / 1000;

    this._updateStyleBlend(dt || 0.016);
    var st = this.lightStyle;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.screenW, this.screenH);

    // 黑底
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, this.screenW, this.screenH);

    // 1) 压暗的静止古镇
    if (this.darkBaseVersion !== this.staticVersion) {
      this._buildDarkBase();
    }
    ctx.drawImage(this.darkBase, 0, 0, this.screenW, this.screenH);

    // 2) 缓慢流动的夜雾（让静态画面"睡着但活着"）
    this._drawMoonHaze(time);

    // 3) 梦灯
    var lr = cfg.LIGHT_RADIUS_RATIO * (st.scale || 1) * this.view.w;
    if (light && light.visible !== false && lr > 4) {
      var lx = this.view.px(light.x);
      var ly = this.view.py(light.y);
      // 指针层：光圈的光晕/边环/充能环/星尘画在 UI 之上（弹窗打开也可见）
      var cctx = this.cursorCtx || ctx;
      if (this.cursorCtx) {
        cctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        cctx.clearRect(0, 0, this.screenW, this.screenH);
      }

      // 3a) 灯内：活的古镇（属于场景层，弹窗时可被遮罩盖住——指针环仍在上层）
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, TAU);
      ctx.clip();
      try {
        ctx.drawImage(city.getFrame(), this.view.x, this.view.y, this.view.w, this.view.h);
      } catch (e) { /* 视频未就绪时忽略 */ }
      ctx.restore();

      // 3b) 边缘羽化：从透明过渡到夜色，让灯自然融入暗镇
      var featherStart = U.clamp(1 - cfg.LIGHT_FEATHER, 0.05, 0.98);
      var fg = ctx.createRadialGradient(lx, ly, lr * featherStart, lx, ly, lr);
      fg.addColorStop(0, 'rgba(' + cfg.NIGHT_TINT + ',0)');
      fg.addColorStop(1, 'rgba(' + cfg.NIGHT_TINT + ',' + Math.min(0.98, cfg.NIGHT_DIM + 0.2) + ')');
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, TAU); ctx.clip();
      ctx.fillStyle = fg;
      ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
      ctx.restore();

      // 3c) 灵色光晕（叠加发光）——指针层
      cctx.save();
      cctx.globalCompositeOperation = 'lighter';
      var glow = cctx.createRadialGradient(lx, ly, 0, lx, ly, lr * 1.75);
      glow.addColorStop(0, st.glow[0]);
      glow.addColorStop(0.45, st.glow[1]);
      glow.addColorStop(1, st.glow[2]);
      cctx.fillStyle = glow;
      cctx.beginPath(); cctx.arc(lx, ly, lr * 1.75, 0, TAU); cctx.fill();
      cctx.restore();

      // 3d) 灯圈细边——指针层
      cctx.save();
      cctx.strokeStyle = st.ring;
      cctx.lineWidth = 2;
      cctx.beginPath(); cctx.arc(lx, ly, lr, 0, TAU); cctx.stroke();
      cctx.restore();

      // 3e) 「灵光」充能环：照住目标上涨点亮、失照快速黯淡——唯一的判定反馈（指针层）
      var ch = light.charge || 0;
      if (ch > 0.004) {
        var startA = -Math.PI / 2;
        var endA = startA + TAU * Math.min(1, ch);
        // 照住目标时脉冲呼吸，提示"涨得很顺"
        var pulse = light.covered ? (0.72 + 0.28 * Math.sin(time * 7)) : 1;
        cctx.save();
        cctx.lineCap = 'round';
        if (ch >= 0.999) {
          cctx.strokeStyle = 'rgba(255, 252, 235, 0.98)';
          cctx.lineWidth = 6;
          cctx.shadowColor = st.glow[0];
          cctx.shadowBlur = 26;
        } else {
          cctx.strokeStyle = 'rgba(' + st.core + ',' + (0.62 + 0.38 * pulse).toFixed(3) + ')';
          cctx.lineWidth = 3.5 + 1.5 * pulse;
          cctx.shadowColor = 'rgba(' + st.core + ',0.55)';
          cctx.shadowBlur = 10 + 14 * pulse;
        }
        cctx.beginPath();
        cctx.arc(lx, ly, lr + 9, startA, endA);
        cctx.stroke();

        // 环上的"头亮珠"：进度末端一颗更亮的光点，让涨速一眼可见
        if (ch < 0.999) {
          var hx = lx + Math.cos(endA) * (lr + 9);
          var hy = ly + Math.sin(endA) * (lr + 9);
          var hg = cctx.createRadialGradient(hx, hy, 0, hx, hy, 7);
          hg.addColorStop(0, 'rgba(255, 252, 240,' + (0.55 + 0.4 * pulse).toFixed(3) + ')');
          hg.addColorStop(1, 'rgba(255, 252, 240,0)');
          cctx.fillStyle = hg;
          cctx.beginPath(); cctx.arc(hx, hy, 7, 0, TAU); cctx.fill();
        }
        cctx.restore();
      }

      // 3e+) 诱饵即时预警：照住假目标时外圈红色急促闪烁（~0.3s 内可感知，远快于文案提醒）
      if (light.onDecoy) {
        var blink = 0.5 + 0.5 * Math.sin(time * 21);
        cctx.save();
        cctx.lineCap = 'round';
        cctx.shadowColor = 'rgba(255, 44, 30, 0.85)';
        cctx.shadowBlur = 14 + 16 * blink;
        cctx.strokeStyle = 'rgba(255, 70, 52,' + (0.5 + 0.5 * blink).toFixed(3) + ')';
        cctx.lineWidth = 3.5 + 3 * blink;
        cctx.beginPath(); cctx.arc(lx, ly, lr + 15, 0, TAU); cctx.stroke();
        cctx.shadowBlur = 0;
        cctx.strokeStyle = 'rgba(255, 96, 72,' + (0.28 + 0.42 * blink).toFixed(3) + ')';
        cctx.lineWidth = 2;
        cctx.beginPath(); cctx.arc(lx, ly, lr + 5, 0, TAU); cctx.stroke();
        cctx.restore();
      }

      // 3f) 星尘（颜色跟随灵色）——指针层
      this._drawDust(cctx, lx, ly, lr, time, st.core);
    } else if (this.cursorCtx) {
      // 光圈隐藏（如加载/序章视频）：清掉指针层残留
      this.cursorCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.cursorCtx.clearRect(0, 0, this.screenW, this.screenH);
    }

    // 4) 成功特效 / 终幕
    if (effects) {
      effects.draw(ctx, this.view, time);
    }

    // 5) 调试标记
    if (debug) {
      this._drawDebug(city, light);
    }
  };

  /* ---------------- 夜雾 ---------------- */
  Renderer.prototype._drawMoonHaze = function (time) {
    var ctx = this.ctx;
    var v = this.view;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var blobs = [
      { x: 0.30, y: 0.35, r: 0.45, sx: 0.015, sy: 0.010, a: 0.05, p: 0 },
      { x: 0.70, y: 0.62, r: 0.50, sx: -0.012, sy: 0.008, a: 0.04, p: 2.1 },
      { x: 0.50, y: 0.15, r: 0.38, sx: 0.008, sy: -0.011, a: 0.045, p: 4.2 }
    ];

    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = v.px(b.x + Math.sin(time * b.sx + b.p) * 0.06);
      var by = v.py(b.y + Math.cos(time * b.sy + b.p) * 0.05);
      var br = v.w * b.r;
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(150, 190, 255,' + b.a + ')');
      g.addColorStop(1, 'rgba(120, 160, 240, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    }

    ctx.restore();
  };

  /* ---------------- 调试标记 ---------------- */
  Renderer.prototype._drawDebug = function (city, light) {
    var ctx = this.ctx;
    var cfg = this.config;
    var v = this.view;

    // 目标位置
    var tp = (light && typeof light.targetPos !== 'undefined') ? light.targetPos : null;
    if (tp) {
      var kx = v.px(tp.x), ky = v.py(tp.y);

      ctx.save();
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(kx, ky, 14, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx - 20, ky); ctx.lineTo(kx + 20, ky); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, ky - 20); ctx.lineTo(kx, ky + 20); ctx.stroke();
      ctx.fillStyle = '#00ff9d';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('TARGET', kx + 18, ky - 16);
      ctx.restore();
    }

    // 判定半径
    if (light) {
      var lx = v.px(light.x), ly = v.py(light.y);
      var scale = (this.lightStyle && this.lightStyle.scale) || 1;
      var cr = cfg.LIGHT_RADIUS_RATIO * scale * cfg.CAPTURE_RADIUS_SCALE * v.w;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(lx, ly, cr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff5050';
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };

  MYC.Renderer = Renderer;

})(window.MYC);
