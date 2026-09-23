(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  async function fetchCountRequests(apiGet, filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) {
      params.set("status", filters.status);
    }
    if (filters.department) {
      params.set("department", filters.department);
    }
    if (filters.assigned_to) {
      params.set("assigned_to", filters.assigned_to);
    }
    const query = params.toString();
    const path = query ? `/api/count-requests?${query}` : "/api/count-requests";
    const data = await apiGet(path);
    return Array.isArray(data.requests) ? data.requests : [];
  }

  async function createCountRequest(apiPost, payload) {
    const data = await apiPost("/api/count-requests", payload);
    return data.request || null;
  }

  async function updateCountRequest(apiPost, payload) {
    const data = await apiPost("/api/count-requests/update", payload);
    return data.request || null;
  }

  function countRequestLabel(request) {
    const scope = String(request.scope_type || "area").toLowerCase();
    if (scope === "rack") {
      const parts = [request.area, request.container_id, request.bay_or_slot ? `B${request.bay_or_slot}` : "", request.level ? `L${request.level}` : ""]
        .filter(Boolean);
      return parts.join(" · ") || request.scope_value || "Rack count";
    }
    if (scope === "sku") {
      return request.item_number || request.scope_value || "SKU count";
    }
    return request.area || request.scope_value || "Area count";
  }

  modules.countRequests = {
    countRequestLabel,
    createCountRequest,
    fetchCountRequests,
    updateCountRequest
  };
})();
