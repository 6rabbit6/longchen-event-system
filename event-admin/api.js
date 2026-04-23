let adminSupabaseClient = null;

function getAdminConfig() {
  const config = window.EVENT_ADMIN_CONFIG || {};
  return {
    supabaseUrl: String(config.supabaseUrl || "").replace(/\/$/, ""),
    supabaseAnonKey: String(config.supabaseAnonKey || ""),
    allowedAdminEmails: Array.isArray(config.allowedAdminEmails) ? config.allowedAdminEmails.map((item) => normalizeEmail(item)).filter(Boolean) : [],
    platformUrl: config.platformUrl || "../Event Platform V1/index.html",
    registrationBaseUrl: config.registrationBaseUrl || "../Registration System/index.html",
    edgeFunctionName: config.edgeFunctionName || "admin-api",
    useEdgeFunctions: config.useEdgeFunctions !== false,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAllowedAdmin(email) {
  const config = getAdminConfig();
  return Boolean(config.allowedAdminEmails.length && config.allowedAdminEmails.includes(normalizeEmail(email)));
}

function getAdminClient() {
  const config = getAdminConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return null;
  if (adminSupabaseClient) return adminSupabaseClient;
  adminSupabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return adminSupabaseClient;
}

async function getCurrentAdminSession() {
  const client = getAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data?.session || null;
  if (session && !isAllowedAdmin(session.user?.email)) {
    await client.auth.signOut();
    return null;
  }
  return session;
}

async function signInAdmin(email, password) {
  const client = getAdminClient();
  if (!client) throw new Error("远程服务未配置");
  const { data, error } = await client.auth.signInWithPassword({ email: String(email || "").trim(), password });
  if (error) throw error;
  if (!isAllowedAdmin(data?.session?.user?.email)) {
    await client.auth.signOut();
    throw new Error("当前账号没有后台权限");
  }
  return data.session;
}

async function signOutAdmin() {
  const client = getAdminClient();
  if (client) await client.auth.signOut();
}

async function restRequest(tableName, options = {}) {
  const config = getAdminConfig();
  const client = getAdminClient();
  const { data } = client ? await client.auth.getSession() : { data: null };
  const token = data?.session?.access_token || config.supabaseAnonKey;
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${tableName}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function adminApiRequest(action, payload = {}, fallback) {
  const config = getAdminConfig();
  const client = getAdminClient();
  const { data } = client ? await client.auth.getSession() : { data: null };
  const token = data?.session?.access_token || "";
  const endpoint = `${config.supabaseUrl}/functions/v1/${config.edgeFunctionName}`;

  if (config.useEdgeFunctions && config.supabaseUrl && config.edgeFunctionName && token) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.success !== false) return body.data;
      if (response.status === 404 || response.status === 405) {
        throw new EdgeApiUnavailableError(body?.message || "统一接口尚未部署");
      }
      throw new EdgeApiBusinessError(body?.message || `统一接口请求失败：${response.status}`);
    } catch (error) {
      if (error instanceof EdgeApiBusinessError) throw error;
      if (!fallback) throw error;
      console.warn(`admin-api ${action} failed, fallback to REST`, error);
    }
  }

  if (fallback) return fallback();
  throw new Error("统一接口不可用");
}

class EdgeApiUnavailableError extends Error {}
class EdgeApiBusinessError extends Error {}

function eq(column, value) {
  return `${column}=eq.${encodeURIComponent(String(value || ""))}`;
}

async function loadEvents() {
  const rows = await restRequest("events", { query: "select=*&order=registration_start_date.desc" });
  return Array.isArray(rows) ? rows.map(mapDbEvent) : [];
}

async function fetchEventList() {
  const rows = await adminApiRequest("listEvents", {}, () => loadEvents());
  return Array.isArray(rows) ? rows.map(mapDbEvent) : [];
}

async function fetchEventDetail(eventId) {
  const row = await adminApiRequest("getEventDetail", { eventId }, async () => {
    const rows = await restRequest("events", { query: `${eq("id", eventId)}&limit=1` });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  });
  return row ? mapDbEvent(row) : null;
}

async function checkEventIdAvailable(eventId, currentEventId = "") {
  const normalizedId = normalizeEventIdInput(eventId);
  if (!normalizedId) return false;
  if (normalizedId === normalizeEventIdInput(currentEventId)) return true;
  const result = await adminApiRequest("checkEventIdAvailable", { eventId: normalizedId, currentEventId }, async () => {
    const rows = await restRequest("events", { query: `select=id&${eq("id", normalizedId)}&limit=1` });
    return { available: !(Array.isArray(rows) && rows.length) };
  });
  return Boolean(result?.available);
}

async function eventHasRegistrations(eventId) {
  const normalizedId = normalizeEventIdInput(eventId);
  if (!normalizedId) return false;
  const result = await adminApiRequest("checkEventHasRegistrations", { eventId: normalizedId }, async () => {
    const rows = await restRequest("registrations", { query: `select=id&${eq("event_id", normalizedId)}&limit=1` });
    return { hasRegistrations: Array.isArray(rows) && rows.length > 0 };
  });
  return Boolean(result?.hasRegistrations);
}

async function saveEvent(eventDraft) {
  const row = mapEventDraftToDbRow(eventDraft);
  const existing = Boolean(eventDraft.originalId);
  const rows = await restRequest("events", {
    method: existing ? "PATCH" : "POST",
    query: existing ? eq("id", eventDraft.originalId) : "",
    body: row,
  });
  return Array.isArray(rows) ? mapDbEvent(rows[0]) : null;
}

async function createOrUpdateEvent(eventDraft) {
  const row = await adminApiRequest("saveEvent", { eventDraft }, () => saveEvent(eventDraft));
  return row ? mapDbEvent(row) : null;
}

async function patchEventPlatformState(eventItem, patch) {
  const config = eventItem.registrationConfig || {};
  const nextConfig = {
    ...config,
    platform: {
      ...(config.platform || {}),
      ...patch,
    },
  };
  const rows = await restRequest("events", {
    method: "PATCH",
    query: eq("id", eventItem.id),
    body: { registration_config: nextConfig },
  });
  return Array.isArray(rows) ? mapDbEvent(rows[0]) : null;
}

async function updateEventPlatformState(eventItem, patch) {
  return patchEventPlatformState(eventItem, patch);
}

async function setEventPublicationState(eventItem, options = {}) {
  const patch = {
    isPublished: options.isPublished,
    visibleOnPlatform: options.visibleOnPlatform,
  };
  const row = await adminApiRequest("setEventPublishState", { eventItem, patch }, () => updateEventPlatformState(eventItem, patch));
  return row ? mapDbEvent(row) : null;
}

async function softDeleteEvent(eventItem) {
  const row = await adminApiRequest("archiveEvent", { eventItem }, () =>
    updateEventPlatformState(eventItem, {
      isPublished: false,
      visibleOnPlatform: false,
      deletedAt: new Date().toISOString(),
    }),
  );
  return row ? mapDbEvent(row) : null;
}

async function loadRegistrations() {
  const rows = await restRequest("registrations", { query: "select=*&order=created_at.desc" });
  return Array.isArray(rows) ? rows.map(mapDbRegistration) : [];
}

async function fetchRegistrationList() {
  const rows = await adminApiRequest("listRegistrations", {}, () => loadRegistrations());
  return Array.isArray(rows) ? rows.map(mapDbRegistration) : [];
}

async function fetchRegistrationDetail(registrationNo) {
  const row = await adminApiRequest("getRegistrationDetail", { registrationNo }, async () => {
    const rows = await restRequest("registrations", { query: `${eq("registration_no", registrationNo)}&limit=1` });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  });
  return row ? mapDbRegistration(row) : null;
}

async function reviewRegistration(registrationNo, status, rejectReason = "") {
  const rows = await restRequest("registrations", {
    method: "PATCH",
    query: [eq("registration_no", registrationNo), eq("status", "pending_review"), eq("payment_status", "paid")].join("&"),
    body: {
      status,
      reject_reason: status === "rejected" ? String(rejectReason || "").trim() : "",
      reviewed_at: new Date().toISOString(),
    },
  });
  return Array.isArray(rows) ? rows.map(mapDbRegistration)[0] : null;
}

async function updateRegistrationReviewStatus(registrationNo, status, rejectReason = "") {
  const row = await adminApiRequest("reviewRegistration", { registrationNo, status, rejectReason }, () => reviewRegistration(registrationNo, status, rejectReason));
  return row ? mapDbRegistration(row) : null;
}

async function bulkReviewRegistrations(registrationNos, status) {
  const results = await adminApiRequest("bulkReviewRegistrations", { registrationNos, status }, async () => {
    const fallbackResults = [];
    for (const registrationNo of registrationNos) {
      fallbackResults.push(await updateRegistrationReviewStatus(registrationNo, status));
    }
    return fallbackResults;
  });
  if (!Array.isArray(results)) return [];
  return results.map((item) => {
    if (item && Object.prototype.hasOwnProperty.call(item, "success")) {
      return item.success ? mapDbRegistration(item.registration) : null;
    }
    return item ? mapDbRegistration(item) : null;
  });
}

async function exportApprovedRegistrations(filters = {}) {
  const rows = await adminApiRequest("exportApprovedRegistrations", { filters }, async () => {
    let query = "select=*&status=eq.approved&payment_status=eq.paid&order=group_name.asc";
    if (filters.eventId && filters.eventId !== "all") query += `&${eq("event_id", filters.eventId)}`;
    return restRequest("registrations", { query });
  });
  return Array.isArray(rows) ? rows.map(mapDbRegistration) : [];
}

function mapDbEvent(row = {}) {
  const registrationConfig = row.registration_config && typeof row.registration_config === "object" ? row.registration_config : createDefaultRegistrationConfig();
  registrationConfig.files = {
    ...(registrationConfig.files || {}),
    regulationArticleUrl: registrationConfig.files?.regulationArticleUrl || row.regulation_article_url || row.regulationArticleUrl || "",
    commitmentArticleUrl: registrationConfig.files?.commitmentArticleUrl || row.commitment_article_url || row.commitmentArticleUrl || "",
  };
  return {
    id: row.id || "",
    name: row.name || "",
    registrationStartDate: row.registration_start_date || row.registrationStartDate || "",
    registrationEndDate: row.registration_end_date || row.registrationEndDate || "",
    competitionStartDate: row.competition_start_date || row.competitionStartDate || "",
    competitionEndDate: row.competition_end_date || row.competitionEndDate || "",
    location: row.location || "",
    description: Array.isArray(row.description) ? row.description.join("\n") : String(row.description || ""),
    regulationFile: {
      name: row.regulation_file_name || row.regulationFile?.name || "",
      url: row.regulation_file_url || row.regulationFile?.url || "",
      articleUrl: registrationConfig.files.regulationArticleUrl || "",
    },
    regulationArticleUrl: registrationConfig.files.regulationArticleUrl || "",
    commitmentFile: {
      name: row.commitment_file_name || row.commitmentFile?.name || "",
      url: row.commitment_file_url || row.commitmentFile?.url || "",
      articleUrl: registrationConfig.files.commitmentArticleUrl || "",
    },
    commitmentArticleUrl: registrationConfig.files.commitmentArticleUrl || "",
    bannerImage: {
      url: row.banner_image_url || row.bannerImage?.url || "",
      fitMode: row.banner_fit_mode || row.bannerImage?.fitMode || "cover",
    },
    shareCard: {
      title: row.share_title || row.shareCard?.title || "",
      description: row.share_description || row.shareCard?.description || "",
      imageUrl: row.share_image_url || row.shareCard?.imageUrl || "",
    },
    registrationConfig: row.registrationConfig || registrationConfig,
  };
}

function mapEventDraftToDbRow(draft) {
  const registrationConfig = normalizeRegistrationConfig(draft.registrationConfig);
  registrationConfig.files = {
    ...(registrationConfig.files || {}),
    regulationArticleUrl: String(registrationConfig.files?.regulationArticleUrl || draft.regulationArticleUrl || draft.regulationFile?.articleUrl || "").trim(),
    commitmentArticleUrl: String(registrationConfig.files?.commitmentArticleUrl || draft.commitmentArticleUrl || draft.commitmentFile?.articleUrl || "").trim(),
  };
  return {
    id: normalizeEventIdInput(draft.id),
    name: String(draft.name || "").trim(),
    registration_start_date: draft.registrationStartDate || null,
    registration_end_date: draft.registrationEndDate || null,
    competition_start_date: draft.competitionStartDate || null,
    competition_end_date: draft.competitionEndDate || null,
    location: String(draft.location || "").trim(),
    description: String(draft.description || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    regulation_file_name: draft.regulationFile?.name || "",
    regulation_file_url: draft.regulationFile?.url || "",
    commitment_file_name: draft.commitmentFile?.name || "",
    commitment_file_url: draft.commitmentFile?.url || "",
    banner_image_url: draft.bannerImage?.url || "",
    banner_fit_mode: draft.bannerImage?.fitMode || "cover",
    share_title: draft.shareCard?.title || "",
    share_description: draft.shareCard?.description || "",
    share_image_url: draft.shareCard?.imageUrl || "",
    registration_config: registrationConfig,
  };
}

function mapDbRegistration(row = {}) {
  return {
    id: row.id || "",
    eventId: row.event_id || row.eventId || "",
    registrationNo: row.registration_no || row.registrationNo || "",
    name: row.name || "",
    phone: row.phone || "",
    certificateNumber: row.certificate_number || row.certificateNumber || "",
    organization: row.organization || "",
    groupName: row.group_name || row.groupName || "",
    eventNames: Array.isArray(row.event_names) ? row.event_names : Array.isArray(row.eventNames) ? row.eventNames : [],
    status: row.status || "",
    paymentStatus: row.payment_status || row.paymentStatus || "",
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    orderNo: row.order_no || row.orderNo || "",
    rejectReason: row.reject_reason || row.rejectReason || "",
    paidAt: row.paid_at || row.paidAt || "",
    createdAt: row.created_at || row.createdAt || "",
  };
}

function createDefaultRegistrationConfig() {
  return {
    insuranceRequired: true,
    maxEventsPerPerson: 2,
    certificateTypes: [
      { value: "id_card", label: "身份证" },
      { value: "passport", label: "护照" },
    ],
    organizations: [],
    files: {
      regulationArticleUrl: "",
      commitmentArticleUrl: "",
    },
    pricingRule: {
      mode: "itemized",
      minEventsPerPerson: 1,
      maxEventsPerPerson: 2,
      baseIncludedCount: 2,
      basePrice: 200,
      extraPricePerItem: 50,
    },
    groups: [],
    platform: {
      isPublished: true,
      visibleOnPlatform: true,
      isHot: false,
      sortOrder: 0,
      tag: "赛事活动",
      deletedAt: "",
    },
  };
}

function normalizeRegistrationConfig(config = {}) {
  return normalizeAdminRegistrationConfig(config);
}
