const app = document.querySelector("#app");
const nav = document.querySelector("#adminNav");
const pageTitle = document.querySelector("#pageTitle");
const logoutButton = document.querySelector("#logoutButton");
const toast = document.querySelector("#toast");
let toastTimer = null;

init();
bindEvents();

async function init() {
  try {
    adminState.session = await getCurrentAdminSession();
    if (adminState.session) await refreshAll();
  } catch (error) {
    console.warn(error);
  } finally {
    adminState.loading = false;
    render();
  }
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  logoutButton.addEventListener("click", async () => {
    await signOutAdmin();
    adminState.session = null;
    render();
  });
}

function render() {
  pageTitle.textContent = adminState.session ? "赛事管理中心" : "后台登录";
  logoutButton.hidden = !adminState.session;
  nav.innerHTML = renderNav();
  if (!adminState.session) {
    app.innerHTML = renderLoginPage();
    return;
  }
  if (adminState.loading) {
    app.innerHTML = `<div class="empty-card">正在加载...</div>`;
    return;
  }
  if (adminState.page === "registrations") {
    app.innerHTML = renderRegistrationsPage();
    return;
  }
  if (adminState.page === "platform_home") {
    if (!adminState.homeConfigDraft) adminState.homeConfigDraft = JSON.parse(JSON.stringify(adminState.homeConfig || createDefaultPlatformHomeConfig()));
    app.innerHTML = renderPlatformHomePage();
    return;
  }
  app.innerHTML = renderEventsPage() + renderEventEditor();
}

async function refreshAll() {
  adminState.loading = true;
  render();
  adminState.events = await fetchEventList();
  adminState.registrations = await fetchRegistrationList();
  adminState.homeConfig = await fetchPlatformHomeConfig();
  adminState.homeConfigDraft = JSON.parse(JSON.stringify(adminState.homeConfig));
  adminState.loading = false;
  render();
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "login") {
    await handleLogin();
  }
  if (action === "go-page") {
    adminState.page = target.dataset.page;
    if (adminState.page === "platform_home") adminState.homeConfigDraft = JSON.parse(JSON.stringify(adminState.homeConfig || createDefaultPlatformHomeConfig()));
    render();
  }
  if (action === "new-event") {
    adminState.editingEvent = createBlankEventDraft();
    adminState.formErrors = {};
    adminState.saveError = "";
    render();
    focusEventEditor();
  }
  if (action === "edit-event") {
    const eventItem = adminState.events.find((item) => item.id === target.dataset.eventId);
    const draft = toEventDraft(eventItem);
    if (eventItem?.id) {
      try {
        draft.eventIdLocked = draft.eventIdLocked || (await eventHasRegistrations(eventItem.id));
      } catch (error) {
        console.warn("check event registrations failed", error);
      }
    }
    adminState.editingEvent = draft;
    adminState.formErrors = {};
    adminState.saveError = "";
    render();
    showToast("已进入赛事编辑");
    focusEventEditor();
  }
  if (action === "close-editor") {
    adminState.editingEvent = null;
    render();
  }
  if (action === "save-event") {
    await handleSaveEvent();
  }
  if (action === "copy-link") {
    await navigator.clipboard.writeText(target.dataset.link);
    showToast("报名链接已复制");
  }
  if (action === "toggle-publish") {
    await handleTogglePublish(target.dataset.eventId);
  }
  if (action === "soft-delete-event") {
    await handleSoftDeleteEvent(target.dataset.eventId);
  }
  if (action === "add-organization") addOrganization();
  if (action === "remove-organization") removeOrganization(Number(target.dataset.index));
  if (action === "add-certificate-type") addCertificateType();
  if (action === "remove-certificate-type") removeCertificateType(Number(target.dataset.index));
  if (action === "add-group") addGroup();
  if (action === "remove-group") removeGroup(Number(target.dataset.index));
  if (action === "add-group-event") addGroupEvent(Number(target.dataset.groupIndex));
  if (action === "remove-group-event") removeGroupEvent(Number(target.dataset.groupIndex), Number(target.dataset.eventIndex));
  if (action === "approve-registration") await approveOne(target.dataset.no);
  if (action === "reject-registration") await rejectOne(target.dataset.no);
  if (action === "bulk-approve") await bulkApprove();
  if (action === "export-json") await exportApproved("json");
  if (action === "export-csv") await exportApproved("csv");
  if (action === "add-home-announcement") addHomeAnnouncement();
  if (action === "remove-home-announcement") removeHomeAnnouncement(Number(target.dataset.index));
  if (action === "add-home-banner") addHomeBanner();
  if (action === "remove-home-banner") removeHomeBanner(Number(target.dataset.index));
  if (action === "save-platform-home") await handleSavePlatformHome();
}

function handleInput(event) {
  const target = event.target;
  if (target.name === "email" || target.name === "password") {
    adminState.login[target.name] = target.value;
    adminState.login.error = "";
    return;
  }
  if (target.name === "registrationSearch") {
    adminState.registrationSearch = target.value;
    render();
    return;
  }
  if (target.dataset.homeField || target.dataset.homeAnnouncementIndex || target.dataset.homeBannerIndex) {
    updateHomeConfigDraft(target);
    return;
  }
  if (!adminState.editingEvent) return;
  if (target.dataset.field) {
    updateDraftField(target);
    if (target.dataset.field === "pricingRule.mode") render();
  }
  if (target.dataset.certIndex) updateCertificateType(target);
  if (target.dataset.orgIndex) updateOrganization(target);
  if (target.dataset.groupField) updateGroup(target);
  if (target.dataset.eventField) updateGroupEvent(target);
}

function handleChange(event) {
  const target = event.target;
  if (target.name === "selectedEventId" || target.name === "registrationStatusFilter") {
    adminState[target.name] = target.value;
    adminState.selectedBulkNos = [];
    render();
  }
  if (target.name === "bulkRegistration") {
    const set = new Set(adminState.selectedBulkNos);
    if (target.checked) set.add(target.value);
    if (!target.checked) set.delete(target.value);
    adminState.selectedBulkNos = Array.from(set);
    render();
  }
  if (target.dataset.homeField || target.dataset.homeAnnouncementIndex || target.dataset.homeBannerIndex) {
    updateHomeConfigDraft(target);
    render();
    return;
  }
  if (!adminState.editingEvent) return;
  if (target.dataset.field) {
    updateDraftField(target);
    if (target.dataset.field === "pricingRule.mode") render();
  }
  if (target.dataset.certIndex) updateCertificateType(target);
  if (target.dataset.orgIndex) updateOrganization(target);
  if (target.dataset.groupField) updateGroup(target);
  if (target.dataset.eventField) updateGroupEvent(target);
}

async function handleLogin() {
  try {
    adminState.session = await signInAdmin(adminState.login.email, adminState.login.password);
    await refreshAll();
  } catch (error) {
    adminState.login.error = error.message || "登录失败";
    render();
  }
}

async function handleSaveEvent() {
  const draft = normalizeEventDraftBeforeSave(adminState.editingEvent);
  adminState.editingEvent = draft;
  adminState.formErrors = validateEventDraft(draft, adminState.events);
  adminState.saveError = "";

  try {
    if (draft.originalId) {
      const hasLocalRegistrations = eventHasLocalRegistrations(draft.originalId);
      const hasRemoteRegistrations = await eventHasRegistrations(draft.originalId);
      if ((hasLocalRegistrations || hasRemoteRegistrations) && draft.id !== draft.originalId) {
        adminState.formErrors.id = "该赛事已有报名记录，禁止修改 eventId，避免历史数据错乱";
        adminState.editingEvent.eventIdLocked = true;
      }
    }

    if (!(await checkEventIdAvailable(draft.id, draft.originalId))) {
      adminState.formErrors.id = "eventId 已存在，请更换";
    }
  } catch (error) {
    console.warn("validate event save failed", error);
    adminState.saveError = `远程校验失败：${error.message || "请检查权限或网络"}`;
    render();
    showToast("远程校验失败");
    return;
  }

  if (Object.keys(adminState.formErrors).length) {
    const message = firstValidationMessage(adminState.formErrors);
    showToast(message || "请检查赛事配置");
    render();
    return;
  }

  try {
    await createOrUpdateEvent(draft);
    adminState.editingEvent = null;
    adminState.formErrors = {};
    showToast("赛事已保存");
    await refreshAll();
  } catch (error) {
    console.warn("save event failed", error);
    adminState.saveError = `远程保存失败：${error.message || "请检查权限或网络"}`;
    render();
    showToast("远程保存失败");
  }
}

async function handleTogglePublish(eventId) {
  const eventItem = adminState.events.find((item) => item.id === eventId);
  if (!eventItem) return;
  const current = eventItem.registrationConfig?.platform?.isPublished !== false;
  try {
    await setEventPublicationState(eventItem, { isPublished: !current, visibleOnPlatform: !current });
    showToast(current ? "赛事已下架" : "赛事已发布");
    await refreshAll();
  } catch (error) {
    console.warn("toggle publish failed", error);
    showToast(error.message || "赛事状态更新失败");
  }
}

async function handleSoftDeleteEvent(eventId) {
  const eventItem = adminState.events.find((item) => item.id === eventId);
  if (!eventItem || !window.confirm("确认软删除该赛事？历史报名记录不会被删除。")) return;
  try {
    await softDeleteEvent(eventItem);
    showToast("赛事已软删除");
    await refreshAll();
  } catch (error) {
    console.warn("soft delete event failed", error);
    showToast(error.message || "赛事软删除失败");
  }
}

function createBlankEventDraft() {
  const config = createDefaultRegistrationConfig();
  return {
    originalId: "",
    id: `event_${Date.now()}`,
    name: "",
    registrationStartDate: "",
    registrationEndDate: "",
    competitionStartDate: "",
    competitionEndDate: "",
    location: "",
    regulationFile: { name: "", url: "" },
    commitmentFile: { name: "", url: "" },
    bannerImage: { url: "", fitMode: "cover" },
    shareCard: { title: "", description: "", imageUrl: "" },
    registrationConfig: config,
    eventIdLocked: false,
  };
}

function toEventDraft(eventItem) {
  return JSON.parse(
    JSON.stringify({
      ...eventItem,
      originalId: eventItem.id,
      eventIdLocked: eventHasLocalRegistrations(eventItem.id),
    }),
  );
}

function updateDraftField(target) {
  const draft = adminState.editingEvent;
  const scope = target.dataset.scope;
  const field = target.dataset.field;
  let value = target.type === "checkbox" ? target.checked : target.value;
  if (field === "id") {
    if (draft.eventIdLocked) {
      target.value = draft.id;
      return;
    }
    value = normalizeEventIdInput(value);
    target.value = value;
  }
  if (scope === "platform") {
    draft.registrationConfig.platform[field] = value;
  } else if (scope === "config") {
    setPath(draft.registrationConfig, field, target.type === "number" ? Number(value) : value);
  } else {
    setPath(draft, field, target.type === "number" ? Number(value) : value);
  }
  delete adminState.formErrors[field];
}

function eventHasLocalRegistrations(eventId) {
  const normalizedId = normalizeEventIdInput(eventId);
  return adminState.registrations.some((item) => normalizeEventIdInput(item.eventId) === normalizedId);
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let node = obj;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) node[part] = value;
    else node = node[part] = node[part] || {};
  });
}

function ensureHomeConfigDraft() {
  if (!adminState.homeConfigDraft) adminState.homeConfigDraft = JSON.parse(JSON.stringify(adminState.homeConfig || createDefaultPlatformHomeConfig()));
  return adminState.homeConfigDraft;
}

function updateHomeConfigDraft(target) {
  const draft = ensureHomeConfigDraft();
  const value = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
  if (target.dataset.homeField) {
    draft[target.dataset.homeField] = value;
    return;
  }
  if (target.dataset.homeAnnouncementIndex) {
    const item = draft.announcements[Number(target.dataset.homeAnnouncementIndex)];
    if (item) item[target.dataset.homeAnnouncementField] = value;
    return;
  }
  if (target.dataset.homeBannerIndex) {
    const item = draft.banners[Number(target.dataset.homeBannerIndex)];
    if (item) item[target.dataset.homeBannerField] = value;
  }
}

function addHomeAnnouncement() {
  const draft = ensureHomeConfigDraft();
  if (draft.announcements.length >= 3) return;
  draft.announcements.push({ id: `notice_${Date.now()}`, text: "", enabled: true, linkUrl: "" });
  render();
}

function removeHomeAnnouncement(index) {
  const draft = ensureHomeConfigDraft();
  draft.announcements.splice(index, 1);
  render();
}

function addHomeBanner() {
  const draft = ensureHomeConfigDraft();
  if (draft.banners.length >= 3) return;
  draft.banners.push({ id: `banner_${Date.now()}`, title: "", subtitle: "", imageUrl: "", enabled: true, sortOrder: draft.banners.length, linkType: "none", eventId: "", linkUrl: "" });
  render();
}

function removeHomeBanner(index) {
  const draft = ensureHomeConfigDraft();
  draft.banners.splice(index, 1);
  render();
}

async function handleSavePlatformHome() {
  try {
    const normalized = normalizePlatformHomeConfig(ensureHomeConfigDraft());
    const saved = await savePlatformHomeConfig(normalized);
    adminState.homeConfig = saved;
    adminState.homeConfigDraft = JSON.parse(JSON.stringify(saved));
    adminState.homeConfigError = "";
    showToast("平台首页配置已保存");
    render();
  } catch (error) {
    console.warn("save platform home failed", error);
    adminState.homeConfigError = error.message || "平台首页配置保存失败";
    showToast("平台首页配置保存失败");
    render();
  }
}

function addOrganization() {
  adminState.editingEvent.registrationConfig.organizations.push({ id: `org_${Date.now()}`, name: "", enabled: true });
  render();
}

function removeOrganization(index) {
  adminState.editingEvent.registrationConfig.organizations.splice(index, 1);
  render();
}

function addCertificateType() {
  adminState.editingEvent.registrationConfig.certificateTypes.push({ value: `cert_${Date.now()}`, label: "" });
  render();
}

function removeCertificateType(index) {
  adminState.editingEvent.registrationConfig.certificateTypes.splice(index, 1);
  render();
}

function updateCertificateType(target) {
  const item = adminState.editingEvent.registrationConfig.certificateTypes[Number(target.dataset.certIndex)];
  if (!item) return;
  const field = target.dataset.certField;
  let value = target.value;
  if (field === "value") {
    value = normalizeEventIdInput(value);
    target.value = value;
  }
  item[field] = field === "label" ? value.trimStart() : value;
  if (field === "label" && (!item.value || /^cert_\d+$/.test(item.value))) {
    item.value = createCertificateSystemValue(item.label, item.value);
  }
  delete adminState.formErrors[`certificateTypes.${target.dataset.certIndex}.${field}`];
  delete adminState.formErrors[`certificateTypes.${target.dataset.certIndex}.value`];
  delete adminState.formErrors.certificateTypes;
}

function updateOrganization(target) {
  const org = adminState.editingEvent.registrationConfig.organizations[Number(target.dataset.orgIndex)];
  if (!org) return;
  const field = target.dataset.orgField;
  org[field] = target.type === "checkbox" ? target.checked : target.value.trimStart();
  delete adminState.formErrors[`organizations.${target.dataset.orgIndex}.name`];
}

function addGroup() {
  adminState.editingEvent.registrationConfig.groups.push({ id: `group_${Date.now()}`, name: "", genderLimit: "all", minBirthYear: 2010, maxBirthYear: 2020, events: [] });
  render();
}

function removeGroup(index) {
  adminState.editingEvent.registrationConfig.groups.splice(index, 1);
  render();
}

function updateGroup(target) {
  const group = adminState.editingEvent.registrationConfig.groups[Number(target.dataset.groupIndex)];
  if (!group) return;
  const field = target.dataset.groupField;
  group[field] = target.type === "number" ? Number(target.value) : target.value;
  delete adminState.formErrors[`groups.${target.dataset.groupIndex}.${field}`];
}

function addGroupEvent(groupIndex) {
  adminState.editingEvent.registrationConfig.groups[groupIndex].events.push({ id: `item_${Date.now()}`, name: "", fee: 0 });
  render();
}

function removeGroupEvent(groupIndex, eventIndex) {
  adminState.editingEvent.registrationConfig.groups[groupIndex].events.splice(eventIndex, 1);
  render();
}

function updateGroupEvent(target) {
  const item = adminState.editingEvent.registrationConfig.groups[Number(target.dataset.groupIndex)]?.events?.[Number(target.dataset.eventIndex)];
  if (!item) return;
  const field = target.dataset.eventField;
  let value = target.type === "number" ? Number(target.value) : target.value;
  if (field === "id") {
    if (adminState.editingEvent.eventIdLocked) {
      target.value = item.id;
      return;
    }
    value = normalizeEventIdInput(value);
    target.value = value;
  }
  item[field] = value;
  if (field === "name" && !adminState.editingEvent.eventIdLocked && (!item.id || isAutoGeneratedItemId(item.id))) {
    item.id = createUniqueGroupEventId(value, item.id, item);
  }
  delete adminState.formErrors[`groups.${target.dataset.groupIndex}.events.${target.dataset.eventIndex}.${field}`];
  delete adminState.formErrors[`groups.${target.dataset.groupIndex}.events.${target.dataset.eventIndex}.id`];
}

function createCertificateSystemValue(label, fallback) {
  const text = String(label || "").trim();
  const knownValues = {
    身份证: "id_card",
    居民身份证: "id_card",
    护照: "passport",
    港澳通行证: "hk_macao_pass",
    台湾通行证: "taiwan_pass",
  };
  return knownValues[text] || normalizeEventIdInput(text) || fallback || `cert_${Date.now()}`;
}

function isAutoGeneratedItemId(value) {
  return /^event_\d+$/.test(String(value || "")) || /^item_\d+$/.test(String(value || ""));
}

function createUniqueGroupEventId(name, fallback, currentItem) {
  const base = normalizeEventIdInput(name) || fallback || `item_${Date.now()}`;
  const groups = adminState.editingEvent.registrationConfig.groups || [];
  const usedIds = new Set();
  groups.forEach((group) => {
    (group.events || []).forEach((eventItem) => {
      if (eventItem !== currentItem && eventItem.id) usedIds.add(eventItem.id);
    });
  });
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  while (usedIds.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function getFilteredRegistrations() {
  const keyword = adminState.registrationSearch.trim();
  return adminState.registrations.filter((item) => {
    if (adminState.selectedEventId !== "all" && item.eventId !== adminState.selectedEventId) return false;
    if (adminState.registrationStatusFilter !== "all" && item.status !== adminState.registrationStatusFilter) return false;
    if (!keyword) return true;
    return [item.name, item.phone, item.certificateNumber, item.registrationNo].some((value) => String(value || "").includes(keyword));
  });
}

function getRegistrationStats() {
  const sourceRecords = adminState.registrations.filter((item) => adminState.selectedEventId === "all" || item.eventId === adminState.selectedEventId);
  const paidRecords = sourceRecords.filter((item) => item.paymentStatus === "paid");
  const groupCounts = {};
  const eventCounts = {};

  sourceRecords.forEach((item) => {
    const groupName = String(item.groupName || "未分组");
    groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
    (Array.isArray(item.eventNames) ? item.eventNames : []).forEach((eventName) => {
      const name = String(eventName || "").trim();
      if (!name) return;
      eventCounts[name] = (eventCounts[name] || 0) + 1;
    });
  });

  return {
    total: sourceRecords.length,
    paid: paidRecords.length,
    pendingReview: paidRecords.filter((item) => item.status === "pending_review").length,
    approved: paidRecords.filter((item) => item.status === "approved").length,
    rejected: paidRecords.filter((item) => item.status === "rejected").length,
    groupCounts,
    eventCounts,
  };
}

async function approveOne(no) {
  try {
    const updated = await updateRegistrationReviewStatus(no, "approved");
    showToast(updated ? "已审核通过" : "当前报名不可审核");
    await refreshAll();
  } catch (error) {
    console.warn("approve registration failed", error);
    showToast(error.message || "审核失败");
  }
}

async function rejectOne(no) {
  const reason = window.prompt("请输入驳回原因，至少 2 个字");
  if (!reason || reason.trim().length < 2) {
    showToast("请填写至少 2 个字的驳回原因");
    return;
  }
  try {
    const updated = await updateRegistrationReviewStatus(no, "rejected", reason);
    showToast(updated ? "已审核驳回" : "当前报名不可审核");
    await refreshAll();
  } catch (error) {
    console.warn("reject registration failed", error);
    showToast(error.message || "审核失败");
  }
}

async function bulkApprove() {
  if (!adminState.selectedBulkNos.length) {
    showToast("请先选择待审核报名记录");
    return;
  }
  if (!window.confirm(`确认批量通过 ${adminState.selectedBulkNos.length} 条待审核报名？`)) return;
  let success = 0;
  try {
    const results = await bulkReviewRegistrations(adminState.selectedBulkNos, "approved");
    for (const updated of results) {
      if (updated) success += 1;
    }
    adminState.selectedBulkNos = [];
    showToast(`已批量通过 ${success} 条`);
    await refreshAll();
  } catch (error) {
    console.warn("bulk approve failed", error);
    showToast(error.message || "批量审核失败");
  }
}

async function exportApproved(type) {
  const filters = {
    eventId: adminState.selectedEventId === "all" ? "" : adminState.selectedEventId,
  };
  let approved = [];
  try {
    approved = await exportApprovedRegistrations(filters);
  } catch (error) {
    console.warn("export approved failed", error);
    showToast(error.message || "导出失败");
    return;
  }
  if (!approved.length) {
    showToast("当前筛选条件下没有可导出的正式名单");
    return;
  }
  if (type === "json") {
    downloadFile("approved-registrations.json", JSON.stringify({ schemaVersion: "registration-export-v1", generatedAt: new Date().toISOString(), registrations: approved }, null, 2), "application/json");
    return;
  }
  const headers = ["报名编号", "姓名", "手机号", "单位", "组别", "项目", "支付金额", "订单号"];
  const rows = approved.map((item) => [item.registrationNo, item.name, item.phone, item.organization, item.groupName, item.eventNames.join("、"), item.totalAmount, item.orderNo]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile("approved-registrations.csv", csv, "text/csv;charset=utf-8");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function focusEventEditor() {
  window.requestAnimationFrame(() => {
    document.querySelector("#eventEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
