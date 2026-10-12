/**
 * 灯影古镇 · 存档（localStorage）
 * ============================================================
 * {
 *   version: 1,
 *   unlockedLevel: 0,        // 已解锁到第几关（0~3，0 = 第一关可玩）
 *   stones: [],              // 已得灵印：'meng' / 'fu' / 'shi' / 'hua'
 *   cards: [],               // 已得角色卡（与 stones 同步，语义分开存）
 *   bestScores: {},          // 各关最高分 { dream_deer: 80, ... }
 *   sawStory: false,         // 是否看过序章
 *   title: null,             // 'butianze'（补天者）
 *   luckyDone: false         // 幸运转盘是否已抽（仅此一次，重置数据后清零）
 * }
 * 版本号防旧档冲突；重置进度：补天终幕 / 自由选关屏的「重新开始」按钮。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  function load() {
    var cfg = MYC.CONFIG;
    var empty = {
      version: cfg.SAVE_VERSION,
      unlockedLevel: 0,
      stones: [],
      cards: [],
      bestScores: {},
      sawStory: false,
      title: null,
      luckyDone: false
    };
    try {
      var raw = localStorage.getItem(cfg.SAVE_KEY);
      if (!raw) return empty;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || data.version !== cfg.SAVE_VERSION) {
        return empty;
      }
      if (!Array.isArray(data.stones)) data.stones = [];
      if (!Array.isArray(data.cards)) data.cards = [];
      if (!data.bestScores || typeof data.bestScores !== 'object') data.bestScores = {};
      if (typeof data.unlockedLevel !== 'number') data.unlockedLevel = 0;
      if (typeof data.sawStory !== 'boolean') data.sawStory = false;
      if (typeof data.luckyDone !== 'boolean') data.luckyDone = false;
      sanitize(data);
      return data;
    } catch (e) {
      return empty;
    }
  }

  /** 旧档清洗：灵印/角色卡去重并按关卡顺序规整（历史版本可能重复 push） */
  function sanitize(data) {
    var levels = MYC.Levels.all;
    var stones = [], cards = [];
    for (var i = 0; i < levels.length; i++) {
      if (data.stones.indexOf(levels[i].stone) >= 0) stones.push(levels[i].stone);
      if (data.cards.indexOf(levels[i].id) >= 0) cards.push(levels[i].id);
    }
    data.stones = stones;
    data.cards = cards;
    if (data.stones.length >= levels.length && !data.title) data.title = 'butianze';
    if (data.stones.length < levels.length) data.title = null;
  }

  function write(data) {
    try {
      localStorage.setItem(MYC.CONFIG.SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* 隐私模式等场景写不进去就算了 */ }
  }

  function reset() {
    try {
      localStorage.removeItem(MYC.CONFIG.SAVE_KEY);
    } catch (e) {}
  }

  /**
   * 关卡成功后的进度写入。
   * 返回 { save, newlyComplete }：
   *   newlyComplete = 这一关刚好集齐了四印（首次补天功成的判定依据）。
   * 已有灵印不重复 push（重玩老关不改变集齐状态）。
   */
  function recordLevelClear(data, level, score) {
    var count = MYC.Levels.count();
    var wasComplete = data.stones.length >= count;

    if (data.stones.indexOf(level.stone) < 0) data.stones.push(level.stone);
    if (data.cards.indexOf(level.id) < 0) data.cards.push(level.id);
    if (data.unlockedLevel < level.index + 1) {
      data.unlockedLevel = Math.min(level.index + 1, count - 1);
    }
    var prev = data.bestScores[level.id] || 0;
    data.bestScores[level.id] = Math.max(prev, score);

    var complete = data.stones.length >= count;
    if (complete) data.title = 'butianze';
    write(data);
    return { save: data, newlyComplete: complete && !wasComplete };
  }

  MYC.Save = {
    load: load,
    write: write,
    reset: reset,
    recordLevelClear: recordLevelClear
  };

})(window.MYC);
