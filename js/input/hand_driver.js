/**
 * 月影城 · 摄像头手势驱动（MediaPipe HandLandmarker）
 * ============================================================
 * 完全本地化：所有模型/库文件都在 assets/vendor/mediapipe/，离线可用。
 *
 * 控制逻辑：
 *   1. 从本地加载 @mediapipe/tasks-vision（WASM + task 模型）
 *   2. GPU 优先，失败自动回退 CPU
 *   3. 取"控制点"得到手的位置：
 *      · 食指伸出（指向姿态）→ 用【食指指尖】（向指尖方向略作延伸补偿）
 *      · 手掌握拳 / 收指     → 用【掌心】（手腕 + 四指根的平均，纯掌心，不掺指尖抖动）
 *      判定用"指骨长度比"（尺度无关，手离摄像头远近不影响），带滞回带，不会来回抖动
 *   4. 多手时锁定"离上一帧最近"的那只手，不会在两只手之间乱跳
 *   5. 摄像头画面是镜像的，x 轴翻转；中间区域放大映射到全屏（EDGE_GAIN_X/Y）
 *   6. 标准 One-Euro 自适应滤波：静止时稳如磐石，快速移动时低延迟跟手
 *   7. 右上角手势预览小窗：绿点 = 识别到的控制点，边框发亮 = 正在跟踪
 *      （config.GESTURE.PREVIEW 可关）
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  /* ============================================================
     One-Euro Filter（标准实现）
     ------------------------------------------------------------
     自适应低通滤波：速度越快、截止频率越高（越跟手），
     速度越慢、截止频率越低（越平滑）。
       minCutoff  静止时的平滑强度（Hz，越小越稳、越迟钝）
       beta       速度对截止频率的贡献（越大快速移动越跟手）
       dCutoff    速度估计本身的平滑
     ============================================================ */
  function OneEuroFilter(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff || 1.0;
    this.beta = beta || 2.0;
    this.dCutoff = dCutoff || 1.0;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  OneEuroFilter.prototype.reset = function () {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  };

  OneEuroFilter.prototype._alpha = function (cutoff, dt) {
    var tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };

  /** tSec：秒（performance.now()/1000） */
  OneEuroFilter.prototype.filter = function (x, tSec) {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      return x;
    }
    var dt = tSec - this.tPrev;
    if (dt <= 1e-4) return this.xPrev;
    this.tPrev = tSec;

    // 速度太快（长时间跟丢后重新出现）：直接贴上去，不滑行
    if (dt > 0.5) {
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }

    var dx = (x - this.xPrev) / dt;
    var aD = this._alpha(this.dCutoff, dt);
    this.dxPrev += aD * (dx - this.dxPrev);

    var cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    var a = this._alpha(cutoff, dt);
    this.xPrev += a * (x - this.xPrev);
    return this.xPrev;
  };

  /* ============================================================
     关键点工具
     ============================================================ */
  // MediaPipe 手部 21 关键点编号
  var WRIST = 0;
  var INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8;
  var MIDDLE_MCP = 9;
  var PALM_POINTS = [WRIST, 5, 9, 13, 17]; // 手腕 + 四指根

  function d2(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 本地模型路径（相对于 index.html）
  var MODEL_PATH = 'assets/vendor/mediapipe/hand_landmarker.task';
  var VISION_WASM_PATH = 'assets/vendor/mediapipe';

  /** 解析成绝对 URL。
   *  关键：动态 import() 的相对说明符在部分浏览器按"裸模块名"处理，
   *  'assets/...' 会直接解析失败（手势识别不了的真凶），
   *  必须先基于页面地址解析成绝对 URL 再 import。 */
  function absUrl(p) {
    return new URL(p, document.baseURI).href;
  }

  function HandDriver(config) {
    this.config = config;
    var g = (config && config.GESTURE) || {};

    // 摄像头中间区域 → 全屏 的映射增益（旧配置 EDGE_GAIN 仍然生效）
    this.gainX = g.EDGE_GAIN_X || g.EDGE_GAIN || 1.35;
    this.gainY = g.EDGE_GAIN_Y || g.EDGE_GAIN || 1.35;

    this.numHands = Math.max(1, g.NUM_HANDS || 2);
    this.lostResetMs = g.LOST_RESET_MS || 600;
    this.previewOn = (g.PREVIEW !== false);

    // One-Euro 参数
    this.minCutoff = g.MIN_CUTOFF || 1.0;
    this.beta = g.BETA || 2.0;

    this.pos = { x: 0.5, y: 0.5 };
    this.rawPos = { x: 0.5, y: 0.5 };
    this.hasHand = false;
    this.lastSeen = 0;
    this.running = false;
    this.mode = 'palm';

    this.video = document.getElementById('camera');
    this.landmarker = null;

    // 手势预览小窗（右上角）
    this.pip = document.getElementById('hand-pip');
    this.pipDot = document.getElementById('pip-dot');
    this.pipCamPos = { x: 0.5, y: 0.5 };

    // 上一帧锁定的手（摄像头原始坐标，用于多手时挑最近的一只）
    this.lockedCam = null;

    this.euroX = new OneEuroFilter(this.minCutoff, this.beta);
    this.euroY = new OneEuroFilter(this.minCutoff, this.beta);
  }

  /* ---------------- 启动 ---------------- */
  HandDriver.prototype.start = function () {
    var self = this;

    if (location.protocol === 'file:' || !window.isSecureContext) {
      return Promise.reject(new Error(
        '摄像头只能在 localhost / https 下使用。' +
        '请用「启动游戏.bat」启动，或在本文件夹执行 node serve.js 后访问 http://localhost:8080'
      ));
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error(
        '浏览器不支持摄像头 API。请确认用 http://localhost 打开，且浏览器为 Chrome / Edge'
      ));
    }
    if (!this.video) {
      return Promise.reject(new Error('页面里找不到 #camera 元素'));
    }

    return navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    }).then(function (stream) {
      self.video.srcObject = stream;
      // 预览小窗同步显示摄像头画面（镜像由 CSS 处理）
      var pipCam = self.pip ? self.pip.querySelector('video') : null;
      if (pipCam && pipCam.srcObject !== stream) {
        pipCam.srcObject = stream;
        pipCam.play().catch(function () { /* 静音自动播，失败不拦路 */ });
      }
      return self.video.play();
    }).then(function () {
      return import(absUrl(VISION_WASM_PATH + '/vision_bundle.mjs'));
    }).then(function (vision) {
      self._vision = vision;
      return vision.FilesetResolver.forVisionTasks(absUrl(VISION_WASM_PATH));
    }).then(function (fileset) {
      return self._tryCreateLandmarker(fileset, 'GPU');
    }).then(function (landmarker) {
      self.landmarker = landmarker;
      self.running = true;
      self.euroX.reset();
      self.euroY.reset();
      self.lockedCam = null;
      self._showPip(true);
      self._loop();
      console.log('[手势] MediaPipe HandLandmarker 已就绪（本地模式）');
      return true;
    }).catch(function (err) {
      self.stop();
      var msg = (err && err.message) || String(err);
      if (/Permission|NotAllowed|denied/i.test(msg)) {
        throw new Error('摄像头权限被拒绝。请在浏览器地址栏左侧允许摄像头，然后刷新页面');
      }
      if (/NotFound|DevicesNotFound|NotReadable/i.test(msg)) {
        throw new Error('没有找到摄像头（或被其他程序占用）。请检查摄像头是否连接、系统隐私设置是否允许');
      }
      if (/Failed to fetch|import|network|Load/i.test(msg) || /WASM|wasm/.test(msg)) {
        throw new Error('手势识别库加载失败。请确认 assets/vendor/mediapipe/ 目录文件完整');
      }
      throw new Error('摄像头手势启动失败：' + msg);
    });
  };

  /** GPU → CPU 回退 */
  HandDriver.prototype._tryCreateLandmarker = function (fileset, delegate) {
    var self = this;
    return this._vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: absUrl(MODEL_PATH),
        delegate: delegate
      },
      runningMode: 'VIDEO',
      numHands: this.numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    }).catch(function (err) {
      if (delegate === 'GPU') {
        console.warn('[手势] GPU 模式失败，回退到 CPU：', err && err.message);
        return self._tryCreateLandmarker(fileset, 'CPU');
      }
      throw err;
    });
  };

  /* ---------------- 逐帧循环 ---------------- */
  HandDriver.prototype._loop = function () {
    var self = this;
    function frame() {
      if (!self.running) return;
      try {
        if (self.video.readyState >= 2 && self.landmarker) {
          // 只在新视频帧到来时识别：既省一半以上算力，
          // 也避免 MediaPipe 对相同时间戳报错（静默丢帧的元凶之一）
          if (self.video.currentTime !== self._lastVideoTime) {
            self._lastVideoTime = self.video.currentTime;
            var result = self.landmarker.detectForVideo(self.video, performance.now());
            if (result && result.landmarks && result.landmarks.length > 0) {
              self._onHand(self._pickHand(result.landmarks));
            } else if (performance.now() - self.lastSeen > self.lostResetMs) {
              if (self.hasHand) {
                self.hasHand = false;
                self._updatePip(false);
              }
            }
          }
        }
      } catch (e) {}
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  /** 多手时挑"离上一帧锁定位置最近"的一只，保证控制连续 */
  HandDriver.prototype._pickHand = function (hands) {
    if (hands.length === 1) return hands[0];
    if (!this.lockedCam) {
      // 首次锁定：挑离屏幕中心最近的手（通常是主动伸出来的那只）
      var best = hands[0], bestD = Infinity;
      for (var i = 0; i < hands.length; i++) {
        var c = hands[i][MIDDLE_MCP];
        var d = (c.x - 0.5) * (c.x - 0.5) + (c.y - 0.5) * (c.y - 0.5);
        if (d < bestD) { bestD = d; best = hands[i]; }
      }
      return best;
    }
    var bestHand = hands[0], bestDist = Infinity;
    for (var j = 0; j < hands.length; j++) {
      var m = hands[j][MIDDLE_MCP];
      var dx = m.x - this.lockedCam.x, dy = m.y - this.lockedCam.y;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestHand = hands[j]; }
    }
    return bestHand;
  };

  /** 手指伸展判定：指尖到指根的距离 / 掌长（尺度无关） */
  HandDriver.prototype._indexExtended = function (lm) {
    var palm = Math.max(1e-4, d2(lm[MIDDLE_MCP], lm[WRIST]));
    return d2(lm[INDEX_TIP], lm[INDEX_MCP]) / palm;
  };

  HandDriver.prototype._onHand = function (lm) {
    // 滞回切换：伸指判定（阈值对应"指尖离指根约 0.75/0.55 个掌长"）
    var ext = this._indexExtended(lm);
    if (ext > 0.75) this.mode = 'finger';
    else if (ext < 0.55) this.mode = 'palm';

    // 控制点
    var cx, cy;
    if (this.mode === 'finger') {
      // 指尖为主，向指尖方向略作延伸（伸出的指尖在视觉上还要再往前一点）
      cx = lm[INDEX_TIP].x * 1.0 + (lm[INDEX_TIP].x - lm[INDEX_PIP].x) * 0.25;
      cy = lm[INDEX_TIP].y * 1.0 + (lm[INDEX_TIP].y - lm[INDEX_PIP].y) * 0.25;
    } else {
      // 纯掌心：手腕 + 四指根平均。不掺指尖，从根上消除抖动
      var px = 0, py = 0;
      for (var i = 0; i < PALM_POINTS.length; i++) {
        px += lm[PALM_POINTS[i]].x;
        py += lm[PALM_POINTS[i]].y;
      }
      cx = px / PALM_POINTS.length;
      cy = py / PALM_POINTS.length;
    }

    // 记录锁定位置（摄像头原始坐标，挑手用）
    this.lockedCam = { x: lm[MIDDLE_MCP].x, y: lm[MIDDLE_MCP].y };

    // 摄像头原始坐标（预览小窗用，含镜像）
    this.pipCamPos.x = cx;
    this.pipCamPos.y = cy;

    // 镜像翻转 + 边缘扩展
    var nx = 1 - cx;
    nx = (nx - 0.5) * this.gainX + 0.5;
    var ny = (cy - 0.5) * this.gainY + 0.5;
    nx = MYC.U.clamp(nx, 0, 1);
    ny = MYC.U.clamp(ny, 0, 1);

    this.rawPos.x = nx;
    this.rawPos.y = ny;

    // 手消失太久后重新出现：重置滤波器，光直接贴到手上（不滑行）
    var now = performance.now();
    if (!this.hasHand && now - this.lastSeen > this.lostResetMs) {
      this.euroX.reset();
      this.euroY.reset();
    }

    // One-Euro 自适应平滑
    var nowSec = now / 1000;
    this.pos.x = this.euroX.filter(nx, nowSec);
    this.pos.y = this.euroY.filter(ny, nowSec);

    this.hasHand = true;
    this.lastSeen = now;
    this._updatePip(true);
  };

  /* ---------------- 预览小窗 ---------------- */
  HandDriver.prototype._showPip = function (on) {
    if (!this.pip) return;
    if (on && this.previewOn) this.pip.classList.add('show');
    else this.pip.classList.remove('show');
  };

  HandDriver.prototype._updatePip = function (tracked) {
    if (!this.pip || !this.pipDot) return;
    if (tracked) {
      // 预览画面本身带镜像，点也要翻 x
      this.pipDot.style.left = ((1 - this.pipCamPos.x) * 100).toFixed(2) + '%';
      this.pipDot.style.top = (this.pipCamPos.y * 100).toFixed(2) + '%';
      this.pipDot.classList.add('tracked');
      this.pip.classList.add('tracked');
    } else {
      this.pipDot.classList.remove('tracked');
      this.pip.classList.remove('tracked');
    }
  };

  /* ---------------- 对外接口 ---------------- */
  HandDriver.prototype.getPosition = function () {
    return this.pos;
  };

  HandDriver.prototype.hasInput = function () {
    return this.hasHand;
  };

  HandDriver.prototype.getCameraElement = function () {
    return this.video;
  };

  /**
   * 暂停：只停识别循环，保留摄像头流和已加载的模型。
   * 切到鼠标模式时用它（而不是 stop），切回来瞬间恢复，
   * 不用重新申请摄像头（有些机器/隐私软件会拒绝二次申请），
   * 也不用重新加载 WASM 模型（好几秒）。
   */
  HandDriver.prototype.pause = function () {
    this.running = false;
    this.hasHand = false;
    this._showPip(false);
  };

  /** pause 后是否还能直接恢复（流和模型都还活着） */
  HandDriver.prototype.canResume = function () {
    return !!(this.landmarker && this.video && this.video.srcObject);
  };

  /** 恢复（配合 pause 使用） */
  HandDriver.prototype.resume = function () {
    if (!this.canResume()) return false;
    this.running = true;
    this.hasHand = false;
    this.lockedCam = null;
    this._lastVideoTime = -1;
    this._showPip(true);
    this._loop();
    console.log('[手势] 摄像头手势已恢复（免重新加载）');
    return true;
  };

  HandDriver.prototype.stop = function () {
    this.running = false;
    this._showPip(false);
    if (this.pip) {
      var pipCam = this.pip.querySelector('video');
      if (pipCam) pipCam.srcObject = null;
    }
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(function (t) { t.stop(); });
      this.video.srcObject = null;
    }
  };

  MYC.HandDriver = HandDriver;

})(window.MYC);
