/**
 * 灯影古镇 · 评分
 * ============================================================
 * 基础完成 60 + 首轮完成 20 + 全程无提示 20 = 100
 * 照错假目标：-当前关.trapPenalty / 次（第四关 10 分）
 * 等级：S ≥ 90，A 80~89，B 60~79
 * 单关满分 100，总分 = 各关最高分之和（满分 400）。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  /* 等级灵语：结算面板的一句收束评语，随缘浮现不重样 */
  var GRADE_COMMENTS = {
    S: [
      '一照即中，灯语通明——此夜灯火为你常明。',
      '心灯如镜，影落无差。司梦颔首：此子可托。',
      '凝眸如印，满街灯台皆为你亮。完美。'
    ],
    A: [
      '光影已稳，离通明只差半分凝眸。',
      '偶有游光掠影，无碍大雅——灯下再练，必成。',
      '照得其所，古镇已认得你的灯笼。'
    ],
    B: [
      '灯火摇曳，初心未失——路已认得你，再走一遍便是。',
      '影未定，心先热。莫急，灯影长巷等你重来。'
    ]
  };

  function pickComment(grade) {
    var pool = GRADE_COMMENTS[grade] || GRADE_COMMENTS.B;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function compute(opts) {
    var score = 0;
    var detail = [];

    if (opts.completed) score += 60;

    if (opts.firstLoop) {
      score += 20;
      detail.push('首轮完成 +20');
    }
    if (opts.hintsUsed === 0) {
      score += 20;
      detail.push('未用提示 +20');
    }
    if (opts.trapHits > 0) {
      var penalty = (opts.trapPenalty || 5) * opts.trapHits;
      score -= penalty;
      detail.push('照错 ' + opts.trapHits + ' 次 -' + penalty);
    } else if (opts.completed) {
      detail.push('零失误 · 灯神颔首');
    }

    score = Math.max(0, Math.min(100, score));
    var grade = score >= 90 ? 'S' : (score >= 80 ? 'A' : 'B');
    return { score: score, grade: grade, comment: pickComment(grade), detail: detail };
  }

  MYC.Score = { compute: compute };

})(window.MYC);
