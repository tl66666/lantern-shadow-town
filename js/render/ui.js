/**
 * 灯影古镇 · 界面层
 * ============================================================
 * 负责所有 HTML 覆盖层的显示/隐藏与文字更新：
 * 加载、待机（四灵卡槽+打字机）、序章（文字/视频）、关前教学、
 * 游玩提示、假目标提醒、成功结算（角色卡+四印）、补天终幕、
 * 自由选关、失败、错误、调试面板。
 *
 * 凝视点击：所有 .btn-gaze 按钮注册进列表，由 game 每帧驱动
 * 进度环（--gp CSS 变量），涨满即触发 onClick——鼠标手势通吃。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var U = MYC.U;

  function UI(config) {
    this.config = config;
    this._audio = null;   // 音频实例由 main 组装后注入（播旁白用，v1.8.0）

    this.el = {
      loading:      document.getElementById('loading'),
      loadingText:  document.getElementById('loading-text'),
      attract:      document.getElementById('attract'),
      attractTyped: document.getElementById('attract-typed'),
      attractCards: document.getElementById('attract-cards'),
      attractProg:  document.getElementById('attract-progress'),
      attractIn:    document.getElementById('attract-input'),
      btnStart:     document.getElementById('btn-start'),
      story:        document.getElementById('story'),
      storyVideo:   document.getElementById('story-video'),
      storyText:    document.getElementById('story-text'),
      levelIntro:   document.getElementById('level-intro'),
      levelBadge:   document.getElementById('level-badge'),
      introCardFrame: document.getElementById('intro-card-frame'),
      introCardImg: document.getElementById('intro-card-img'),
      hint:         document.getElementById('hint'),
      hintText:     document.getElementById('hint-text'),
      decoyRemind:  document.getElementById('decoy-remind'),
      decoyText:    document.getElementById('decoy-remind-text'),
      success:      document.getElementById('success'),
      successCardImg: document.getElementById('spirit-card-img'),
      successCard:  document.getElementById('spirit-card'),
      successCardFrame: document.getElementById('spirit-card-frame'),
      successCardGlyph: document.getElementById('spirit-card-glyph'),
      successQuote: document.getElementById('spirit-quote'),
      successPanel: document.getElementById('success-panel'),
      successTitle: document.getElementById('success-title'),
      successScore: document.getElementById('success-score'),
      stoneRow:     document.getElementById('stone-row'),
      nextLine:     document.getElementById('next-line'),
      btnNext:      document.getElementById('btn-next'),
      btnReplay:    document.getElementById('btn-replay'),
      btnSuccessBack: document.getElementById('btn-success-back'),
      final:        document.getElementById('final'),
      finalVideo:   document.getElementById('final-video'),
      finalVideoText: document.getElementById('final-video-text'),
      finalTotal:   document.getElementById('final-total'),
      finalStones:  document.getElementById('final-stones'),
      btnFinalReplay: document.getElementById('btn-final-replay'),
      btnFinalSelect:  document.getElementById('btn-final-select'),
      levelSelect:  document.getElementById('level-select'),
      selectGrid:   document.getElementById('select-grid'),
      btnSelectBack: document.getElementById('btn-select-back'),
      guidePop:     document.getElementById('guide-pop'),
      guideTitle:   document.getElementById('guide-title'),
      guideLine2:   document.getElementById('guide-line-2'),
      resetConfirm: document.getElementById('reset-confirm'),
      cardZoom:     document.getElementById('card-zoom'),
      zoomFrame:    document.querySelector('.zoom-frame'),
      zoomImg:      document.getElementById('zoom-card-img'),
      zoomGlyph:    document.getElementById('zoom-card-glyph'),
      zoomTitle:    document.getElementById('zoom-card-title'),
      zoomSubtitle: document.getElementById('zoom-card-subtitle'),
      zoomDesc:     document.getElementById('zoom-card-desc'),
      zoomLightDot: document.getElementById('zoom-card-lightdot'),
      zoomLightName: document.getElementById('zoom-card-lightname'),
      zoomScene:    document.getElementById('zoom-card-scene'),
      zoomSealName: document.getElementById('zoom-card-sealname'),
      zoomSeal:     document.getElementById('zoom-card-seal'),
      settings:     document.getElementById('settings'),
      settingsProgress: document.getElementById('settings-progress'),
      settingsStats: document.getElementById('settings-stats'),
      settingsVersion: document.getElementById('settings-version'),
      fail:         document.getElementById('fail'),
      failText:     document.getElementById('fail-text'),
      error:        document.getElementById('error'),
      errorText:    document.getElementById('error-text'),
      toast:        document.getElementById('toast'),
      inputToggle:  document.getElementById('input-toggle'),
      debug:        document.getElementById('debug'),
      debugText:    document.getElementById('debug-text'),
      debugCam:     document.getElementById('debug-camera'),
      // 幸运转盘（v1.11.0：通关谢礼，仅此一次）
      lucky:        document.getElementById('lucky'),
      luckyWheel:   document.getElementById('lucky-wheel'),
      luckyGo:      document.getElementById('btn-lucky-go'),
      luckyHint:    document.getElementById('lucky-hint'),
      luckyBurst:   document.getElementById('lucky-burst'),
      luckyLight:   document.getElementById('lucky-light'),
      luckyFootNote: document.getElementById('lucky-foot-note'),
      btnFinalLucky: document.getElementById('btn-final-lucky'),
      btnLuckyContinue: document.getElementById('btn-lucky-continue')
    };

    this._toastTimer = null;
    this._hintTimer = null;
    this._decoyTimer = null;
    this._guideTimer = null;
    this._typeTimer = null;
    this._storyVideoOk = null;   // null=未探测 true/false
    this._storyEnded = false;
    this._storyLineIdx = -1;
    this._finaleVideoOk = null;  // 通关视频探测：null=未探测 true/false
    this._finalVideoEnded = false;
    this._finalLineIdx = -1;
    this._introLevel = null;     // 当前预告界面显示的关（缩放用）
    this._successLevel = null;   // 当前结算界面显示的关（缩放用）

    this._cb = {
      replay: null, next: null, finalReplay: null, introStart: null,
      levelSelect: null, gazeToggle: null, finalSelect: null,
      selectBack: null, resetConfirm: null,
      startGame: null, introBack: null, successBack: null,
      finalLucky: null, luckyGo: null, luckyContinue: null
    };

    this._gazeButtons = [];
    this._modal = null;   // 'reset' = 重置确认框打开（凝视只认框内按钮）

    var self = this;

    // 固定按钮：点击回调 + 注册凝视
    function bind(id, cb) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (cb) cb();
      });
      self._registerGaze(el, function () { if (cb) cb(); });
    }

    bind('btn-next', function () { if (self._cb.next) self._cb.next(); });
    bind('btn-replay', function () { if (self._cb.replay) self._cb.replay(); });
    bind('btn-intro-start', function () { if (self._cb.introStart) self._cb.introStart(); });
    bind('btn-intro-back', function () { if (self._cb.introBack) self._cb.introBack(); });
    bind('btn-start', function () { if (self._cb.startGame) self._cb.startGame(); });
    bind('btn-success-back', function () { if (self._cb.successBack) self._cb.successBack(); });
    bind('btn-final-replay', function () { if (self._cb.finalReplay) self._cb.finalReplay(); });
    bind('btn-final-select', function () { if (self._cb.finalSelect) self._cb.finalSelect(); });
    bind('btn-select-back', function () { if (self._cb.selectBack) self._cb.selectBack(); });
    bind('btn-reset-final', function () { self.showResetConfirm(); });
    bind('btn-reset-select', function () { self.showResetConfirm(); });
    bind('btn-reset-confirm', function () { if (self._cb.resetConfirm) self._cb.resetConfirm(); });
    bind('btn-reset-cancel', function () { self.hideResetConfirm(); });
    bind('btn-zoom-back', function () { self.hideCardZoom(); });
    bind('btn-zoom-close', function () { self.hideCardZoom(); });
    // 幸运转盘：终幕入口 / 中央星钮开转 / 揭晓收下（v1.11.0）
    // 星钮转过后带 .spun（退光禁点）：凝视重复触发也在回调里拦掉
    bind('btn-final-lucky', function () { if (self._cb.finalLucky) self._cb.finalLucky(); });
    bind('btn-lucky-go', function () {
      if (self.el.luckyGo && self.el.luckyGo.classList.contains('spun')) return;
      if (self._cb.luckyGo) self._cb.luckyGo();
    });
    bind('btn-lucky-continue', function () { if (self._cb.luckyContinue) self._cb.luckyContinue(); });

    // 右上角设置：任何界面都可打开，包括角色卡详情/重置确认开着的时候——
    // showSettings 会先收起底层弹窗（设置面板独占弹窗位）。
    // 游玩中打开会真正暂停关卡（冻结逻辑并暂停视频，见 game.update），关闭后原地恢复。
    bind('btn-settings', function () {
      self.showSettings();
    });
    bind('btn-settings-close', function () { self.hideSettings(); });
    bind('btn-settings-reset', function () { self.hideSettings(); self.showResetConfirm(); });

    // ESC：随手关弹窗（重置确认是危险操作，不代答）
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (self._modal === 'zoom') self.hideCardZoom();
      else if (self._modal === 'settings') self.hideSettings();
    });

    // 点背板空白处也能关（点到面板本体不关）
    if (this.el.cardZoom) {
      this.el.cardZoom.addEventListener('click', function (e) {
        if (e.target === self.el.cardZoom) self.hideCardZoom();
      });
    }
    if (this.el.settings) {
      this.el.settings.addEventListener('click', function (e) {
        if (e.target === self.el.settings) self.hideSettings();
      });
    }

    // 角色卡：点击 / 凝视 → 放大细观（预告页未寻得的卡只给提示）
    if (this.el.introCardFrame) {
      var introFrame = this.el.introCardFrame;
      var zoomIntro = function () {
        var lv = self._introLevel;
        if (!lv) return;
        var got = self._lastSave && self._lastSave.stones.indexOf(lv.stone) >= 0;
        if (got) self.showCardZoom(lv);
        else self.toast('尚未寻得此灵——寻得后，角色卡将显影', 3600);
      };
      introFrame.addEventListener('click', function (e) { e.stopPropagation(); zoomIntro(); });
      this._registerGaze(introFrame, zoomIntro);
    }
    if (this.el.successCardFrame) {
      var spiritFrame = this.el.successCardFrame;
      var zoomSpirit = function () {
        if (self._successLevel) self.showCardZoom(self._successLevel);
      };
      spiritFrame.addEventListener('click', function (e) { e.stopPropagation(); zoomSpirit(); });
      this._registerGaze(spiritFrame, zoomSpirit);
    }

    if (this.el.inputToggle) {
      this.el.inputToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (self._cb.gazeToggle) self._cb.gazeToggle();
      });
      this._registerGaze(this.el.inputToggle, function () {
        if (self._cb.gazeToggle) self._cb.gazeToggle();
      });
    }

    // 预热探测序章视频是否存在（boot 到进入 STORY 之间结果大概率已就绪）
    // 用 HEAD：GET 会把整个视频拖进连接却无人消费，占死连接池
    fetch(config.ASSETS.introVideo, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { self._storyVideoOk = r.ok; })
      .catch(function () { self._storyVideoOk = false; });

    // 同样预热探测通关视频（四印集齐的补天终幕用；不存在则回退 Canvas 演出）
    fetch(config.ASSETS.finaleVideo, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { self._finaleVideoOk = r.ok; })
      .catch(function () { self._finaleVideoOk = false; });
  }

  /* ============================================================
     凝视按钮
     ============================================================ */
  UI.prototype._registerGaze = function (el, onClick) {
    var self = this;
    this._gazeButtons.push({
      el: el,
      onClick: onClick,
      progress: 0,
      ui: self,
      visible: function () {
        // display:none / 未挂文档的按钮直接不可见（v1.13.0）：结算页收起的
        // 「再寻一次」若仍算可见，全零矩形 + 24px 容差会在屏幕左上角
        // 形成幽灵热区，手光路过的瞬间就可能误触发断流程按钮
        if (el.getClientRects().length === 0) return false;
        var layer = el.closest('.layer');
        if (layer) return layer.classList.contains('show');
        return document.body.contains(el);
      },
      rect: function () { return el.getBoundingClientRect(); }
    });
  };

  /** game 每帧调用：返回可凝视按钮列表 */
  UI.prototype.getGazeButtons = function () {
    return this._gazeButtons;
  };

  /** 写进度环（0~1） */
  UI.prototype.setProgress = function (b, p) {
    if (!b.el) return;
    b.el.style.setProperty('--gp', p.toFixed(3));
    if (p > 0.02) b.el.classList.add('gazing');
    else b.el.classList.remove('gazing');
  };

  /* ============================================================
     基础显示控制
     ============================================================ */
  UI.prototype.show = function (name) {
    var el = this.el[name];
    if (el) el.classList.add('show');
  };

  UI.prototype.hide = function (name) {
    var el = this.el[name];
    if (el) el.classList.remove('show');
  };

  UI.prototype.hideAll = function () {
    ['loading', 'attract', 'story', 'levelIntro', 'hint', 'decoyRemind',
     'success', 'final', 'levelSelect', 'fail', 'error', 'resetConfirm', 'cardZoom',
     'settings', 'guidePop', 'lucky'].forEach(function (n) {
      var el = this.el[n];
      if (el) el.classList.remove('show');
    }, this);
    // 通关视频：离开终幕时停播清场（防隐藏层里继续解码）
    this.stopFinalVideo();
    // 寻得指引浮层的自动退场定时一并清掉
    // （指引配音不再靠定时切割，切场景由下方 stopNarration 统一收声，v1.12.0）
    if (this._guideTimer) { clearTimeout(this._guideTimer); this._guideTimer = null; }
    // 幸运转盘的旋转帧驱动/停稳/揭晓一并清掉：中途离开不残留庆祝特效与配音（v1.12.0）
    if (this._luckyRaf) { cancelAnimationFrame(this._luckyRaf); this._luckyRaf = null; }
    if (this._luckyStopTimer) { clearTimeout(this._luckyStopTimer); this._luckyStopTimer = null; }
    if (this._luckyRevealTimer) { clearTimeout(this._luckyRevealTimer); this._luckyRevealTimer = null; }
    this._luckySpinning = false;
    if (this._audio) this._audio.stopNarration(0.3);
    this._modal = null;
    this.clearHint();
  };

  /** 停掉通关视频并复位字幕/面板遮罩（幂等，可安全反复调用） */
  UI.prototype.stopFinalVideo = function () {
    var v = this.el.finalVideo;
    if (v) {
      try { v.pause(); } catch (e) {}
      v.classList.add('hidden-video');
      v.ontimeupdate = null;
      v.onended = null;
      v.onerror = null;
    }
    if (this.el.finalVideoText) this.el.finalVideoText.classList.remove('show');
    if (this.el.final) this.el.final.classList.remove('no-panel');
    this._finalVideoEnded = false;
    this._finalLineIdx = -1;
  };

  /* ============================================================
     角色卡放大细观（弹窗：盖在预告/结算之上，凝视只认框内按钮）
     ============================================================ */
  // 灵光颜色的雅称（卷宗「灵光偏好」条目用）
  var LIGHT_NAMES = { meng: '青碧', fu: '朱红', shi: '鎏金', hua: '月白' };

  /* ============================================================
     幸运转盘四奖品（v1.12.0 · 棒棒糖都是一个味道，只是专属图案不一样）
     —— 转盘画面不动，转的是灯光；灯光直接停在奖励所在的方位
       （12 点方向 = 0° 顺时针，与 lucky.jpg 四个角色的菱形方位对应）：
       大芬萌莎 = 左上粉 → 灯光停 315°
       龙岗神马 = 右上黄 → 灯光停 45°
       甘坑李白 = 右下蓝 → 灯光停 135°
       大运梦鹿 = 左下绿 → 灯光停 225°
     · stopAngle：灯光光柱最终指向的方位角（扇区正中）
     · sticker / color：揭晓弹窗糖面圆牌上的角色字与主题色
     ============================================================ */
  var LUCKY_PRIZES = [
    {
      key: 'mengsha', name: '大芬萌莎', sticker: '萌', color: '#ff8fab',
      audio: 'assets/audio/萌莎棒棒糖.mp3', stopAngle: 315,
      desc: '萌莎小仙女的专属棒棒糖，粉粉的甜里藏着大芬油画村的浪漫。'
    },
    {
      key: 'shenma', name: '龙岗神马', sticker: '神', color: '#ffb347',
      audio: 'assets/audio/神马棒棒糖.mp3', stopAngle: 45,
      desc: '神马踏着祥云奔来，元气满满，把龙岗的夜空都点亮了。'
    },
    {
      key: 'libai', name: '甘坑李白', sticker: '李', color: '#6db3f2',
      audio: 'assets/audio/甘坑李白棒棒糖.mp3', stopAngle: 135,
      desc: '李白举杯邀月醉卧甘坑，这支棒棒糖也甜出了诗意的小气泡。'
    },
    {
      key: 'menglu', name: '大运梦鹿', sticker: '鹿', color: '#7ed491',
      audio: 'assets/audio/大运梦鹿棒棒糖.mp3', stopAngle: 225,
      desc: '梦鹿驮着晨光轻奔，大运新城的那抹绿意，落在了这颗糖上。'
    }
  ];

  UI.prototype.showCardZoom = function (level) {
    if (!level || !this.el.cardZoom) return;
    var frame = this.el.zoomFrame;
    var img = this.el.zoomImg;
    // 图片加载兜底：万一图缺失，显示灵纹占位而不是黑盒
    img.onload = function () { if (frame) frame.classList.remove('zoom-noimg'); };
    img.onerror = function () { if (frame) frame.classList.add('zoom-noimg'); };
    img.src = level.card.fullImage || level.card.image;
    this.el.zoomTitle.textContent = level.card.title;
    this.el.zoomSubtitle.textContent = level.card.subtitle;
    this.el.zoomDesc.textContent = level.card.desc;
    // 卷宗情报：偏好灵光 / 出没场景 / 所属灵印——既是题跋装饰，也是真实的寻灵线索
    if (this.el.zoomLightDot) this.el.zoomLightDot.style.background = level.light.color;
    if (this.el.zoomLightName) this.el.zoomLightName.textContent = LIGHT_NAMES[level.stone] || '灵光';
    if (this.el.zoomScene) this.el.zoomScene.textContent = level.scene || '古镇某处';
    if (this.el.zoomSealName) this.el.zoomSealName.textContent =
      (level.stoneGlyph || '灵') + ' · ' + (level.sealName || '灵印');
    if (this.el.zoomGlyph) this.el.zoomGlyph.textContent = level.stoneGlyph || '灵';
    if (this.el.zoomSeal) this.el.zoomSeal.textContent = level.stoneGlyph || '灵';
    if (frame) {
      frame.classList.toggle('zoom-noimg', !img.complete || !img.naturalWidth);
      frame.setAttribute('data-stone', level.stone || '');
    }
    this.el.cardZoom.style.setProperty('--light-color', level.light.color);
    this._modal = 'zoom';
    this.el.cardZoom.classList.add('show');
  };

  UI.prototype.hideCardZoom = function () {
    if (this.el.cardZoom) this.el.cardZoom.classList.remove('show');
    if (this._modal === 'zoom') this._modal = null;
  };

  /* ============================================================
     重置确认（弹窗：盖在待机/选关之上，凝视只认框内按钮）
     ============================================================ */
  UI.prototype.showResetConfirm = function () {
    if (!this.el.resetConfirm) return;
    this._modal = 'reset';
    this.el.resetConfirm.classList.add('show');
  };

  UI.prototype.hideResetConfirm = function () {
    this._modal = null;
    if (this.el.resetConfirm) this.el.resetConfirm.classList.remove('show');
  };

  /* ============================================================
     设置面板（弹窗：四灵印进度 + 清除数据入口 + 版本）
     ============================================================ */
  UI.prototype.showSettings = function () {
    if (!this.el.settings) return;

    // 设置面板独占弹窗位：若角色卡详情/重置确认正开着，先收起再开设置——
    // _modal 只有单标记，直接覆盖会让收起逻辑对不上号（关掉设置后底层弹窗还挂着）。
    if (this._modal === 'zoom') this.hideCardZoom();
    else if (this._modal === 'reset') this.hideResetConfirm();

    // 四灵印进度：获得的实心发光，未获得的虚线空槽
    if (this.el.settingsProgress) {
      this.el.settingsProgress.innerHTML = '';
      var levels = MYC.Levels.all;
      var stones = this._lastSave ? (this._lastSave.stones || []) : [];
      for (var i = 0; i < levels.length; i++) {
        var lv = levels[i];
        var got = stones.indexOf(lv.stone) >= 0;
        var gem = document.createElement('div');
        gem.className = 'settings-gem' + (got ? ' got' : '');
        gem.textContent = lv.stoneGlyph || '灵';
        gem.title = got ? lv.levelLabel : '尚未寻得';
        this.el.settingsProgress.appendChild(gem);
      }
    }

    // 统计一句话：进度 + 最高分合计
    if (this.el.settingsStats) {
      var all = MYC.Levels.all;
      var st = this._lastSave ? (this._lastSave.stones || []) : [];
      var gotCount = 0;
      for (var j = 0; j < all.length; j++) {
        if (st.indexOf(all[j].stone) >= 0) gotCount++;
      }
      var bestSum = 0;
      var best = this._lastSave ? this._lastSave.bestScores : {};
      for (var k in best) {
        if (best.hasOwnProperty(k)) bestSum += (best[k] || 0);
      }
      this.el.settingsStats.textContent =
        '已寻得 ' + gotCount + ' / ' + all.length + ' 灵印' +
        (gotCount >= all.length ? ' · 四灯同明！' : '') +
        ' · 各关最高分合计 ' + bestSum + ' 分';
    }

    if (this.el.settingsVersion && this.config.BUILD) {
      this.el.settingsVersion.textContent = this.config.BUILD;
    }

    this._modal = 'settings';
    this.el.settings.classList.add('show');
  };

  UI.prototype.hideSettings = function () {
    if (this.el.settings) this.el.settings.classList.remove('show');
    if (this._modal === 'settings') this._modal = null;
  };

  UI.prototype.isModal = function () {
    return !!this._modal;
  };

  /* ============================================================
     加载
     ============================================================ */
  UI.prototype.showLoading = function (text) {
    if (this.el.loadingText) this.el.loadingText.textContent = text || '正在点亮古镇……';
    this.show('loading');
  };

  UI.prototype.hideLoading = function () { this.hide('loading'); };

  /* ============================================================
     ATTRACT（待机：四灵卡槽 + 打字机 + 进度）
     ============================================================ */
  UI.prototype.showAttract = function (save, allDone, inputText) {
    this.hideAll();
    this._lastSave = save;
    this._buildAttractCards(save);
    if (this.el.attractProg) {
      var lv;
      if (allDone) {
        lv = MYC.Levels.get(MYC.Levels.count() - 1);
        this.el.attractProg.textContent = '四印已齐 · 自由选关';
      } else {
        lv = null;
        for (var i = 0; i < MYC.Levels.count(); i++) {
          var L = MYC.Levels.get(i);
          if (save.stones.indexOf(L.stone) < 0) { lv = L; break; }
        }
        if (!lv) lv = MYC.Levels.get(0);
        this.el.attractProg.textContent = lv.levelLabel + '　·　' + lv.scene;
      }
    }
    if (this.el.attractIn) this.el.attractIn.textContent = inputText || '';
    if (this.el.btnStart) {
      this.el.btnStart.textContent = allDone
        ? '自由选关'
        : (save.sawStory ? '继续寻灵' : '开始游戏');
    }

    this._typeWriter(this.el.attractTyped, this.config.ATTRACT_LINES);
    this.show('attract');
  };

  UI.prototype._buildAttractCards = function (save) {
    var box = this.el.attractCards;
    if (!box) return;
    box.innerHTML = '';
    // 重建前先清掉上一轮待机卡的凝视注册（同选关页 select-item 的做法）
    this._gazeButtons = this._gazeButtons.filter(function (b) {
      return !b.el.classList.contains('attract-card');
    });
    var levels = MYC.Levels.all;
    var self = this;
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      var got = save.stones.indexOf(lv.stone) >= 0;
      var d = document.createElement('div');
      // 已寻得卡加 btn-gaze：凝视时卡框亮边 + 进度环；未寻得保留「？」槽样式
      d.className = 'attract-card' + (got ? ' got btn-gaze' : '');
      // 未寻得：绝不加载卡面图（防剧透），用 1px 透明占位，画面交给 CSS 的「？」呼吸符
      // 小卡一律用裁剪版 thumbnail（带1），完整图只给放大弹窗
      var cardSrc = got ? (lv.card.thumbnail || lv.card.image)
                        : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      d.innerHTML =
        '<img src="' + cardSrc + '" alt="' + (got ? lv.targetName : '？') + '" draggable="false" />' +
        '<span class="card-name">' + lv.targetName + '</span>' +
        '<span class="card-stone">' + lv.stoneGlyph + '</span>';
      // 待机卡可点也可照：已寻得的直接放大细观；未寻得的给一句指引（凝视与点击同效）
      var openCard = (function (level, isGot) {
        return function () {
          if (self._modal) return;               // 已有弹窗打开时不响应
          if (isGot) self.showCardZoom(level);
          else self.toast('尚未寻得此灵——寻得后，待机卡将显影', 3200);
        };
      })(lv, got);
      d.addEventListener('click', function (e) { e.stopPropagation(); openCard(); });
      self._registerGaze(d, openCard);
      box.appendChild(d);
    }
  };

  /* ---------------- 打字机 ---------------- */
  UI.prototype._typeWriter = function (el, lines) {
    if (this._typeTimer) { clearInterval(this._typeTimer); this._typeTimer = null; }
    if (!el) return;
    el.innerHTML = '';

    var li = 0, ci = 0;
    var spans = [];
    for (var i = 0; i < lines.length; i++) {
      var s = document.createElement('div');
      s.className = 'typed-line';
      el.appendChild(s);
      spans.push(s);
    }

    var self = this;
    this._typeTimer = setInterval(function () {
      if (li >= lines.length) {
        clearInterval(self._typeTimer);
        self._typeTimer = null;
        return;
      }
      var line = lines[li];
      spans[li].textContent = line.slice(0, ++ci);
      if (ci >= line.length) { li++; ci = 0; }
    }, 90);
  };

  /* ============================================================
     STORY（序章：文字 / 可选视频）
     ============================================================ */

  /** 注入音频实例（main 组装后调用）；UI 用它播序章/终幕旁白整轨 */
  UI.prototype.setAudio = function (audio) { this._audio = audio; };

  /** 开始序章。返回 true = 视频模式（assets/videos/prologue.mp4 存在时启用） */
  UI.prototype.beginStory = function () {
    this.hideAll();
    this._storyEnded = false;
    this._storyLineIdx = -1;
    this.show('story');

    var useVideo = this._storyVideoOk === true;
    var v = this.el.storyVideo;

    if (useVideo && v) {
      v.classList.remove('hidden-video');
      v.style.display = 'block';
      this.el.storyText.classList.add('video-mode');
      // 关键修复：显式赋源（此前从未赋 src，play() 空转 → 黑屏卡死）
      v.src = this.config.ASSETS.introVideo;
      try { v.load(); } catch (e) {}
      v.currentTime = 0;
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 手势激活内自动播 */ });
      // 旁白整轨随视频同步播（配音 15.96s 略长于视频 15.04s，结尾由 endStory 淡出收掉）
      if (this._audio) this._audio.playNarration(this.config.ASSETS.voicePrologue);
      var self = this;
      v.ontimeupdate = function () { self._storySubtitles(); self._clearStoryWatch(); };
      v.onended = function () { self._storyEnded = true; self._clearStoryWatch(); };
      v.onerror = function () {
        self._storyVideoOk = false;   // 此后直接回退文字模式
        self._storyEnded = true;      // 本次也放行，绝不卡死
        self._clearStoryWatch();
      };
      // 看门狗：8s 内画面仍未推进（加载失败/播放被拦）→ 降级放行
      self._clearStoryWatch();
      self._storyWatch = setTimeout(function () {
        if (!self._storyEnded && (!v.duration || v.currentTime < 0.1)) v.onerror();
      }, 8000);
    } else {
      if (v) { v.style.display = 'none'; v.classList.add('hidden-video'); }
      if (this.el.storyText) this.el.storyText.classList.remove('video-mode');
    }
    return useVideo;
  };

  /** 视频字幕：按视频时长均分 STORY_LINES */
  UI.prototype._storySubtitles = function () {
    var v = this.el.storyVideo;
    if (!v || !v.duration) return;
    var lines = this.config.STORY_LINES;
    // 字幕对句优先按配音时间轴（voice-timings.js）；缺配置时回退均分
    var timings = (window.MYC.VOICE_TIMINGS && window.MYC.VOICE_TIMINGS.story) || null;
    var idx = 0;
    if (timings) {
      for (var i = 0; i < timings.length && i < lines.length; i++) {
        if (v.currentTime >= timings[i]) idx = i;
      }
      idx = Math.min(idx, lines.length - 1);
    } else {
      idx = Math.min(lines.length - 1, Math.floor(v.currentTime / v.duration * lines.length));
    }
    if (idx !== this._storyLineIdx) {
      this._storyLineIdx = idx;
      this.setStoryLine(lines[idx]);
    }
  };

  UI.prototype.setStoryLine = function (text) {
    var el = this.el.storyText;
    if (!el) return;
    el.classList.remove('show');
    el.textContent = text;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('show'); });
    });
  };

  UI.prototype.isStoryVideoEnded = function () {
    return this._storyEnded;
  };

  /** 清除序章视频看门狗 */
  UI.prototype._clearStoryWatch = function () {
    if (this._storyWatch) { clearTimeout(this._storyWatch); this._storyWatch = null; }
  };

  UI.prototype.endStory = function () {
    if (this._typeTimer) { clearInterval(this._typeTimer); this._typeTimer = null; }
    this._clearStoryWatch();
    // 旁白收尾：0.6s 线性淡出（配音比视频长 ~0.9s，不能让它溢到下一画面）
    if (this._audio) this._audio.stopNarration(0.6);
    var v = this.el.storyVideo;
    if (v) {
      try { v.pause(); } catch (e) {}
      v.style.display = 'none';
      v.classList.add('hidden-video');
      v.ontimeupdate = null;
      v.onended = null;
      v.onerror = null;
    }
    if (this.el.storyText) this.el.storyText.classList.remove('show');
    this.hide('story');
  };

  /* ============================================================
     FINAL（补天终幕：可选通关视频 → 视频先行，面板后浮现）
     ------------------------------------------------------------
     有 finale.mp4：视频全屏先行，字幕随进度同步；
     视频结束（game 轮询 isFinalVideoEnded）→ showFinal 揭面板，
     最后一帧停格垫在半透明面板后。
     无视频：返回 false，game 走原有 Canvas 补天演出。
     ============================================================ */

  /** 开始通关视频。返回 true = 视频模式 */
  UI.prototype.beginFinal = function (save) {
    var v = this.el.finalVideo;
    var useVideo = this._finaleVideoOk === true && !!v;
    if (!useVideo) return false;

    this._lastSave = save;
    this._finalVideoEnded = false;
    this._finalLineIdx = -1;

    // 面板先藏起来（.no-panel），视频放完由 showFinal 揭幕
    if (this.el.final) this.el.final.classList.add('no-panel');
    this.show('final');

    v.classList.remove('hidden-video');
    // 关键修复：显式赋源（与序章同坑：此前从未赋 src）
    v.src = this.config.ASSETS.finaleVideo;
    try { v.load(); } catch (e) {}
    v.currentTime = 0;
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* 手势链内自动播 */ });
    // 终幕旁白整轨随视频同步播（配音 15.65s 略长于视频 15.04s，结尾淡出收掉）
    if (this._audio) this._audio.playNarration(this.config.ASSETS.voiceFinale);

    var self = this;
    v.ontimeupdate = function () { self._finalSubtitles(); };
    v.onended = function () {
      // 视频放完即收旁白，让配乐回来再揭面板
      if (self._audio) self._audio.stopNarration(0.6);
      self._finalVideoEnded = true;
    };
    v.onerror = function () {
      if (self._audio) self._audio.stopNarration(0.3);
      self._finaleVideoOk = false;
      self._finalVideoEnded = true;   // 视频坏了也放行到面板，不卡死
    };
    return true;
  };

  /** 通关视频字幕：按视频时长均分 FINAL_VIDEO_LINES */
  UI.prototype._finalSubtitles = function () {
    var v = this.el.finalVideo;
    if (!v || !v.duration || !this.el.finalVideoText) return;
    var lines = this.config.FINAL_VIDEO_LINES;
    // 字幕对句优先按配音时间轴（voice-timings.js）；缺配置时回退均分
    var timings = (window.MYC.VOICE_TIMINGS && window.MYC.VOICE_TIMINGS.final) || null;
    var idx = 0;
    if (timings) {
      for (var i = 0; i < timings.length && i < lines.length; i++) {
        if (v.currentTime >= timings[i]) idx = i;
      }
      idx = Math.min(idx, lines.length - 1);
    } else {
      idx = Math.min(lines.length - 1, Math.floor(v.currentTime / v.duration * lines.length));
    }
    if (idx !== this._finalLineIdx) {
      this._finalLineIdx = idx;
      var el = this.el.finalVideoText;
      el.classList.remove('show');
      el.textContent = lines[idx];
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add('show'); });
      });
    }
  };

  /** game 轮询：通关视频是否已放完 */
  UI.prototype.isFinalVideoEnded = function () {
    return this._finalVideoEnded;
  };

  /* ============================================================
     LEVEL_INTRO（关前预告）
     ------------------------------------------------------------
     只给「特征 / 行为 / 习性」三条线索，不剧透去向；
     未寻得的灵，角色卡以问号剪影显示（寻得后显影，可放大细观）。
     ============================================================ */
  UI.prototype.showLevelIntro = function (level, save) {
    this.hideAll();
    this._introLevel = level;
    if (save) this._lastSave = save;

    var el = this.el.levelIntro;
    if (!el) return;

    var got = save && save.stones.indexOf(level.stone) >= 0;

    document.getElementById('intro-story').textContent = level.story.intro;
    document.getElementById('intro-title').textContent = level.levelLabel;
    document.getElementById('intro-subtitle').textContent = level.scene;

    if (this.el.introCardFrame) {
      if (got) this.el.introCardFrame.classList.remove('unknown');
      else this.el.introCardFrame.classList.add('unknown');
    }
    if (this.el.introCardImg) {
      // 未寻得：不加载卡面图（防剧透），用透明占位；CSS 会显示「？」灵纹
      // 小卡用裁剪版 thumbnail（带1），完整图只给放大弹窗
      this.el.introCardImg.src = got
        ? (level.card.thumbnail || level.card.image)
        : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }

    document.getElementById('intro-card-title').textContent =
      got ? level.card.title : '？？？ · 未寻得';
    document.getElementById('intro-sign').textContent = level.targetCard[0];
    document.getElementById('intro-behave').textContent = level.targetCard[1];
    document.getElementById('intro-goal').textContent = level.targetCard[2];
    document.getElementById('intro-tip').textContent = got
      ? '此灵已寻得 · 照住左卡 1.5 秒可放大细观'
      : '寻得此灵后，角色卡将显影 · 照住假目标会被提醒并扣分';

    var startBtn = document.getElementById('btn-intro-start');
    if (startBtn) startBtn.textContent = '开始寻 ' + level.targetName;

    this.show('levelIntro');
  };

  /* ---------------- 游玩中角标 ---------------- */
  UI.prototype.showLevelBadge = function (level) {
    var el = this.el.levelBadge;
    if (!el) return;
    el.innerHTML =
      '<span class="badge-dot"></span>' +
      level.levelLabel + '　·　找' + level.targetName;
    el.style.setProperty('--light-color', level.light.color);
    el.classList.add('show');
  };

  UI.prototype.hideLevelBadge = function () {
    if (this.el.levelBadge) this.el.levelBadge.classList.remove('show');
  };

  /* ============================================================
     提示 / 假目标提醒 / 轻提示
     ============================================================ */
  UI.prototype.showHint = function (text, duration, color) {
    var self = this;
    var el = this.el.hintText;
    if (!el) return;

    el.textContent = text;
    if (color) el.style.borderColor = color;
    el.classList.add('show');
    this.show('hint');

    if (this._hintTimer) clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(function () {
      el.classList.remove('show');
      self.hide('hint');
    }, duration || 6500);
  };

  UI.prototype.clearHint = function () {
    if (this._hintTimer) clearTimeout(this._hintTimer);
    if (this.el.hintText) this.el.hintText.classList.remove('show');
    this.hide('hint');
  };

  UI.prototype.showDecoyRemind = function (text, sec) {
    var self = this;
    var el = this.el.decoyText;
    if (!el) return;
    el.textContent = text;
    this.show('decoyRemind');
    if (this._decoyTimer) clearTimeout(this._decoyTimer);
    this._decoyTimer = setTimeout(function () {
      self.hide('decoyRemind');
    }, (sec || 2) * 1000);
  };

  UI.prototype.toast = function (text, duration) {
    var self = this;
    var el = this.el.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, duration || 4500);
  };

  /* ============================================================
     寻得指引浮层（非阻塞，v1.8.0）
     —— 找到角色后弹出，引导「点角色卡听故事 + 找工作人员领奖」。
     不进 _modal 体系、不挡凝视：玩家可以边看指引边点角色卡；
     约 7 秒自动退场（完整伴随 6s 指引配音），任何界面切换（hideAll）也会顺手关掉。
     ============================================================ */
  UI.prototype.showGuidePop = function (allStones) {
    var self = this;
    var el = this.el.guidePop;
    if (!el) return;
    if (this._guideTimer) { clearTimeout(this._guideTimer); this._guideTimer = null; }
    if (this.el.guideTitle) {
      this.el.guideTitle.textContent = allStones ? '四印已齐！' : '灯灵寻回！';
    }
    if (this.el.guideLine2) {
      this.el.guideLine2.innerHTML = '找到全部角色，<b>可以获得奖励</b>！';
    }
    // 查看角色卡配音（约 6s，一秒不剪，v1.12.0）：前三关寻得角色时播，指引玩家
    // 点卡看详情；第四关集齐四印时不播——四印合璧按钮的持续闪烁接管指引，两路不打架。
    // 播完由 playNarration 的 ended 监听自动恢复配乐，不再定时切割 6s 配音
    if (!allStones && this._audio && this.config.ASSETS.voiceClaim) {
      this._audio.playNarration(this.config.ASSETS.voiceClaim);
    }
    el.classList.remove('show');
    void el.offsetWidth;   // 强制回流：同一结算页连续寻得也能重播入场
    el.classList.add('show');
    // 浮层展示 7s：完整伴随 6s 配音收尾后再退场，配音由 ended 自然收声
    this._guideTimer = setTimeout(function () {
      el.classList.remove('show');
      self._guideTimer = null;
    }, 7000);
  };

  /* ============================================================
     SUCCESS（角色卡 + 四印 + 结算）
     ============================================================ */
  UI.prototype.showSuccessPanel = function (level, result, save, justCompletedAll) {
    this._lastSave = save;
    this._successLevel = level;

    var card = this.el.successCard;
    if (card) {
      card.style.setProperty('--light-color', level.light.color);
      // 通关面板小卡用裁剪版 thumbnail（带1）；完整大图只在点开细观弹窗里给
      var cardSrc = level.card.thumbnail || level.card.image;
      this.el.successCardImg.src = cardSrc;
      // 缺图兜底：灵印占位（与详情弹窗 zoom-noimg 同款思路）
      if (this.el.successCardFrame) {
        this.el.successCardFrame.classList.toggle('sc-noimg', !cardSrc);
      }
      if (this.el.successCardGlyph) {
        this.el.successCardGlyph.textContent = level.stoneGlyph || '灵';
      }
      document.getElementById('spirit-card-title').textContent = level.card.title;
      document.getElementById('spirit-card-subtitle').textContent = level.card.subtitle;
      document.getElementById('spirit-card-desc').textContent = level.card.desc;
    }

    this.el.successQuote.textContent = level.story.found;
    this.el.successTitle.textContent = level.sealName + '到手';

    var el = this.el.successScore;
    if (el) {
      var detail = (result.detail && result.detail.length)
        ? '<div class="success-detail">' + result.detail.join('　') + '</div>' : '';
      var comment = result.comment
        ? '<div class="success-comment">「' + result.comment + '」</div>' : '';
      el.innerHTML =
        '得分：<strong>' + result.score + '</strong> / 100　等级：<strong>' + result.grade + '</strong>' +
        '<div class="success-rows">用时 ' + result.timeText + '　·　提示：' + result.hintsText +
        '　·　' + (result.fakeText || '') + '</div>' +
        (result.detail.length ? detail : '') + comment;
    }

    this._buildStones(this.el.stoneRow, save);

    // 「下一关」按钮随进度换语义：
    //   刚集齐四印 → 四印合璧（补天终幕，仅此一次）
    //   四印早已齐（重玩）→ 返回选关，不再重演补天
    //   其余 → 下一关
    if (this.el.btnNext) this.el.btnNext.classList.remove('flash-quest');
    // v1.13.0：结算页只留唯一主按钮（与四印合璧的唯一通路同一模式）——
    // 「再寻一次」「返回」一律收起：玩家点了任何岔路都回不到本关的
    // 关前视频/进度，宁可入口少也不能断流程；重玩走选关界面入口
    if (this.el.btnReplay) this.el.btnReplay.style.display = 'none';
    if (this.el.btnSuccessBack) this.el.btnSuccessBack.style.display = 'none';
    if (justCompletedAll) {
      this.el.nextLine.textContent = '四印已齐——女娲在等你。';
      this.el.btnNext.textContent = '四印合璧';
      // 四印合璧持续闪烁：第四关不播配音，闪烁就是玩家唯一的行动指引（v1.11.0）
      this.el.btnNext.classList.add('flash-quest');
    } else if (save.stones.length >= MYC.Levels.count()) {
      this.el.nextLine.textContent = '四印已齐 · 灯火长明——想再走哪条街，随时回来。';
      this.el.btnNext.textContent = '返回选关';
    } else {
      this.el.nextLine.textContent = level.story.next;
      this.el.btnNext.textContent = '下一关';
    }

    this.el.success.style.setProperty('--light-color', level.light.color);
    // 重入结算页重播入场动画：layer 靠 opacity 显隐，fill-mode:both 的子元素
    // 动画只在首帧播一次 —— 摘掉、强制回流、装回，每次亮灯都能整套重演
    this._replaySuccessAnims();
    this.show('success');
  };

  /* 摘-回流-装回三步重放：卡片显形、卡面转正、四印砸落、灯签浮现全套重来 */
  UI.prototype._replaySuccessAnims = function () {
    var root = this.el.success;
    if (!root) return;
    var nodes = root.querySelectorAll(
      '.spirit-card, .spirit-card-frame, .spirit-quote, .success-panel, .stone-glyph, .sc-hint'
    );
    var i;
    for (i = 0; i < nodes.length; i++) nodes[i].style.animation = 'none';
    void root.offsetWidth; // 强制回流：让浏览器记住"动画已清零"这个事实
    for (i = 0; i < nodes.length; i++) nodes[i].style.animation = '';
  };

  UI.prototype._buildStones = function (box, save) {
    if (!box) return;
    box.innerHTML = '';
    var levels = MYC.Levels.all;
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      var got = save.stones.indexOf(lv.stone) >= 0;
      var s = document.createElement('div');
      s.className = 'stone' + (got ? ' got' : '');
      s.innerHTML = '<span class="stone-glyph">' + lv.stoneGlyph + '</span><span class="stone-name">' + lv.sealName + '</span>';
      box.appendChild(s);
    }
  };

  /* ============================================================
     FINAL（补天终幕）
     ============================================================ */
  UI.prototype.showFinal = function (save) {
    this._lastSave = save;
    // 抽奖入口显隐：只有没抽过谢礼的人才看得到「转转幸运大转盘」（v1.11.0，仅此一次）
    if (this.el.btnFinalLucky) {
      this.el.btnFinalLucky.style.display = save.luckyDone ? 'none' : '';
    }
    this._buildStones(this.el.finalStones, save);

    var total = 0;
    var levels = MYC.Levels.all;
    for (var i = 0; i < levels.length; i++) {
      total += save.bestScores[levels[i].id] || 0;
    }
    if (this.el.finalTotal) {
      this.el.finalTotal.textContent = '总分　' + total + ' / ' + (levels.length * 100);
    }

    // 视频模式：揭面板、视频停帧留底、收字幕
    if (this.el.final) this.el.final.classList.remove('no-panel');
    var fv = this.el.finalVideo;
    if (fv && !fv.classList.contains('hidden-video')) {
      try { fv.pause(); } catch (e) {}
      if (this.el.finalVideoText) this.el.finalVideoText.classList.remove('show');
    }

    this.show('final');
  };

  /* ============================================================
     LEVEL_SELECT（自由选关）
     ============================================================ */
  UI.prototype.showLevelSelect = function (save) {
    this._lastSave = save;
    this.hideAll();

    var grid = this.el.selectGrid;
    if (grid) {
      grid.innerHTML = '';
      // 旧的动态关项目按钮：清掉（下次重建）
      this._gazeButtons = this._gazeButtons.filter(function (b) {
        return !b.el.classList.contains('select-item');
      });

      var levels = MYC.Levels.all;
      var self = this;
      for (var i = 0; i < levels.length; i++) {
        (function (lv) {
          var best = save.bestScores[lv.id];
          var got = save.stones.indexOf(lv.stone) >= 0;
          var item = document.createElement('div');
          item.className = 'select-item btn-gaze' + (got ? ' cleared' : ' locked');
          // 未寻得：不显示卡面，改用「？」占位（防剧透）；已寻得：裁剪版小卡（带1），完整图只给放大弹窗
          var cardHtml = got
            ? '<img src="' + (lv.card.thumbnail || lv.card.image) + '" draggable="false" />'
            : '<div class="select-unknown">？</div>';
          item.innerHTML =
            cardHtml +
            '<div class="select-info">' +
              '<div class="select-name">' + lv.levelLabel + '</div>' +
              '<div class="select-scene">' + lv.scene + '</div>' +
              '<div class="select-best">' + (got ? ('已得' + lv.sealName + ' · 最高 ' + (best || 0) + ' 分') : '尚未寻得') + '</div>' +
            '</div>';
          item.addEventListener('click', function (e) {
            e.stopPropagation();
            if (self._cb.levelSelect) self._cb.levelSelect(lv.index);
          });
          self._registerGaze(item, function () {
            if (self._cb.levelSelect) self._cb.levelSelect(lv.index);
          });
          grid.appendChild(item);
        })(levels[i]);
      }
    }
    this.show('levelSelect');
  };

  /* ============================================================
     FAIL（超时未充满）
     ============================================================ */
  UI.prototype.showFail = function (level) {
    this.hideAll();
    var she = (level.index === 0 || level.index === 3) ? '她' : '他';
    if (this.el.failText) {
      this.el.failText.textContent = '今夜无缘——' + she + '下次节庆还会来。';
    }
    this.show('fail');
  };

  /* ============================================================
     错误 / 输入切换 / 调试
     ============================================================ */
  UI.prototype.showError = function (text) {
    this.hideAll();
    if (this.el.errorText) this.el.errorText.textContent = text;
    this.show('error');
  };

  UI.prototype.setInputToggle = function (text, state) {
    var el = this.el.inputToggle;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hand', 'mouse', 'busy');
    if (state) el.classList.add(state);
  };

  UI.prototype.onInputToggle = function (cb) { this._cb.gazeToggle = cb; };
  UI.prototype.onGazeToggle = function (cb) { this._cb.gazeToggle = cb; };
  UI.prototype.onReplay = function (cb) { this._cb.replay = cb; };
  UI.prototype.onNext = function (cb) { this._cb.next = cb; };
  UI.prototype.onFinalReplay = function (cb) { this._cb.finalReplay = cb; };
  UI.prototype.onIntroStart = function (cb) { this._cb.introStart = cb; };
  UI.prototype.onLevelSelect = function (cb) { this._cb.levelSelect = cb; };
  UI.prototype.onFinalSelect = function (cb) { this._cb.finalSelect = cb; };
  UI.prototype.onSelectBack = function (cb) { this._cb.selectBack = cb; };
  UI.prototype.onResetConfirm = function (cb) { this._cb.resetConfirm = cb; };
  UI.prototype.onStartGame = function (cb) { this._cb.startGame = cb; };
  UI.prototype.onIntroBack = function (cb) { this._cb.introBack = cb; };
  UI.prototype.onSuccessBack = function (cb) { this._cb.successBack = cb; };

  UI.prototype.toggleDebug = function () {
    if (!this.el.debug) return false;
    return this.el.debug.classList.toggle('show');
  };

  UI.prototype.setDebug = function (on, lines, cameraEl) {
    if (!this.el.debug) return;
    if (on) this.el.debug.classList.add('show');
    else this.el.debug.classList.remove('show');

    if (lines && this.el.debugText) {
      this.el.debugText.textContent = lines;
    }

    if (this.el.debugCam) {
      if (on && cameraEl && cameraEl.srcObject) {
        if (this.el.debugCam.srcObject !== cameraEl.srcObject) {
          this.el.debugCam.srcObject = cameraEl.srcObject;
          this.el.debugCam.play().catch(function () {});
        }
      } else if (!on) {
        this.el.debugCam.srcObject = null;
      }
    }
  };

  /* ============================================================
     幸运转盘（v1.12.0 · 通关谢礼，仅此一次）
     —— 整图不切割，转盘画面不动：玩家照住中央星钮后开转，
        转的是叠在盘面上的灯光层（.lucky-light 锥形光柱），
        --lrot 交给 CSS transition（5.2s 缓出）；
        --lit（四灵奖励灰→亮）没有 transition 可吃，由 RAF 逐帧驱动同步点亮；
        停稳后光柱驻留在中奖方位持续脉冲，揭晓弹窗靠右不打转盘。
     ============================================================ */

  /** 进入转盘层：复位上一轮的灯光/点亮/庆祝状态（重置数据后再抽也是从零开始） */
  UI.prototype.showLucky = function () {
    var wheel = this.el.luckyWheel;
    var light = this.el.luckyLight;
    var go = this.el.luckyGo;
    var hint = this.el.luckyHint;
    var burst = this.el.luckyBurst;
    if (light) {
      light.classList.remove('spinning', 'stay');
      light.style.setProperty('--lrot', '0deg');
    }
    if (wheel) {
      wheel.classList.remove('lit-flash');
      wheel.style.setProperty('--lit', '0');
    }
    if (go) go.classList.remove('spun');
    if (hint) hint.classList.remove('dim', 'gone');
    // 庆祝特效与中奖态复位：重进转盘永远是最初的样子（v1.12.0 无弹窗版）
    if (burst) {
      burst.classList.remove('active');
      burst.style.setProperty('--burst-rot', '0deg');
    }
    if (this.el.lucky) this.el.lucky.classList.remove('won');
    // 与 index.html .lucky-foot-note 默认文案保持一致（中奖后由 _revealLuckyPrize 原地改写）
    if (this.el.luckyFootNote) {
      this.el.luckyFootNote.innerHTML = '机会<b>仅此一次</b> · 抽中的棒棒糖通关后找工作人员领取';
    }
    this._luckySpinning = false;
    this._luckyRot = 0;
    this._luckyPrize = null;
    this.show('lucky');
  };

  /** 玩家照住中央星钮、光圈充满后触发：先抽定结果，灯光转起来、盘面四灵同步由灰变亮 */
  UI.prototype.startLuckySpin = function () {
    var wheel = this.el.luckyWheel;
    var light = this.el.luckyLight;
    if (!wheel || !light || this._luckySpinning) return;
    this._luckySpinning = true;
    var self = this;
    // 开转瞬间就挂 .spun：星钮退光禁点（bind 里还有 .spun 守卫，双保险），提示语转暗
    if (this.el.luckyGo) this.el.luckyGo.classList.add('spun');
    if (this.el.luckyHint) this.el.luckyHint.classList.add('dim');

    // 结果此刻抽定：随机奖品 + 灯光终角 = 当前角 + ≥4 整圈 + 该奖励方位角 + 小抖动
    var prize = LUCKY_PRIZES[Math.floor(Math.random() * LUCKY_PRIZES.length)];
    this._luckyPrize = prize;
    var jitter = Math.random() * 40 - 20;   // ±20°：停稳后光柱仍罩着对应奖品
    var target = this._luckyRot + 4 * 360 + prize.stopAngle + jitter;
    this._luckyRot = target;
    // 记下光柱终角（0~359）：庆祝特效要以中奖方位为轴心绽放（v1.12.0）
    this._luckyBeamAngle = ((target % 360) + 360) % 360;

    // 转盘画面不动，转的是灯光：--lrot 只在 .spinning 下有 transition，
    // 先挂类，再一次性写终值，交给 CSS 转 5.2s 缓出
    light.classList.add('spinning');
    light.style.setProperty('--lrot', target + 'deg');

    // 音效：开转气声 + 旋转途中渐疏的滴答（预调度整段 5.2 秒，与 CSS 时长同步，v1.12.0）
    if (this._audio) {
      this._audio.whoosh();
      if (this._audio.luckyTicks) this._audio.luckyTicks(5.2);
    }

    // 灰→亮：filter 没有 transition，RAF 逐帧推 --lit，缓出曲线与灯光旋转同步
    var t0 = (window.performance && performance.now()) || Date.now();
    var DUR = 5200;
    function tick(now) {
      if (!self._luckySpinning) return;
      var t = Math.min(1, ((now || Date.now()) - t0) / DUR);
      var e = 1 - Math.pow(1 - t, 2.2);
      wheel.style.setProperty('--lit', (0.08 + 0.92 * e).toFixed(3));
      if (t < 1) {
        self._luckyRaf = requestAnimationFrame(tick);
      } else {
        self._luckyRaf = null;
      }
    }
    this._luckyRaf = requestAnimationFrame(tick);

    // 灯光收束：摘 spinning（transition 结束定格），光柱驻留脉冲 + 过曝闪光宣布停稳
    this._luckyStopTimer = setTimeout(function () {
      self._luckyStopTimer = null;
      light.classList.remove('spinning');
      light.classList.add('stay');
      wheel.classList.add('lit-flash');
      wheel.style.setProperty('--lit', '1');
      // 闪光落定再揭晓：弹详情 + 播对应棒棒糖配音
      self._luckyRevealTimer = setTimeout(function () {
        self._luckyRevealTimer = null;
        self._revealLuckyPrize(self._luckyPrize);
      }, 780);
    }, DUR);
  };

  /** 揭晓（v1.12.0 无弹窗版）：转盘界面原地庆祝——光爆+双环+星屑对准中奖方位绽放，
      脚注原地换中奖文案、「收下」按钮随 #lucky.won 浮现，配音整曲直播一秒不剪 */
  UI.prototype._revealLuckyPrize = function (prize) {
    if (!prize) return;
    // 庆祝特效以真实光柱角为轴（含抖动，永远罩住抽中的那颗糖）
    var burst = this.el.luckyBurst;
    if (burst) {
      burst.style.setProperty('--burst-rot', (this._luckyBeamAngle || prize.stopAngle) + 'deg');
      // 摘了再挂并强制回流，保证动画每次都从零演起
      burst.classList.remove('active');
      void burst.offsetWidth;
      burst.classList.add('active');
    }
    // 脚注原地换中奖文案；「收下 · 自由体验」按钮由 #lucky.won 控制浮现，无新弹窗
    if (this.el.luckyFootNote) {
      this.el.luckyFootNote.innerHTML = '抽中<b>' + prize.name + '</b>！通关后找工作人员，兑换这颗甜甜的谢礼';
    }
    if (this.el.lucky) this.el.lucky.classList.add('won');
    // 中奖琶音 + 对应棒棒糖的完整配音（约 8 秒，自然播完自动恢复配乐）
    if (this._audio) {
      if (this._audio.luckyWin) this._audio.luckyWin();
      this._audio.playNarration(prize.audio);
    }
  };

  UI.prototype.onFinalLucky = function (cb) { this._cb.finalLucky = cb; };
  UI.prototype.onLuckyGo = function (cb) { this._cb.luckyGo = cb; };
  UI.prototype.onLuckyContinue = function (cb) { this._cb.luckyContinue = cb; };

  MYC.UI = UI;

})(window.MYC);
