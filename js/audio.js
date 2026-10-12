/**
 * 月影城 · 音效与氛围
 * ============================================================
 * 全部用 WebAudio 实时合成，不需要任何音频素材。
 *
 * 三层结构：
 *   1. 常驻氛围：夜风（低通噪声）+ 远处人群低鸣（带通噪声）——解锁后一直循环
 *   2. 事件音效：发现叮声 / 锁定音 / 王冠闪耀 / 成功琶音 / 误跟提示音
 *   3. 剧情层（随视频时间变化）：
 *      · 巡游时段（phase 0.485~1.0）→ 隐约的手鼓与铃
 *      · 戏台开演时段（phase 0.21~0.645）→ 远处的笛声短句
 *
 * 以后要做公主语音，把 mp3 放进 assets/audio/，playVoice() 会自动播放。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.enabled = true;
    this.voiceBuffers = {};
    this.voiceMissing = {};   // 探测过不存在的语音名：不再反复请求
    this.master = null;
    this.ambienceOn = false;

    // 剧情层节奏状态
    this._nextDrum = 0;
    this._drumBeat = 0;
    this._nextFlute = 0;
    this._lastPhase = 0;

    // 配乐层状态（HTMLAudio 循环播放）
    this.musicEl = null;
    this.musicName = null;    // 当前曲目：'journey' | 'hunt'
    this.musicState = 'off';  // off | playing | paused | want（等手势解锁）
    this.musicVol = 0;
    this.musicWant = null;    // 被自动播放策略拦下的点播：解锁后自动起播
    this.musicDuck = null;    // 旁白段配乐压低目标（null = 标准 MUSIC_VOL）
    this._musicFade = null;   // 淡入淡出定时器
  }

  /** 创建/恢复音频上下文（浏览器要求必须由用户操作触发） */
  Audio.prototype.unlock = function () {
    if (!this.enabled) return null;
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      try { this.ctx = new AC(); } catch (e) { this.enabled = false; return null; }

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(function () {});
    }
    if (!this.ambienceOn) this._startAmbience();

    // 手势解锁后：接续被自动播放策略拦下的配乐点播
    // （页面加载即进序章视频，那时还没有任何用户手势，点播只能先记着）
    if (this.musicWant && this.musicState === 'want') {
      var want = this.musicWant;
      this.musicWant = null;
      this.playMusic(want);
    }
    return this.ctx;
  };

  /* ================= 配乐层（HTMLAudio 循环播放） =================
   * 三首曲目随游戏状态流转（game.js setState 挂接）：
   *   journey → assets/audio/music-journey.mp3  序章视频（穿越古钟）
   *   finale  → assets/audio/music-finale.mp3   补天终幕（天梯上升）
   *   hunt    → assets/audio/music-hunt.mp3     找人游玩（Silent Hunt）
   * 自动播放策略兜底：未解锁时的点播缓存进 musicWant，unlock() 后自动起播。
   * 音量统一 MUSIC_VOL，进退场淡入淡出；切曲目时旧曲独立退场，不抢主定时器。
   */

  Audio.prototype.MUSIC_SRC = {
    journey: 'assets/audio/music-journey.mp3',
    finale: 'assets/audio/music-finale.mp3',
    hunt: 'assets/audio/music-hunt.mp3'
  };
  Audio.prototype.MUSIC_VOL = 0.5;

  /** 确保音乐 <audio> 就绪（切曲目时旧曲淡出重建）；文件缺失静默降级为无声 */
  Audio.prototype._ensureMusicEl = function (name) {
    var src = this.MUSIC_SRC[name];
    if (!src) return null;
    if (this.musicEl && this.musicName === name) return this.musicEl;
    if (this.musicEl) {
      var old = this.musicEl;
      // 旧曲退场：独立小定时器淡出 0.5s 再挂起，不占用主淡入淡出定时器
      if (!old.paused && old.volume > 0.01) {
        var v0 = old.volume;
        var t0 = Date.now();
        var iv = setInterval(function () {
          var k = Math.min(1, (Date.now() - t0) / 500);
          try { old.volume = v0 * (1 - k); } catch (err) {}
          if (k >= 1) { clearInterval(iv); try { old.pause(); } catch (err2) {} }
        }, 50);
      } else {
        try { old.pause(); } catch (err3) {}
      }
      this.musicEl = null;
    }
    var el = document.createElement('audio');
    el.src = src;
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.setAttribute('playsinline', '');
    this.musicEl = el;
    this.musicName = name;
    return el;
  };

  /** 音量淡入淡出（新一次淡变会取消未完成的旧淡变） */
  Audio.prototype._fadeMusicTo = function (el, target, ms) {
    if (this._musicFade) { clearInterval(this._musicFade); this._musicFade = null; }
    var self = this;
    var from = el.volume;
    var t0 = Date.now();
    this._musicFade = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / ms);
      var v = from + (target - from) * k;
      try { el.volume = v; } catch (err) {}
      self.musicVol = v;
      if (k >= 1) {
        clearInterval(self._musicFade);
        self._musicFade = null;
        if (target === 0) { try { el.pause(); } catch (err2) {} }
      }
    }, 50);
  };

  /** 点播配乐：journey（序章/终幕视频）| hunt（找人游玩） */
  Audio.prototype.playMusic = function (name) {
    if (!this.enabled || !this.MUSIC_SRC[name]) return;
    // 同曲已在播：原地续着，不重来一遍淡入
    if (this.musicState === 'playing' && this.musicName === name) return;
    if (!this.ctx) {
      // 还没解锁（页面加载即进序章）：记住点播，等首次手势 unlock()
      this.musicWant = name;
      this.musicState = 'want';
      return;
    }
    var el = this._ensureMusicEl(name);
    if (!el) return;
    this.musicWant = null;
    this.musicState = 'playing';
    var self = this;
    var p = null;
    try { p = el.play(); } catch (err) { p = null; }
    if (p && p.catch) {
      p.catch(function () {
        if (el.error) {
          // 文件真缺了：静默放弃，别在每次手势里反复重试
          self.musicWant = null;
          self.musicState = 'off';
          return;
        }
        // 个别浏览器手势判定更严：拦下就缓存，下次 unlock() 再试
        self.musicWant = name;
        self.musicState = 'want';
      });
    }
    this._fadeMusicTo(el, this.musicDuck || this.MUSIC_VOL, 1200);
  };

  /** 旁白段压低配乐（duck），人声更清楚；传 null 恢复标准音量 */
  Audio.prototype.duckMusic = function (vol) {
    this.musicDuck = (typeof vol === 'number') ? vol : null;
    if (this.musicEl && this.musicState === 'playing') {
      this._fadeMusicTo(this.musicEl, this.musicDuck || this.MUSIC_VOL, 800);
    }
  };

  /* ================= 旁白音轨（序章/终幕配音，v1.8.0） ================= */

  /** 播旁白整轨，同时把配乐压低到 duck 电平突出人声 */
  Audio.prototype.playNarration = function (src) {
    var old = this._narr;
    this._narr = null;
    if (old) { try { old.pause(); } catch (e) {} }
    this.duckMusic(0.18);
    // 注意：本文件作用域内 Audio 被游戏音频管理器同名构造器遮蔽，
    // 必须用 window.Audio 才能拿到 DOM 的 <audio> 元素构造器
    var el = new window.Audio(src);
    el.volume = 1;
    el.preload = 'auto';
    this._narr = el;
    var self = this;
    // 配音自然播完（如转盘奖品配音整曲约 8 秒，一秒不剪）：自动恢复配乐音量，
    // 不再依赖切场景时的 stopNarration 兜底（v1.12.0）
    el.addEventListener('ended', function () {
      if (self._narr === el) { self._narr = null; self.duckMusic(null); }
    });
    var p = el.play();
    if (p && p.catch) p.catch(function () {
      // 极端场景 <audio> 自动播被拦：退到已解锁的 AudioContext 播同一段
      try {
        fetch(src)
          .then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(function (buf) { var ctx = self.ctx || self.unlock(); return ctx.decodeAudioData(buf); })
          .then(function (decoded) { if (decoded && self._narr === el) self._playBuffer(decoded); })
          .catch(function () {});
      } catch (e) {}
    });
  };

  /** 停旁白并恢复配乐标准音量；fade 秒内线性淡出（收尾不爆音） */
  Audio.prototype.stopNarration = function (fade) {
    var el = this._narr;
    this._narr = null;
    this.duckMusic(null);
    if (!el) return;
    var n = (typeof fade === 'number' && fade > 0) ? 12 : 0;
    if (!n) { try { el.pause(); } catch (e) {} return; }
    var i = 0;
    var t = setInterval(function () {
      i++;
      try { el.volume = Math.max(0, 1 - i / n); } catch (e2) {}
      if (i >= n) { clearInterval(t); try { el.pause(); } catch (e3) {} }
    }, fade * 1000 / n);
  };

  /** 停播（离开游戏画面）：淡出后挂起，进度留在原地 */
  Audio.prototype.stopMusic = function () {
    this.musicWant = null;
    this.musicState = 'off';
    if (this.musicEl && !this.musicEl.paused) {
      this._fadeMusicTo(this.musicEl, 0, 700);
    } else if (this._musicFade) {
      clearInterval(this._musicFade);
      this._musicFade = null;
    }
  };

  /** 弹窗打开：配乐同步淡出暂停（音量归零后自动 pause） */
  Audio.prototype.pauseMusic = function () {
    if (this.musicState !== 'playing') return;
    this.musicState = 'paused';
    if (this.musicEl && !this.musicEl.paused) this._fadeMusicTo(this.musicEl, 0, 400);
  };

  /** 弹窗关闭：原地续播（不重头） */
  Audio.prototype.resumeMusic = function () {
    if (this.musicState !== 'paused' || !this.musicEl) return;
    this.musicState = 'playing';
    var el = this.musicEl;
    try {
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
    this._fadeMusicTo(el, this.MUSIC_VOL, 800);
  };

  /* ================= 常驻氛围层 ================= */

  /** 生成一段平滑的噪声缓冲（随机游走近似褐噪） */
  Audio.prototype._noiseBuffer = function (seconds, warmth) {
    var ctx = this.ctx;
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var v = 0;
    for (var i = 0; i < len; i++) {
      v = v * warmth + (Math.random() * 2 - 1) * (1 - warmth);
      data[i] = v * 2.2;
    }
    return buf;
  };

  Audio.prototype._startAmbience = function () {
    var ctx = this.ctx;
    if (!ctx) return;
    this.ambienceOn = true;

    // —— 夜风：低通噪声，音量缓慢起伏 ——
    var wind = ctx.createBufferSource();
    wind.buffer = this._noiseBuffer(4, 0.985);
    wind.loop = true;
    var windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 320;
    var windGain = ctx.createGain();
    windGain.gain.value = 0.035;

    // 缓慢的呼吸感（10 秒周期 ±40%）
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.014;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    lfo.start();

    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master);
    wind.start();

    // —— 远处人群低鸣：带通噪声，像广场那头隐约的人声 ——
    var murmur = ctx.createBufferSource();
    murmur.buffer = this._noiseBuffer(5, 0.96);
    murmur.loop = true;
    var mFilter = ctx.createBiquadFilter();
    mFilter.type = 'bandpass';
    mFilter.frequency.value = 720;
    mFilter.Q.value = 0.6;
    var mGain = ctx.createGain();
    mGain.gain.value = 0.012;
    murmur.connect(mFilter);
    mFilter.connect(mGain);
    mGain.connect(this.master);
    murmur.start();
  };

  /* ================= 剧情层（随视频时间） ================= */

  /**
   * 全局秒数版包装（game.js 调用）
   * 内部转换为全局秒数进行判断
   */
  Audio.prototype.updateTime = function (t, dt) {
    // 巡游和戏台的逻辑改用全局秒数
    var T = MYC.Timeline ? MYC.Timeline.SCHEDULE : null;
    var inProcession = T ? (t >= T.processionStart && t <= T.processionEnd) : false;
    var stageOpen = MYC.Timeline ? MYC.Timeline.getStageOpen(t) : 0;

    var ctx = this.unlock();
    if (!ctx) return;
    var now = ctx.currentTime;

    // 循环回卷检测（简单用 t 跳跃检测）
    if (this._lastT !== undefined && t < this._lastT - 5) {
      this._nextDrum = 0;
      this._nextFlute = 0;
    }
    this._lastT = t;

    // 巡游鼓点
    if (inProcession) {
      if (this._nextDrum < now) this._nextDrum = now + 0.1;
      while (this._nextDrum < now + 0.25) {
        this._drumBeat++;
        var drumT = this._nextDrum;
        if (this._drumBeat % 2 === 1) { this._drum(drumT); }
        else { this._tick(drumT); }
        this._nextDrum += 0.42;
      }
    }

    // 戏台笛声
    if (stageOpen > 0.5) {
      if (this._nextFlute < now) this._nextFlute = now + 0.3;
      if (this._nextFlute < now + 0.2) {
        this._flutePhrase(this._nextFlute);
        this._nextFlute += 3.4;
      }
    }
  };

  // 保留旧接口兼容
  Audio.prototype.updatePhase = function (phase, dt) {
    var ctx = this.unlock();
    if (!ctx) return;

    var T = MYC.Timeline ? MYC.Timeline.SCHEDULE : null;
    var now = ctx.currentTime;

    // 循环回卷时重置乐句节拍
    if (phase < this._lastPhase - 0.5) {
      this._nextDrum = 0;
      this._nextFlute = 0;
    }
    this._lastPhase = phase;

    // —— 巡游鼓点 ——
    var inProcession = T ? (phase >= T.processionStart && phase <= T.processionEnd)
                         : (phase >= 0.485 && phase <= 1.0);
    if (inProcession) {
      if (this._nextDrum < now) this._nextDrum = now + 0.1;
      while (this._nextDrum < now + 0.25) {
        this._drumBeat++;
        var t = this._nextDrum;
        if (this._drumBeat % 2 === 1) {
          this._drum(t);            // 低鼓：咚
        } else {
          this._tick(t);            // 高铃：哒
        }
        this._nextDrum += 0.42;
      }
    }

    // —— 戏台笛声 ——
    var stageOpen = MYC.Timeline ? MYC.Timeline.getStageOpen(phase) : 0;
    if (stageOpen > 0.5) {
      if (this._nextFlute < now) this._nextFlute = now + 0.3;
      if (this._nextFlute < now + 0.2) {
        this._flutePhrase(this._nextFlute);
        this._nextFlute += 3.4;
      }
    }
  };

  /** 低鼓：短促的咚 */
  Audio.prototype._drum = function (t) {
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + 0.26);
  };

  /** 高铃/铃鼓：噪声脆响 */
  Audio.prototype._tick = function (t) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.06, 0.3);
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5200;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.02, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  };

  /** 远处笛声短句：三连音五声音阶 */
  Audio.prototype._flutePhrase = function (t) {
    var scale = [587, 659, 784, 880];
    var base = Math.floor(Math.random() * 2);
    for (var i = 0; i < 3; i++) {
      var f = scale[(base + i) % scale.length];
      this.tone(f, 0.55, 'triangle', 0.016, (t - this.ctx.currentTime) + i * 0.34);
    }
  };

  /* ================= 事件音效 ================= */

  /**
   * 播放一个音
   * @param freq 起始频率
   * @param dur  时长（秒）
   * @param type 波形：sine / triangle / square
   * @param vol  音量 0~1
   * @param delay 延迟多少秒开始
   * @param glideTo 若给定，则频率滑到该值
   */
  Audio.prototype.tone = function (freq, dur, type, vol, delay, glideTo) {
    var ctx = this.unlock();
    if (!ctx) return;
    var t0 = ctx.currentTime + (delay || 0);

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    }

    // 简单的包络：快速起音 + 平滑衰减
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol || 0.15), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(this.master || ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  /** 光圈出现 / 移动时的轻微气声 */
  Audio.prototype.whoosh = function () {
    this.tone(520, 0.18, 'sine', 0.05, 0, 300);
  };

  /** 转盘旋转滴答（v1.12.0）：按灯光旋转同款缓出曲线预排一路渐疏的 click，
      前密后疏越转越慢；全部用 tone 的 delay 参数预先调度，不占定时器 */
  Audio.prototype.luckyTicks = function (totalSec) {
    var N = 26;
    for (var i = 0; i < N; i++) {
      var t = totalSec * (1 - Math.pow(1 - (i + 1) / N, 1 / 2.2));
      // 最后一颗高半音，接住「停稳」的耳朵预期
      this.tone(i === N - 1 ? 1568 : 1250, 0.05, 'square', 0.045, t);
    }
  };

  /** 中奖揭晓（v1.12.0）：欢快上行琶音 + 高音亮尾，接奖品配音 */
  Audio.prototype.luckyWin = function () {
    this.tone(523, 0.16, 'triangle', 0.09, 0);
    this.tone(659, 0.16, 'triangle', 0.09, 0.10);
    this.tone(784, 0.16, 'triangle', 0.09, 0.20);
    this.tone(1047, 0.30, 'triangle', 0.10, 0.30);
    this.tone(1319, 0.55, 'sine', 0.07, 0.44);
  };

  /** 发现线索：清脆一声 */
  Audio.prototype.chime = function () {
    this.tone(880, 0.5, 'sine', 0.10);
    this.tone(1320, 0.5, 'sine', 0.06, 0.05);
  };

  /** 提示出现 */
  Audio.prototype.clue = function () {
    this.tone(660, 0.35, 'triangle', 0.08);
  };

  /** 关键剧情时刻（国王与随从分开）：轻轻的两声拨弦感 */
  Audio.prototype.separation = function () {
    this.tone(587, 0.4, 'sine', 0.07);
    this.tone(880, 0.55, 'sine', 0.05, 0.16);
  };

  /** 误跟假目标：温和的低音提示（不是刺耳的错误音） */
  Audio.prototype.miss = function () {
    this.tone(392, 0.28, 'sine', 0.07);
    this.tone(311, 0.4, 'sine', 0.06, 0.14);
  };

  /** 王冠闪耀 / 跟随锁定 */
  Audio.prototype.crown = function () {
    this.tone(1046, 0.9, 'sine', 0.12);
    this.tone(1568, 0.9, 'sine', 0.08, 0.08);
    this.tone(2093, 1.1, 'sine', 0.06, 0.16);
  };

  /** 成功结算：上行琶音 + 结尾钟声 */
  Audio.prototype.success = function () {
    var notes = [523, 659, 784, 1046, 1318];
    for (var i = 0; i < notes.length; i++) {
      this.tone(notes[i], 1.2, 'sine', 0.10, i * 0.14);
    }
    this.tone(1568, 2.2, 'sine', 0.06, 0.8);
    this.tone(784, 2.4, 'triangle', 0.05, 0.8);
  };

  /* ---------------- 灵语兜底 ----------------
   * assets/audio/ 里没有语音文件时，按灵石播一段专属合成音型，
   * 让"灵归其位"依然有听觉记忆点：梦鹿空灵、神马轻快、
   * 李白潇洒、萌莎温暖。以后放入 mp3 会自动优先播文件。
   */
  Audio.prototype.SPIRIT_MOTIFS = {
    meng: [[784, 0, 0.5], [988, 0.16, 0.5], [1175, 0.32, 0.9]],           // 梦鹿：空灵上行
    fu:   [[659, 0, 0.22], [784, 0.14, 0.22], [659, 0.28, 0.22], [1046, 0.42, 0.8]], // 神马：轻快蹄声
    shi:  [[587, 0, 0.4], [880, 0.2, 0.4], [659, 0.4, 0.3], [1046, 0.62, 1.0]],      // 诗仙：潇洒婉转
    hua:  [[698, 0, 0.5], [880, 0.18, 0.5], [1046, 0.36, 1.1], [880, 0.7, 0.9]]      // 画灵：温暖铺陈
  };

  /** 播放语音文件；不存在则退回该灵的专属合成音型 */
  Audio.prototype.playVoice = function (name) {
    var ctx = this.unlock();
    if (!ctx) return;
    var self = this;

    if (this.voiceBuffers[name]) {
      this._playBuffer(this.voiceBuffers[name]);
      return;
    }
    // 已探测过没有文件：直接播合成音型，不再发请求
    if (this.voiceMissing[name]) {
      this._playSpiritMotif(name.replace(/^spirit_/, ''));
      return;
    }
    // 清单里没有的语音（清单为空 = 全部没有）：不发请求，直接播合成音型
    var known = MYC.VOICE_FILES && MYC.VOICE_FILES.indexOf(name) >= 0;
    if (!known) {
      this.voiceMissing[name] = true;
      this._playSpiritMotif(name.replace(/^spirit_/, ''));
      return;
    }

    var url = 'assets/audio/' + name + '.mp3';
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('no file'); return r.arrayBuffer(); })
      .then(function (buf) { return ctx.decodeAudioData(buf); })
      .then(function (decoded) {
        self.voiceBuffers[name] = decoded;
        self._playBuffer(decoded);
      })
      .catch(function () {
        // 没有语音文件：记住它，改播该灵的专属音型
        self.voiceMissing[name] = true;
        self._playSpiritMotif(name.replace(/^spirit_/, ''));
      });
  };

  /** 播一段灵石专属音型（空缺音名用中性的钟声） */
  Audio.prototype._playSpiritMotif = function (stone) {
    var motif = this.SPIRIT_MOTIFS[stone];
    if (!motif) motif = [[523, 0, 0.5], [784, 0.25, 1.0]];
    // 反馈音量加大（v1.8.0）：寻得角色是高光时刻，音型要清晰可闻
    for (var i = 0; i < motif.length; i++) {
      this.tone(motif[i][0], motif[i][2], 'sine', 0.22, motif[i][1]);
      this.tone(motif[i][0] * 2, motif[i][2] * 0.6, 'sine', 0.08, motif[i][1]);
    }
  };

  Audio.prototype._playBuffer = function (buffer) {
    var ctx = this.unlock();
    if (!ctx) return;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.master || ctx.destination);
    src.start();
  };

  MYC.Audio = Audio;

})(window.MYC);
