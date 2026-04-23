const PLATFORM_EVENT_STATUS = {
  SOFT_DELETED: "soft_deleted",
  UNPUBLISHED: "unpublished",
  HIDDEN: "hidden",
  REGISTRATION_UPCOMING: "registration_upcoming",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  EVENT_ENDED: "event_ended",
};

function normalizePlatformEventId(value) {
  return String(value || "").trim().toLowerCase();
}

function isSafePlatformEventId(value) {
  const pattern = new RegExp(getPlatformConfig().eventIdPattern);
  return pattern.test(normalizePlatformEventId(value));
}

function calculatePlatformEventStatus(row = {}, platform = {}) {
  if (platform.deletedAt) return PLATFORM_EVENT_STATUS.SOFT_DELETED;
  if (platform.isPublished === false) return PLATFORM_EVENT_STATUS.UNPUBLISHED;
  if (platform.visibleOnPlatform === false) return PLATFORM_EVENT_STATUS.HIDDEN;

  const today = new Date();
  const registrationStart = parsePlatformDate(row.registration_start_date || row.registrationStart);
  const registrationEnd = parsePlatformDate(row.registration_end_date || row.registerEnd);
  const competitionEnd = parsePlatformDate(row.competition_end_date || row.competitionEnd);

  if (registrationStart && today < registrationStart) return PLATFORM_EVENT_STATUS.REGISTRATION_UPCOMING;
  if (registrationEnd && today > registrationEnd) return PLATFORM_EVENT_STATUS.REGISTRATION_CLOSED;
  if (competitionEnd && today > competitionEnd) return PLATFORM_EVENT_STATUS.EVENT_ENDED;
  return PLATFORM_EVENT_STATUS.REGISTRATION_OPEN;
}

function isPlatformVisibleByStatus(status) {
  return ![PLATFORM_EVENT_STATUS.SOFT_DELETED, PLATFORM_EVENT_STATUS.UNPUBLISHED, PLATFORM_EVENT_STATUS.HIDDEN].includes(status);
}

function parsePlatformDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
