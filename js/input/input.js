/**
 * 月影城 · 输入管理器
 * ============================================================
 * 对游戏逻辑只暴露两个方法：getPosition() 和 hasInput()。
 * 至于位置是鼠标来的还是摄像头来的，游戏逻辑不关心。
 * 摄像头不可用时自动降级为鼠标，保证永远能玩。
 *
 * 还支持运行时切换（屏幕左下角按钮 / I 键）：
 *   switchTo('HAND') / switchTo('MOUSE')
 * 切换过程中旧驱动保持工作，新驱动就绪后才交接，任何时刻都有输入。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function InputManager(config) {
    this.config = config;
    this.mode = config.INPUT_SOURCE;   // 期望使用的输入方式
    this.driver = null;                // 实际生效的驱动
    this.status = 'idle';              // idle | loading | ready | error
    this.message = '';                 // 给玩家看的提示（如降级说明）
    this.fallback = false;             // 是否发生了降级
    this._switching = false;
    this._pausedHand = null;          // 暂停备用的手势驱动（快速切回用）
  }

  /** 启动输入。返回 Promise，resolve 时一定有一个可用驱动 */
  InputManager.prototype.start = function () {
    var self = this;

    if (this.mode === 'HAND' && MYC.HandDriver) {
      this.status = 'loading';
      this.driver = new MYC.HandDriver(this.config);
      return this.driver.start()
        .then(function () {
          self.status = 'ready';
          console.log('[输入] 摄像头手势已启用');
        })
        .catch(function (err) {
          console.warn('[输入] 摄像头手势不可用，自动降级为鼠标：', err && err.message);
          self.fallback = true;
          self.message = '摄像头不可用，已切换为鼠标控制';
          return self._startMouse();
        });
    }

    return this._startMouse();
  };

  InputManager.prototype._startMouse = function () {
    var self = this;
    this.driver = new MYC.MouseDriver(this.config);
    return Promise.resolve(this.driver.start()).then(function () {
      self.status = 'ready';
      console.log('[输入] 鼠标控制已启用');
    });
  };

  /** 当前真正生效的输入方式：'HAND' | 'MOUSE' */
  InputManager.prototype.getActiveMode = function () {
    return (this.driver && this.driver.constructor === MYC.HandDriver) ? 'HAND' : 'MOUSE';
  };

  /**
   * 运行时切换输入方式。
   * 返回 Promise<{ ok:boolean, message?:string }>。
   * 新驱动完全就绪后才停旧驱动；手势启动失败时保持原输入不变。
   *
   * 手势 ↔ 鼠标来回切是低成本操作：
   * 切走时手势驱动只 pause（保留摄像头和模型），
   * 切回时若还能恢复就直接 resume，不用重新加载模型。
   */
  InputManager.prototype.switchTo = function (mode) {
    var self = this;

    if (this._switching) {
      return Promise.resolve({ ok: false, message: '正在切换中，稍候' });
    }
    if (mode === this.getActiveMode()) {
      return Promise.resolve({ ok: true });
    }
    this._switching = true;

    var startNew;
    if (mode === 'HAND' && MYC.HandDriver) {
      startNew = function () {
        if (self._pausedHand && self._pausedHand.canResume()) {
          var h = self._pausedHand;
          self._pausedHand = null;
          if (h.resume()) return Promise.resolve(h);
          // 恢复失败（流中途断了）：走全新启动
          h.stop();
        }
        var h2 = new MYC.HandDriver(self.config);
        return h2.start().then(function () { return h2; });
      };
    } else {
      startNew = function () {
        var m = new MYC.MouseDriver(self.config);
        return Promise.resolve(m.start()).then(function () { return m; });
      };
    }

    return startNew().then(function (driver) {
      self._retireDriver(self.driver);
      self.driver = driver;
      self.mode = mode;
      self.fallback = false;
      self.message = '';
      self.status = 'ready';
      self._switching = false;
      console.log('[输入] 已切换为 ' + mode);
      return { ok: true };
    }).catch(function (err) {
      self._switching = false;
      var msg = (err && err.message) || String(err);
      console.warn('[输入] 切换到 ' + mode + ' 失败：', msg);
      return { ok: false, message: msg };
    });
  };

  /** 旧驱动退场：手势驱动 pause 备用，其他直接停 */
  InputManager.prototype._retireDriver = function (driver) {
    if (!driver) return;
    if (driver.constructor === MYC.HandDriver) {
      driver.pause();
      this._pausedHand = driver;
    } else if (driver.stop) {
      driver.stop();
    }
  };

  /** 返回 { x, y }（0~1 归一化坐标），没有输入时返回 null */
  InputManager.prototype.getPosition = function () {
    return this.driver ? this.driver.getPosition() : null;
  };

  /** 玩家最近是否在操作（用于待机检测） */
  InputManager.prototype.hasInput = function () {
    return this.driver ? this.driver.hasInput() : false;
  };

  /** 给 UI / 调试用的状态信息 */
  InputManager.prototype.getStatus = function () {
    return {
      mode: this.mode,
      fallback: this.fallback,
      message: this.message,
      type: this.driver ? this.driver.constructor.name : 'none'
    };
  };

  MYC.InputManager = InputManager;

})(window.MYC);
