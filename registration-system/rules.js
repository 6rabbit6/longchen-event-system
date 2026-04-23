const REGISTRATION_EVENT_STATUS = {
  SOFT_DELETED: "soft_deleted",
  UNPUBLISHED: "unpublished",
  HIDDEN: "hidden",
  REGISTRATION_UPCOMING: "registration_upcoming",
  REGISTRATION_OPEN: "registration_open",
  REGISTRATION_CLOSED: "registration_closed",
  EVENT_ENDED: "event_ended",
};

function calculateRegistrationEventStatus(eventConfig = {}, registrationConfig = {}) {
  const platform = registrationConfig.platform || {};
  if (platform.deletedAt) return REGISTRATION_EVENT_STATUS.SOFT_DELETED;
  if (platform.isPublished === false) return REGISTRATION_EVENT_STATUS.UNPUBLISHED;
  if (platform.visibleOnPlatform === false) return REGISTRATION_EVENT_STATUS.HIDDEN;

  const today = new Date();
  const registrationStart = parseRegistrationDate(eventConfig.registrationStartDate || eventConfig.registration_start_date);
  const registrationEnd = parseRegistrationDate(eventConfig.registrationEndDate || eventConfig.registration_end_date);
  const competitionEnd = parseRegistrationDate(eventConfig.competitionEndDate || eventConfig.competition_end_date);

  if (registrationStart && today < registrationStart) return REGISTRATION_EVENT_STATUS.REGISTRATION_UPCOMING;
  if (registrationEnd && today > registrationEnd) return REGISTRATION_EVENT_STATUS.REGISTRATION_CLOSED;
  if (competitionEnd && today > competitionEnd) return REGISTRATION_EVENT_STATUS.EVENT_ENDED;
  return REGISTRATION_EVENT_STATUS.REGISTRATION_OPEN;
}

function getRemoteRegistrationEventStatus(remoteEvent = {}) {
  return calculateRegistrationEventStatus(remoteEvent, remoteEvent.registrationConfig || {});
}

function isRegistrationEventAccessBlocked(status) {
  return [REGISTRATION_EVENT_STATUS.SOFT_DELETED, REGISTRATION_EVENT_STATUS.UNPUBLISHED, REGISTRATION_EVENT_STATUS.HIDDEN].includes(status);
}

function getRegistrationEventStatusMessage(status) {
  const messages = {
    [REGISTRATION_EVENT_STATUS.SOFT_DELETED]: "该赛事已删除，无法继续访问。",
    [REGISTRATION_EVENT_STATUS.UNPUBLISHED]: "该赛事暂未发布。",
    [REGISTRATION_EVENT_STATUS.HIDDEN]: "该赛事已下架或暂不展示。",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_UPCOMING]: "报名尚未开始。",
    [REGISTRATION_EVENT_STATUS.REGISTRATION_CLOSED]: "报名已截止。",
    [REGISTRATION_EVENT_STATUS.EVENT_ENDED]: "赛事已结束。",
  };
  return messages[status] || "";
}

function parseRegistrationDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
