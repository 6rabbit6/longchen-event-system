const app = document.querySelector("#app");
const bottomNav = document.querySelector("#bottomNav");
const toast = document.querySelector("#toast");

init();
bindEvents();

async function init() {
  renderApp();
  await refreshPlatformEvents();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    handleAction(target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target.closest("[data-action='open-event'], [data-action='open-home-banner']");
    if (target) handleAction(target);
  });
}

function handleAction(target) {
  const action = target.dataset.action;

  if (action === "switch-tab") {
    setCurrentTab(target.dataset.tab);
    return;
  }

  if (action === "quick-action") {
    handleQuickAction(target.dataset.quickId);
    return;
  }

  if (action === "open-event") {
    openRegistrationModule(target.dataset.eventId);
  }

  if (action === "open-home-banner") {
    openHomeBanner(target.dataset.bannerId);
  }

  if (action === "open-announcement") {
    openHomeAnnouncement(target.dataset.announcementId);
  }
}

function setCurrentTab(tabId) {
  if (!tabItems.some((item) => item.id === tabId)) return;
  appState.currentTab = tabId;
  appState.currentUtility = "";
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderApp() {
  bottomNav.innerHTML = renderBottomNav();

  if (appState.currentUtility) {
    app.innerHTML = renderUtilityPage(appState.currentUtility);
    return;
  }

  if (appState.currentTab === "home") {
    app.innerHTML = renderHomePage();
    return;
  }

  if (appState.currentTab === "events") {
    app.innerHTML = renderEventsPage();
    return;
  }

  app.innerHTML = renderProfilePage();
}

function renderHomePage() {
  if (appState.loading) return renderLoadingState();
  if (appState.loadError) return renderEmptyState(appState.loadError);

  const hotEvents = appState.events.filter((item) => item.isHot).slice(0, 4);
  const latestEvents = [...appState.events].sort((a, b) => String(b.registerStart || "").localeCompare(String(a.registerStart || ""))).slice(0, 4);
  return `
    <article class="home-page">
      ${renderHero(appState.homeConfig)}
      ${renderHomeAnnouncements(appState.homeConfig)}
      ${renderQuickActions(appState.quickActions)}
      <section class="content-section">
        ${renderSectionTitle("热门赛事", "全部赛事")}
        <div class="event-list">
          ${(hotEvents.length ? hotEvents : latestEvents).map((item) => renderEventCard(item)).join("") || renderEmptyState("暂无热门赛事")}
        </div>
      </section>
      <section class="content-section">
        ${renderSectionTitle("最新赛事")}
        <div class="event-list">
          ${latestEvents.map((item) => renderEventCard(item, { compact: true })).join("") || renderEmptyState("暂无最新赛事")}
        </div>
      </section>
    </article>
  `;
}

function renderEventsPage() {
  if (appState.loading) return renderLoadingState();
  if (appState.loadError) return renderEmptyState(appState.loadError);

  return `
    <article class="events-page">
      <header class="page-head">
        <span>EVENTS</span>
        <h1>赛事列表</h1>
        <p>这里先展示平台赛事集合，后续可继续接入筛选、城市、项目类型和报名状态。</p>
      </header>
      <section class="event-list">
        ${appState.events.map((item) => renderEventCard(item)).join("") || renderEmptyState("暂无可报名赛事")}
      </section>
    </article>
  `;
}

function renderProfilePage() {
  return renderPlaceholderPage("我的赛事", "登录、报名订单、参赛记录和个人信息将在后续版本接入。");
}

function renderUtilityPage(actionId) {
  const action = appState.quickActions.find((item) => item.id === actionId);
  if (!action) return renderPlaceholderPage("平台服务", "该服务将在后续版本接入。");
  return renderPlaceholderPage(action.label, `${action.description}。这里已预留独立页面结构，后续可接入 Web / 小程序共用 API。`);
}

function handleQuickAction(actionId) {
  const action = appState.quickActions.find((item) => item.id === actionId);
  if (!action) return;

  if (actionId === "registration") {
    setCurrentTab("events");
    showToast("请选择赛事进入报名");
    return;
  }

  appState.currentUtility = actionId;
  renderApp();
}

function openRegistrationModule(eventId) {
  const normalizedEventId = normalizePlatformEventId(eventId);
  if (!isSafePlatformEventId(normalizedEventId)) {
    showToast("赛事 ID 无效，请刷新后重试");
    return;
  }

  const eventItem = appState.events.find((item) => item.id === normalizedEventId);
  if (!eventItem) {
    showToast("未找到该赛事，请刷新后重试");
    return;
  }
  if (!isPlatformEventVisible(eventItem)) {
    showToast("该赛事已下架或暂不可报名");
    return;
  }

  const config = getPlatformConfig();
  const returnUrl = window.location.href.split("#")[0];
  const registrationUrl = `${config.registrationBaseUrl}?eventId=${encodeURIComponent(normalizedEventId)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  window.location.href = registrationUrl;
}

function openHomeBanner(bannerId) {
  const banner = getEnabledHomeBanners(appState.homeConfig).find((item) => item.id === bannerId);
  if (!banner) return;
  if (banner.linkType === "event") {
    openRegistrationModule(banner.eventId);
    return;
  }
  if (banner.linkType === "url" && banner.linkUrl) {
    window.open(banner.linkUrl, "_blank", "noopener");
  }
}

function openHomeAnnouncement(announcementId) {
  const announcement = (appState.homeConfig.announcements || []).find((item) => item.id === announcementId);
  if (announcement?.linkUrl) window.open(announcement.linkUrl, "_blank", "noopener");
}

async function refreshPlatformEvents() {
  appState.loading = true;
  appState.loadError = "";
  renderApp();

  try {
    const [events, homeConfig] = await Promise.all([loadPlatformEvents(), loadPlatformHomeConfig()]);
    appState.events = events;
    appState.homeConfig = homeConfig;
    if (!appState.events.length) {
      appState.loadError = "暂无已发布赛事";
    }
  } catch (error) {
    console.warn("loadPlatformEvents failed", error);
    appState.loadError = "赛事加载失败，请稍后重试";
  } finally {
    appState.loading = false;
    renderApp();
  }
}

function showToast(message) {
  window.clearTimeout(appState.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  appState.toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}
