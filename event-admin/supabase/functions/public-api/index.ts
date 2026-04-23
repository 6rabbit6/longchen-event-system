import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVENT_ID_PATTERN = /^[a-z0-9_-]+$/;
const EVENT_STATUS = {
  SOFT_DELETED: "soft_deleted",
  UNPUBLISHED: "unpublished",
  HIDDEN: "hidden",
  REGISTRATION_UPCOMING: "registration_upcoming",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  EVENT_ENDED: "event_ended",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, 405);
  }

  try {
    const admin = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const action = safeText(body.action);
    const payload = asObject(body.payload);
    const data = await handleAction(action, payload, admin);
    return jsonResponse({ success: true, data });
  } catch (error) {
    const appError = toAppError(error);
    return jsonResponse({ success: false, code: appError.code, message: appError.message }, appError.status);
  }
});

async function handleAction(action: string, payload: Record<string, unknown>, admin: ReturnType<typeof createClient>) {
  switch (action) {
    case "listEvents":
      return listPublicEvents(admin);
    case "getEventDetail":
      return getPublicEventDetail(admin, safeText(payload.eventId));
    case "getEventAccessStatus":
      return getPublicEventAccessStatus(admin, safeText(payload.eventId));
    case "submitRegistration":
      return submitRegistration(admin, payload);
    case "searchRegistrations":
      return searchRegistrations(admin, payload);
    case "uploadInsuranceFile":
      return uploadInsuranceFile(admin, payload);
    default:
      throw new AppError("UNKNOWN_ACTION", "未知接口动作", 400);
  }
}

async function listPublicEvents(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("events").select("*").order("registration_start_date", { ascending: false });
  if (error) throw error;
  return (data || []).filter((row) => isPublicVisibleEvent(row)).map((row) => ({ ...row, public_status: calculateEventStatus(row) }));
}

async function getPublicEventDetail(admin: ReturnType<typeof createClient>, eventId: string) {
  assertSafeEventId(eventId);
  const event = await loadEventOrThrow(admin, eventId);
  const status = calculateEventStatus(event);
  if ([EVENT_STATUS.SOFT_DELETED, EVENT_STATUS.UNPUBLISHED, EVENT_STATUS.HIDDEN].includes(status)) {
    throw statusToError(status);
  }
  return { event: { ...event, public_status: status }, status, canRegister: status === EVENT_STATUS.REGISTRATION_OPEN, message: getStatusMessage(status) };
}

async function getPublicEventAccessStatus(admin: ReturnType<typeof createClient>, eventId: string) {
  assertSafeEventId(eventId);
  const event = await loadEventOrThrow(admin, eventId);
  const status = calculateEventStatus(event);
  return { status, canRegister: status === EVENT_STATUS.REGISTRATION_OPEN, message: getStatusMessage(status) };
}

async function submitRegistration(admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const record = asObject(payload.record);
  const order = asObject(payload.order);
  const eventId = normalizeEventId(record.eventId || order.eventId || payload.eventId);
  assertSafeEventId(eventId);

  const event = await loadEventOrThrow(admin, eventId);
  const status = calculateEventStatus(event);
  if (status !== EVENT_STATUS.REGISTRATION_OPEN) throw statusToError(status);

  const config = getRegistrationConfig(event);
  const platform = asObject(config.platform);
  if (platform.registrationEnabled === false) {
    throw new AppError("EVENT_NOT_OPEN", "该赛事暂未开启报名", 409);
  }

  const validated = validateRegistrationRecord(record, order, event, config);
  const duplicate = await findDuplicateRegistration(admin, eventId, validated.certificate_number);
  if (duplicate) {
    throw new AppError("DUPLICATE_REGISTRATION", getDuplicateMessage(safeText(duplicate.status)), 409);
  }

  const row = {
    ...validated,
    id: safeUuid(record.id) || crypto.randomUUID(),
    event_id: eventId,
    registration_no: safeText(record.registrationNo) || createRegistrationNo(),
    order_no: safeText(order.orderNo) || createOrderNo(),
    status: "pending_review",
    payment_status: "paid",
    paid_at: nullableTimestamp(order.paidAt) || new Date().toISOString(),
    submitted_at: nullableTimestamp(record.submittedAt || order.createdAt) || new Date().toISOString(),
    created_at: nullableTimestamp(order.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviewed_at: null,
    reject_reason: "",
  };

  const { data, error } = await admin.from("registrations").insert(row).select("*");
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

async function searchRegistrations(admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const eventId = normalizeEventId(payload.eventId);
  assertSafeEventId(eventId);
  const query = safeText(payload.query).trim();
  if (!query) throw new AppError("INVALID_REGISTRATION_QUERY", "请输入查询条件", 400);

  const column = getRegistrationSearchColumn(query);
  const value = column === "phone" ? query : query.toUpperCase();
  const { data, error } = await admin
    .from("registrations")
    .select("id,event_id,registration_no,certificate_type,certificate_number,name,gender,birth_date,birth_year,age,phone,organization_id,organization,group_id,group_name,event_ids,event_names,insurance_uploaded,insurance_file_url,total_amount,status,payment_status,order_no,paid_at,reject_reason,reviewed_at,submitted_at,created_at,updated_at")
    .eq("event_id", eventId)
    .eq("payment_status", "paid")
    .in("status", ["pending_review", "approved", "rejected"])
    .eq(column, value)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function uploadInsuranceFile(admin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const eventId = normalizeEventId(payload.eventId);
  assertSafeEventId(eventId);
  const registrationNo = sanitizePathPart(payload.registrationNo, "registration");
  const fileName = safeText(payload.fileName) || "insurance";
  const contentType = safeText(payload.contentType).toLowerCase();
  const base64 = safeText(payload.base64);
  const size = Number(payload.size || 0);
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const maxBytes = Number(Deno.env.get("MAX_INSURANCE_FILE_BYTES") || 5 * 1024 * 1024);

  if (!base64) throw new AppError("FILE_REQUIRED", "请选择保险单文件", 400);
  if (!allowedTypes.has(contentType)) throw new AppError("INVALID_FILE_TYPE", "保险单文件类型不支持", 400);
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
    throw new AppError("INVALID_FILE_SIZE", `保险单文件不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 400);
  }

  // Make sure the event exists and is not an arbitrary storage namespace.
  await loadEventOrThrow(admin, eventId);

  const extension = getSafeFileExtension(fileName, contentType);
  const timestamp = Date.now();
  const randomPart = crypto.randomUUID().slice(0, 8);
  const path = `${sanitizePathPart(eventId, "event")}/insurance/${registrationNo}-${timestamp}-${randomPart}.${extension}`;
  const bytes = decodeBase64(base64);
  if (bytes.byteLength !== size) {
    throw new AppError("INVALID_FILE_SIZE", "保险单文件大小校验失败", 400);
  }

  const bucketName = Deno.env.get("REGISTRATION_FILES_BUCKET") || "registration-files";
  const { error } = await admin.storage.from(bucketName).upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = admin.storage.from(bucketName).getPublicUrl(path);
  const publicUrl = safeText(data?.publicUrl);
  if (!publicUrl) throw new AppError("FILE_URL_UNAVAILABLE", "保险单文件地址生成失败", 500);

  return {
    bucket: bucketName,
    path,
    url: publicUrl,
    name: fileName,
    type: contentType,
    size,
  };
}

function validateRegistrationRecord(record: Record<string, unknown>, order: Record<string, unknown>, event: Record<string, unknown>, config: Record<string, unknown>) {
  const groups = Array.isArray(config.groups) ? config.groups.map(asObject) : [];
  const certificateTypes = Array.isArray(config.certificateTypes) ? config.certificateTypes.map(asObject) : [];
  const organizations = Array.isArray(config.organizations) ? config.organizations.map(asObject) : [];
  const pricingRule = asObject(config.pricingRule);

  const groupId = safeText(record.groupId);
  const group = groups.find((item) => safeText(item.id) === groupId || safeText(item.name) === safeText(record.groupName));
  if (!group) throw new AppError("INVALID_GROUP", "参赛组别不合法", 400);
  const gender = safeText(record.gender);
  const genderLimit = safeText(group.genderLimit) || "all";
  if (genderLimit !== "all" && genderLimit !== gender) {
    throw new AppError("INVALID_GROUP", "参赛组别与性别不匹配", 400);
  }
  const birthYear = Number(record.birthYear) || Number(String(record.birthDate || "").slice(0, 4)) || 0;
  const minBirthYear = Number(group.minBirthYear) || 0;
  const maxBirthYear = Number(group.maxBirthYear) || 9999;
  if (!birthYear || birthYear < minBirthYear || birthYear > maxBirthYear) {
    throw new AppError("INVALID_GROUP", "参赛组别与出生年份不匹配", 400);
  }

  const eventIds = toStringArray(record.eventIds);
  const groupEvents = Array.isArray(group.events) ? group.events.map(asObject) : [];
  const validEventIds = new Set(groupEvents.map((item) => safeText(item.id)).filter(Boolean));
  if (!eventIds.length) throw new AppError("INVALID_EVENTS", "请至少选择 1 个参赛项目", 400);
  if (eventIds.some((id) => !validEventIds.has(id))) throw new AppError("INVALID_EVENTS", "参赛项目与当前组别不匹配", 400);

  const minCount = Math.max(1, Number(pricingRule.minEventsPerPerson || 1));
  const maxCount = Math.max(minCount, Number(pricingRule.maxEventsPerPerson || config.maxEventsPerPerson || 1));
  if (eventIds.length < minCount) throw new AppError("TOO_FEW_EVENTS", `至少选择 ${minCount} 个参赛项目`, 400);
  if (eventIds.length > maxCount) throw new AppError("TOO_MANY_EVENTS", `每人最多可报 ${maxCount} 项`, 400);

  const certificateType = safeText(record.certificateType);
  if (certificateTypes.length && !certificateTypes.some((item) => safeText(item.value) === certificateType)) {
    throw new AppError("INVALID_CERTIFICATE_TYPE", "证件类型不合法", 400);
  }

  const enabledOrganizations = organizations.filter((item) => item.enabled !== false);
  const organizationId = safeText(record.organizationId);
  if (enabledOrganizations.length && !enabledOrganizations.some((item) => safeText(item.id) === organizationId || safeText(item.name) === safeText(record.organization))) {
    throw new AppError("INVALID_ORGANIZATION", "代表单位不合法", 400);
  }

  if (config.insuranceRequired === true && !record.insuranceFile && !record.insuranceFileUrl && !record.insurance_file_url) {
    throw new AppError("INSURANCE_REQUIRED", "请上传保险单", 400);
  }

  const serverAmount = calculateRegistrationAmount(eventIds, groupEvents, pricingRule);
  const requiredFields = {
    certificate_number: normalizeCertificate(record.certificateNumber),
    name: safeText(record.name),
    gender,
    birth_date: safeText(record.birthDate),
    phone: safeText(record.phone),
    organization: safeText(record.organization),
    group_name: safeText(group.name || record.groupName),
  };
  Object.entries(requiredFields).forEach(([field, value]) => {
    if (!value) throw new AppError("MISSING_FIELD", `${field} 不能为空`, 400);
  });

  return {
    certificate_type: certificateType,
    certificate_number: requiredFields.certificate_number,
    name: requiredFields.name,
    gender: requiredFields.gender,
    birth_date: requiredFields.birth_date,
    birth_year: birthYear,
    age: Number(record.age) || null,
    phone: requiredFields.phone,
    organization_id: organizationId,
    organization: requiredFields.organization,
    group_id: safeText(group.id || groupId),
    group_name: requiredFields.group_name,
    event_ids: eventIds,
    event_names: toStringArray(record.eventNames).length ? toStringArray(record.eventNames) : eventIds.map((id) => safeText(groupEvents.find((item) => safeText(item.id) === id)?.name)).filter(Boolean),
    insurance_uploaded: Boolean(record.insuranceFile || record.insuranceFileUrl || record.insurance_file_url),
    insurance_file_url: safeText(record.insuranceFileUrl || record.insurance_file_url || asObject(record.insuranceFile).remoteUrl || asObject(record.insuranceFile).previewUrl),
    total_amount: serverAmount,
  };
}

function calculateRegistrationAmount(eventIds: string[], groupEvents: Record<string, unknown>[], pricingRule: Record<string, unknown>) {
  if (pricingRule.mode === "tiered") {
    const baseIncludedCount = Math.max(1, Number(pricingRule.baseIncludedCount || eventIds.length || 1));
    const basePrice = Math.max(0, Number(pricingRule.basePrice || 0));
    const extraPricePerItem = Math.max(0, Number(pricingRule.extraPricePerItem || 0));
    return eventIds.length <= baseIncludedCount ? basePrice : basePrice + (eventIds.length - baseIncludedCount) * extraPricePerItem;
  }
  return eventIds.reduce((sum, eventId) => {
    const item = groupEvents.find((eventItem) => safeText(eventItem.id) === eventId);
    return sum + Math.max(0, Number(item?.fee || 0));
  }, 0);
}

async function loadEventOrThrow(admin: ReturnType<typeof createClient>, eventId: string) {
  const { data, error } = await admin.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("EVENT_NOT_FOUND", "未找到该赛事", 404);
  return data;
}

async function findDuplicateRegistration(admin: ReturnType<typeof createClient>, eventId: string, certificateNumber: string) {
  const { data, error } = await admin
    .from("registrations")
    .select("id,status")
    .eq("event_id", eventId)
    .eq("certificate_number", certificateNumber)
    .in("status", ["pending_payment", "pending_review", "approved"])
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

function getRegistrationConfig(event: Record<string, unknown>) {
  return asObject(event.registration_config);
}

function calculateEventStatus(event: Record<string, unknown>) {
  const config = getRegistrationConfig(event);
  const platform = asObject(config.platform);
  if (platform.deletedAt) return EVENT_STATUS.SOFT_DELETED;
  if (platform.isPublished === false) return EVENT_STATUS.UNPUBLISHED;
  if (platform.visibleOnPlatform === false) return EVENT_STATUS.HIDDEN;

  const today = new Date();
  const registrationStart = parseDate(event.registration_start_date);
  const registrationEnd = parseDate(event.registration_end_date);
  const competitionEnd = parseDate(event.competition_end_date);
  if (registrationStart && today < registrationStart) return EVENT_STATUS.REGISTRATION_UPCOMING;
  if (registrationEnd && today > registrationEnd) return EVENT_STATUS.REGISTRATION_CLOSED;
  if (competitionEnd && today > competitionEnd) return EVENT_STATUS.EVENT_ENDED;
  return EVENT_STATUS.REGISTRATION_OPEN;
}

function isPublicVisibleEvent(event: Record<string, unknown>) {
  return ![EVENT_STATUS.SOFT_DELETED, EVENT_STATUS.UNPUBLISHED, EVENT_STATUS.HIDDEN].includes(calculateEventStatus(event));
}

function statusToError(status: string) {
  const codeMap: Record<string, string> = {
    [EVENT_STATUS.SOFT_DELETED]: "EVENT_NOT_FOUND",
    [EVENT_STATUS.UNPUBLISHED]: "EVENT_UNPUBLISHED",
    [EVENT_STATUS.HIDDEN]: "EVENT_HIDDEN",
    [EVENT_STATUS.REGISTRATION_UPCOMING]: "REGISTRATION_NOT_STARTED",
    [EVENT_STATUS.REGISTRATION_CLOSED]: "REGISTRATION_CLOSED",
    [EVENT_STATUS.EVENT_ENDED]: "EVENT_ENDED",
  };
  return new AppError(codeMap[status] || "EVENT_NOT_OPEN", getStatusMessage(status) || "赛事暂不可访问", status === EVENT_STATUS.SOFT_DELETED ? 404 : 409);
}

function getStatusMessage(status: string) {
  const messages: Record<string, string> = {
    [EVENT_STATUS.SOFT_DELETED]: "该赛事已删除，无法继续访问。",
    [EVENT_STATUS.UNPUBLISHED]: "该赛事暂未发布。",
    [EVENT_STATUS.HIDDEN]: "该赛事已下架或暂不展示。",
    [EVENT_STATUS.REGISTRATION_UPCOMING]: "报名尚未开始。",
    [EVENT_STATUS.REGISTRATION_CLOSED]: "报名已截止。",
    [EVENT_STATUS.EVENT_ENDED]: "赛事已结束。",
  };
  return messages[status] || "";
}

function getRegistrationSearchColumn(query: string) {
  if (/^1[3-9]\d{9}$/.test(query)) return "phone";
  if (query.toUpperCase().startsWith("BM-")) return "registration_no";
  return "certificate_number";
}

function createRegistrationNo() {
  return `BM-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createOrderNo() {
  return `ORDER-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getDuplicateMessage(status: string) {
  if (status === "pending_payment") return "该证件号已有未完成支付的报名记录，请先完成支付或联系管理员";
  if (status === "pending_review") return "该证件号已提交报名，当前正在审核中，请勿重复报名";
  if (status === "approved") return "该证件号已报名成功，无需重复报名";
  return "该证件号已有报名记录";
}

function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) throw new AppError("SERVER_CONFIG_MISSING", "服务端 Supabase 配置缺失", 500);
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function getSafeFileExtension(fileName: string, contentType: string) {
  const nameExtension = fileName.split(".").pop()?.toLowerCase() || "";
  const safeNameExtension = /^[a-z0-9]{2,8}$/.test(nameExtension) ? nameExtension : "";
  if (safeNameExtension) return safeNameExtension === "jpeg" ? "jpg" : safeNameExtension;
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "application/pdf") return "pdf";
  return "bin";
}

function sanitizePathPart(value: unknown, fallback: string) {
  const text = safeText(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertSafeEventId(eventId: string) {
  if (!eventId || !EVENT_ID_PATTERN.test(eventId)) throw new AppError("INVALID_EVENT_ID", "eventId 不合法", 400);
}

function normalizeEventId(value: unknown) {
  return safeText(value).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
}

function normalizeCertificate(value: unknown) {
  return safeText(value).toUpperCase();
}

function safeUuid(value: unknown) {
  const text = safeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function nullableTimestamp(value: unknown) {
  const text = safeText(value);
  return text || null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeText(item)).filter(Boolean) : [];
}

function parseDate(value: unknown) {
  const text = safeText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeText(value: unknown) {
  return String(value ?? "").trim();
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
