(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});
  const ROLE_TOKEN_KEY = "warehouse.auditRoleToken";
  const params = new URLSearchParams(window.location.search);
  const context = params.get("place") && params.get("map") ? {
    placeId: params.get("place"), mapId: params.get("map"), draft: params.get("draft") === "1", version: null
  } : null;

  function acceptVersion(body) {
    if (context && Number.isInteger(body.map_version)) {
      context.version = Math.max(context.version || 0, body.map_version);
    }
  }

  async function loadPlaceContext() {
    if (!context) return null;
    const data = await apiGet("/api/context");
    Object.assign(context, {placeName:data.place_name, mapName:data.map_name, published:data.published});
    window.dispatchEvent(new CustomEvent("place-context", {detail:context}));
    return context;
  }

  async function parseJsonBody(response) {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function getAuditRoleToken() {
    try {
      return String(window.sessionStorage.getItem(ROLE_TOKEN_KEY) || "");
    } catch (_error) {
      return "";
    }
  }

  function setAuditRoleToken(token) {
    const normalized = String(token || "").trim();
    try {
      if (normalized) {
        window.sessionStorage.setItem(ROLE_TOKEN_KEY, normalized);
      } else {
        window.sessionStorage.removeItem(ROLE_TOKEN_KEY);
      }
    } catch (_error) {
      // Ignore storage errors in restricted/private browser contexts.
    }
    return normalized;
  }

  function clearAuditRoleToken() {
    setAuditRoleToken("");
  }

  function authHeaders(options = {}) {
    const headers = { ...(options.headers || {}) };
    if (context) {
      headers["X-Place-Id"] = context.placeId;
      headers["X-Map-Id"] = context.mapId;
      headers["X-Map-Draft"] = context.draft ? "1" : "0";
      if (context.version !== null) headers["X-Map-Version"] = String(context.version);
    }
    if (options.skipAuth) {
      return headers;
    }
    const token = getAuditRoleToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async function apiGet(path, options = {}) {
    const response = await fetch(path, {
      method: "GET",
      headers: authHeaders(options)
    });
    const body = await parseJsonBody(response);
    if (!response.ok) {
      const code = body.code ? ` [${body.code}]` : "";
      throw new Error((body.error || "Request failed.") + code);
    }
    acceptVersion(body);
    return body;
  }

  async function apiPost(path, payload, options = {}) {
    const headers = authHeaders(options);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {})
    });
    const body = await parseJsonBody(response);
    if (!response.ok) {
      const code = body.code ? ` [${body.code}]` : "";
      throw new Error((body.error || "Request failed.") + code);
    }
    acceptVersion(body);
    if (context && /\/(rack-location|floor-location|slotted-pallet-location|movable-item-location|audit\/entry)$/.test(path)) {
      window.dispatchEvent(new Event("place-inventory-saved"));
    }
    return body;
  }

  async function requestRoleSession(role, pin) {
    const response = await apiPost("/api/auth/role-session", { role, pin }, { skipAuth: true });
    if (response.token) {
      setAuditRoleToken(response.token);
    }
    return response;
  }

  modules.api = {
    context,
    loadPlaceContext,
    apiGet,
    apiPost,
    clearAuditRoleToken,
    getAuditRoleToken,
    requestRoleSession,
    setAuditRoleToken
  };
})();
