const adminState = {
  session: null,
  page: "events",
  loading: true,
  events: [],
  registrations: [],
  formErrors: {},
  saveError: "",
  selectedEventId: "all",
  registrationStatusFilter: "all",
  registrationSearch: "",
  editingEvent: null,
  login: {
    email: "",
    password: "",
    error: "",
  },
  selectedBulkNos: [],
};

const navItems = [
  { id: "events", label: "赛事管理" },
  { id: "registrations", label: "报名审核" },
];

const reviewLabels = {
  pending_review: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

const paymentLabels = {
  paid: "已支付",
  unpaid: "未支付",
  failed: "支付失败",
  refunded: "已退款",
};
