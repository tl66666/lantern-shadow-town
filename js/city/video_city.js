/**
 * 灯影古镇 · 真实视频画面源
 * ============================================================
 * 逐关视频循环：当前关卡的视频由 levels.js 指定。
 * 对游戏逻辑暴露 getTime() / getDuration() / getFrame()。
 * 切关时（SUCCESS → 下一关）调用 switchLevel()：换 src → 等首帧 →
 * 截新静态底图，随后恢复播放。切换是低频操作（一关一次），
 * 1~2 秒的等待正好被「灵印入槽」动画掩护。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var STATIC_SNAPSHOT_T = 0.05;

  function VideoCity(config) {
    MYC.CitySource.call(this, config);
    this.video = document.getElementById('city-video');
    this.level = null;
    this.staticFrame = null;
    this.ready = false;
    this.timeScale = 1;
    this.duration = 0;
    this.shouldPlay = false;
    this._loading = false;
  }

  VideoCity.prototype = Object.create(MYC.CitySource.prototype);
  VideoCity.prototype.constructor = VideoCity;

  /** 加载第一关（启动时调用一次） */
  VideoCity.prototype.load = function (level) {
    return this._loadLevel(level);
  };

  /** 内部：载入指定关的视频并截图静态底图 */
  VideoCity.prototype._loadLevel = function (level) {
    var self = this;
    this.level = level;
    this._loading = true;

    return new Promise(function (resolve, reject) {
      var v = self.video;
      if (!v) { reject(new Error('页面里找不到 #city-video 元素')); return; }

      var settled = false;
      function finish(fn) {
        if (settled) return;
        settled = true;
        fn();
      }

      v.addEventListener('error', function () {
        finish(function () {
          self._loading = false;
          reject(new Error('关卡视频加载失败：' + (level ? level.video : '?')));
        });
      }, { once: true });

      function snapshotAndStart() {
        try {
          var c = document.createElement('canvas');
          c.width = v.videoWidth || self.config.WORLD_W;
          c.height = v.videoHeight || self.config.WORLD_H;
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          self.staticFrame = c;
        } catch (e) { /* 截图失败时保留旧底图 */ }
        self.duration = v.duration || 15;
        self.ready = true;
        self._loading = false;
        finish(resolve);
      }

      v.addEventListener('loadeddata', function () {
        self.duration = v.duration || 15;

        var onSeeked = function () {
          v.removeEventListener('seeked', onSeeked);
          snapshotAndStart();
        };
        v.addEventListener('seeked', onSeeked);

        try {
          v.currentTime = Math.min(STATIC_SNAPSHOT_T, (self.duration || 1) * 0.005);
        } catch (e) {
          snapshotAndStart();
          return;
        }
        setTimeout(function () {
          if (!settled) {
            v.removeEventListener('seeked', onSeeked);
            snapshotAndStart();
          }
        }, 1500);
      }, { once: true });

      try { v.pause(); } catch (e) {}
      v.src = level.video;
      v.playbackRate = MYC.U.clamp(self.timeScale, 0.15, 4);
      v.load();
    });
  };

  /** 切换关卡（游戏流程中调用）。返回 Promise，resolve 时新视频已可播 */
  VideoCity.prototype.switchLevel = function (level) {
    var self = this;
    this.ready = false;
    this.shouldPlay = false;

    // 若上一关加载还在进行，直接放弃旧 promise 的结果（finish 里的 settled 已兜底）
    return this._loadLevel(level).then(function () {
      if (self.shouldPlay) self.start();
      return level;
    });
  };

  VideoCity.prototype.update = function (dt) {
    if (this.shouldPlay && this.video && this.video.paused && !this._loading) {
      this.video.play().catch(function () {});
    }
  };

  VideoCity.prototype.standBy = function () {
    this.shouldPlay = false;
    if (!this.video) return;
    this.video.pause();
    try { this.video.currentTime = 0; } catch (e) {}
  };

  VideoCity.prototype.start = function () {
    this.shouldPlay = true;
    if (this.video && !this._loading) {
      this.video.play().catch(function () {});
    }
  };

  VideoCity.prototype.getTime = function () {
    return this.video ? this.video.currentTime : 0;
  };

  VideoCity.prototype.getDuration = function () {
    if (this.duration) return this.duration;
    if (this.video && this.video.duration && isFinite(this.video.duration)) {
      this.duration = this.video.duration;
      return this.duration;
    }
    return 0;
  };

  VideoCity.prototype.getFrame = function () {
    return this.video;
  };

  VideoCity.prototype.getStaticFrame = function () {
    return this.staticFrame;
  };

  VideoCity.prototype.isReady = function () {
    return this.ready;
  };

  VideoCity.prototype.setTimeScale = function (s) {
    this.timeScale = s;
    if (this.video) {
      this.video.playbackRate = MYC.U.clamp(s, 0.15, 4);
    }
  };

  MYC.VideoCity = VideoCity;

})(window.MYC);
