// Future API / Edge Function contract draft.
// Event Admin now calls the unified admin-api Edge Function first and falls
// back to direct REST only when the function is not deployed in local testing.
// Keep these action names stable so Web and Mini Program clients can share the
// same API surface later.

const API_CONTRACT_VERSION = "event-business-api-v1";

const apiContract = {
  edgeFunction: {
    name: "admin-api",
    method: "POST",
    requestEnvelope: {
      action: "string",
      payload: "object",
    },
    responseEnvelope: {
      success: "boolean",
      data: "any",
      code: "string",
      message: "string",
    },
  },
  events: {
    list: {
      method: "GET",
      path: "/events",
      query: ["visibility", "status", "keyword"],
      returns: ["events[]"],
    },
    detail: {
      method: "GET",
      path: "/events/:eventId",
      returns: ["event"],
    },
    create: {
      method: "POST",
      path: "/events",
      body: ["event", "registrationConfig"],
      returns: ["event"],
    },
    update: {
      method: "PATCH",
      path: "/events/:eventId",
      body: ["event", "registrationConfig"],
      returns: ["event"],
    },
    publishState: {
      method: "PATCH",
      path: "/events/:eventId/platform-state",
      body: ["isPublished", "visibleOnPlatform", "isHot", "sortOrder"],
      returns: ["event"],
    },
    softDelete: {
      method: "POST",
      path: "/events/:eventId/soft-delete",
      returns: ["event"],
    },
    checkEventId: {
      action: "checkEventIdAvailable",
      method: "POST",
      path: "/functions/v1/admin-api",
      body: ["eventId", "currentEventId"],
      returns: ["available"],
    },
    hasRegistrations: {
      action: "checkEventHasRegistrations",
      method: "POST",
      path: "/functions/v1/admin-api",
      returns: ["hasRegistrations"],
    },
  },
  registrations: {
    list: {
      method: "GET",
      path: "/registrations",
      query: ["eventId", "status", "keyword"],
      returns: ["registrations[]"],
    },
    detail: {
      method: "GET",
      path: "/registrations/:registrationNo",
      returns: ["registration"],
    },
    review: {
      method: "PATCH",
      path: "/registrations/:registrationNo/review",
      body: ["status", "rejectReason"],
      returns: ["registration"],
    },
    bulkReview: {
      method: "PATCH",
      path: "/registrations/bulk-review",
      body: ["registrationNos", "status"],
      returns: ["results[]"],
    },
    exportApproved: {
      method: "GET",
      path: "/registrations/export-approved",
      query: ["eventId", "groupName", "eventName", "format"],
      returns: ["file"],
    },
  },
  publicApi: {
    edgeFunction: {
      name: "public-api",
      method: "POST",
      path: "/functions/v1/public-api",
      requestEnvelope: {
        action: "string",
        payload: "object",
      },
      responseEnvelope: {
        success: "boolean",
        data: "any",
        code: "string",
        message: "string",
      },
    },
    listEvents: {
      action: "listEvents",
      returns: ["visibleEvents[]"],
      clients: ["web-platform", "registration-web", "wechat-mini-program"],
    },
    getEventDetail: {
      action: "getEventDetail",
      body: ["eventId"],
      returns: ["event", "status", "canRegister", "message"],
      clients: ["registration-web", "wechat-mini-program"],
    },
    submitRegistration: {
      action: "submitRegistration",
      body: ["eventId", "record", "order"],
      returns: ["registration"],
      clients: ["registration-web", "wechat-mini-program"],
    },
    searchRegistrations: {
      action: "searchRegistrations",
      body: ["eventId", "query"],
      returns: ["registrations[]"],
      clients: ["registration-web", "wechat-mini-program"],
    },
    uploadInsuranceFile: {
      action: "uploadInsuranceFile",
      body: ["eventId", "registrationNo", "fileName", "contentType", "size", "base64"],
      returns: ["bucket", "path", "url", "name", "type", "size"],
      clients: ["registration-web", "wechat-mini-program"],
    },
  },
};
