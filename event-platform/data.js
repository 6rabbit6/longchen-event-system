function createCoverSvg(options) {
  const title = options.title || "SPORTS EVENT";
  const subtitle = options.subtitle || "SPORTS EVENT";
  const colorA = options.colorA || "#0f8a62";
  const colorB = options.colorB || "#19b4a6";
  const accent = options.accent || "#ffda68";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${colorA}" offset="0"/>
          <stop stop-color="${colorB}" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="720" height="420" fill="url(#g)"/>
      <path d="M0 298 C120 248 196 350 330 288 C456 230 570 292 720 236 L720 420 L0 420 Z" fill="rgba(255,255,255,.22)"/>
      <path d="M58 314 C165 246 254 382 362 292 C465 207 555 277 664 194" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
      <circle cx="604" cy="86" r="56" fill="rgba(255,255,255,.14)"/>
      <circle cx="98" cy="84" r="32" fill="rgba(255,255,255,.18)"/>
      <text x="48" y="92" fill="white" font-size="34" font-family="Arial, sans-serif" font-weight="800" letter-spacing="2">${subtitle}</text>
      <text x="48" y="162" fill="white" font-size="44" font-family="Arial, sans-serif" font-weight="900">${title}</text>
      <text x="50" y="214" fill="rgba(255,255,255,.86)" font-size="22" font-family="Arial, sans-serif">赛事报名 · 成绩查询 · 订单服务</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const platformEvents = [
  {
    id: "short_track_beijing_2026_02",
    title: "2026年北京市短道速滑联赛第二站",
    cover: createCoverSvg({
      title: "短道速滑联赛",
      subtitle: "SHORT TRACK",
      colorA: "#0d6775",
      colorB: "#18a6ad",
      accent: "#f7f0d0",
    }),
    registerStart: "2026-04-16",
    registerEnd: "2026-05-06",
    location: "北京市 首都体育馆",
    status: "open",
    tag: "冰雪赛事",
  },
  {
    id: "xiamen_fitness_run_2026",
    title: "2026美丽中国·全民健身跑（福建·厦门站）",
    cover: createCoverSvg({
      title: "全民健身跑",
      subtitle: "CITY RUN",
      colorA: "#1b8a4a",
      colorB: "#8cc63e",
      accent: "#ffe28a",
    }),
    registerStart: "2026-04-16",
    registerEnd: "2026-05-10",
    location: "福建省 厦门市",
    status: "open",
    tag: "福建活动",
  },
  {
    id: "shaanxi_green_run_2026",
    title: "2026年绿跑中国全民健康大赛（陕西·长武站）",
    cover: createCoverSvg({
      title: "绿跑中国",
      subtitle: "GREEN RUN",
      colorA: "#2e7d32",
      colorB: "#71c837",
      accent: "#ffffff",
    }),
    registerStart: "2026-04-21",
    registerEnd: "2026-05-18",
    location: "陕西省 咸阳市",
    status: "open",
    tag: "全民健身",
  },
  {
    id: "mountain_trail_yanmen_2026",
    title: "2026雁门关山地越野跑",
    cover: createCoverSvg({
      title: "山地越野跑",
      subtitle: "TRAIL RUN",
      colorA: "#2870b8",
      colorB: "#6bc5f2",
      accent: "#ffef9f",
    }),
    registerStart: "2026-04-18",
    registerEnd: "2026-05-22",
    location: "山西省 忻州市",
    status: "upcoming",
    tag: "越野跑",
  },
  {
    id: "youth_swim_invite_2026",
    title: "2026青少年游泳邀请赛",
    cover: createCoverSvg({
      title: "青少年游泳",
      subtitle: "SWIMMING",
      colorA: "#005f99",
      colorB: "#20c7d9",
      accent: "#d8fff7",
    }),
    registerStart: "2026-03-01",
    registerEnd: "2026-03-20",
    location: "上海市 浦东新区",
    status: "ended",
    tag: "青少年",
  },
  {
    id: "campus_basketball_2026",
    title: "2026城市校园篮球公开赛",
    cover: createCoverSvg({
      title: "校园篮球",
      subtitle: "BASKETBALL",
      colorA: "#b23b00",
      colorB: "#f28c28",
      accent: "#fff0c2",
    }),
    registerStart: "2026-05-01",
    registerEnd: "2026-05-25",
    location: "广东省 广州市",
    status: "upcoming",
    tag: "球类赛事",
  },
];

const quickActions = [
  { id: "registration", label: "赛事报名", description: "进入赛事报名通道", icon: "calendar" },
  { id: "results", label: "成绩查询", description: "查询成绩与证书", icon: "search" },
  { id: "orders", label: "赛事订单", description: "查看报名订单", icon: "order" },
  { id: "insurance", label: "赛事保险", description: "保险服务入口", icon: "shield" },
];
