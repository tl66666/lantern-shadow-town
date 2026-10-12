/**
 * 灯影古镇 · 启动自检
 * ============================================================
 * 检查四关视频、四张角色卡是否就位。缺文件直接把错误亮在屏幕上，
 * 不让玩家进入一个"找不到目标"的游戏。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function run() {
    var required = [];
    var levels = MYC.Levels.all;
    for (var i = 0; i < levels.length; i++) {
      // 修复：数据里是 thumbnail / fullImage，此前误查不存在的 card.image，
      // 导致凭空 fetch('/undefined') → 误报素材缺失
      if (levels[i].video) required.push(levels[i].video);
      if (levels[i].card && levels[i].card.thumbnail) required.push(levels[i].card.thumbnail);
    }

    return Promise.all(required.map(function (url) {
      // 修复：GET 会把大视频的响应体拉进连接却无人消费，
      // 占死浏览器每域名 6 条连接 → 后续请求全挂（自检永不落定）。
      // HEAD 只取状态头，连接即取即还。
      return fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error(url);
          return url;
        })
        .catch(function () { return null; });
    })).then(function (results) {
      var missing = [];
      for (var i = 0; i < results.length; i++) {
        if (results[i] === null) missing.push(required[i]);
      }
      if (missing.length) {
        var err = new Error('素材缺失');
        err.missing = missing;
        return Promise.reject(err);
      }
      return true;
    });
  }

  MYC.AssetCheck = { run: run };

})(window.MYC);
