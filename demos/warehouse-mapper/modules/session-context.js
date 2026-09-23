(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  const ACCESS_MODE_KEY = "warehouse.accessMode";
  const DEPARTMENT_KEY = "warehouse.department";
  const LAST_AREA_KEY = "warehouse.lastArea";

  function storedAccessMode() {
    try {
      return String(window.sessionStorage.getItem(ACCESS_MODE_KEY) || "").trim().toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function setStoredAccessMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();
    try {
      if (normalized === "admin" || normalized === "user") {
        window.sessionStorage.setItem(ACCESS_MODE_KEY, normalized);
      } else {
        window.sessionStorage.removeItem(ACCESS_MODE_KEY);
      }
    } catch (_error) {
      // Ignore storage errors in restricted browser contexts.
    }
  }

  function storedDepartment() {
    try {
      return String(window.sessionStorage.getItem(DEPARTMENT_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function setStoredDepartment(name) {
    try {
      const value = String(name || "").trim();
      if (value) {
        window.sessionStorage.setItem(DEPARTMENT_KEY, value);
      } else {
        window.sessionStorage.removeItem(DEPARTMENT_KEY);
      }
    } catch (_error) {
      // Ignore storage errors in restricted browser contexts.
    }
  }

  function storedLastArea() {
    try {
      return String(window.sessionStorage.getItem(LAST_AREA_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function setStoredLastArea(areaName) {
    try {
      const value = String(areaName || "").trim();
      if (value) {
        window.sessionStorage.setItem(LAST_AREA_KEY, value);
      } else {
        window.sessionStorage.removeItem(LAST_AREA_KEY);
      }
    } catch (_error) {
      // Ignore storage errors in restricted browser contexts.
    }
  }

  function departmentAreas(profile) {
    return Array.isArray(profile?.areas)
      ? profile.areas.map((area) => String(area || "").trim()).filter(Boolean)
      : [];
  }

  function userAllowedAreas(allAreas, selectedDepartment, departments) {
    const available = (allAreas || []).map((area) => String(area || "").trim()).filter(Boolean);
    const selected = String(selectedDepartment || "").trim().toLowerCase();
    const profile = (departments || []).find(
      (department) => String(department.name || "").trim().toLowerCase() === selected
    );
    const configuredAreas = departmentAreas(profile);
    if (configuredAreas.length) {
      const availableSet = new Set(available);
      return configuredAreas.filter((area) => !availableSet.size || availableSet.has(area));
    }
    if (selected && available.includes(selectedDepartment)) {
      return [selectedDepartment];
    }
    return [];
  }

  function focusOverviewArea(state, el, areaName, { persist = true, isAdmin = false, setStoredLastAreaFn = setStoredLastArea } = {}) {
    const normalized = String(areaName || "").trim();
    const isAll = !normalized || normalized === "All Areas";
    state.area = isAll ? "All Areas" : normalized;
    state.overview.focusedArea = isAll ? "" : normalized;
    state.overview.selectedArea = isAll ? "" : normalized;
    if (el?.areaSelect) {
      el.areaSelect.value = state.area;
    }
    if (persist && !isAdmin && state.selectedDepartment) {
      setStoredLastAreaFn(state.area);
    }
  }

  function initializeUserAreaNavigation(ctx, allAreas = [], { force = false } = {}) {
    const {
      state,
      el,
      isAdmin = false,
      isAuditOperatorClient = false,
      departments = [],
      focusOverviewAreaFn = focusOverviewArea
    } = ctx;
    if (!force && state.userAreaInitialized) {
      return;
    }
    if (isAdmin || isAuditOperatorClient || state.accessMode !== "user" || !state.selectedDepartment) {
      state.userAreaInitialized = true;
      return;
    }
    const allowed = userAllowedAreas(allAreas, state.selectedDepartment, departments.length ? departments : state.departments);
    if (!allowed.length) {
      state.userAreaInitialized = true;
      return;
    }
    const remembered = storedLastArea();
    let targetArea = "All Areas";
    if (remembered === "All Areas") {
      targetArea = "All Areas";
    } else if (remembered && allowed.includes(remembered)) {
      targetArea = remembered;
    } else if (allowed.length === 1) {
      targetArea = allowed[0];
    }
    focusOverviewAreaFn(state, el, targetArea, { persist: false, isAdmin });
    state.userAreaInitialized = true;
  }

  modules.sessionContext = {
    ACCESS_MODE_KEY,
    DEPARTMENT_KEY,
    LAST_AREA_KEY,
    departmentAreas,
    focusOverviewArea,
    initializeUserAreaNavigation,
    setStoredAccessMode,
    setStoredDepartment,
    setStoredLastArea,
    storedAccessMode,
    storedDepartment,
    storedLastArea,
    userAllowedAreas
  };
})();
