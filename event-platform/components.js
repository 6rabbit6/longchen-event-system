function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "待定";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

function formatDateRange(start, end) {
  if (!start && !end) return "待定";
  if (!end) return formatDate(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function renderIcon(type) {
  const icons = {
    calendar: `<svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>`,
    search: `<svg viewBox="0 0 24 24"><path d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"/></svg>`,
    order: `<svg viewBox="0 0 24 24"><path d="M7 4h10v16H7zM9 8h6M9 12h6M9 16h4"/></svg>`,
    shield: `<svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.8-2.8 8-7 10-4.2-2-7-5.2-7-10V6l7-3Z"/><path d="m9.5 12 1.8 1.8 3.5-4"/></svg>`,
    home: `<svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>`,
    trophy: `<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/></svg>`,
    user: `<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0"/></svg>`,
  };
  return icons[type] || icons.calendar;
}

function renderStatus(status) {
  const config = statusMap[status] || statusMap.registration_upcoming;
  return `<span class="event-status ${config.className}">${escapeHtml(config.label)}</span>`;
}

function renderSectionTitle(title, actionText = "") {
  return `
    <div class="section-title">
      <h2>${escapeHtml(title)}</h2>
      ${actionText ? `<button type="button" data-action="switch-tab" data-tab="events">${escapeHtml(actionText)}</button>` : ""}
    </div>
  `;
}

function renderHero(homeConfig = createDefaultHomeConfig()) {
  const config = normalizeHomeConfig(homeConfig);
  const banner = getEnabledHomeBanners(config)[0] || null;
  const title = banner?.title || config.heroTitle || "龙辰赛事服务平台";
  const summary = banner?.subtitle || config.heroSubtitle || "赛事报名、成绩查询、订单与保险服务一站式入口";
  const imageUrl = banner?.imageUrl || "";
  const bannerAttrs = banner ? `data-banner-id="${escapeHtml(banner.id)}"` : "";
  const clickable = banner && banner.linkType !== "none" ? " hero-clickable" : "";
  return `
    <section class="hero${imageUrl ? " has-banner-image" : ""}${clickable}" ${bannerAttrs} ${clickable ? `data-action="open-home-banner" tabindex="0" role="button"` : ""}>
      ${imageUrl ? `<img class="hero-bg-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />` : ""}
      <div class="hero-art" aria-hidden="true">
        <span class="hero-line hero-line-one"></span>
        <span class="hero-line hero-line-two"></span>
        <span class="hero-dot"></span>
      </div>
      <div class="hero-content">
        <span class="hero-kicker">SPORTS SERVICE PLATFORM</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(summary)}</p>
        <div class="hero-tags">
          <span>报名入口</span>
          <span>赛事聚合</span>
          <span>移动优先</span>
        </div>
      </div>
    </section>
  `;
}

function normalizeHomeConfig(config = {}) {
  const defaults = createDefaultHomeConfig();
  return {
    ...defaults,
    ...config,
    heroTitle: String(config.heroTitle || defaults.heroTitle).trim(),
    heroSubtitle: String(config.heroSubtitle || defaults.heroSubtitle).trim(),
    announcements: Array.isArray(config.announcements) ? config.announcements : defaults.announcements,
    banners: Array.isArray(config.banners) ? config.banners : defaults.banners,
  };
}

function getEnabledHomeBanners(homeConfig = {}) {
  return (Array.isArray(homeConfig.banners) ? homeConfig.banners : [])
    .filter((item) => item && item.enabled !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function renderHomeAnnouncements(homeConfig = {}) {
  const announcements = (Array.isArray(homeConfig.announcements) ? homeConfig.announcements : [])
    .filter((item) => item && item.enabled !== false && String(item.text || "").trim())
    .slice(0, 3);
  if (!announcements.length) return "";
  return `
    <section class="announcement-bar" aria-label="平台公告">
      <span>公告</span>
      <div>
        ${announcements
          .map((item) => {
            const content = escapeHtml(item.text);
            return item.linkUrl
              ? `<button type="button" data-action="open-announcement" data-announcement-id="${escapeHtml(item.id)}">${content}</button>`
              : `<p>${content}</p>`;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderQuickActions(actions) {
  return `
    <section class="quick-grid" aria-label="快捷入口">
      ${actions
        .map(
          (item) => `
            <button class="quick-action" type="button" data-action="quick-action" data-quick-id="${escapeHtml(item.id)}">
              <span class="quick-icon">${renderIcon(item.icon)}</span>
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.description)}</small>
            </button>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderEventCard(eventItem, options = {}) {
  const compact = options.compact ? " event-card-compact" : "";
  return `
    <article class="event-card${compact}" data-action="open-event" data-event-id="${escapeHtml(eventItem.id)}" tabindex="0" role="button">
      <div class="event-cover">
        <img src="${eventItem.cover}" alt="${escapeHtml(eventItem.title)}封面" />
        ${renderStatus(eventItem.status)}
      </div>
      <div class="event-info">
        <div class="event-meta">
          <span>${escapeHtml(eventItem.tag)}</span>
        </div>
        <h3>${escapeHtml(eventItem.title)}</h3>
        <p><span>报名时间</span>${escapeHtml(formatDateRange(eventItem.registerStart, eventItem.registerEnd))}</p>
        <p><span>比赛地点</span>${escapeHtml(eventItem.location)}</p>
      </div>
    </article>
  `;
}

function renderBottomNav() {
  return tabItems
    .map(
      (item) => `
        <button class="${appState.currentTab === item.id ? "is-active" : ""}" type="button" data-action="switch-tab" data-tab="${escapeHtml(item.id)}">
          ${renderIcon(item.icon)}
          <span>${escapeHtml(item.label)}</span>
        </button>
      `,
    )
    .join("");
}

function renderPlaceholderPage(title, description) {
  return `
    <section class="placeholder-page">
      <div class="placeholder-symbol">${renderIcon("trophy")}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <button type="button" data-action="switch-tab" data-tab="home">返回首页</button>
    </section>
  `;
}

function renderLoadingState(text = "正在加载赛事...") {
  return `<section class="empty-panel">${escapeHtml(text)}</section>`;
}

function renderEmptyState(text) {
  return `<section class="empty-panel">${escapeHtml(text)}</section>`;
}
