import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVENT_ID_PATTERN = /^[a-z0-9_-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, 405);
  }

  try {
    const env = getEnv();
    const authHeader = req.headers.get("Authorization") || "";
    const user = await getAuthenticatedAdmin(env, authHeader);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const payload = body.payload || {};
    const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const data = await handleAction(action, payload, admin, user.email || "");
    return jsonResponse({ success: true, data });
  } catch (error) {
    const appError = toAppError(error);
    return jsonResponse(
      {
        success: false,
        code: appError.code,
        message: appError.message,
      },
      appError.status,
    );
  }
});

async function handleAction(action: string, payload: Record<string, unknown>, admin: ReturnType<typeof createClient>, adminEmail: string) {
  switch (action) {
    case "listEvents":
      return listEvents(admin);
    case "getEventDetail":
      return getEventDetail(admin, safeText(payload.eventId));
    case "checkEventIdAvailable":
      return checkEventIdAvailable(admin, safeText(payload.eventId), safeText(payload.currentEventId));
    case "checkEventHasRegistrations":
      return checkEventHasRegistrations(admin, safeText(payload.eventId));
    case "saveEvent":
      return saveEvent(admin, payload.eventDraft as Record<string, unknown>);
    case "setEventPublishState":
      return setEventPublishState(admin, payload.eventItem as Record<string, unknown>, payload.patch as Record<string, unknown>);
    case "archiveEvent":
      return archiveEvent(admin, payload.eventItem as Record<string, unknown>);
    case "listRegistrations":
      return listRegistrations(admin);
    case "getRegistrationDetail":
      return getRegistrationDetail(admin, safeText(payload.registrationNo));
    case "reviewRegistration":
      return reviewRegistration(admin, safeText(payload.registrationNo), safeText(payload.status), safeText(payload.rejectReason), adminEmail);
    case "bulkReviewRegistrations":
      return bulkReviewRegistrations(admin, toStringArray(payload.registrationNos), safeText(payload.status), adminEmail);
    case "exportApprovedRegistrations":
      return exportApprovedRegistrations(admin, payload.filters as Record<string, unknown>);
    default:
      throw new AppError("UNKNOWN_ACTION", "未知接口动作", 400);
  }
}

async function listEvents(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("events").select("*").order("registration_start_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getEventDetail(admin: ReturnType<typeof createClient>, eventId: string) {
  assertSafeEventId(eventId);
  const { data, error } = await admin.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function checkEventIdAvailable(admin: ReturnType<typeof createClient>, eventId: string, currentEventId = "") {
  const normalizedId = normalizeEventId(eventId);
  assertSafeEventId(normalizedId);
  if (normalizedId === normalizeEventId(currentEventId)) return { available: true };
  const { data, error } = await admin.from("events").select("id").eq("id", normalizedId).limit(1);
  if (error) throw error;
  return { available: !data?.length };
}

async function checkEventHasRegistrations(admin: ReturnType<typeof createClient>, eventId: string) {
  assertSafeEventId(eventId);
  const { data, error } = await admin.from("registrations").select("id").eq("event_id", eventId).limit(1);
  if (error) throw error;
  return { hasRegistrations: Boolean(data?.length) };
}

async function saveEvent(admin: ReturnType<typeof createClient>, eventDraft: Record<string, unknown>) {
  if (!eventDraft || typeof eventDraft !== "object") {
    throw new AppError("INVALID_EVENT", "赛事数据不能为空", 400);
  }
  const originalId = normalizeEventId(eventDraft.originalId);
  const nextId = normalizeEventId(eventDraft.id);
  assertSafeEventId(nextId);

  if (originalId && originalId !== nextId) {
    const has = await checkEventHasRegistrations(admin, originalId);
    if (has.hasRegistrations) {
      throw new AppError("EVENT_ID_LOCKED", "该赛事已有报名记录，禁止修改 eventId，避免历史数据错乱", 409);
    }
  }

  const available = await checkEventIdAvailable(admin, nextId, originalId);
  if (!available.available) {
    throw new AppError("EVENT_ID_EXISTS", "eventId 已存在，请更换", 409);
  }

  const row = mapEventDraftToDbRow(eventDraft);
  const query = originalId ? admin.from("events").update(row).eq("id", originalId).select("*") : admin.from("events").insert(row).select("*");
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

async function setEventPublishState(admin: ReturnType<typeof createClient>, eventItem: Record<string, unknown>, patch: Record<string, unknown>) {
  const eventId = normalizeEventId(eventItem?.id);
  assertSafeEventId(eventId);
  const config = asObject(eventItem?.registrationConfig || eventItem?.registration_config);
  const nextConfig = {
    ...config,
    platform: {
      ...asObject(config.platform),
      ...asObject(patch),
    },
  };
  const { data, error } = await admin.from("events").update({ registration_config: nextConfig }).eq("id", eventId).select("*");
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

async function archiveEvent(admin: ReturnType<typeof createClient>, eventItem: Record<string, unknown>) {
  return setEventPublishState(admin, eventItem, {
    isPublished: false,
    visibleOnPlatform: false,
    deletedAt: new Date().toISOString(),
  });
}

async function listRegistrations(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("registrations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getRegistrationDetail(admin: ReturnType<typeof createClient>, registrationNo: string) {
  const { data, error } = await admin.from("registrations").select("*").eq("registration_no", registrationNo).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function reviewRegistration(admin: ReturnType<typeof createClient>, registrationNo: string, status: string, rejectReason: string, adminEmail: string) {
  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("INVALID_REVIEW_STATUS", "审核状态不合法", 400);
  }
  if (status === "rejected" && rejectReason.trim().length < 2) {
    throw new AppError("INVALID_REJECT_REASON", "请填写至少 2 个字的驳回原因", 400);
  }
  const patch = {
    status,
    reject_reason: status === "rejected" ? rejectReason.trim() : "",
    reviewed_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("registrations")
    .update(patch)
    .eq("registration_no", registrationNo)
    .eq("status", "pending_review")
    .eq("payment_status", "paid")
    .select("*");
  if (error) throw error;
  if (!data?.length) {
    throw new AppError("REGISTRATION_NOT_REVIEWABLE", "当前报名不可审核", 409);
  }
  return data[0];
}

async function bulkReviewRegistrations(admin: ReturnType<typeof createClient>, registrationNos: string[], status: string, adminEmail: string) {
  const results = [];
  for (const registrationNo of registrationNos) {
    try {
      const registration = await reviewRegistration(admin, registrationNo, status, "", adminEmail);
      results.push({ registrationNo, success: true, registration });
    } catch (error) {
      const appError = toAppError(error);
      results.push({ registrationNo, success: false, code: appError.code, message: appError.message });
    }
  }
  return results;
}

async function exportApprovedRegistrations(admin: ReturnType<typeof createClient>, filters: Record<string, unknown> = {}) {
  let query = admin.from("registrations").select("*").eq("status", "approved").eq("payment_status", "paid").order("group_name", { ascending: true });
  const eventId = normalizeEventId(filters.eventId);
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getAuthenticatedAdmin(env: ReturnType<typeof getEnv>, authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AppError("UNAUTHORIZED", "请先登录后台", 401);

  const client = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new AppError("UNAUTHORIZED", "登录状态无效，请重新登录", 401);
  const email = String(data.user.email || "").trim().toLowerCase();
  if (!env.allowedAdminEmails.includes(email)) {
    throw new AppError("FORBIDDEN", "当前账号没有后台权限", 403);
  }
  return { ...data.user, email };
}

function getEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const allowedAdminEmails = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new AppError("SERVER_CONFIG_MISSING", "服务端 Supabase 配置缺失", 500);
  }
  if (!allowedAdminEmails.length) {
    throw new AppError("ADMIN_CONFIG_MISSING", "管理员白名单未配置", 500);
  }
  return { supabaseUrl, anonKey, serviceRoleKey, allowedAdminEmails };
}

function mapEventDraftToDbRow(draft: Record<string, unknown>) {
  const registrationConfig = asObject(draft.registrationConfig);
  return {
    id: normalizeEventId(draft.id),
    name: safeText(draft.name),
    registration_start_date: nullableText(draft.registrationStartDate),
    registration_end_date: nullableText(draft.registrationEndDate),
    competition_start_date: nullableText(draft.competitionStartDate),
    competition_end_date: nullableText(draft.competitionEndDate),
    location: safeText(draft.location),
    description: safeText(draft.description)
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    regulation_file_name: safeText(asObject(draft.regulationFile).name),
    regulation_file_url: safeText(asObject(draft.regulationFile).url),
    commitment_file_name: safeText(asObject(draft.commitmentFile).name),
    commitment_file_url: safeText(asObject(draft.commitmentFile).url),
    banner_image_url: safeText(asObject(draft.bannerImage).url),
    banner_fit_mode: safeText(asObject(draft.bannerImage).fitMode) || "cover",
    share_title: safeText(asObject(draft.shareCard).title),
    share_description: safeText(asObject(draft.shareCard).description),
    share_image_url: safeText(asObject(draft.shareCard).imageUrl),
    registration_config: registrationConfig,
  };
}

function assertSafeEventId(eventId: string) {
  if (!eventId || !EVENT_ID_PATTERN.test(eventId)) {
    throw new AppError("INVALID_EVENT_ID", "eventId 只能使用小写字母、数字、下划线和中划线", 400);
  }
}

function normalizeEventId(value: unknown) {
  return safeText(value).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
}

function nullableText(value: unknown) {
  const text = safeText(value);
  return text || null;
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeText(item)).filter(Boolean) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toAppError(error: unknown) {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "服务端处理失败";
  return new AppError("SERVER_ERROR", message, 500);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
