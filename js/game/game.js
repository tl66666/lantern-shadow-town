/**
 * 灯影古镇 · 游戏主控（状态机 + 每帧逻辑）
 * ============================================================
 * 状态机：
 *   BOOT → ATTRACT ⇄ STORY(首次) → LEVEL_INTRO → PLAYING → SUCCESS → 下一关…
 *                                    │              │
 *                              (60s 无输入)     (充能满)
 *                                    ↓              ↓
 *                                 ATTRACT     演出 → 角色卡 → 结算
 *   四印齐：SUCCESS → FINAL（补天终幕）→ LEVEL_SELECT（自由选关）
 *
 * 凝视点击：光圈悬停按钮 → 进度环快速涨满 → 等效点击（鼠标/手势通吃）。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var U = MYC.U;

  function Game(opts) {
    this.config = opts.config;
    this.city = opts.city;
    this.input = opts.input;
    this.renderer = opts.renderer;
    this.ui = opts.ui;
    this.effects = opts.effects;
    this.audio = opts.audio;

    this.state = 'BOOT';
    this.stateTime = 0;

    this.light = { x: 0.5, y: 0.5, visible: true, charge: 0 };
    this.lightTarget = { x: 0.5, y: 0.5 };

    this.success = new MYC.Success(this.config);
    this.hints = new MYC.Hints(this.config);

    this.save = MYC.Save.load();
    this.level = null;

    this.debug = this.config.SHOW_DEBUG;
    this.loopsUsed = 1;
    this.lastPhase = 0;
    this.playTime = 0;
    this.idleTime = 0;
    this.discoveryTimer = 0;
    this.discoveryWas = false;
    this.storyIndex = -1;
    this.storyMode = 'text';          // 'text' | 'video'
    this.fired = {};                  // SUCCESS 演出时间线旗标
    this._gazeHintShown = false;      // 凝视首充能教学提示（只弹一次）
    this.justCompletedAll = false;    // 本关刚好集齐四印（→ 补天终幕）
    this.finalVideoMode = false;      // 补天终幕是否用通关视频（finale.mp4 存在时）
    this._modalPaused = false;        // 游玩中被弹窗（设置等）暂停中
    this.eternalElapsed = 0;          // 灵光不灭激活后经过的时间

    this.decoyCover = {};
    this.decoyTold = {};
    this.trapHits = 0;
    this.followedFake = false;
    this.targetPos = null;

    this.lastDebugText = '';

    var self = this;
    this.ui.onReplay(function () { self.replayLevel(); });
    this.ui.onNext(function () { self.goNextLevel(); });
    this.ui.onFinalReplay(function () { self.replayFinal(); });
    this.ui.onStartGame(function () { self.requestStart(); });
    this.ui.onIntroStart(function () {
      if (self.state !== 'LEVEL_INTRO') return;
      if (self.stateTime < 0.4) return;   // 防连点
      self.setState('PLAYING');
    });
    this.ui.onIntroBack(function () { self.introBack(); });
    this.ui.onSuccessBack(function () { self.successBack(); });
    this.ui.onLevelSelect(function (idx) { self.enterLevel(idx, true); });
    this.ui.onGazeToggle(function () { self.toggleInput(); });
    this.ui.onFinalSelect(function () { self.setState('LEVEL_SELECT'); });
    this.ui.onSelectBack(function () { self.setState('ATTRACT'); });
    this.ui.onResetConfirm(function () { self.resetAll(); });
    // 幸运转盘三回调（v1.11.0）：终幕入口开转盘 / 星钮开转 / 收下落账回选关
    this.ui.onFinalLucky(function () {
      if (self.state !== 'FINAL') return;
      self.setState('LUCKY');
    });
    this.ui.onLuckyGo(function () {
      if (self.state !== 'LUCKY') return;
      self.ui.startLuckySpin();
    });
    this.ui.onLuckyContinue(function () {
      // 收下谢礼：落账「仅此一次」标记，回到自由体验的选关页
      self.save.luckyDone = true;
      MYC.Save.write(self.save);
      self.setState('LEVEL_SELECT');
    });
  }

  Game.prototype.start = function () {
    this.setState('ATTRACT');
    this._syncInputToggle();
  };

  /* ============================================================
     输入方式切换
     ============================================================ */
  Game.prototype.toggleInput = function () {
    var self = this;
    var target = this.input.getActiveMode() === 'HAND' ? 'MOUSE' : 'HAND';
    this.ui.setInputToggle('切换中…', 'busy');

    this.input.switchTo(target).then(function (res) {
      if (res.ok) {
        self.ui.toast(target === 'HAND'
          ? '已切换为摄像头手势（食指指向 = 灯的位置）'
          : '已切换为鼠标控制', 3200);
      } else {
        self.ui.toast('切换失败：' + (res.message || '未知原因'), 5200);
      }
      self._syncInputToggle();
    });
  };

  Game.prototype._syncInputToggle = function () {
    var hand = this.input.getActiveMode() === 'HAND';
    this.ui.setInputToggle(hand ? '🖐 手势' : '🖱 鼠标', hand ? 'hand' : 'mouse');
  };

  /* ============================================================
     状态机
     ============================================================ */
  Game.prototype.setState = function (s) {
    this.state = s;
    this.stateTime = 0;
    this.fired = {};
    this.light.visible = true;   // 默认亮灯；仅序章/终幕视频播放期间熄灭

    if (s === 'ATTRACT') {
      var done = this.save.stones.length >= MYC.Levels.count();
      this.ui.hideAll();
      this.ui.hideLevelBadge();
      this.ui.showAttract(this.save, done, this.input.fallback ? this.input.message : '');
      this.ui.clearHint();
      this.success.reset();
      this.hints.reset();
      this.effects.reset();
      this.city.setTimeScale(1);
      this.city.standBy();
      this.idleTime = 0;
      this.light.charge = 0;
    }

    if (s === 'STORY') {
      this._storyFinished = false;   // 重收尾守卫：每次进序章都要能正常收尾一次
      this.ui.hideAll();
      this.storyIndex = -1;
      this.storyMode = this.ui.beginStory(this.save) ? 'video' : 'text';
      // 序章视频播放中：光圈退场（画面里不该有灯），播完进入下一状态时由 setState 自动恢复
      if (this.storyMode === 'video') this.light.visible = false;
      this.city.standBy();
    }

    if (s === 'LEVEL_INTRO') {
      this.ui.hideAll();
      this.ui.showLevelIntro(this.level, this.save);
      this.city.standBy();
      this.success.setLevel(this.level);
      this.hints.setLevel(this.level);
      this._applyLightStyle();
      this.idleTime = 0;
    }

    if (s === 'PLAYING') {
      this.ui.hideAll();
      this.ui.clearHint();
      this.success.setLevel(this.level);
      this.hints.setLevel(this.level);
      this.city.start();
      this.city.setTimeScale(1);
      this.playTime = 0;
      this.loopsUsed = 1;
      this.lastPhase = this._phase();
      this.idleTime = 0;
      this.discoveryTimer = 0;
      this.discoveryWas = false;
      this.decoyCover = {};
      this.decoyTold = {};
      this.trapHits = 0;
      this.followedFake = false;
      this.eternalElapsed = 0;
      this.justCompletedAll = false;
      this.effects.reset();
      this.ui.showLevelBadge(this.level);
      // 空场前段（视频前 head 秒无灵杰）：开场先给一句提示，避免"满街找不到人"的挫败感
      if (this.level.head) {
        this.ui.toast('灵杰尚未入镇——先提灯照遍街巷，等他现身。', 6000);
      }
    }

    if (s === 'SUCCESS') {
      this.ui.clearHint();
      this.ui.hideLevelBadge();
      this.city.setTimeScale(0.3);
      // 灯钉在目标身上：由 _updateSuccess 每帧驱动（角色卡浮现后交还输入）
    }

    if (s === 'FINAL') {
      this.ui.hideAll();
      this.city.standBy();
      this.city.setTimeScale(1);
      this.idleTime = 0;
      // 有通关视频：视频先行（Canvas 演出让位）；无视频：维持 Canvas 补天演出
      this.finalVideoMode = this.ui.beginFinal(this.save);
      // 终幕视频播放中：光圈退场，面板浮现时再恢复（面板按钮需要凝视）
      if (this.finalVideoMode) this.light.visible = false;
      if (!this.finalVideoMode) this.effects.playSkyMend();
      // 终幕面板不立即出现：先看四印升空织补天幕（_updateFinal 按时序浮现）
    }

    if (s === 'LEVEL_SELECT') {
      this.ui.hideAll();
      this.ui.showLevelSelect(this.save);
      this.city.standBy();
      this.idleTime = 0;
    }

    if (s === 'FAIL') {
      this.ui.hideAll();
      this.ui.clearHint();
      this.ui.hideLevelBadge();
      this.city.standBy();
      this.ui.showFail(this.level);
    }

    if (s === 'LUCKY') {
      // 幸运转盘：清场只留转盘层；配乐走下方 else stopMusic 分支（留白 + 夜风）
      this.ui.hideAll();
      this.ui.clearHint();
      this.ui.hideLevelBadge();
      this.city.standBy();
      this.city.setTimeScale(1);
      this.idleTime = 0;
      this.light.charge = 0;
      this.ui.showLucky(this.save);
    }

    // —— 配乐随状态流转 ——
    //   序章 → 古钟（journey）；补天终幕 → 天梯上升（finale，v1.8.0 换曲）；
    //   找人游玩 → Silent Hunt 循环；其余界面留白（只有常驻夜风氛围层）。
    if (this.audio) {
      if (s === 'STORY') this.audio.playMusic('journey');
      else if (s === 'FINAL') this.audio.playMusic('finale');
      else if (s === 'PLAYING') this.audio.playMusic('hunt');
      else this.audio.stopMusic();
    }

    console.log('[状态] → ' + s);
  };

  /** 进入某一关（切视频 → 关前预告）。fromSelect=true 时返回键回选关 */
  Game.prototype.enterLevel = function (idx, fromSelect) {
    var level = MYC.Levels.get(idx);
    var self = this;
    this._introFrom = fromSelect ? 'select' : 'flow';
    this.ui.showLoading('前往 ' + level.scene + ' ……');
    this.city.switchLevel(level).then(function () {
      self.renderer.setStaticSource(self.city.getStaticFrame());
      self.ui.hideLoading();
      self.level = level;
      self.setState('LEVEL_INTRO');
    }).catch(function (err) {
      console.error('[切关失败]', err);
      self.ui.hideLoading();
      self.ui.toast('关卡视频加载失败：' + level.video, 8000);
      self.setState('ATTRACT');
    });
  };

  Game.prototype.requestStart = function () {
    if (this.state !== 'ATTRACT') return;
    if (this.ui.isModal()) return;   // 重置确认框打开时不响应
    if (this.audio) this.audio.unlock();
    var allDone = this.save.stones.length >= MYC.Levels.count();
    if (allDone && this.save.title) {
      this.setState('LEVEL_SELECT');
      return;
    }
    if (!this.save.sawStory) {
      this.setState('STORY');
      return;
    }
    var next = this._currentLevelIndex();
    this.enterLevel(next);
  };

  /** 进度推算：第一个未集印的关（全齐后回最后一关自由刷分） */
  Game.prototype._currentLevelIndex = function () {
    for (var i = 0; i < MYC.Levels.count(); i++) {
      var lv = MYC.Levels.get(i);
      if (this.save.stones.indexOf(lv.stone) < 0) return i;
    }
    return Math.min(this.save.unlockedLevel, MYC.Levels.count() - 1);
  };

  /* ============================================================
     每帧更新
     ============================================================ */
  Game.prototype.update = function (dt) {
    this.stateTime += dt;

    // 弹窗（设置/重置确认/角色卡）打开期间：游玩中真正暂停——冻结关卡逻辑并暂停视频，
    // 关闭后原地恢复（city.shouldPlay 重新点亮，city.update 会自动续播）。
    // 非 PLAYING 状态一律清除暂停标记，防止重置等切状态路径把游戏永久冻住。
    var modalOpen = this.ui.isModal();
    if (this.state !== 'PLAYING') {
      this._modalPaused = false;
    } else if (modalOpen && !this._modalPaused) {
      this._modalPaused = true;
      this.city.shouldPlay = false;
      if (this.city.video) { try { this.city.video.pause(); } catch (e) {} }
      if (this.audio) this.audio.pauseMusic();   // 配乐同步暂停
    } else if (!modalOpen && this._modalPaused) {
      this._modalPaused = false;
      this.city.shouldPlay = true;
      if (this.audio) this.audio.resumeMusic();  // 关闭弹窗原地续播
    }
    if (this._modalPaused) {
      // 弹窗冻结期间光圈必须继续跟随输入：否则光圈坐标定格在打开瞬间，
      // 永远照不到弹窗内的按钮（返回/关闭/设置），凝视触发集体失灵，
      // 玩家只能靠鼠标点击——这正是"按钮要点鼠标才有反应"的元凶。
      if (this.input.hasInput()) {
        var mpos = this.input.getPosition();
        if (mpos) {
          this.lightTarget.x = mpos.x;
          this.lightTarget.y = mpos.y;
        }
      }
      var followM = 1 - Math.exp(-30 * dt);
      this.light.x = U.ema(this.light.x, this.lightTarget.x, followM);
      this.light.y = U.ema(this.light.y, this.lightTarget.y, followM);
      this._updateGaze(dt);   // 面板按钮照常凝视
      return;                 // 关卡逻辑、城市视频、特效全部冻结
    }

    switch (this.state) {
      case 'ATTRACT': this._updateAttract(dt); break;
      case 'STORY': this._updateStory(dt); break;
      case 'LEVEL_INTRO': this._updateLevelIntro(dt); break;
      case 'PLAYING': this._updatePlaying(dt); break;
      case 'SUCCESS': this._updateSuccess(dt); break;
      case 'FINAL': this._updateFinal(dt); break;
      case 'LEVEL_SELECT': this._updateLevelSelect(dt); break;
      case 'FAIL': this._updateFail(dt); break;
      case 'LUCKY': this._updateLucky(dt); break;
    }

    // 非游玩态开了弹窗（角色卡详情/设置/重置确认）：
    // 状态机的光圈钉位（终幕升起、通关演出、待机静止、剧情播放等）必须让位给输入，
    // 否则光圈停在弹窗外面，框内按钮（✕/返回）和右上角 ⚙ 永远照不到，凝视集体失灵。
    // 不看 hasInput：弹窗开着时追最近一次输入位置即可——手里没灯时 pos 冻结，光圈也就原地不动。
    if (modalOpen && this.state !== 'PLAYING') {
      var modalPos = this.input.getPosition();
      if (modalPos) {
        this.lightTarget.x = modalPos.x;
        this.lightTarget.y = modalPos.y;
      }
    }

    // 凝视点击（所有状态都检测；PLAYING 中没有可见按钮自然不会触发）
    this._updateGaze(dt);

    // 光圈追着目标点走：帧率无关的指数平滑
    var followA = 1 - Math.exp(-30 * dt);
    this.light.x = U.ema(this.light.x, this.lightTarget.x, followA);
    this.light.y = U.ema(this.light.y, this.lightTarget.y, followA);
    this.city.update(dt);
    this.effects.update(dt);
  };

  /* ---------------- ATTRACT（待机：按钮驱动，不再"动一动就开"） ---------------- */
  Game.prototype._updateAttract = function (dt) {
    // 光圈只跟输入，绝不自动漂移：人正在照按钮等充能时，
    // 灯突然飘走会打断凝视进度（用户明确要求：任何时候都不要漂移）。
    if (this.input.hasInput()) {
      var pos = this.input.getPosition();
      if (pos) {
        this.lightTarget.x = pos.x;
        this.lightTarget.y = pos.y;
      }
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
    }
  };

  /* ---------------- STORY（序章） ---------------- */
  Game.prototype._updateStory = function (dt) {
    var cfg = this.config;

    if (this.storyMode === 'video') {
      // 视频模式：ui 已接管字幕；播放结束或中途关闭由 ui 回调
      if (this.ui.isStoryVideoEnded()) {
        this._finishStory();
      }
      return;
    }

    // 文字模式：打字机逐句
    var lines = cfg.STORY_LINES;
    var idx = Math.floor(this.stateTime / cfg.STORY_LINE_TIME);

    if (idx !== this.storyIndex) {
      this.storyIndex = idx;
      if (idx < lines.length) {
        this.ui.setStoryLine(lines[idx]);
        if (this.audio) this.audio.clue();
      }
    }
    if (idx >= lines.length) {
      this._finishStory();
    }
  };

  Game.prototype._finishStory = function () {
    // 防每帧重入：收尾链路是异步的（city.switchLevel 加载关卡视频期间 state 仍是 STORY，
    // 视频已 ended / 文字已超时的判定每帧都成立），不加守卫时 endStory + enterLevel
    // 会被并发调上百次——切关 promise 堆积、hideAll/stopNarration 每帧爆发。
    if (this._storyFinished) return;
    this._storyFinished = true;
    this.ui.endStory();
    this.save.sawStory = true;
    MYC.Save.write(this.save);
    this.enterLevel(this._currentLevelIndex());
  };

  /* ---------------- LEVEL_INTRO（关前预告：确认制，看完再出发） ---------------- */
  Game.prototype._updateLevelIntro = function (dt) {
    // 光圈只跟输入，不自动漂移：人正在照「开始寻 / 返回 / 放大角色卡」时
    // 灯不能自己飘走打断凝视进度。
    var pos = this.input.getPosition();
    if (pos && this.input.hasInput()) {
      this.lightTarget.x = pos.x;
      this.lightTarget.y = pos.y;
    }
  };

  /* ---------------- LEVEL_SELECT（自由选关） ---------------- */
  Game.prototype._updateLevelSelect = function (dt) {
    // 灯只跟手、不自动漂移：防止灯自己晃到关卡卡上被当成「选好了」。
    // 手离开 / 无操作超时才回待机。
    if (this.input.hasInput()) {
      var pos = this.input.getPosition();
      if (pos) {
        this.lightTarget.x = pos.x;
        this.lightTarget.y = pos.y;
      }
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
    }
    if (this.idleTime > this.config.IDLE_TIMEOUT) this.setState('ATTRACT');
  };

  /* ---------------- LUCKY（幸运转盘：照住星钮抽奖） ----------------
     灯只跟手不漂移，与选关页同理；揭晓弹窗开着时不清场，
     免得弹窗没收就被超时踢回待机（转盘 5.2s < IDLE_TIMEOUT，天然安全） */
  Game.prototype._updateLucky = function (dt) {
    if (this.input.hasInput()) {
      var pos = this.input.getPosition();
      if (pos) {
        this.lightTarget.x = pos.x;
        this.lightTarget.y = pos.y;
      }
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
    }
    if (!this.ui.isModal() && this.idleTime > this.config.IDLE_TIMEOUT) {
      this.setState('ATTRACT');
    }
  };

  /* ---------------- PLAYING（核心玩法） ---------------- */
  Game.prototype._updatePlaying = function (dt) {
    this.playTime += dt;

    var pos = this.input.getPosition();
    if (pos) {
      this.lightTarget.x = pos.x;
      this.lightTarget.y = pos.y;
    }

    if (this.input.hasInput()) this.idleTime = 0;
    else this.idleTime += dt;
    if (this.idleTime > this.config.IDLE_TIMEOUT) {
      this.setState('ATTRACT');
      return;
    }

    // 提示阶梯
    var h = this.hints.update(dt);
    if (h.changed) {
      this.ui.showHint(h.text);
      if (this.audio) this.audio.clue();
      if (this.hints.eternal()) {
        this.success.eternal = true;
        this.ui.toast('灵光不灭——照一点，攒一点', 4200);
        if (this.audio) this.audio.separation();
      }
    }

    var phase = this._phase();
    if (phase < this.lastPhase - 0.5) this.loopsUsed++;
    this.lastPhase = phase;

    // 灵杰段进度：带空场前段（level.head 秒）的视频，把全片进度映射到灵杰段；
    // 空场期间返回 -1——目标和迷障都不在场，照到谁都不算数。
    var seg = this._segPhase();

    // 目标位置 + 充能判定
    var targetPos = seg < 0 ? null : MYC.Levels.getTargetPos(this.level, seg);
    this.targetPos = targetPos;
    this.light.targetPos = targetPos;
    var res = this.success.update(this.light, targetPos, dt);
    this.light.charge = res.charge;
    this.light.covered = res.covered;

    // 干扰陷阱
    var decoys = seg < 0 ? [] : MYC.Levels.getDecoys(this.level, seg);
    this.light.decoys = decoys;
    var capR = this.level.radius * this.config.CAPTURE_RADIUS_SCALE;
    this.light.onDecoy = null;   // 渲染层即时预警用：当前正照住的诱饵（判定公式与上面完全一致）
    for (var di = 0; di < decoys.length; di++) {
      var d = decoys[di];
      var covering = U.dist(this.light.x, this.light.y, d.x, d.y) <= capR;
      if (covering) {
        this.light.onDecoy = d;
        this.decoyCover[d.id] = (this.decoyCover[d.id] || 0) + dt;
        if (this.decoyCover[d.id] > this.level.trapSec && !this.decoyTold[d.id]) {
          this.decoyTold[d.id] = true;
          this.followedFake = true;
          this.trapHits++;
          this.ui.showDecoyRemind(d.name + '：' + d.hint, this.config.TRAP_REMIND_SEC);
          if (this.audio) this.audio.miss();
        }
      }
    }

    // 发现音（照住目标的瞬间）
    if (res.covered && !this.discoveryWas) {
      if (this.audio) this.audio.chime();
    }
    this.discoveryWas = res.covered;

    // 灵光不灭后的失败倒计时（保底之外的真正放弃）
    if (this.hints.eternal()) {
      this.eternalElapsed += dt;
      if (this.eternalElapsed > this.config.FAIL_AFTER_ETERNAL) {
        this.setState('FAIL');
        return;
      }
    }

    if (res.success) {
      this._startSuccess();
      return;
    }

    if (this.audio) this.audio.updatePhase(phase, dt);
  };

  Game.prototype._startSuccess = function () {
    this.setState('SUCCESS');
    // 成功演出 + 角色卡 + 结算 的整条时间线由 _updateSuccess 驱动
  };

  Game.prototype._updateSuccess = function (dt) {
    var f = this.fired;
    var t = this.stateTime;
    var lv = this.level;

    // 演出期灯钉在目标身上；角色卡浮现后交还输入，好去照「下一关」
    if (t < this.config.CARD_REVEAL_DELAY) {
      var tp = this.targetPos || lv.sceneAnchor;
      this.lightTarget.x = tp.x;
      this.lightTarget.y = tp.y;
    } else {
      var pos = this.input.getPosition();
      if (pos) {
        this.lightTarget.x = pos.x;
        this.lightTarget.y = pos.y;
      }
    }

    if (!f.fx && t >= 0) {
      f.fx = true;
      this.effects.play(lv.successEffect, lv.sceneAnchor, this.light);
      if (this.audio) this.audio.crown();
    }

    if (!f.seal && t >= 1.4) {
      f.seal = true;
      if (this.audio) this.audio.success();
    }

    if (!f.card && t >= this.config.CARD_REVEAL_DELAY) {
      f.card = true;
      var result = this._computeScore();
      var rec = MYC.Save.recordLevelClear(this.save, lv, result.score);
      this.save = rec.save;
      this.justCompletedAll = rec.newlyComplete;
      this.ui.showSuccessPanel(lv, result, this.save, rec.newlyComplete);
      if (this.audio) this.audio.playVoice('spirit_' + lv.stone);
    }

    // 卡片显影 2.2 秒后弹「寻得指引」浮层：点角色卡听故事 + 找工作人员领奖
    // （v1.8.0；四印已齐时文案切到领奖强调）
    if (!f.guide && t >= this.config.CARD_REVEAL_DELAY + 2.2) {
      f.guide = true;
      this.ui.showGuidePop(this.justCompletedAll ||
                           this.save.stones.length >= MYC.Levels.count());
    }
  };

  Game.prototype._computeScore = function () {
    var hintsUsed = this.hints.count();
    var result = MYC.Score.compute({
      completed: true,
      firstLoop: this.loopsUsed <= 1,
      hintsUsed: hintsUsed,
      trapHits: this.trapHits,
      trapPenalty: this.level.trapPenalty
    });

    var total = Math.max(0, Math.round(this.playTime));
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    result.timeText = (mm > 0 ? mm + ' 分 ' : '') + (ss < 10 && mm > 0 ? '0' + ss : ss) + ' 秒';
    result.hintsText = hintsUsed === 0 ? '未使用' : (hintsUsed + ' 层');
    result.fakeText = this.followedFake ? '误照了迷障' : '识破迷障';
    return result;
  };

  /* ---------------- SUCCESS → 流转 ---------------- */
  Game.prototype.goNextLevel = function () {
    if (this.state !== 'SUCCESS') return;

    // 只有本关刚好集齐四印，才第一次上演补天终幕
    if (this.justCompletedAll) {
      this.setState('FINAL');
      return;
    }
    // 四印早已齐（重玩模式）：回自由选关，不再重演补天
    if (this.save.stones.length >= MYC.Levels.count()) {
      this.setState('LEVEL_SELECT');
      return;
    }
    this.enterLevel(this._currentLevelIndex());
  };

  /** 关前预告「返回」：从选关进来的回选关，其余回待机 */
  Game.prototype.introBack = function () {
    if (this.state !== 'LEVEL_INTRO') return;
    this.setState(this._introFrom === 'select' ? 'LEVEL_SELECT' : 'ATTRACT');
  };

  /** 结算「返回」：四印齐回选关，其余回待机 */
  Game.prototype.successBack = function () {
    if (this.state !== 'SUCCESS') return;
    var all = this.save.stones.length >= MYC.Levels.count();
    this.setState(all ? 'LEVEL_SELECT' : 'ATTRACT');
  };

  Game.prototype.replayLevel = function () {
    if (this.state !== 'SUCCESS' && this.state !== 'FINAL') return;
    this.enterLevel(this.level.index);
  };

  /* ---------------- FINAL（补天终幕） ---------------- */
  Game.prototype._updateFinal = function (dt) {
    var riseK = U.smoothstep(0.6, 3.4, this.stateTime);

    // 前段：梦灯从镇中缓缓升起，引着四印的光上天；
    // 升定之后交还输入——终幕面板的「再看一次 / 自由选关」也要能凝视
    if (riseK < 1) {
      this.lightTarget.x = 0.5;
      this.lightTarget.y = U.lerp(0.66, 0.34, riseK);
    } else {
      var pos = this.input.getPosition();
      if (pos) {
        this.lightTarget.x = pos.x;
        this.lightTarget.y = pos.y;
      }
      if (this.input.hasInput()) this.idleTime = 0;
      else this.idleTime += dt;
    }

    // 光织补完，终幕面板浮现（称号 / 四印 / 总分 / 按钮）
    // 视频模式：等通关视频放完（或兜底超时）再揭面板
    if (!this.fired.panel) {
      var panelDue = this.finalVideoMode
        ? (this.ui.isFinalVideoEnded() || this.stateTime >= this.config.FINAL_VIDEO_MAX)
        : (this.stateTime >= this.config.FINAL_PANEL_DELAY);
      if (panelDue) {
        this.fired.panel = true;
        this.light.visible = true;   // 视频放完：光圈归位，终幕面板按钮需要凝视
        this.ui.showFinal(this.save);
      }
    }

    if (this.stateTime > this.config.FINAL_RETURN_TIME ||
        this.idleTime > this.config.IDLE_TIMEOUT) {
      this.setState('ATTRACT');
    }
  };

  Game.prototype.replayFinal = function () {
    if (this.state !== 'FINAL') return;
    this.setState('FINAL');
  };

  /* ---------------- FAIL（超时未充满） ---------------- */
  Game.prototype._updateFail = function (dt) {
    this.lightTarget.x = 0.5;
    this.lightTarget.y = 0.5;
    if (this.stateTime > 3.2) this.setState('ATTRACT');
  };

  /* ============================================================
     凝视点击
     ------------------------------------------------------------
     防误触（armed 语义）：
     · 按钮随界面刚弹出时，如果灯恰好压在按钮上（比如待机漂移、
       上个界面停留的位置），必须先离开一次才能开始充能——
       否则会出现「选关界面还没动就自动选好了」的连环误触。
     · 充满触发后同样要求离开一次，防止同一点连环触发两个界面。
     · 重置确认框 / 角色卡放大框打开期间，只响应框内按钮（和输入切换、右上角 ⚙——
      ⚙ 常驻所有界面之上，任何弹窗期间都要能凝视唤出设置）。
     ============================================================ */
  Game.prototype._updateGaze = function (dt) {
    var btns = this.ui.getGazeButtons();
    if (!btns.length) return;

    var lx = this.renderer.view.px(this.light.x);
    var ly = this.renderer.view.py(this.light.y);
    // 真机手部输入自带抖动，光圈又有平滑滞后：把输入目标点（手的"意图位置"）
    // 一并纳入命中判定——意图点照着按钮就算照住，不再被平滑拖累。
    var tx = this.renderer.view.px(this.lightTarget.x);
    var ty = this.renderer.view.py(this.lightTarget.y);
    var tol = this.config.GAZE.HOLD_TOL;
    var modal = this.ui.isModal();

    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];

      if (modal && !b.el.closest('#reset-confirm') && !b.el.closest('#card-zoom') &&
          !b.el.closest('#settings') &&
          b.el.id !== 'input-toggle' && b.el.id !== 'btn-settings') continue;

      if (!b.visible()) {
        if (b.progress > 0) { b.progress = 0; b.ui.setProgress(b, 0); }
        b.seen = false;    // 下次可见时重新走武装流程
        b.armed = false;
        continue;
      }
      if (!b.seen) {
        b.seen = true;
        b.armed = false;   // 刚出现：若灯压着，等先离开
      }

      var r = b.rect();
      // 容差：小按钮（⚙/✕ 这类）至少外扩 24px 横向、14px 纵向——
      // 真机手抖下 8px 纵向容差太小，光圈反复充到八九成又被抖出边界清零
      var pad = Math.max(24, (r.width * (tol - 1)) / 2);
      var padY = Math.max(14, (r.height * (tol - 1)) / 2);
      var inL = lx >= r.left - pad && lx <= r.right + pad &&
                ly >= r.top - padY && ly <= r.bottom + padY;
      var inT = tx >= r.left - pad && tx <= r.right + pad &&
                ty >= r.top - padY && ty <= r.bottom + padY;
      var inside = inL || inT;   // 平滑灯位或输入意图点任一命中即可

      if (!inside) {
        b.armed = true;
        if (b.progress > 0) {
          // 离开的衰减放缓（1.1 倍速 ≈ 充能同量级）：手抖出界一瞬间
          // 不再把进度几乎清零，玩家看到的是"继续充满"而不是"永远差一点"
          b.progress = Math.max(0, b.progress - dt * 1.1);
          b.ui.setProgress(b, b.progress);
        }
        continue;
      }
      if (!b.armed) continue;

      b.progress = Math.min(1, b.progress + dt / this.config.GAZE.FILL_SEC);
      b.ui.setProgress(b, b.progress);
      // 首次充能教学：不少玩家不知道「照住 1.5 秒」这条规则——
      // 第一次看到进度环涨起来时就点明玩法（v1.8.0，只弹一次）
      if (!this._gazeHintShown) {
        this._gazeHintShown = true;
        this.ui.showHint('光圈照住按钮别动 · 停 1.5 秒即可点亮', 4.5);
      }
      if (b.progress >= 1) {
        b.progress = 0;
        b.armed = false;   // 触发后必须离开一次才能再触发
        b.ui.setProgress(b, 0);
        // 异常防护：提示音或回调任何一个抛错，都不允许吞掉触发动作——
        // 真机上音频上下文/弹窗元素处于边缘状态时曾导致"圈满无反应"
        if (this.audio) {
          try { this.audio.crown(); }
          catch (toneErr) { console.error('[凝视] 提示音异常（已跳过）', toneErr); }
        }
        try {
          console.info('[凝视] 触发 →', b.el.id || b.el.className);
          b.onClick();
        } catch (cbErr) {
          console.error('[凝视] 回调异常：' + (b.el.id || b.el.className), cbErr);
        }
      }
    }
  };

  /* ---------------- 重置进度 ---------------- */
  Game.prototype.resetAll = function () {
    if (this.audio) this.audio.crown();
    MYC.Save.reset();
    // 清档后整页重载：摄像头/素材/存档全部走一遍全新开机流程
    setTimeout(function () { location.reload(); }, 350);
  };

  /* ============================================================
     工具
     ============================================================ */
  Game.prototype._applyLightStyle = function () {
    var lv = this.level;
    if (!lv) return;
    this.renderer.setLightStyle({
      color: lv.light.color,
      core: lv.light.core,
      glow: lv.light.glow,
      ring: lv.light.ring,
      scale: lv.lightScale || 1
    });
    // UI（按钮进度环 / 角标 / 结算框）跟随当前灵色
    document.documentElement.style.setProperty('--light-color', lv.light.color);
  };

  Game.prototype._loopSeconds = function () {
    if (this.city.getDuration) {
      var d = this.city.getDuration();
      if (d && isFinite(d) && d > 1) return d;
    }
    return 15;
  };

  Game.prototype._phase = function () {
    var loop = this._loopSeconds();
    if (!loop) return 0;
    return ((this.city.getTime() % loop) + loop) % loop / loop;
  };

  /** 灵杰段进度：扣掉视频前面的空场段（level.head 秒）。
   *  目标轨迹 / 迷障窗口都以"灵杰段"归一化标定，与空场拼接解耦。
   *  空场期间（灵杰还没入镇）返回 -1。 */
  Game.prototype._segPhase = function () {
    var head = (this.level && this.level.head) || 0;
    var phase = this._phase();
    if (!head) return phase;
    var total = this._loopSeconds();
    var segLen = total - head;
    if (segLen <= 1) return phase;
    var segT = phase * total - head;
    return segT < 0 ? -1 : segT / segLen;
  };

  Game.prototype.toggleDebug = function () {
    this.debug = this.ui.toggleDebug();
    if (this.debug) this._updateDebugPanel();
    else this.ui.setDebug(false);
  };

  Game.prototype.render = function (dt) {
    this.renderer.render(this.city, this.light, this.effects, this.debug, dt);
    if (this.debug) this._updateDebugPanel();
  };

  Game.prototype._updateDebugPanel = function () {
    var phase = this._phase();
    var lv = this.level;
    var tp = this.targetPos;
    var inWindow = tp !== null;
    var covered = this.light.covered;

    var inputType = 'none';
    if (this.input.driver) inputType = this.input.driver.constructor.name;

    var lines = [
      '状态: ' + this.state,
      '关卡: ' + (lv ? (lv.index + 1) + ' ' + lv.name + '（找' + lv.targetName + '）' : '无'),
      '输入: ' + inputType,
      '灯位置: ' + this.light.x.toFixed(3) + ', ' + this.light.y.toFixed(3),
      '视频时间: ' + this.city.getTime().toFixed(1) + 's / ' + this._loopSeconds().toFixed(1) + 's',
      '循环进度: ' + phase.toFixed(3) + '  循环数: ' + this.loopsUsed,
      '目标坐标: ' + (tp ? tp.x.toFixed(3) + ', ' + tp.y.toFixed(3) : '不在场'),
      '照住目标: ' + (covered ? '是' : '否'),
      '充能进度: ' + (this.success.charge * 100).toFixed(1) + '%' +
        (this.success.eternal ? '（灵光不灭）' : ''),
      '场上假目标: ' + ((this.light.decoys && this.light.decoys.length)
        ? this.light.decoys.map(function (d) { return d.name; }).join('、') : '无'),
      '照错次数: ' + this.trapHits + '  提示层: ' + this.hints.count(),
      '存档: 印 ' + this.save.stones.join(',') + '  解锁至第 ' + (this.save.unlockedLevel + 1) + ' 关',
      '',
      '（调试时点击画面可记录校准坐标）'
    ].join('\n');

    var camEl = (this.input.driver && this.input.driver.getCameraElement)
      ? this.input.driver.getCameraElement() : null;

    this.ui.setDebug(true, lines, camEl);
  };

  MYC.Game = Game;

})(window.MYC);
