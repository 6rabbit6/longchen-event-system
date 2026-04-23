const remoteConfigStorageKey = "registration-system-supabase-config-v1";
// Configure by setting window.REGISTRATION_SUPABASE_CONFIG or this localStorage key.
let supabaseAuthClient = null;
let supabaseAuthClientKey = "";

function getRemoteConfig() {
  const inlineConfig = window.REGISTRATION_SUPABASE_CONFIG || {};
  const storedConfig = readStoredRemoteConfig();
  const hasInlineEventId = Object.prototype.hasOwnProperty.call(inlineConfig, "eventId");
  const config = {
    supabaseUrl: safeText(inlineConfig.supabaseUrl || inlineConfig.url || storedConfig.supabaseUrl || storedConfig.url).replace(/\/$/, ""),
    supabaseAnonKey: safeText(inlineConfig.supabaseAnonKey || inlineConfig.anonKey || storedConfig.supabaseAnonKey || storedConfig.anonKey),
    eventId: hasInlineEventId ? safeText(inlineConfig.eventId) : safeText(storedConfig.eventId || getCurrentEventConfig()?.id || event.id),
    publicEdgeFunctionName: safeText(inlineConfig.publicEdgeFunctionName || storedConfig.publicEdgeFunctionName || "public-api"),
    usePublicApi: inlineConfig.usePublicApi !== false && storedConfig.usePublicApi !== false,
  };
  return {
    ...config,
    enabled: Boolean(config.supabaseUrl && config.supabaseAnonKey),
  };
}

function readStoredRemoteConfig() {
  try {
    const raw = localStorage.getItem(remoteConfigStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isRemoteEnabled() {
  return getRemoteConfig().enabled;
}

function getSupabaseAuthClient() {
  const config = getRemoteConfig();
  if (!config.enabled || !window.supabase?.createClient) return null;

  const clientKey = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (supabaseAuthClient && supabaseAuthClientKey === clientKey) return supabaseAuthClient;

  supabaseAuthClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  supabaseAuthClientKey = clientKey;
  return supabaseAuthClient;
}

async function supabaseRestRequest(tableName, options = {}) {
  const config = getRemoteConfig();
  if (!config.enabled) return null;

  const query = options.query ? `?${options.query}` : "";
  const authorizationToken = await getSupabaseRestAuthorizationToken(config);
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${tableName}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${authorizationToken}`,
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

async function publicApiRequest(action, payload = {}, fallback) {
  const config = getRemoteConfig();
  if (config.usePublicApi && config.enabled) {
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
      if (response.status === 404 || response.status === 405) throw new PublicApiUnavailableError("public-api 尚未部署");
      throw new PublicApiBusinessError(body?.message || `公共接口请求失败：${response.status}`);
    } catch (error) {
      if (error instanceof PublicApiBusinessError) throw error;
      if (!fallback) throw error;
      console.warn(`public-api ${action} failed, fallback to REST`, error);
    }
  }
  if (fallback) return fallback();
  return null;
}

class PublicApiUnavailableError extends Error {}
class PublicApiBusinessError extends Error {}

async function getSupabaseRestAuthorizationToken(config) {
  const client = getSupabaseAuthClient();
  if (!client) return config.supabaseAnonKey;

  try {
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || config.supabaseAnonKey;
  } catch {
    return config.supabaseAnonKey;
  }
}

function remoteEq(column, value) {
  return `${column}=eq.${encodeURIComponent(safeText(value))}`;
}

function remoteIn(column, values) {
  return `${column}=in.(${values.map((item) => encodeURIComponent(item)).join(",")})`;
}

function toNullableTimestamp(value) {
  const text = safeText(value).trim();
  return text ? text : null;
}

function sanitizeRemoteRegistrationPayloadTimestamps(payload) {
  const nextPayload = { ...payload };
  ["paid_at", "reviewed_at", "submitted_at", "created_at", "updated_at"].forEach((field) => {
    nextPayload[field] = toNullableTimestamp(nextPayload[field]);
  });
  return nextPayload;
}

async function loadRemoteEvent() {
  const config = getRemoteConfig();
  if (!config.enabled) return null;

  const row = await publicApiRequest("getEventDetail", { eventId: config.eventId }, async () => {
    const queryParts = ["select=*", "limit=1"];
    if (config.eventId) queryParts.push(remoteEq("id", config.eventId));
    const rows = await supabaseRestRequest("events", { query: queryParts.join("&") });
    return Array.isArray(rows) ? rows[0] : null;
  });
  const eventRow = row?.event || row;
  return eventRow ? mapDbEventToEventConfig(eventRow) : null;
}

async function saveRemoteEventConfig(eventConfig, registrationConfig) {
  const config = getRemoteConfig();
  if (!config.enabled) return null;

  const nextEventConfig = sanitizeEventConfig(eventConfig);
  const nextRegistrationConfig = sanitizeRegistrationConfig(registrationConfig);
  const eventId = safeText(nextEventConfig.id || config.eventId).trim();
  if (!eventId) return null;

  const payload = mapEventConfigToDbRow(
    {
      ...nextEventConfig,
      id: eventId,
    },
    nextRegistrationConfig,
  );

  const rows = await supabaseRestRequest("events", {
    method: "PATCH",
    query: remoteEq("id", eventId),
    body: payload,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? mapDbEventToEventConfig(row) : null;
}

async function loadRemoteOrganizations() {
  const config = getRemoteConfig();
  if (!config.enabled) return null;

  const rows = await supabaseRestRequest("organizations", { query: "select=*&order=name.asc" });
  if (!Array.isArray(rows)) return null;

  const filteredRows = rows.filter((row) => !row.event_id || row.event_id === config.eventId);
  return filteredRows.map(mapDbOrganizationToConfig).filter((item) => item.name);
}

async function createRemoteRegistration(record, recordOrder) {
  if (!isRemoteEnabled()) return null;
  const recordForSave = await resolveInsuranceFileForRemoteSave(record, recordOrder);
  const row = await publicApiRequest("submitRegistration", {
    eventId: safeText(recordForSave?.eventId || recordOrder?.eventId || getRemoteConfig().eventId),
    record: recordForSave,
    order: recordOrder,
  }, async () => {
    const payload = sanitizeRemoteRegistrationPayloadTimestamps(mapRegistrationToDbRow(recordForSave, recordOrder));
    console.log("createRemoteRegistration fallback payload:", payload);
    const rows = await supabaseRestRequest("registrations", {
      method: "POST",
      body: payload,
    });
    return Array.isArray(rows) ? rows[0] : null;
  });
  return row ? mapDbRegistrationToEntry(row) : null;
}

async function resolveInsuranceFileForRemoteSave(record, recordOrder) {
  const insuranceFile = record?.insuranceFile;
  if (!insuranceFile) return record;

  const existingRemoteUrl = getRemoteInsuranceFileUrl(insuranceFile);
  if (existingRemoteUrl) return record;

  let uploadedUrl = "";
  try {
    uploadedUrl = await uploadInsuranceFileToStorage(insuranceFile, record, recordOrder);
  } catch (error) {
    throw new Error(`Insurance upload failed: ${error?.message || "unknown error"}`);
  }
  return {
    ...record,
    insuranceFile: {
      ...insuranceFile,
      previewUrl: uploadedUrl,
      remoteUrl: uploadedUrl,
    },
  };
}

async function findRemoteDuplicateRegistration(eventId, certificateNumber) {
  const config = getRemoteConfig();
  const normalizedCertificateNumber = normalizeCertificateForDuplicate(certificateNumber);
  if (!config.enabled || !eventId || !normalizedCertificateNumber) return null;

  const query = [
    "select=*",
    remoteEq("event_id", eventId),
    remoteEq("certificate_number", normalizedCertificateNumber),
    remoteIn("status", ["pending_payment", "pending_review", "approved"]),
    "limit=1",
  ].join("&");
  const rows = await supabaseRestRequest("registrations", { query });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? mapDbRegistrationToEntry(row) : null;
}

async function searchRemoteRegistrations(query) {
  const config = getRemoteConfig();
  if (!config.enabled) return null;

  const normalizedQuery = safeText(query).trim();
  const publicRows = await publicApiRequest("searchRegistrations", { eventId: config.eventId, query: normalizedQuery }, async () => null);
  if (Array.isArray(publicRows)) return publicRows.map(mapDbRegistrationToEntry);

  const queryParts = [
    "select=*",
    remoteEq("event_id", config.eventId),
    remoteEq("payment_status", "paid"),
    remoteIn("status", ["pending_review", "approved", "rejected"]),
    "order=created_at.desc",
  ];

  if (normalizedQuery) {
    const searchColumn = getRemoteRegistrationSearchColumn(normalizedQuery);
    const searchValue = searchColumn === "certificate_number" || searchColumn === "registration_no" ? normalizedQuery.toUpperCase() : normalizedQuery;
    queryParts.push(`${searchColumn}=eq.${encodeURIComponent(searchValue)}`);
  }

  const rows = await supabaseRestRequest("registrations", { query: queryParts.join("&") });
  return Array.isArray(rows) ? rows.map(mapDbRegistrationToEntry) : [];
}

function getRemoteRegistrationSearchColumn(query) {
  if (/^1[3-9]\d{9}$/.test(query)) return "phone";
  if (query.toUpperCase().startsWith("BM-")) return "registration_no";
  return "certificate_number";
}

function mapDbEventToEventConfig(row) {
  const bannerUrl = pickRemoteValue(row, "banner_image_url", "banner_url", "bannerImageUrl");
  const remoteRegistrationConfig = pickRemoteValue(row, "registration_config", "registrationConfig");
  const remoteFiles = asObject(asObject(remoteRegistrationConfig).files || asObject(remoteRegistrationConfig).documents || asObject(remoteRegistrationConfig).resources);
  return {
    id: safeText(pickRemoteValue(row, "id")),
    name: safeText(pickRemoteValue(row, "name")),
    registrationStartDate: safeText(pickRemoteValue(row, "registration_start_date", "registrationStartDate")),
    registrationEndDate: safeText(pickRemoteValue(row, "registration_end_date", "registrationEndDate")),
    competitionStartDate: safeText(pickRemoteValue(row, "competition_start_date", "competitionStartDate")),
    competitionEndDate: safeText(pickRemoteValue(row, "competition_end_date", "competitionEndDate")),
    location: safeText(pickRemoteValue(row, "location")),
    regulationFile: {
      name: safeText(pickRemoteValue(row, "regulation_file_name", "regulationFileName", "regulation_name")),
      url: safeText(pickRemoteValue(row, "regulation_file_url", "regulationFileUrl", "regulation_url")),
      articleUrl: safeText(pickRemoteValue(row, "regulation_article_url", "regulationArticleUrl") || remoteFiles.regulationArticleUrl || asObject(remoteFiles.regulationFile).articleUrl),
    },
    regulationArticleUrl: safeText(pickRemoteValue(row, "regulation_article_url", "regulationArticleUrl") || remoteFiles.regulationArticleUrl || asObject(remoteFiles.regulationFile).articleUrl),
    commitmentFile: {
      name: safeText(pickRemoteValue(row, "commitment_file_name", "commitmentFileName", "commitment_name")),
      url: safeText(pickRemoteValue(row, "commitment_file_url", "commitmentFileUrl", "commitment_url")),
      articleUrl: safeText(pickRemoteValue(row, "commitment_article_url", "commitmentArticleUrl") || remoteFiles.commitmentArticleUrl || asObject(remoteFiles.commitmentFile).articleUrl),
    },
    commitmentArticleUrl: safeText(pickRemoteValue(row, "commitment_article_url", "commitmentArticleUrl") || remoteFiles.commitmentArticleUrl || asObject(remoteFiles.commitmentFile).articleUrl),
    bannerImage: {
      mode: bannerUrl ? "url" : "none",
      name: safeText(pickRemoteValue(row, "banner_image_name", "bannerImageName")),
      type: "",
      size: 0,
      url: safeText(bannerUrl),
      sourceUrl: safeText(bannerUrl),
      fitMode: safeText(pickRemoteValue(row, "banner_fit_mode", "bannerFitMode")) === "contain" ? "contain" : "cover",
      storageKey: "",
      uploadedAt: safeText(pickRemoteValue(row, "banner_uploaded_at", "bannerUploadedAt")),
    },
    shareCard: {
      title: safeText(pickRemoteValue(row, "share_title", "shareTitle")),
      description: safeText(pickRemoteValue(row, "share_description", "shareDescription")),
      imageUrl: safeText(pickRemoteValue(row, "share_image_url", "shareImageUrl")),
    },
    description: normalizeRemoteDescription(pickRemoteValue(row, "description")),
    registrationConfig: normalizeRemoteRegistrationConfig(remoteRegistrationConfig),
  };
}

function mapEventConfigToDbRow(eventConfig, registrationConfig) {
  const bannerImage = sanitizeBannerImage(eventConfig?.bannerImage);
  const shareCard = sanitizeShareCard(eventConfig?.shareCard);
  const regulationFile = eventConfig?.regulationFile || {};
  const commitmentFile = eventConfig?.commitmentFile || {};

  return {
    id: safeText(eventConfig?.id),
    name: safeText(eventConfig?.name),
    registration_start_date: toNullableText(eventConfig?.registrationStartDate),
    registration_end_date: toNullableText(eventConfig?.registrationEndDate),
    competition_start_date: toNullableText(eventConfig?.competitionStartDate),
    competition_end_date: toNullableText(eventConfig?.competitionEndDate),
    location: safeText(eventConfig?.location),
    description: normalizeArray(eventConfig?.description),
    regulation_file_name: safeText(regulationFile.name),
    regulation_file_url: safeText(regulationFile.url),
    commitment_file_name: safeText(commitmentFile.name),
    commitment_file_url: safeText(commitmentFile.url),
    banner_image_url: safeText(bannerImage.url),
    banner_image_name: safeText(bannerImage.name),
    banner_fit_mode: bannerImage.fitMode === "contain" ? "contain" : "cover",
    banner_uploaded_at: toNullableTimestamp(bannerImage.uploadedAt),
    share_title: safeText(shareCard.title),
    share_description: safeText(shareCard.description),
    share_image_url: safeText(shareCard.imageUrl),
    registration_config: sanitizeRegistrationConfig(registrationConfig),
  };
}

function mapDbOrganizationToConfig(row) {
  return {
    id: safeText(pickRemoteValue(row, "id")),
    name: safeText(pickRemoteValue(row, "name")),
    enabled: pickRemoteValue(row, "enabled") !== false,
  };
}

function mapRegistrationToDbRow(record, recordOrder) {
  const insuranceFileUrl = getRemoteInsuranceFileUrl(record?.insuranceFile);
  return {
    id: createRemoteRegistrationPrimaryId(record),
    event_id: safeText(record?.eventId || recordOrder?.eventId || getCurrentEventConfig().id),
    registration_no: safeText(record?.registrationNo),
    certificate_type: safeText(record?.certificateType),
    certificate_number: normalizeCertificateForDuplicate(record?.certificateNumber),
    name: safeText(record?.name),
    gender: safeText(record?.gender),
    birth_date: safeText(record?.birthDate),
    birth_year: Number(record?.birthYear) || null,
    age: Number(record?.age) || null,
    phone: safeText(record?.phone),
    organization_id: safeText(record?.organizationId),
    organization: safeText(record?.organization),
    group_id: safeText(record?.groupId),
    group_name: safeText(record?.groupName),
    event_ids: normalizeArray(record?.eventIds),
    event_names: normalizeArray(record?.eventNames),
    insurance_uploaded: Boolean(record?.insuranceFile),
    insurance_file_url: insuranceFileUrl,
    total_amount: Number(recordOrder?.amount ?? record?.totalAmount ?? 0) || 0,
    status: safeText(record?.status || "pending_review"),
    payment_status: safeText(recordOrder?.paymentStatus || "paid"),
    order_no: safeText(recordOrder?.orderNo),
    paid_at: toNullableTimestamp(recordOrder?.paidAt),
    reject_reason: safeText(record?.rejectReason),
    reviewed_at: toNullableTimestamp(record?.reviewedAt),
    submitted_at: toNullableTimestamp(record?.submittedAt || recordOrder?.createdAt),
    created_at: toNullableTimestamp(record?.submittedAt || recordOrder?.createdAt || nowIso()),
    updated_at: toNullableTimestamp(record?.updatedAt || nowIso()),
  };
}

function createRemoteRegistrationPrimaryId(record) {
  const currentId = safeText(record?.id).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentId)) return currentId;
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return createFallbackUuid();
}

function createFallbackUuid() {
  const randomByte = () => Math.floor(Math.random() * 256);
  const bytes = Array.from({ length: 16 }, () => randomByte());
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function mapDbRegistrationToEntry(row) {
  const record = {
    id: safeText(row.id),
    eventId: safeText(row.event_id),
    registrationNo: safeText(row.registration_no || row.registrationNo),
    certificateType: safeText(row.certificate_type),
    certificateNumber: safeText(row.certificate_number),
    name: safeText(row.name),
    gender: safeText(row.gender),
    birthDate: safeText(row.birth_date),
    birthYear: Number(row.birth_year) || null,
    age: Number(row.age) || null,
    phone: safeText(row.phone),
    organizationId: safeText(row.organization_id),
    organization: safeText(row.organization || row.team_name),
    groupId: safeText(row.group_id),
    groupName: safeText(row.group_name),
    eventIds: normalizeRemoteList(row.event_ids),
    eventNames: normalizeRemoteList(row.event_names),
    insuranceFile: row.insurance_uploaded
      ? {
          name: "已上传",
          type: "remote",
          size: 0,
          previewUrl: safeText(row.insurance_file_url),
          remoteUrl: safeText(row.insurance_file_url),
        }
      : null,
    totalAmount: Number(row.total_amount) || 0,
    status: safeText(row.status),
    errors: {},
    rejectReason: safeText(row.reject_reason),
    reviewedAt: safeText(row.reviewed_at),
    submittedAt: safeText(row.submitted_at || row.created_at),
    updatedAt: safeText(row.updated_at),
  };

  return {
    record,
    order: {
      id: "",
      eventId: record.eventId,
      registrationId: record.id,
      orderNo: safeText(row.order_no),
      registrationNo: record.registrationNo,
      amount: record.totalAmount,
      paymentMethod: "mock_wechat",
      paymentStatus: safeText(row.payment_status || "paid"),
      reviewStatus: "pending",
      createdAt: safeText(row.created_at || row.submitted_at),
      paidAt: safeText(row.paid_at),
    },
  };
}

function normalizeRemoteList(value) {
  if (Array.isArray(value)) return value.map((item) => safeText(item)).filter(Boolean);
  const text = safeText(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => safeText(item)).filter(Boolean);
  } catch {
    // Keep the fallback below for plain comma-separated values.
  }
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickRemoteValue(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

function toNullableText(value) {
  const text = safeText(value).trim();
  return text ? text : null;
}

function normalizeRemoteRegistrationConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return sanitizeRegistrationConfig(value);
}

function normalizeRemoteDescription(value) {
  if (Array.isArray(value)) return value.map((item) => safeText(item).trim()).filter(Boolean);
  return safeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getRemoteInsuranceFileUrl(file) {
  const previewUrl = safeText(file?.remoteUrl || file?.url || file?.storageUrl || file?.previewUrl).trim();
  if (!previewUrl || previewUrl.startsWith("data:")) return "";
  return previewUrl;
}

async function uploadInsuranceFileToStorage(file, record, recordOrder) {
  const uploadSource = getInsuranceUploadSource(file);
  if (!uploadSource?.body) {
    throw new Error("Insurance upload source unavailable");
  }
  validateInsuranceUploadType(uploadSource.contentType);
  const config = getRemoteConfig();
  const publicUploadedFile = await uploadInsuranceFileWithPublicApi(file, uploadSource, record, recordOrder, config);
  if (publicUploadedFile?.url) return publicUploadedFile.url;

  const client = getSupabaseAuthClient();
  if (!client) throw new Error("Supabase Storage client unavailable");
  const bucketName = "registration-files";
  const filePath = getInsuranceStorageFilePath(file, record, recordOrder, config, uploadSource.extension);
  const { error } = await client.storage.from(bucketName).upload(filePath, uploadSource.body, {
    cacheControl: "3600",
    contentType: uploadSource.contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = client.storage.from(bucketName).getPublicUrl(filePath);
  const publicUrl = safeText(data?.publicUrl).trim();
  if (!publicUrl) throw new Error("Insurance public URL unavailable");
  return publicUrl;
}

async function uploadInsuranceFileWithPublicApi(file, uploadSource, record, recordOrder, config) {
  const payload = {
    eventId: safeText(record?.eventId || recordOrder?.eventId || config.eventId || getCurrentEventConfig().id),
    registrationNo: safeText(record?.registrationNo || recordOrder?.registrationNo || recordOrder?.orderNo),
    fileName: safeText(file?.name || uploadSource.body?.name || "insurance"),
    contentType: safeText(uploadSource.contentType),
    size: Number(uploadSource.body?.size || file?.size || 0),
    base64: await blobToBase64Payload(uploadSource.body),
  };
  return publicApiRequest("uploadInsuranceFile", payload, async () => null);
}

async function blobToBase64Payload(blob) {
  if (typeof Blob === "undefined" || !(blob instanceof Blob)) {
    throw new Error("Insurance upload blob unavailable");
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Read insurance file failed"));
    reader.readAsDataURL(blob);
  });
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function getInsuranceStorageFilePath(file, record, recordOrder, config, extension) {
  const eventId = sanitizeStoragePathPart(record?.eventId || recordOrder?.eventId || config.eventId || getCurrentEventConfig().id, "event");
  const registrationNo = sanitizeStoragePathPart(record?.registrationNo || recordOrder?.registrationNo || recordOrder?.orderNo, "registration");
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${eventId}/insurance/${registrationNo}-${timestamp}-${randomPart}.${extension || getInsuranceFileExtension(file)}`;
}

function getInsuranceUploadSource(file) {
  const uploadFile = file?.uploadFile || file?.rawFile || file?.file || file?.blob;
  if (typeof Blob !== "undefined" && uploadFile instanceof Blob) {
    return {
      body: uploadFile,
      contentType: uploadFile.type || file?.type || "application/octet-stream",
      extension: getInsuranceFileExtension({ ...file, type: uploadFile.type || file?.type }),
    };
  }

  const previewUrl = safeText(file?.previewUrl).trim();
  if (previewUrl.startsWith("data:")) {
    return dataUrlToInsuranceUploadSource(previewUrl, file);
  }

  return null;
}

function dataUrlToInsuranceUploadSource(dataUrl, file) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;

  const contentType = match[1] || file?.type || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    body: new Blob([bytes], { type: contentType }),
    contentType,
    extension: getInsuranceFileExtension({ ...file, type: contentType }),
  };
}

function validateInsuranceUploadType(contentType) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowedTypes.has(safeText(contentType))) {
    throw new Error("Insurance unsupported file type");
  }
}

function getInsuranceFileExtension(file) {
  const nameExtension = safeText(file?.name).split(".").pop().toLowerCase();
  const safeNameExtension = /^[a-z0-9]{2,8}$/.test(nameExtension) ? nameExtension : "";
  if (safeNameExtension) return safeNameExtension === "jpeg" ? "jpg" : safeNameExtension;

  const type = safeText(file?.type).toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "bin";
}

function sanitizeStoragePathPart(value, fallback) {
  const text = safeText(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}
