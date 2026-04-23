const EVENT_ID_PATTERN = new RegExp(window.EVENT_ADMIN_CONFIG?.eventIdPattern || "^[a-z0-9_-]+$");
const EVENT_STATUS = {
  SOFT_DELETED: "soft_deleted",
  UNPUBLISHED: "unpublished",
  HIDDEN: "hidden",
  REGISTRATION_UPCOMING: "registration_upcoming",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  EVENT_ENDED: "event_ended",
};

function normalizeEventIdInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function isSafeEventId(value) {
  const text = String(value || "").trim();
  return Boolean(text && EVENT_ID_PATTERN.test(text));
}

function isValidDateValue(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function isDateAfter(left, right) {
  if (!isValidDateValue(left) || !isValidDateValue(right)) return false;
  return new Date(`${left}T00:00:00`) > new Date(`${right}T00:00:00`);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEventDraftBeforeSave(draft) {
  const next = JSON.parse(JSON.stringify(draft || {}));
  next.id = normalizeEventIdInput(next.id);
  next.name = normalizeText(next.name);
  next.location = normalizeText(next.location);
  next.description = normalizeText(next.description);
  next.registrationConfig = normalizeAdminRegistrationConfig(next.registrationConfig || {});
  next.registrationConfig.platform = {
    ...(next.registrationConfig.platform || {}),
    tag: normalizeText(next.registrationConfig.platform?.tag || "赛事活动"),
    sortOrder: Number(next.registrationConfig.platform?.sortOrder || 0) || 0,
  };
  return next;
}

function normalizeAdminRegistrationConfig(config) {
  const next = {
    ...createDefaultRegistrationConfig(),
    ...config,
    platform: {
      ...createDefaultRegistrationConfig().platform,
      ...(config.platform || {}),
    },
  };

  const organizationMap = new Map();
  (Array.isArray(config.organizations) ? config.organizations : []).forEach((item) => {
    const name = normalizeText(item?.name);
    if (!name || organizationMap.has(name)) return;
    organizationMap.set(name, {
      id: normalizeEventIdInput(item?.id || name) || `org_${organizationMap.size + 1}`,
      name,
      enabled: item?.enabled !== false,
    });
  });

  next.organizations = Array.from(organizationMap.values());
  next.certificateTypes = (Array.isArray(config.certificateTypes) ? config.certificateTypes : next.certificateTypes)
    .map((item) => ({
      value: normalizeEventIdInput(item?.value || item?.label),
      label: normalizeText(item?.label),
    }))
    .filter((item) => item.value && item.label);

  next.groups = (Array.isArray(config.groups) ? config.groups : []).map((group, groupIndex) => ({
    id: normalizeEventIdInput(group?.id || group?.name) || `group_${groupIndex + 1}`,
    name: normalizeText(group?.name),
    genderLimit: ["male", "female", "all"].includes(group?.genderLimit) ? group.genderLimit : "all",
    minBirthYear: Number(group?.minBirthYear) || 1900,
    maxBirthYear: Number(group?.maxBirthYear) || 2100,
    events: (Array.isArray(group?.events) ? group.events : []).map((item, itemIndex) => ({
      id: normalizeEventIdInput(item?.id || item?.name) || `item_${itemIndex + 1}`,
      name: normalizeText(item?.name),
      fee: Math.max(0, Number(item?.fee) || 0),
    })),
  }));

  const pricingRule = next.pricingRule || {};
  next.maxEventsPerPerson = Math.max(1, Number(next.maxEventsPerPerson || pricingRule.maxEventsPerPerson || 1));
  next.pricingRule = {
    mode: pricingRule.mode === "tiered" ? "tiered" : "itemized",
    minEventsPerPerson: Math.max(1, Number(pricingRule.minEventsPerPerson || 1)),
    maxEventsPerPerson: Math.max(1, Number(pricingRule.maxEventsPerPerson || next.maxEventsPerPerson)),
    baseIncludedCount: Math.max(1, Number(pricingRule.baseIncludedCount || 1)),
    basePrice: Math.max(0, Number(pricingRule.basePrice || 0)),
    extraPricePerItem: Math.max(0, Number(pricingRule.extraPricePerItem || 0)),
  };

  if (next.pricingRule.minEventsPerPerson > next.pricingRule.maxEventsPerPerson) {
    next.pricingRule.maxEventsPerPerson = next.pricingRule.minEventsPerPerson;
  }
  next.maxEventsPerPerson = next.pricingRule.maxEventsPerPerson;
  return next;
}

function validateEventDraft(draft, existingEvents = []) {
  const errors = {};
  const normalizedId = normalizeEventIdInput(draft?.id);
  const originalId = normalizeText(draft?.originalId);

  if (!normalizeText(draft?.name)) errors.name = "赛事名称不能为空";
  if (!normalizedId) errors.id = "eventId 不能为空";
  if (normalizedId && !isSafeEventId(normalizedId)) errors.id = "eventId 只能使用小写字母、数字、下划线和中划线";
  if (existingEvents.some((item) => item.id === normalizedId && item.id !== originalId)) errors.id = "eventId 已存在，请更换";

  ["registrationStartDate", "registrationEndDate", "competitionStartDate", "competitionEndDate"].forEach((field) => {
    if (!draft?.[field]) errors[field] = "日期不能为空";
    else if (!isValidDateValue(draft[field])) errors[field] = "日期格式不正确";
  });
  if (!normalizeText(draft?.location)) errors.location = "比赛地点不能为空";
  if (isDateAfter(draft?.registrationStartDate, draft?.registrationEndDate)) errors.registrationEndDate = "报名截止时间不能早于报名开始时间";
  if (isDateAfter(draft?.competitionStartDate, draft?.competitionEndDate)) errors.competitionEndDate = "比赛结束时间不能早于比赛开始时间";
  if (isDateAfter(draft?.registrationEndDate, draft?.competitionEndDate)) errors.registrationEndDate = "报名截止时间不应晚于比赛结束时间";

  const config = draft?.registrationConfig || {};
  const itemIds = new Set();
  (Array.isArray(config.groups) ? config.groups : []).forEach((group, groupIndex) => {
    if (!normalizeText(group.name)) errors[`groups.${groupIndex}.name`] = "组别名称不能为空";
    if (!Number.isFinite(Number(group.minBirthYear))) errors[`groups.${groupIndex}.minBirthYear`] = "最小出生年份不合法";
    if (!Number.isFinite(Number(group.maxBirthYear))) errors[`groups.${groupIndex}.maxBirthYear`] = "最大出生年份不合法";
    if (Number(group.minBirthYear) > Number(group.maxBirthYear)) errors[`groups.${groupIndex}.maxBirthYear`] = "最大出生年份不能小于最小出生年份";
    (Array.isArray(group.events) ? group.events : []).forEach((item, itemIndex) => {
      const id = normalizeEventIdInput(item.id);
      if (!normalizeText(item.name)) errors[`groups.${groupIndex}.events.${itemIndex}.name`] = "项目名称不能为空";
      if (!id) errors[`groups.${groupIndex}.events.${itemIndex}.id`] = "项目 ID 不能为空";
      if (id && itemIds.has(id)) errors[`groups.${groupIndex}.events.${itemIndex}.id`] = "项目 ID 在当前赛事内不能重复";
      if (id) itemIds.add(id);
      if (!Number.isFinite(Number(item.fee)) || Number(item.fee) < 0) errors[`groups.${groupIndex}.events.${itemIndex}.fee`] = "报名费必须是非负数字";
    });
  });

  return errors;
}

function firstValidationMessage(errors) {
  return Object.values(errors || {})[0] || "";
}

function getEventPlatformConfig(registrationConfig = {}) {
  return registrationConfig.platform || {};
}

function calculateEventLifecycleStatus(eventItem = {}) {
  const platform = getEventPlatformConfig(eventItem.registrationConfig || eventItem.registration_config || {});
  if (platform.deletedAt) return EVENT_STATUS.SOFT_DELETED;
  if (platform.isPublished === false) return EVENT_STATUS.UNPUBLISHED;
  if (platform.visibleOnPlatform === false) return EVENT_STATUS.HIDDEN;

  const today = new Date();
  const registrationStart = parseDateOnly(eventItem.registrationStartDate || eventItem.registration_start_date);
  const registrationEnd = parseDateOnly(eventItem.registrationEndDate || eventItem.registration_end_date);
  const competitionEnd = parseDateOnly(eventItem.competitionEndDate || eventItem.competition_end_date);

  if (registrationStart && today < registrationStart) return EVENT_STATUS.REGISTRATION_UPCOMING;
  if (registrationEnd && today > registrationEnd) return EVENT_STATUS.REGISTRATION_CLOSED;
  if (competitionEnd && today > competitionEnd) return EVENT_STATUS.EVENT_ENDED;
  return EVENT_STATUS.REGISTRATION_OPEN;
}

function isEventVisibleOnPlatform(eventItem = {}) {
  const status = calculateEventLifecycleStatus(eventItem);
  return ![EVENT_STATUS.SOFT_DELETED, EVENT_STATUS.UNPUBLISHED, EVENT_STATUS.HIDDEN].includes(status);
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
