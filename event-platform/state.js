const appState = {
  currentTab: "home",
  currentUtility: "",
  toastTimer: null,
  loading: true,
  loadError: "",
  events: [],
  quickActions,
};

const tabItems = [
  { id: "home", label: "首页", icon: "home" },
  { id: "events", label: "赛事", icon: "trophy" },
  { id: "profile", label: "我的", icon: "user" },
];

const statusMap = {
  registration_open: {
    label: "报名进行中",
    className: "status-open",
  },
  registration_upcoming: {
    label: "即将开始",
    className: "status-upcoming",
  },
  registration_closed: {
    label: "报名已截止",
    className: "status-ended",
  },
  event_ended: {
    label: "赛事已结束",
    className: "status-ended",
  },
  soft_deleted: {
    label: "已删除",
    className: "status-ended",
  },
  unpublished: {
    label: "未发布",
    className: "status-ended",
  },
  hidden: {
    label: "已下架",
    className: "status-ended",
  },
};
