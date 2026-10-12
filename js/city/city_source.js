/**
 * 月影城 · 画面源接口
 * ============================================================
 * SimCity（程序模拟）和 VideoCity（真实视频）都实现下面这套方法。
 * 游戏逻辑只认这套接口，所以以后换素材不用改玩法代码。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function CitySource(config) {
    this.config = config;
  }

  /** 加载素材，返回 Promise */
  CitySource.prototype.load = function () { return Promise.resolve(); };

  /** 每帧推进时间，dt 为秒 */
  CitySource.prototype.update = function (dt) {};

  /** 当前循环内的时间（秒） */
  CitySource.prototype.getTime = function () { return 0; };

  /** 返回"当前动态画面"（图片/画布/视频元素都可） */
  CitySource.prototype.getFrame = function () { return null; };

  /** 返回静止首帧（用于光圈外的底图） */
  CitySource.prototype.getStaticFrame = function () { return null; };

  /** 是否加载完成 */
  CitySource.prototype.isReady = function () { return false; };

  /** 时间缩放（成功演出时放慢城市） */
  CitySource.prototype.setTimeScale = function (s) {};

  /** 待机：暂停并回到循环起点（视频源实现；模拟城市无需做事） */
  CitySource.prototype.standBy = function () {};

  /** 开始播放（进入游戏） */
  CitySource.prototype.start = function () {};

  MYC.CitySource = CitySource;

})(window.MYC);
