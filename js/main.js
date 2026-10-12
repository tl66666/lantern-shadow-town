/**
 * 灯影古镇 · 启动流程
 * ============================================================
 * 自检素材 → 载入第一关视频 → 鼠标/手势就绪 → 开机。
 * 运行期：rAF 主循环 + resize + 指针事件（D=调试，I=切输入）。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var C = MYC.CONFIG;
  var canvas = document.getElementById('stage');

  function boot() {
    var ui = new MYC.UI(C);

    // 版本号只在控制台可见（界面不再显示右下角小字）
    console.log('%c[灯影古镇] 当前构建：' + C.BUILD, 'color:#9df5d8;');

    MYC.AssetCheck.run().then(function () {
      var save = MYC.Save.load();
      var idx = firstLevelIndex(save);

      var city = new MYC.VideoCity(C);
      var renderer = new MYC.Renderer(canvas, C);
      var effects = new MYC.Effects(C);
      var audio = new MYC.Audio();
      var input = new MYC.InputManager(C);
      ui.setAudio(audio);   // UI 播序章/终幕旁白时用它压配乐（v1.8.0）

      var game = new MYC.Game({
        config: C, city: city, input: input, renderer: renderer,
        ui: ui, effects: effects, audio: audio
      });

      ui.showLoading('点亮灯影古镇……');

      Promise.all([
        city.load(MYC.Levels.get(idx)),
        input.start()
      ]).then(function () {
        renderer.setStaticSource(city.getStaticFrame());
        ui.hideLoading();
        window.game = game;   // 调试/测试入口
        game.start();
        loop(game);
        bindEvents(game, ui, audio);
      }).catch(function (err) {
        console.error('[启动失败]', err);
        ui.showError('启动失败：' + ((err && err.message) || '未知错误'));
      });
    }).catch(function (err) {
      console.error('[素材缺失]', err.missing);
      ui.showError('素材缺失：\n' + (err.missing || []).join('\n') +
        '\n\n请确认 assets/ 目录完整后刷新。');
    });
  }

  function firstLevelIndex(save) {
    var levels = MYC.Levels.all;
    for (var i = 0; i < levels.length; i++) {
      if (save.stones.indexOf(levels[i].stone) < 0) return i;
    }
    return levels.length - 1;
  }

  /* ---------------- 主循环 ---------------- */
  var lastT = 0;
  function loop(game) {
    function frame(t) {
      // dt 上限 0.12（v1.13.0，原 0.05）：0.05 时帧率一掉（如 10fps），
      // 凝视充能按 dt 累积就只剩一半速——玩家表现是"进度变慢"。
      // 0.12 让偶发掉帧按墙钟基本补回，仍拦得住切标签页的一次性大跳帧
      var dt = Math.min((t - lastT) / 1000, 0.12);
      lastT = t;
      if (dt > 0) {
        try {
          game.update(dt);
          game.render(dt);
        } catch (e) {
          // 主循环保活：真机上输入/视频/音频的偶发异常绝不允许杀死 rAF——
          // 一旦中断，画面永久冻结，玩家表现就是"点什么都没反应"。
          console.error('[主循环异常，已保活]', e);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents(game, ui, audio) {
    window.addEventListener('resize', function () {
      game.renderer.resize();
    });

    window.addEventListener('pointerdown', function (e) {
      if (audio) audio.unlock();
      // 待机页只认「开始游戏」按钮（点击 / 凝视充满均可）：
      // 序章与关前预告均不可点击跳过，由按钮与自动时间线推进
    });

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.key === 'd' || e.key === 'D') game.toggleDebug();
      if (e.key === 'i' || e.key === 'I') game.toggleInput();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.MYC);
