function getPlatformConfig() {
  const config = window.EVENT_PLATFORM_CONFIG || {};
  return {
    supabaseUrl: String(config.supabaseUrl || "").replace(/\/$/, ""),
    supabaseAnonKey: String(config.supabaseAnonKey || ""),
    registrationBaseUrl: config.registrationBaseUrl || "../registration-system/index.html",
    adminBaseUrl: config.adminBaseUrl || "../event-admin/index.html",
    publicEdgeFunctionName: config.publicEdgeFunctionName || "public-api",
    usePublicApi: config.usePublicApi !== false,
    eventIdPattern: config.eventIdPattern || "^[a-z0-9_-]+$",
  };
}

function isPlatformRemoteEnabled() {
  const config = getPlatformConfig();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

async function platformRestRequest(tableName, query = "") {
  const config = getPlatformConfig();
  if (!isPlatformRemoteEnabled()) return null;

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${tableName}${query ? `?${query}` : ""}`, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }

  return response.json();
}

async function platformPublicApiRequest(action, payload = {}, fallback) {
  const config = getPlatformConfig();
  if (config.usePublicApi && isPlatformRemoteEnabled()) {
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/${config.publicEdgeFunctionName}`, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.success !== false) return body.data;
      if (response.status === 404 || response.status === 405) throw new PlatformPublicApiUnavailableError("public-api 尚未部署");
      throw new PlatformPublicApiBusinessError(body?.message || `公共接口请求失败：${response.status}`);
    } catch (error) {
      if (error instanceof PlatformPublicApiBusinessError) throw error;
      if (!fallback) throw error;
      console.warn(`public-api ${action} failed, fallback to REST`, error);
    }
  }
  if (fallback) return fallback();
  return null;
}

class PlatformPublicApiUnavailableError extends Error {}
class PlatformPublicApiBusinessError extends Error {}

async function loadPlatformEvents() {
  const rows = await platformPublicApiRequest("listEvents", {}, () => platformRestRequest("events", "select=*&order=registration_start_date.desc"));
  if (!Array.isArray(rows)) return [];
  return rows.map(mapDbEventToPlatformEvent).filter(isPlatformEventVisible).sort(sortPlatformEvents);
}

async function loadPlatformHomeConfig() {
  const fallback = () => Promise.resolve(createDefaultHomeConfig());
  try {
    const config = await platformPublicApiRequest("getPlatformHomeConfig", {}, fallback);
    return normalizePlatformHomeConfig(config);
  } catch (error) {
    console.warn("loadPlatformHomeConfig failed, use default", error);
    return createDefaultHomeConfig();
  }
}

function normalizePlatformHomeConfig(config = {}) {
  const defaults = createDefaultHomeConfig();
  const announcements = Array.isArray(config.announcements) ? config.announcements : defaults.announcements;
  const banners = Array.isArray(config.banners) ? config.banners : defaults.banners;
  return {
    heroTitle: String(config.heroTitle || defaults.heroTitle).trim(),
    heroSubtitle: String(config.heroSubtitle || defaults.heroSubtitle).trim(),
    announcements: announcements
      .map((item, index) => ({
        id: String(item?.id || `notice_${index + 1}`).trim(),
        text: String(item?.text || "").trim(),
        enabled: item?.enabled !== false,
        linkUrl: String(item?.linkUrl || "").trim(),
      }))
      .filter((item) => item.text)
      .slice(0, 3),
    banners: banners
      .map((item, index) => ({
        id: String(item?.id || `banner_${index + 1}`).trim(),
        title: String(item?.title || "").trim(),
        subtitle: String(item?.subtitle || "").trim(),
        imageUrl: String(item?.imageUrl || "").trim(),
        enabled: item?.enabled !== false,
        sortOrder: Number(item?.sortOrder || index),
        linkType: ["none", "event", "url"].includes(item?.linkType) ? item.linkType : "none",
        eventId: normalizePlatformEventId(item?.eventId || ""),
        linkUrl: String(item?.linkUrl || "").trim(),
      }))
      .filter((item) => item.title || item.imageUrl)
      .slice(0, 3),
  };
}

function mapDbEventToPlatformEvent(row) {
  const config = row.registration_config && typeof row.registration_config === "object" ? row.registration_config : {};
  const platform = config.platform || {};
  const bannerUrl = row.banner_image_url || row.banner_url || "";
  const title = row.name || row.title || "未命名赛事";

  return {
    id: normalizePlatformEventId(row.id),
    title,
    cover:
      bannerUrl ||
      createCoverSvg({
        title,
        subtitle: platform.subtitle || "SPORTS EVENT",
        colorA: platform.colorA || "#0d6775",
        colorB: platform.colorB || "#18a6ad",
        accent: platform.accent || "#f7f0d0",
      }),
    registerStart: row.registration_start_date || "",
    registerEnd: row.registration_end_date || "",
    competitionStart: row.competition_start_date || "",
    competitionEnd: row.competition_end_date || "",
    location: row.location || "地点待定",
    status: calculatePlatformEventStatus(row, platform),
    tag: platform.tag || config.tag || "赛事活动",
    isHot: Boolean(platform.isHot),
    sortOrder: Number(platform.sortOrder || 0),
    isPublished: platform.isPublished !== false,
    visibleOnPlatform: platform.visibleOnPlatform !== false,
    deletedAt: platform.deletedAt || "",
    raw: row,
  };
}

function isPlatformEventVisible(eventItem) {
  return Boolean(eventItem.id !== "platform_home_config" && isSafePlatformEventId(eventItem.id) && isPlatformVisibleByStatus(eventItem.status));
}

function sortPlatformEvents(a, b) {
  if (b.isHot !== a.isHot) return Number(b.isHot) - Number(a.isHot);
  if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder;
  return String(b.registerStart || "").localeCompare(String(a.registerStart || ""));
}
