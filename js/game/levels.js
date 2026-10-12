/**
 * 灯影古镇 · 关卡数据（全部数据驱动）
 * ============================================================
 * 四关的轨迹全部按实际视频逐帧标定：
 *   第 1 关 lantern_town.mp4   梦鹿：3.3s 从南牌坊进场（设计如此）
 *   第 2 关 temple_fair.mp4     神马：1.5s 起即在场，沿大街中线一路向南
 *   第 3 关 blossom_creek.mp4   李白：开场即在酒楼前，全程在场
 *   第 4 关 gallery_street.mp4 萌莎：开场即在画馆前，向南出牌坊离场
 *
 * 所有坐标为归一化（x 左→右 0~1，y 上→下 0~1），
 * t 为循环进度 phase（0~1，按视频时长折算）。
 *
 * 每关还带有：故事文案（story）、角色卡（card）、灵印（stone）、
 * 梦灯四色（light）、难度参数（charge / hintDelay / trapSec / trapPenalty）。
 */
window.MYC = window.MYC || {};

(function (MYC) {
  'use strict';

  var LEVELS = [
    /* ================= 第 1 关 · 灯河梦鹿 ================= */
    {
      id: 'dream_deer',
      index: 0,
      name: '灯河梦鹿',
      levelLabel: '第一关 · 寻梦鹿',
      scene: '水乡元宵灯会',
      video: 'assets/videos/lantern_town.mp4',
      // 空场前段（秒）：视频前 10 秒灵杰未现身（无目标视频拼接在原视频前）
      head: 10.04,
      targetName: '梦鹿',
      sealName: '梦印',
      stone: 'meng',
      stoneGlyph: '梦',
      // 梦灯：青碧（全尺寸）
      light: {
        color: '#3FBFB0',
        core: '200, 245, 238',
        glow: ['rgba(63, 191, 176, 0.28)', 'rgba(45, 160, 150, 0.13)', 'rgba(30, 120, 115, 0)'],
        ring: 'rgba(140, 235, 220, 0.40)'
      },
      lightScale: 1.0,
      radius: 0.060,
      charge: { rate: 0.62, decay: 0.42 },   // 稳照约 1.5s 充满（回落最慢，最宽松）
      hintDelay: 20,
      trapSec: 1.2,   // 照错 1.2s 即弹提醒（另有 0.3s 红环即时预警）
      trapPenalty: 5,
      // 故事文案
      story: {
        intro: '元宵夜。掌梦的灵杰混在满街红金里——今晚，她要把新年第一场好梦送出去。',
        found: '灵光罩住她的那一刻，鹿角上的珠串轻轻一晃。她回头，把怀中锦囊托付给你——「把好梦，带给还醒着的人。」',
        next: '河灯已远，好梦顺水而去。庙会的鼓声，正在北街响起。'
      },
      // 角色卡（成功后获得）
      card: {
        thumbnail: 'assets/images/cards/menglu1.jpg',   // 未获得：剪影+数字1
        fullImage: 'assets/images/cards/menglu.jpg',    // 获得后详情大图
        title: '梦鹿 · 司梦',
        subtitle: '灯河锦囊 · 红袍鹿角',
        desc: '女娲捏的第一位灵杰。每岁元宵，把新年第一场好梦装进锦囊，交乌篷船载往人间。她独自走，从不结伴——鹿角上挂着的珠串，是灯会最亮的星。'
      },
      targetCard: [
        '红袍金绣的鹿角少女，怀中一点暖光',
        '独自一人，匀速向北',
        '鹿角挂珠串，从不与人群同行'
      ],
      target: {
        enter: 0.215, exit: 0.97,
        path: [
          { t: 0.215, x: 0.500, y: 0.712, note: '从南牌坊门洞走进主街' },
          { t: 0.300, x: 0.500, y: 0.610 },
          { t: 0.332, x: 0.500, y: 0.530, note: '灯会广场中段' },
          { t: 0.430, x: 0.490, y: 0.420 },
          { t: 0.532, x: 0.480, y: 0.320, note: '主街北段，接近桥头' },
          { t: 0.632, x: 0.260, y: 0.280, note: '左转走向西侧石阶埠头' },
          { t: 0.730, x: 0.220, y: 0.250, note: '登上乌篷船' },
          { t: 0.832, x: 0.320, y: 0.250, note: '船离岸，随水漂' },
          { t: 0.960, x: 0.390, y: 0.230, note: '漂向河心（循环收尾）' }
        ]
      },
      decoys: [
        {
          id: 'parade', name: '神马巡游队',
          hint: '红衣提灯的巡游不是她——他们只是路过。',
          window: [0.08, 0.72],
          path: [
            { t: 0.08, x: 0.12, y: 0.62 },
            { t: 0.17, x: 0.24, y: 0.65 },
            { t: 0.33, x: 0.47, y: 0.66 },
            { t: 0.53, x: 0.71, y: 0.66 },
            { t: 0.63, x: 0.84, y: 0.69 }
          ]
        },
        {
          id: 'sedan', name: '花轿',
          hint: '花轿里坐着别人。',
          window: [0.02, 0.28],
          path: [
            { t: 0.02, x: 0.81, y: 0.38 },
            { t: 0.17, x: 0.91, y: 0.36 },
            { t: 0.28, x: 0.96, y: 0.34 }
          ]
        },
        {
          id: 'lion', name: '舞狮',
          hint: '台上舞狮蹦得再欢，也不是她。',
          window: [0.05, 0.95],
          pos: { x: 0.21, y: 0.55 }
        }
      ],
      sceneAnchor: { x: 0.34, y: 0.25, label: '河心乌篷船' },
      hints: [
        '灯会红金身影多——她头上有鹿角。',
        '花轿、舞狮、巡游都是热闹，梦鹿总是一个人走。',
        '神马也披红挂金——但他是马首、被人簇拥；梦鹿怀里有一点暖光。',
        '她从镇口一路向北——目标是河埠头现成的乌篷船。',
        '看主街偏西那条线——红袍鹿角的少女正走向石阶。现在照住她！'
      ],
      successEffect: 'lotus'
    },

    /* ================= 第 2 关 · 庙会神马 ================= */
    {
      id: 'temple_horse',
      index: 1,
      name: '庙会神马',
      levelLabel: '第二关 · 寻神马',
      scene: '山门庙会大街',
      video: 'assets/videos/temple_fair.mp4',
      // 空场前段（秒）：视频前 10 秒灵杰未现身
      head: 10.04,
      targetName: '神马',
      sealName: '福印',
      stone: 'fu',
      stoneGlyph: '福',
      light: {
        color: '#E0533F',
        core: '255, 205, 190',
        glow: ['rgba(224, 83, 63, 0.30)', 'rgba(200, 60, 45, 0.14)', 'rgba(170, 40, 30, 0)'],
        ring: 'rgba(255, 160, 140, 0.40)'
      },
      lightScale: 1.0,
      radius: 0.065,
      charge: { rate: 0.62, decay: 0.46 },   // 稳照约 1.5s 充满
      hintDelay: 30,
      trapSec: 1.2,   // 照错 1.2s 即弹提醒（另有 0.3s 红环即时预警）
      trapPenalty: 5,
      story: {
        intro: '庙会夜。掌福的灵杰走在提灯队最前——白马红袍，从鼓楼出发，要把一个「福」字送出山门。',
        found: '白鬃扬起，金绸翻飞。神马朝你颔首，额上金福微微发亮——「福已上桌。替我看着，这满街灯火。」',
        next: '烟花散尽，福气入印。桃花溪的水声，在镇南等你。'
      },
      card: {
        thumbnail: 'assets/images/cards/shenma1.jpg',   // 未获得：剪影+数字1
        fullImage: 'assets/images/cards/shenma.jpg',    // 获得后详情大图
        title: '神马 · 司福',
        subtitle: '白马红袍 · 金绸额福',
        desc: '庙会的守护者，福气的押运人。白马首人身，红唐装金绸带，率提灯队从鼓楼一路走到南门。认他不难——满街队伍里，只有他的鬃毛白得像月光。'
      },
      targetCard: [
        '白马首、额贴金福、肩飘金绸',
        '率领提灯队，走在最前',
        '白鬃如月光，队伍里唯一的马首'
      ],
      target: {
        enter: 0.095, exit: 0.87,
        path: [
          { t: 0.095, x: 0.500, y: 0.220, note: '鼓楼前现身（开场即在）' },
          { t: 0.166, x: 0.500, y: 0.300 },
          { t: 0.232, x: 0.500, y: 0.380 },
          { t: 0.332, x: 0.500, y: 0.500, note: '大街中段' },
          { t: 0.532, x: 0.500, y: 0.620 },
          { t: 0.632, x: 0.500, y: 0.700 },
          { t: 0.730, x: 0.500, y: 0.780 },
          { t: 0.830, x: 0.500, y: 0.880, note: '走到南山门前' }
        ]
      },
      decoys: [
        {
          id: 'dragon', name: '舞龙队',
          hint: '金龙舞得再高，也不是神马。',
          window: [0.08, 0.80],
          path: [
            { t: 0.08, x: 0.05, y: 0.52 },
            { t: 0.17, x: 0.08, y: 0.50 },
            { t: 0.53, x: 0.62, y: 0.58 },
            { t: 0.63, x: 0.75, y: 0.55 },
            { t: 0.73, x: 0.88, y: 0.55 }
          ]
        },
        {
          id: 'sedan', name: '花轿',
          hint: '花轿抬的是别家的喜事。',
          window: [0.10, 0.62],
          path: [
            { t: 0.10, x: 0.85, y: 0.55 },
            { t: 0.30, x: 0.90, y: 0.35 },
            { t: 0.53, x: 0.92, y: 0.12 },
            { t: 0.62, x: 0.93, y: 0.08 }
          ]
        },
        {
          id: 'poet', name: '白袍醉客',
          hint: '那位白袍客自顾自喝酒，不是你要找的马。',
          window: [0.10, 0.90],
          pos: { x: 0.20, y: 0.33 }
        }
      ],
      sceneAnchor: { x: 0.50, y: 0.88, label: '南山门' },
      hints: [
        '今晚好几支队伍都有红金领队——领头那匹是白马。',
        '舞龙的、抬轿的都在走，神马的白鬃最亮眼。',
        '他额头贴着金「福」字，肩后飘着两条金绸带。',
        '他从山门出发，一路向鼓楼祭台去。',
        '看大街中线——白马红袍的领队正走向祭台。现在照住他！'
      ],
      successEffect: 'firework'
    },

    /* ================= 第 3 关 · 溪畔李白 ================= */
    {
      id: 'creek_poet',
      index: 2,
      name: '溪畔李白',
      levelLabel: '第三关 · 寻李白',
      scene: '桃花溪月夜',
      video: 'assets/videos/blossom_creek.mp4',
      // 拼接片：前 10.04s 为空场无目标；10.04s 起（= 灵杰段第 0s）李白才从左侧酒家推门而出。
      // 下方 target/decoys 的 t 均为「灵杰段」内进度：segPhase = (视频时间 - head) / (总长 - head)。
      head: 10.04,
      targetName: '李白',
      sealName: '诗印',
      stone: 'shi',
      stoneGlyph: '诗',
      light: {
        color: '#F0C040',
        core: '255, 240, 190',
        glow: ['rgba(240, 192, 64, 0.28)', 'rgba(210, 160, 40, 0.13)', 'rgba(170, 120, 20, 0)'],
        ring: 'rgba(255, 225, 140, 0.42)'
      },
      lightScale: 1.0,
      radius: 0.055,
      charge: { rate: 0.62, decay: 0.50 },   // 稳照约 1.5s 充满（连击加成后更快）
      hintDelay: 30,
      trapSec: 1.2,   // 照错 1.2s 即弹提醒（另有 0.3s 红环即时预警）
      trapPenalty: 5,
      story: {
        intro: '桃花夜。掌诗的灵杰刚饮罢一壶——白袍墨镜，拎着酒壶踏出酒家门，要沿前街把月色走完。',
        found: '墨镜后的目光，穿过灯河望向你。他举壶遥敬——「今夜月色，与你共分。」',
        next: '诗印入袖，满身月光。最后一站——字画街的画舫，正要点灯。'
      },
      card: {
        thumbnail: 'assets/images/cards/libai1.jpg',    // 未获得：剪影+数字1
        fullImage: 'assets/images/cards/libai.jpg',     // 获得后详情大图
        title: '李白 · 司诗',
        subtitle: '白袍墨镜 · 醉步邀月',
        desc: '诗魂入镇，月下独酌。金边墨镜是他在人间的唯一破绽——全街的书生都结伴论诗，只有他拎着酒壶，三步一晃地从酒家走到灯架下，与天上的月亮对饮。'
      },
      targetCard: [
        '白袍、金墨镜、手拎酒壶',
        '独自醉步，三步一晃',
        '全街书生都结伴，唯他独行'
      ],
      target: {
        // 逐帧二次精修（视频 10.1~24.9s 高密度抽帧+归一化网格定谳）：10.1s 酒家门里现身 →
        // 10.3s 推门而出 → 10.7~11.4s 下台阶 → 12.0s 踏上前街西端 → 沿前街东南行 →
        // 19.1s 街东灯柱下停步举杯邀月 → 23.0s 收杯低首 → 24.9s 原地鞠躬收尾。
        // t 为「灵杰段」进度：segPhase = (视频时间 - 10.04) / 15.043；视频前 10.04s 空场无目标。
        enter: 0.005, exit: 0.995,
        path: [
          { t: 0.005, x: 0.360, y: 0.370, note: '视频10.1s：酒家门里现身' },
          { t: 0.020, x: 0.375, y: 0.390, note: '视频10.3s：推门而出' },
          { t: 0.043, x: 0.375, y: 0.435, note: '视频10.7s：下台阶' },
          { t: 0.066, x: 0.360, y: 0.475, note: '视频11.0s：台阶中段' },
          { t: 0.090, x: 0.350, y: 0.515, note: '视频11.4s：踏上前街' },
          { t: 0.130, x: 0.345, y: 0.545, note: '视频12.0s：前街西端起步' },
          { t: 0.200, x: 0.370, y: 0.570, note: '视频13.1s：前街西段' },
          { t: 0.330, x: 0.520, y: 0.630, note: '视频15.0s：前街中段' },
          { t: 0.460, x: 0.660, y: 0.640, note: '视频17.0s：前街东段' },
          { t: 0.600, x: 0.820, y: 0.620, note: '视频19.1s：街东灯柱下停步举杯' },
          { t: 0.730, x: 0.820, y: 0.610, note: '视频21.0s：举杯邀月' },
          { t: 0.860, x: 0.800, y: 0.610, note: '视频23.0s：收杯低首' },
          { t: 0.990, x: 0.810, y: 0.630, note: '视频24.9s：原地鞠躬收尾' }
        ]
      },
      decoys: [
        {
          id: 'scholars', name: '白衣书生群',
          hint: '书生们结伴论诗——李白从不结伴。',
          window: [0.02, 0.99],
          pos: { x: 0.79, y: 0.53 }
        },
        {
          id: 'crane', name: '白鹤',
          hint: '白鹤似雪，终非故人。',
          // 白鹤开场待在左侧院子里（视频 10~14s，段 0~0.25），与刚出门的李白同框、同为白色，极易看混。
          // 二次精修后李白下台阶轨迹在 (0.35,0.52) 一线，鹤位 (0.27,0.49) 距轨迹 0.084，不误伤正确跟人。
          window: [0.0, 0.25],
          pos: { x: 0.27, y: 0.49 }
        },
        {
          id: 'lady', name: '凉亭贵妇',
          hint: '凉亭里品茗的贵妇在看月亮，不在找酒。',
          window: [0.02, 0.99],
          pos: { x: 0.77, y: 0.46 }
        },
        {
          id: 'robed', name: '桥上白衣客',
          hint: '桥上那两位结伴而过，不是他。',
          window: [0.05, 0.60],
          pos: { x: 0.49, y: 0.10 }
        }
      ],
      sceneAnchor: { x: 0.82, y: 0.63, label: '街东灯柱下' },
      hints: [
        '满街白衣文人不少——戴金色墨镜的才是他。',
        '书生们结伴吟诗，李白独自一人。',
        '他手里永远拎着一只酒壶，走路三步一晃。',
        '他从左侧酒家门里出来，穿过院子下前街。',
        '小心院子里的白鹤——白羽似雪，却不是他。',
        '看前街东段——白袍墨镜的醉客在灯柱下举杯邀月。现在照住他！'
      ],
      successEffect: 'petal'
    },

    /* ================= 第 4 关 · 街市萌莎 ================= */
    {
      id: 'street_mona',
      index: 3,
      name: '街市萌莎',
      levelLabel: '第四关 · 寻萌莎',
      scene: '字画古玩街 · 画舫码头',
      video: 'assets/videos/gallery_street.mp4',
      // 空场前段（秒）：视频前 10 秒灵杰未现身
      head: 10.04,
      targetName: '萌莎',
      sealName: '画印',
      stone: 'hua',
      stoneGlyph: '画',
      light: {
        color: '#EAE6DA',
        core: '250, 248, 240',
        glow: ['rgba(234, 230, 218, 0.26)', 'rgba(200, 196, 180, 0.12)', 'rgba(160, 155, 140, 0)'],
        ring: 'rgba(245, 242, 230, 0.45)'
      },
      lightScale: 0.8,
      radius: 0.050,
      charge: { rate: 0.62, decay: 0.55 },   // 稳照约 1.5s 充满（回落最快，最考验盯功）
      hintDelay: 40,
      trapSec: 1.2,   // 照错 1.2s 即弹提醒（另有 0.3s 红环即时预警）
      trapPenalty: 10,
      story: {
        intro: '灯会夜。掌画的灵杰从油画里走出来——深裙金边，独自缓行，要亲眼看一眼真正的人间夜色。',
        found: '她回眸，裙上金边次第亮起——「画了一辈子别人，这一幅，画你。」',
        next: ''
      },
      card: {
        thumbnail: 'assets/images/cards/mengsha1.jpg',  // 未获得：剪影+数字1
        fullImage: 'assets/images/cards/mengsha.jpg',   // 获得后详情大图
        title: '萌莎 · 司画',
        subtitle: '深裙金边 · 油画之姿',
        desc: '从画馆的油画里走出的贵妇，画了一辈子别人，今夜终于来看世界本身。绸缎裙的仕女成群结队，只有她带着油画的笔触，独自缓行向画舫。'
      },
      targetCard: [
        '油画质感、深色裙金边',
        '独自缓行，驻足看画',
        '人群里唯一带着油画笔触的身影'
      ],
      target: {
        enter: 0.02, exit: 0.77,
        path: [
          { t: 0.020, x: 0.185, y: 0.432, note: '画馆前（开场即在）' },
          { t: 0.100, x: 0.220, y: 0.520 },
          { t: 0.166, x: 0.298, y: 0.482 },
          { t: 0.232, x: 0.382, y: 0.556, note: '穿过主街西侧' },
          { t: 0.332, x: 0.478, y: 0.556 },
          { t: 0.432, x: 0.500, y: 0.695, note: '主街正中' },
          { t: 0.550, x: 0.500, y: 0.800, note: '下段（被摊篷遮挡段）' },
          { t: 0.632, x: 0.500, y: 0.920, note: '接近牌坊' },
          { t: 0.730, x: 0.500, y: 0.965, note: '走出牌坊街口' }
        ]
      },
      decoys: [
        {
          id: 'portrait', name: '画像摊',
          hint: '画里那位再像，也只是画。',
          window: [0.05, 0.95],
          pos: { x: 0.64, y: 0.75 }
        },
        {
          id: 'fans', name: '团扇仕女',
          hint: '执扇的仕女们结伴而行——她总是独行。',
          window: [0.10, 0.90],
          pos: { x: 0.42, y: 0.62 }
        },
        {
          id: 'darkrobe', name: '深袍路人',
          hint: '深色衣袍的不止她一个——但油画质感只有一个。',
          window: [0.05, 0.95],
          pos: { x: 0.49, y: 0.40 }
        }
      ],
      sceneAnchor: { x: 0.50, y: 0.90, label: '牌坊街口' },
      hints: [
        '绸缎裙的女士们成群结队——油画质感的那位才是萌莎。',
        '她的裙是深色的、镶着金边，像从画里走出来。',
        '仕女们团扇遮面结伴而行，萌莎独自缓行。',
        '她从画馆出来，要去码头登画舫。',
        '看字画街中线——深裙金边的贵妇正走向画舫。现在照住她！'
      ],
      successEffect: 'frame'
    }
  ];

  /* ============================================================
     工具函数
     ============================================================ */

  /** 轨迹插值：phase 在 [t0, t1] 之间线性插值 */
  function pathPosition(path, phase) {
    if (!path || path.length === 0) return null;
    for (var i = 0; i < path.length - 1; i++) {
      if (phase >= path[i].t && phase <= path[i + 1].t) {
        var span = path[i + 1].t - path[i].t;
        var k = span <= 0 ? 0 : (phase - path[i].t) / span;
        return {
          x: MYC.U.lerp(path[i].x, path[i + 1].x, k),
          y: MYC.U.lerp(path[i].y, path[i + 1].y, k)
        };
      }
    }
    return { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }

  function getLevel(idx) {
    return LEVELS[MYC.U.clamp(idx, 0, LEVELS.length - 1)];
  }

  function levelCount() {
    return LEVELS.length;
  }

  /** 按 id 找关（存档恢复 / 自由选关） */
  function byId(id) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === id) return LEVELS[i];
    }
    return LEVELS[0];
  }

  /** 目标当前位置；不在场（enter 之前 / exit 之后）返回 null */
  function getTargetPos(level, phase) {
    phase = MYC.U.clamp(phase, 0, 1);
    if (phase < level.target.enter || phase > level.target.exit) return null;
    return pathPosition(level.target.path, phase);
  }

  /** 场上干扰目标列表（phase 时刻在场且有坐标的） */
  function getDecoys(level, phase) {
    var out = [];
    for (var i = 0; i < level.decoys.length; i++) {
      var d = level.decoys[i];
      if (phase < d.window[0] || phase > d.window[1]) continue;
      var p = d.pos || pathPosition(d.path, phase);
      if (p) out.push({ id: d.id, name: d.name, hint: d.hint, x: p.x, y: p.y });
    }
    return out;
  }

  MYC.LEVELS = LEVELS;
  MYC.Levels = {
    all: LEVELS,
    get: getLevel,
    byId: byId,
    count: levelCount,
    pathPosition: pathPosition,
    getTargetPos: getTargetPos,
    getDecoys: getDecoys
  };

})(window.MYC);
