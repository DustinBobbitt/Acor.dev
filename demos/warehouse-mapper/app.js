"use strict";

const currentPath = String(window.location.pathname || "");
const shellMode = String(document.body?.dataset?.warehouseShell || "").trim().toLowerCase();
const isFieldShell = shellMode === "field";
const isManageShell = shellMode === "manage";
const placeContextSuffix = window.WarehouseModules?.api?.context ? `.${window.WarehouseModules.api.context.placeId}.${window.WarehouseModules.api.context.mapId}` : "";
const ACCESS_MODE_KEY = "warehouse.accessMode" + placeContextSuffix;
const DEPARTMENT_KEY = "warehouse.department" + placeContextSuffix;
const LAST_AREA_KEY = "warehouse.lastArea" + placeContextSuffix;
const ADMIN_PASSWORD = "admin";
let isAdmin = currentPath.startsWith("/admin");
let isAuditOperatorClient = currentPath.startsWith("/audit");

const WarehouseModules = window.WarehouseModules || {};
const SharedConstants = WarehouseModules.constants || {};
const SharedHelpers = WarehouseModules.helpers || {};
const SharedApi = WarehouseModules.api || {};
const SharedManagement = WarehouseModules.management || {};
const SharedSearch = WarehouseModules.search || {};
const SharedAudit = WarehouseModules.audit || {};
const SharedHeatVisualAge = WarehouseModules.heatVisualAge || {};
const SharedRackPan = WarehouseModules.rackPan || {};
const SharedDetailPanel = WarehouseModules.detailPanel || {};
const SharedInspector = WarehouseModules.inspector || {};
const SharedRenderers = WarehouseModules.renderers || {};
const SharedGeometry = WarehouseModules.geometry || {};
const SharedAssetTemplates = WarehouseModules.assetTemplates || {};

const state = {
  viewMode: "overview",
  area: "All Areas",
  racks: [],
  zones: [],
  nullSpaces: [],
  areas: [],
  slottedPallets: [],
  movableItems: [],
  layout: null,
  mapFiles: [],
  currentMapPath: "",
  service: {
    apiVersion: "",
    serviceKind: "",
    capabilities: {},
    name: "",
    heatMap: {
      fresh_max_days: 7,
      aging_max_days: 30,
      stale_max_days: 90
    }
  },
  selectedRack: "",
  selectedZone: "",
  selectedSlottedPallet: "",
  rackModel: null,
  zoneModel: null,
  slottedModel: null,
  slottedPendingAdd: null,
  rackPendingAdd: null,
  selectedCellKey: "",
  selectedCell: null,
  searchResults: [],
  heatMapEnabled: false,
  searchMode: {
    active: false,
    query: "",
    rackMatches: {}
  },
  management: {
    rows: [],
    summary: null,
    lastGeneratedAt: "",
    previewSource: "api",
    previewError: "",
    parsedQuery: { includes: [], excludes: [] },
    filters: {
      area: "All Areas",
      query: "",
      location_type: "all",
      container_id: "",
      po_number: "",
      recorded_location: "",
      inventory_source: "",
      inventory_before: "",
      inventory_after: "",
      age_bucket: "all",
      older_than_days: "",
      min_qty: "",
      max_qty: "",
      low_qty_threshold: 5,
      chips: {
        low_qty: false,
        empty_only: false,
        mixed_only: false,
        has_po: false,
        rack_only: false,
        floor_only: false,
        never_inventoried: false
      }
    },
    export: {
      scope: "filtered",
      format: "csv",
      path: ""
    }
  },
  audit: {
    session: null,
    entries: [],
    entryMap: {},
    summary: null,
    role: "legacy",
    capabilities: {
      can_start_session: true,
      can_close_session: true,
      can_complete_scope: true,
      can_record_entry: true,
      can_view_full_results: true
    },
    adminSummary: null,
    operatorContext: null,
    subview: "overview",
    startName: "Audit Session 1",
    startMode: "assisted"
  },
  accessMode: "",
  selectedDepartment: "",
  userAreaInitialized: false,
  departments: [],
  unassignedPeople: [],
  auditors: [],
  config: {
    areas: [],
    rows: [],
    zones: [],
    slotted_pallets: [],
    null_spaces: [],
    movable_items: [],
    layout: {},
    current_path: "",
    selection: { type: "", id: "" },
    placementType: "",
    dirty: false,
    autoFitOnRender: false,
    focusedArea: "",
    layoutUnlocked: false,
    viewport: {
      zoom: 1,
      panX: 20,
      panY: 20
    },
    drag: {
      active: false,
      type: "",
      id: "",
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      moved: false,
      dropTargetId: "",
      dropTargetType: ""
    }
  },
  rackPan: {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
  },
  rackBeamEdit: false,
  inspector: {
    open: false,
    anchorRect: null
  },
  overview: {
    zoom: 1,
    panX: 20,
    panY: 20,
    selectedArea: "",
    focusedArea: "",
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragPanX: 0,
    dragPanY: 0,
    movableDrag: {
      active: false,
      itemId: "",
      originX: 0,
      originY: 0
    },
    areaTransfer: {
      active: false,
      phase: "",
      item: null,
      sourceArea: "",
      destArea: "",
      ghostNode: null
    }
  },
  visualAge: {
    rows: {},
    zones: {},
    slotted: {},
    movable: {}
  }
};

const VIEW_MODES = SharedConstants.VIEW_MODES;
const OVERVIEW_MIN_ZOOM = SharedConstants.OVERVIEW_MIN_ZOOM;
const OVERVIEW_MAX_ZOOM = SharedConstants.OVERVIEW_MAX_ZOOM;
const OVERVIEW_FOCUS_MAX_ZOOM = SharedConstants.OVERVIEW_FOCUS_MAX_ZOOM;
const CONFIG_MIN_ZOOM = SharedConstants.CONFIG_MIN_ZOOM;
const CONFIG_MAX_ZOOM = SharedConstants.CONFIG_MAX_ZOOM;

const el = {
  viewMode: document.getElementById("viewMode"),
  areaSelect: document.getElementById("areaSelect"),
  rackSelect: document.getElementById("rackSelect"),
  zoneSelect: document.getElementById("zoneSelect"),
  slottedSelect: document.getElementById("slottedSelect"),
  mapSelect: document.getElementById("mapSelect"),
  mapLoadBtn: document.getElementById("mapLoadBtn"),
  mapLatestBtn: document.getElementById("mapLatestBtn"),
  landingOverlay: document.getElementById("landingOverlay"),
  landingUserBtn: document.getElementById("landingUserBtn"),
  landingAdminBtn: document.getElementById("landingAdminBtn"),
  landingDepartmentForm: document.getElementById("landingDepartmentForm"),
  landingDepartmentSelect: document.getElementById("landingDepartmentSelect"),
  landingDepartmentCancelBtn: document.getElementById("landingDepartmentCancelBtn"),
  landingAdminForm: document.getElementById("landingAdminForm"),
  landingAdminPassword: document.getElementById("landingAdminPassword"),
  landingAdminCancelBtn: document.getElementById("landingAdminCancelBtn"),
  landingError: document.getElementById("landingError"),
  accessSwitchBtn: document.getElementById("accessSwitchBtn"),
  viewTitle: document.getElementById("viewTitle"),
  legendBar: document.getElementById("legendBar"),
  viewSummary: document.getElementById("viewSummary"),
  gridWrap: document.getElementById("gridWrap"),
  detailViewControls: document.getElementById("detailViewControls"),
  detailBackBtn: document.getElementById("detailBackBtn"),
  overviewControls: document.getElementById("overviewControls"),
  overviewBackBtn: document.getElementById("overviewBackBtn"),
  overviewAddPalletBtn: document.getElementById("overviewAddPalletBtn"),
  overviewOpenOverlayBtn: document.getElementById("overviewOpenOverlayBtn"),
  auditToolbar: document.getElementById("auditToolbar"),
  auditNameInput: document.getElementById("auditNameInput"),
  auditModeSelect: document.getElementById("auditModeSelect"),
  auditAssigneeSelect: document.getElementById("auditAssigneeSelect"),
  auditTargetDepartmentSelect: document.getElementById("auditTargetDepartmentSelect"),
  auditOwnDepartmentOverrideRow: document.getElementById("auditOwnDepartmentOverrideRow"),
  auditOwnDepartmentOverride: document.getElementById("auditOwnDepartmentOverride"),
  auditStartBtn: document.getElementById("auditStartBtn"),
  auditPrintAssignmentBtn: document.getElementById("auditPrintAssignmentBtn"),
  auditCloseBtn: document.getElementById("auditCloseBtn"),
  auditCompleteScopeBtn: document.getElementById("auditCompleteScopeBtn"),
  auditSessionPill: document.getElementById("auditSessionPill"),
  auditRoleSummary: document.getElementById("auditRoleSummary"),
  heatModeToggleBtn: document.getElementById("heatModeToggleBtn"),
  legendSwatch1: document.getElementById("legendSwatch1"),
  legendSwatch2: document.getElementById("legendSwatch2"),
  legendSwatch3: document.getElementById("legendSwatch3"),
  legendSwatch4: document.getElementById("legendSwatch4"),
  legendSwatch5: document.getElementById("legendSwatch5"),
  legendLabel1: document.getElementById("legendLabel1"),
  legendLabel2: document.getElementById("legendLabel2"),
  legendLabel3: document.getElementById("legendLabel3"),
  legendLabel4: document.getElementById("legendLabel4"),
  legendLabel5: document.getElementById("legendLabel5"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  fitBtn: document.getElementById("fitBtn"),
  resetPanBtn: document.getElementById("resetPanBtn"),
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchSummary: document.getElementById("searchSummary"),
  searchResults: document.getElementById("searchResults"),
  searchModeBar: document.getElementById("searchModeBar"),
  searchModeText: document.getElementById("searchModeText"),
  searchModeExitBtn: document.getElementById("searchModeExitBtn"),
  searchResultsPanel: document.getElementById("searchResultsPanel"),
  auditRequestBanner: document.getElementById("auditRequestBanner"),
  auditRequestText: document.getElementById("auditRequestText"),
  auditRequestStartBtn: document.getElementById("auditRequestStartBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  detailPanel: document.getElementById("detailPanel"),
  detailTitle: document.getElementById("detailTitle"),
  auditSupervisorPanel: document.getElementById("auditSupervisorPanel"),
  departmentAdminPanel: document.getElementById("departmentAdminPanel"),
  overviewActionPanel: document.getElementById("overviewActionPanel"),
  detailForm: document.getElementById("detailForm"),
  locationCode: document.getElementById("locationCode"),
  lastInventoriedOutput: document.getElementById("lastInventoriedOutput"),
  auditSessionRow: document.getElementById("auditSessionRow"),
  auditSessionOutput: document.getElementById("auditSessionOutput"),
  auditExpectedItemRow: document.getElementById("auditExpectedItemRow"),
  auditExpectedItemOutput: document.getElementById("auditExpectedItemOutput"),
  auditExpectedQtyRow: document.getElementById("auditExpectedQtyRow"),
  auditExpectedQtyOutput: document.getElementById("auditExpectedQtyOutput"),
  auditResultRow: document.getElementById("auditResultRow"),
  auditResultOutput: document.getElementById("auditResultOutput"),
  auditNotesRow: document.getElementById("auditNotesRow"),
  auditNotesInput: document.getElementById("auditNotesInput"),
  itemInput: document.getElementById("itemInput"),
  qtyInput: document.getElementById("qtyInput"),
  recordedInput: document.getElementById("recordedInput"),
  poInput: document.getElementById("poInput"),
  mixedToggleRow: document.getElementById("mixedToggleRow"),
  mixedToggle: document.getElementById("mixedToggle"),
  mixedEditor: document.getElementById("mixedEditor"),
  mixedRows: document.getElementById("mixedRows"),
  addMixedRowBtn: document.getElementById("addMixedRowBtn"),
  saveBtn: document.getElementById("saveBtn"),
  pullOutBtn: document.getElementById("pullOutBtn"),
  moveAreaBtn: document.getElementById("moveAreaBtn"),
  statusText: document.getElementById("statusText"),
  floatingInspector: document.getElementById("floatingInspector"),
  fiLocation: document.getElementById("fiLocation"),
  fiItemInput: document.getElementById("fiItemInput"),
  fiQtyInput: document.getElementById("fiQtyInput"),
  fiRecordedInput: document.getElementById("fiRecordedInput"),
  fiMixedToggle: document.getElementById("fiMixedToggle"),
  fiMixedEditBtn: document.getElementById("fiMixedEditBtn"),
  fiMinusBtn: document.getElementById("fiMinusBtn"),
  fiPlusBtn: document.getElementById("fiPlusBtn"),
  fiPlus5Btn: document.getElementById("fiPlus5Btn"),
  fiPrevBtn: document.getElementById("fiPrevBtn"),
  fiNextBtn: document.getElementById("fiNextBtn"),
  fiSaveBtn: document.getElementById("fiSaveBtn"),
  fiCloseBtn: document.getElementById("fiCloseBtn")
};

const INVENTORY_AGE_BUCKET_ORDER = SharedConstants.INVENTORY_AGE_BUCKET_ORDER;

function normalizedHeatMapSettings(raw) {
  return SharedHelpers.normalizedHeatMapSettings(raw);
}

function inventoryAgeBucketLabels(settings = state.service.heatMap) {
  return SharedHelpers.inventoryAgeBucketLabels(settings);
}

const apiGet = SharedApi.apiGet;
const apiPost = SharedApi.apiPost;
const requestRoleSession = SharedApi.requestRoleSession;
const setAuditRoleToken = SharedApi.setAuditRoleToken;
const getAuditRoleToken = SharedApi.getAuditRoleToken;
const clearAuditRoleToken = SharedApi.clearAuditRoleToken;

function defaultAuditCapabilities(role = "legacy") {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "operator") {
    return {
      can_start_session: false,
      can_close_session: false,
      can_complete_scope: false,
      can_record_entry: true,
      can_view_full_results: false
    };
  }
  return {
    can_start_session: true,
    can_close_session: true,
    can_complete_scope: true,
    can_record_entry: true,
    can_view_full_results: true
  };
}

function storedAccessMode() {
  try {
    const value = String(window.sessionStorage.getItem(ACCESS_MODE_KEY) || "").trim().toLowerCase();
    return value === "admin" || value === "user" ? value : "";
  } catch (_error) {
    return "";
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

function initializeAccessMode() {
  if (currentPath.startsWith("/audit")) {
    state.accessMode = "user";
  } else if (isFieldShell || isManageShell) {
    state.accessMode = storedAccessMode();
  } else {
    state.accessMode = storedAccessMode();
  }
  isAdmin = state.accessMode === "admin";
  isAuditOperatorClient = currentPath.startsWith("/audit");
  state.selectedDepartment = isAdmin ? "" : storedDepartment();
}

function showLandingOverlay() {
  el.landingOverlay?.classList.remove("hidden");
  el.landingAdminForm?.classList.add("hidden");
  el.landingDepartmentForm?.classList.add("hidden");
  if (el.landingError) {
    el.landingError.textContent = "";
  }
  setTimeout(() => el.landingUserBtn?.focus(), 0);
}

function hideLandingOverlay() {
  el.landingOverlay?.classList.add("hidden");
}

function setAccessMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  state.accessMode = normalized === "admin" ? "admin" : "user";
  isAdmin = state.accessMode === "admin";
  isAuditOperatorClient = currentPath.startsWith("/audit");
  if (isAdmin) {
    state.selectedDepartment = "";
    setStoredDepartment("");
  } else {
    state.selectedDepartment = storedDepartment();
    state.userAreaInitialized = false;
  }
  setStoredAccessMode(state.accessMode);
  hideLandingOverlay();
}

function currentDepartmentProfile() {
  const selected = String(state.selectedDepartment || "").trim().toLowerCase();
  return (state.departments || []).find((department) => String(department.name || "").trim().toLowerCase() === selected) || null;
}

function departmentAreas(profile = currentDepartmentProfile()) {
  return Array.isArray(profile?.areas) ? profile.areas.map((area) => String(area || "").trim()).filter(Boolean) : [];
}

function userAllowedAreas(allAreas = []) {
  const available = (allAreas || []).map((area) => String(area || "").trim()).filter(Boolean);
  const configuredAreas = departmentAreas();
  if (configuredAreas.length) {
    const availableSet = new Set(available);
    return configuredAreas.filter((area) => !availableSet.size || availableSet.has(area));
  }
  const selected = String(state.selectedDepartment || "").trim();
  if (selected && available.includes(selected)) {
    return [selected];
  }
  return [];
}

function focusOverviewArea(areaName, { persist = true } = {}) {
  const normalized = String(areaName || "").trim();
  const isAll = !normalized || normalized === "All Areas";
  state.area = isAll ? "All Areas" : normalized;
  state.overview.focusedArea = isAll ? "" : normalized;
  state.overview.selectedArea = isAll ? "" : normalized;
  if (el.areaSelect) {
    el.areaSelect.value = state.area;
  }
  if (persist && !isAdmin && state.selectedDepartment) {
    setStoredLastArea(state.area);
  }
}

function persistUserLastArea(areaName) {
  if (isAdmin || !state.selectedDepartment) {
    return;
  }
  const normalized = String(areaName || "All Areas").trim() || "All Areas";
  setStoredLastArea(normalized);
}

function initializeUserAreaNavigation(allAreas = [], { force = false } = {}) {
  if (!force && state.userAreaInitialized) {
    return;
  }
  if (isAdmin || isAuditOperatorClient || state.accessMode !== "user" || !state.selectedDepartment) {
    state.userAreaInitialized = true;
    return;
  }
  const allowed = userAllowedAreas(allAreas);
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
  focusOverviewArea(targetArea, { persist: false });
  state.userAreaInitialized = true;
}

function departmentPeople() {
  return Array.from(new Set([
    ...(state.departments || []).flatMap((department) => department.people || []),
    ...(state.unassignedPeople || []),
    ...(state.auditors || [])
  ].map((person) => String(person || "").trim()).filter(Boolean))).sort();
}

function auditRequestAppliesToCurrentUser() {
  const session = state.audit.session;
  if (isAdmin || isAuditOperatorClient || !session || !state.selectedDepartment) {
    return false;
  }
  const selected = String(state.selectedDepartment || "").trim().toLowerCase();
  const assignedDepartment = String(session.assigned_department || "").trim().toLowerCase();
  const person = String(session.assigned_person || "").trim().toLowerCase();
  const profile = currentDepartmentProfile();
  const people = (profile?.people || []).map((entry) => String(entry || "").trim().toLowerCase());
  return assignedDepartment === selected || (!!person && people.includes(person));
}

function applyAccessModeControls() {
  const adminOnlyValues = new Set(["management", "config"]);
  const legacyOperationalValues = new Set(["floor", "slotted"]);
  const fieldShellHidden = new Set(["floor", "slotted", "audit", "management", "config"]);
  const manageShellHidden = new Set(["floor", "slotted", "rack", "audit", "config"]);
  const userAuditAvailable = auditRequestAppliesToCurrentUser();
  Array.from(el.viewMode?.options || []).forEach((option) => {
    const value = String(option.value || "");
    if (!value) {
      return;
    }
    option.hidden =
      (isFieldShell && fieldShellHidden.has(value)) ||
      (isManageShell && manageShellHidden.has(value) && value !== "management" && value !== "overview") ||
      (isAuditOperatorClient && value !== "audit") ||
      (!isAdmin && adminOnlyValues.has(value) && !isManageShell) ||
      (!isAdmin && !isAuditOperatorClient && legacyOperationalValues.has(value)) ||
      (!isAdmin && !isAuditOperatorClient && value === "audit" && !userAuditAvailable && !isFieldShell && !isManageShell);
  });
  if (isAuditOperatorClient && state.viewMode !== "audit") {
    state.viewMode = "audit";
    el.viewMode.value = "audit";
  }
  if (!isAdmin && adminOnlyValues.has(state.viewMode) && !isManageShell) {
    state.viewMode = "overview";
    el.viewMode.value = "overview";
  }
  if (!isAdmin && !isAuditOperatorClient && legacyOperationalValues.has(state.viewMode)) {
    state.viewMode = "overview";
    el.viewMode.value = "overview";
  }
  document.body.classList.toggle("admin-access", isAdmin);
  document.body.classList.toggle("user-access", !isAdmin);
  if (el.accessSwitchBtn) {
    el.accessSwitchBtn.textContent = isAdmin ? "Admin Mode" : "User Mode";
  }
  renderAdminDepartmentPanel();
  syncAuditAssignmentControls();
  renderAuditRequestBanner();
}

function requireAccessMode() {
  initializeAccessMode();
  if (state.accessMode) {
    hideLandingOverlay();
    return true;
  }
  showLandingOverlay();
  return false;
}

function normalizeDepartmentProfiles(rawDepartments = []) {
  return (Array.isArray(rawDepartments) ? rawDepartments : [])
    .map((department) => ({
      name: String(department?.name || "").trim(),
      areas: Array.isArray(department?.areas) ? department.areas.map((area) => String(area || "").trim()).filter(Boolean) : [],
      people: Array.isArray(department?.people) ? department.people.map((person) => String(person || "").trim()).filter(Boolean) : []
    }))
    .filter((department) => department.name);
}

function normalizePeople(rawPeople = []) {
  const seen = new Set();
  const people = [];
  (Array.isArray(rawPeople) ? rawPeople : []).forEach((value) => {
    const person = String(value || "").trim();
    const key = person.toLowerCase();
    if (person && !seen.has(key)) {
      seen.add(key);
      people.push(person);
    }
  });
  return people;
}

function derivedDepartmentProfiles() {
  return (state.areas || [])
    .map((area) => String(area || "").trim())
    .filter((area) => area && area !== "All Areas")
    .map((area) => ({ name: area, areas: [area], people: [] }));
}

async function loadDepartments() {
  try {
    const payload = await apiGet("/api/departments");
    state.departments = normalizeDepartmentProfiles(payload.departments || []);
    state.unassignedPeople = normalizePeople(payload.unassigned_people || []);
    state.auditors = normalizePeople(payload.auditors || []);
  } catch (_error) {
    state.departments = [];
    state.unassignedPeople = [];
    state.auditors = [];
  }
  if (!state.departments.length) {
    state.departments = derivedDepartmentProfiles();
  }
  renderDepartmentSelect();
  renderAdminDepartmentPanel();
}

function renderDepartmentSelect() {
  if (!el.landingDepartmentSelect) {
    return;
  }
  el.landingDepartmentSelect.innerHTML = "";
  (state.departments || []).forEach((department) => {
    const option = document.createElement("option");
    option.value = department.name;
    option.textContent = department.name;
    el.landingDepartmentSelect.appendChild(option);
  });
  if (state.selectedDepartment && (state.departments || []).some((department) => department.name === state.selectedDepartment)) {
    el.landingDepartmentSelect.value = state.selectedDepartment;
  }
}

function showDepartmentPrompt() {
  if (!el.landingOverlay || !el.landingDepartmentForm) {
    return;
  }
  renderDepartmentSelect();
  el.landingOverlay.classList.remove("hidden");
  el.landingAdminForm?.classList.add("hidden");
  el.landingDepartmentForm.classList.remove("hidden");
  if (el.landingError) {
    el.landingError.textContent = state.departments.length ? "Select your department to continue." : "No departments are configured yet.";
  }
  setTimeout(() => el.landingDepartmentSelect?.focus(), 0);
}

function ensureUserDepartmentSelection() {
  if (isAdmin || isAuditOperatorClient || state.accessMode !== "user") {
    return true;
  }
  if (state.selectedDepartment && (state.departments || []).some((department) => department.name === state.selectedDepartment)) {
    return true;
  }
  showDepartmentPrompt();
  return false;
}

function auditSessionScopeText(session = state.audit.session) {
  if (!session) {
    return "No active request.";
  }
  const scope = String(session.scope_type || "warehouse").replaceAll("_", " ");
  const values = Array.isArray(session.scope_values) && session.scope_values.length ? session.scope_values.join(", ") : "warehouse";
  const mode = String(session.mode || "assisted") === "blind" ? "Blind" : "Assisted";
  const assignee = session.assigned_person ? ` for ${session.assigned_person}` : "";
  return `${mode} audit${assignee}: ${scope} ${values}`;
}

function renderAuditRequestBanner() {
  if (!el.auditRequestBanner) {
    return;
  }
  const visible = auditRequestAppliesToCurrentUser() && !inAuditWorkspace();
  el.auditRequestBanner.classList.toggle("hidden", !visible);
  if (visible && el.auditRequestText) {
    el.auditRequestText.textContent = auditSessionScopeText();
  }
}

function syncAuditPrintAssignmentButton() {
  if (!el.auditPrintAssignmentBtn) {
    return;
  }
  const printable = isAdmin && inAuditWorkspace() && !!state.audit.session;
  el.auditPrintAssignmentBtn.classList.toggle("hidden", !printable);
}

function applyAuditPayload(payload = {}) {
  state.audit.session = payload.active_session || null;
  state.audit.entries = Array.isArray(payload.entries) ? payload.entries : [];
  state.audit.expectedLocations = Array.isArray(payload.expected_locations) ? payload.expected_locations : [];
  state.audit.entryMap = auditEntryMap(state.audit.entries);
  state.audit.summary = payload.summary || null;
  state.audit.role = String(payload.role || state.audit.role || "legacy").trim() || "legacy";
  state.audit.capabilities = payload.capabilities || defaultAuditCapabilities(state.audit.role);
  state.audit.adminSummary = payload.admin_summary || null;
  state.audit.operatorContext = payload.operator_context || null;
  state.audit.reviewQueue = Array.isArray(payload.review_queue) ? payload.review_queue : [];
  state.audit.closedSessions = Array.isArray(payload.closed_sessions) ? payload.closed_sessions : [];
  if (el.auditSessionPill) {
    if (state.audit.session) {
      el.auditSessionPill.textContent = `${state.audit.session.name} · ${state.audit.session.mode === "blind" ? "Blind" : "Assisted"}`;
    } else {
      el.auditSessionPill.textContent = "No active audit";
    }
  }
  syncAuditRoleSummary();
  renderAuditSupervisorPanel();
  renderAuditRequestBanner();
  syncAuditPrintAssignmentButton();
  applyAccessModeControls();
}

function renderAuditSupervisorPanel() {
  if (!el.auditSupervisorPanel) {
    return;
  }
  const visible = inAuditWorkspace() && !!state.audit.capabilities?.can_view_full_results;
  el.auditSupervisorPanel.classList.toggle("hidden", !visible);
  if (!visible) {
    el.auditSupervisorPanel.innerHTML = "";
    return;
  }
  const queue = Array.isArray(state.audit.reviewQueue) ? state.audit.reviewQueue : [];
  const closed = Array.isArray(state.audit.closedSessions) ? state.audit.closedSessions : [];
  const queueRows = queue.map((entry) => `
    <div>
    <button type="button" class="audit-review-item" data-location-id="${escapeHtml(entry.location_id || "")}">
      <span>${escapeHtml(entry.display_label || entry.location_id || "Location")}</span>
      <strong>${escapeHtml(String(entry.result_status || "review_needed").replaceAll("_", " "))}</strong>
    </button>
    ${entry.review_status === 'recount_requested' ? '<span>Recount requested</span>' : `<button type="button" data-audit-review="accepted" data-entry="${escapeHtml(entry.entry_id)}">Accept count</button> <button type="button" data-audit-review="recount_requested" data-entry="${escapeHtml(entry.entry_id)}">Request recount</button>`}
    </div>
  `).join("");
  el.auditSupervisorPanel.innerHTML = `
    <h3>Supervisor Review</h3>
    <p>${queue.length} issue${queue.length === 1 ? "" : "s"} need review. Finished or cancelled sessions: ${closed.length}.</p>
    <div class="audit-review-list">${queueRows || "<p>No variance or review-needed entries.</p>"}</div>
  `;
  el.auditSupervisorPanel.querySelectorAll('[data-audit-review]').forEach(button => button.addEventListener('click', async () => {
    const auditId = state.audit.session?.audit_id;
    const entryId = button.dataset.entry;
    const decision = button.dataset.auditReview;
    const note = await requestAuditNote(decision === 'accepted' ? 'Accept audit count' : 'Request recount',
      decision === 'accepted' ? 'Accepting preserves this discrepancy as reviewed evidence; live inventory is unchanged.' : 'A new count will be required before closure.',
      decision === 'accepted' ? 'Accept count' : 'Request recount');
    if (!note) return;
    button.disabled = true;
    try {
      applyAuditPayload(await apiPost('/api/audit/review', { audit_id: auditId, entry_id: entryId, decision, note }));
      renderGrid(); syncControlVisibility();
    } catch (error) { setStatus(error.message); button.disabled = false; }
  }));
  el.auditSupervisorPanel.querySelectorAll(".audit-review-item").forEach((node) => {
    node.addEventListener("click", () => {
      const id = String(node.getAttribute("data-location-id") || "");
      const entry = queue.find((item) => item.location_id === id);
      if (entry) {
        setStatus(`Review ${entry.display_label || entry.location_id}: ${String(entry.result_status || "").replaceAll("_", " ")}`);
      }
    });
  });
}

function renderAdminDepartmentPanel() {
  if (!el.departmentAdminPanel) {
    return;
  }
  const visible = isAdmin;
  el.departmentAdminPanel.classList.toggle("hidden", !visible);
  if (!visible) {
    el.departmentAdminPanel.innerHTML = "";
    return;
  }
  const departments = state.departments.length ? state.departments : derivedDepartmentProfiles();
  const rows = departments.map((department, index) => `
    <div class="department-admin-row" data-index="${index}">
      <label>Department <input data-field="name" type="text" value="${escapeHtml(department.name || "")}"></label>
      <label>Areas <input data-field="areas" type="text" value="${escapeHtml((department.areas || []).join(", "))}"></label>
      <label>People <input data-field="people" type="text" value="${escapeHtml((department.people || []).join(", "))}" placeholder="Eddie, Maria"></label>
    </div>
  `).join("");
  el.departmentAdminPanel.innerHTML = `
    <h3>Departments & People</h3>
    <p class="hint">Users pick a department for daily inventory. Routine changes are labeled by department; names are used for audit assignment and printouts.</p>
    <div id="departmentAdminRows">${rows}</div>
    <div class="department-admin-row department-roster-row">
      <label>Unassigned <input id="departmentUnassignedInput" type="text" value="${escapeHtml((state.unassignedPeople || []).join(", "))}" placeholder="People not assigned to a department"></label>
      <label>Auditors <input id="departmentAuditorsInput" type="text" value="${escapeHtml((state.auditors || []).join(", "))}" placeholder="Regular auditors"></label>
    </div>
    <div class="department-admin-actions">
      <button id="departmentAddBtn" type="button">Add Department</button>
      <button id="departmentSaveBtn" type="button">Save Departments</button>
    </div>
  `;
  document.getElementById("departmentAddBtn")?.addEventListener("click", () => {
    state.departments.push({ name: "", areas: [], people: [] });
    renderAdminDepartmentPanel();
  });
  document.getElementById("departmentSaveBtn")?.addEventListener("click", saveDepartmentsFromPanel);
  syncAuditAssignmentControls();
}

function departmentsFromPanel() {
  return Array.from(document.querySelectorAll(".department-admin-row")).map((row) => {
    const name = row.querySelector('[data-field="name"]')?.value || "";
    const areas = String(row.querySelector('[data-field="areas"]')?.value || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const people = String(row.querySelector('[data-field="people"]')?.value || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return { name: name.trim(), areas, people };
  }).filter((department) => department.name);
}

function peopleListFromInput(id) {
  return String(document.getElementById(id)?.value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function saveDepartmentsFromPanel() {
  try {
    const payload = await apiPost("/api/departments", {
      departments: departmentsFromPanel(),
      unassigned_people: peopleListFromInput("departmentUnassignedInput"),
      auditors: peopleListFromInput("departmentAuditorsInput")
    });
    state.departments = normalizeDepartmentProfiles(payload.departments || []);
    state.unassignedPeople = normalizePeople(payload.unassigned_people || []);
    state.auditors = normalizePeople(payload.auditors || []);
    renderDepartmentSelect();
    renderAdminDepartmentPanel();
    setStatus("Departments saved.");
  } catch (error) {
    setStatus(`Department save failed: ${error.message}`);
  }
}

function departmentsForPerson(person) {
  const target = String(person || "").trim().toLowerCase();
  if (!target) {
    return [];
  }
  return (state.departments || []).filter((department) =>
    (department.people || []).some((candidate) => String(candidate || "").trim().toLowerCase() === target)
  );
}

function syncAuditAssignmentControls() {
  if (!el.auditAssigneeSelect || !el.auditTargetDepartmentSelect) {
    return;
  }
  const previousPerson = el.auditAssigneeSelect.value;
  el.auditAssigneeSelect.innerHTML = `<option value="">Unassigned</option>`;
  const addGroup = (label, people) => {
    const unique = normalizePeople(people);
    if (!unique.length) {
      return;
    }
    const group = document.createElement("optgroup");
    group.label = label;
    unique.forEach((person) => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      group.appendChild(option);
    });
    el.auditAssigneeSelect.appendChild(group);
  };
  addGroup("Department People", (state.departments || []).flatMap((department) => department.people || []));
  addGroup("Unassigned", state.unassignedPeople || []);
  addGroup("Auditors", state.auditors || []);
  if (departmentPeople().includes(previousPerson)) {
    el.auditAssigneeSelect.value = previousPerson;
  }
  const selectedPerson = el.auditAssigneeSelect.value;
  const ownDepartments = new Set(departmentsForPerson(selectedPerson).map((department) => department.name));
  const previousDepartment = el.auditTargetDepartmentSelect.value;
  el.auditTargetDepartmentSelect.innerHTML = `<option value="">Current area / warehouse</option>`;
  (state.departments || []).forEach((department) => {
    const option = document.createElement("option");
    option.value = department.name;
    option.textContent = ownDepartments.has(department.name) ? `${department.name} (own department)` : department.name;
    option.dataset.ownDepartment = ownDepartments.has(department.name) ? "1" : "0";
    el.auditTargetDepartmentSelect.appendChild(option);
  });
  if (previousDepartment && Array.from(el.auditTargetDepartmentSelect.options).some((option) => option.value === previousDepartment)) {
    el.auditTargetDepartmentSelect.value = previousDepartment;
  }
  const selectedOption = el.auditTargetDepartmentSelect.selectedOptions[0];
  const requiresOverride = selectedOption?.dataset?.ownDepartment === "1";
  el.auditOwnDepartmentOverrideRow?.classList.toggle("hidden", !requiresOverride);
  if (!requiresOverride && el.auditOwnDepartmentOverride) {
    el.auditOwnDepartmentOverride.checked = false;
  }
}

function syncAuditRoleSummary() {
  if (!el.auditRoleSummary) {
    return;
  }
  const role = String(state.audit.role || "legacy").trim() || "legacy";
  const counted = Number(state.audit.operatorContext?.counts?.counted_locations || state.audit.entries.length || 0);
  const issues = Number(state.audit.operatorContext?.counts?.issue_count || 0);
  const required = Number(state.audit.operatorContext?.counts?.required_locations || 0);
  const remaining = Number(state.audit.operatorContext?.counts?.remaining_locations || 0);
  const coverage = `Counted ${counted} of ${required} · ${remaining} remaining`;
  if (!inAuditWorkspace()) {
    el.auditRoleSummary.classList.add("hidden");
    return;
  }
  if (state.audit.capabilities?.can_view_full_results) {
    const completedScopes = Number(state.audit.adminSummary?.completed_scopes?.length || 0);
    el.auditRoleSummary.textContent = `Role: ${role} | ${coverage} | Issues ${issues} | Completed scopes ${completedScopes}`;
  } else {
    el.auditRoleSummary.textContent = `Role: ${role} | ${coverage} | Issues ${issues}`;
  }
  el.auditRoleSummary.classList.remove("hidden");
}

function auditClientRole() {
  if (isAdmin) {
    return "admin";
  }
  if (isAuditOperatorClient) {
    return "operator";
  }
  return "";
}

async function ensureAuditRoleSession() {
  const role = auditClientRole();
  if (!state.service.capabilities?.audit_role_split || !role) {
    return;
  }
  const existingToken = String(getAuditRoleToken() || "").trim();
  if (existingToken) {
    return;
  }
  const pin = await promptAuditPin(role);
  if (!pin) {
    throw new Error("Audit PIN is required.");
  }
  clearAuditRoleToken();
  const response = await requestRoleSession(role, pin);
  if (response?.token) {
    setAuditRoleToken(response.token);
  }
  state.audit.role = String(response?.role || role);
  state.audit.capabilities = response?.capabilities || defaultAuditCapabilities(state.audit.role);
}

function promptAuditPin(role) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "audit-pin-overlay";
    overlay.innerHTML = `
      <div class="audit-pin-dialog" role="dialog" aria-modal="true" aria-label="Audit PIN">
        <h2>${escapeHtml(String(role || "audit"))} PIN</h2>
        <p>Enter the audit PIN for this device.</p>
        <input id="auditPinModalInput" type="password" autocomplete="current-password">
        <div class="audit-pin-actions">
          <button id="auditPinCancelBtn" type="button">Cancel</button>
          <button id="auditPinSubmitBtn" type="button">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#auditPinModalInput");
    const cleanup = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector("#auditPinCancelBtn")?.addEventListener("click", () => cleanup(""));
    overlay.querySelector("#auditPinSubmitBtn")?.addEventListener("click", () => cleanup(String(input?.value || "")));
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        cleanup(String(input.value || ""));
      } else if (event.key === "Escape") {
        cleanup("");
      }
    });
    setTimeout(() => input?.focus(), 0);
  });
}

async function loadServiceStatus() {
  try {
    const status = await apiGet("/api/status");
    state.service.apiVersion = String(status.api_version || "");
    state.service.serviceKind = String(status.service_kind || status.backend || "");
    state.service.capabilities = status.capabilities || {};
    state.service.name = String(status.service || "");
    state.service.heatMap = normalizedHeatMapSettings(status.heat_map || status.capabilities?.heat_map || state.service.heatMap);
    state.currentMapPath = String(status.current_path || state.currentMapPath || "");
    return status;
  } catch (_error) {
    const health = await apiGet("/api/health");
    state.service.apiVersion = String(health.api_version || "");
    state.service.serviceKind = String(health.service_kind || health.backend || "");
    state.service.capabilities = {};
    state.service.name = String(health.service || "warehouse-api-host");
    state.service.heatMap = normalizedHeatMapSettings(state.service.heatMap);
    return health;
  }
}

function clamp(value, min, max) {
  return SharedHelpers.clamp(value, min, max);
}

function rackCellKey(bay, level) {
  return SharedHelpers.rackCellKey(bay, level);
}

function floorCellKey(slot) {
  return SharedHelpers.floorCellKey(slot);
}

function slottedCellKey(slot) {
  return SharedHelpers.slottedCellKey(slot);
}

function movableItemKey(itemId) {
  return SharedHelpers.movableItemKey(itemId);
}

function setStatus(message) {
  el.statusText.textContent = message;
}

function isSearchModeActive() {
  return !!state.searchMode.active;
}

function rackSearchHitSet(rowName) {
  const byRack = state.searchMode.rackMatches || {};
  return byRack[rowName] || new Set();
}

function rackSearchStats(rowName) {
  return SharedSearch.rackSearchStats(state.searchResults, rowName, searchResultLocationKey);
}

function updateSearchModeBarText() {
  if (!isSearchModeActive()) {
    return;
  }
  const query = state.searchMode.query || "(none)";
  const totalResults = formatInteger(state.searchResults.length);
  let message = `Search mode: "${query}" (${totalResults} results)`;
  if (state.viewMode === "rack" && state.selectedRack) {
    const stats = rackSearchStats(state.selectedRack);
    const qtyText = formatInteger(stats.qty);
    const locationsText = formatInteger(stats.uniqueLocations);
    const locationLabel = stats.uniqueLocations === 1 ? "unique location" : "unique locations";
    message += ` | Rack ${state.selectedRack}: ${qtyText} in ${locationsText} ${locationLabel}`;
  }
  el.searchModeText.textContent = message;
}

function setSearchMode(active, query = "", results = []) {
  if (!active) {
    state.searchMode = { active: false, query: "", rackMatches: {} };
    el.searchModeBar.classList.add("hidden");
    return;
  }
  const rackMatches = SharedSearch.buildRackMatches(results, rackCellKey);
  state.searchMode = { active: true, query, rackMatches };
  updateSearchModeBarText();
  el.searchModeBar.classList.remove("hidden");
}

function clearSearchMode(options = {}) {
  const resetQuery = !!options.resetQuery;
  setSearchMode(false);
  state.searchResults = [];
  if (resetQuery) {
    el.searchInput.value = "";
  }
  renderSearchResults();
  renderGrid();
  setStatus("Search mode cleared.");
}

function searchResultLocationKey(result) {
  return SharedSearch.searchResultLocationKey(result);
}

function formatInteger(value) {
  return SharedHelpers.formatInteger(value);
}

function updateSearchSummary() {
  const query = (state.searchMode.query || el.searchInput.value.trim()).replace(/\s+/g, " ").trim();
  const totalQty = state.searchResults.reduce((sum, result) => {
    const qty = Number(result.qty || 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  const uniqueLocations = new Set(state.searchResults.map(searchResultLocationKey)).size;
  const label = query || "(none)";
  const formattedQty = formatInteger(totalQty);
  const formattedLocations = formatInteger(uniqueLocations);
  const locationLabel = Number(uniqueLocations) === 1 ? "unique location" : "unique locations";
  el.searchSummary.textContent = `Search: ${label}  Returned: ${formattedQty} in ${formattedLocations} ${locationLabel}`;
}

function shortPathLabel(pathValue) {
  const full = String(pathValue || "");
  if (!full) {
    return "(none)";
  }
  const parts = full.split(/[/\\]+/);
  return parts[parts.length - 1] || full;
}

function renderMapOptions() {
  el.mapSelect.innerHTML = "";
  if (!state.mapFiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No map files found";
    el.mapSelect.appendChild(option);
    return;
  }
  state.mapFiles.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.path || "";
    const stamp = entry.modified_at ? new Date(entry.modified_at).toLocaleString() : "";
    option.textContent = stamp ? `${entry.name} (${stamp})` : entry.name;
    el.mapSelect.appendChild(option);
  });
  const selected = state.currentMapPath && state.mapFiles.some((m) => m.path === state.currentMapPath)
    ? state.currentMapPath
    : (state.mapFiles[0]?.path || "");
  el.mapSelect.value = selected;
}

function escapeHtml(value) {
  const text = String(value == null ? "" : value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseSmartQuery(query) {
  return SharedManagement.parseSmartQuery(query);
}

function toSafeInt(value, fallback = 0) {
  return SharedHelpers.toSafeInt(value, fallback);
}

function isTrue(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function parseInventoryTimestamp(value) {
  return SharedHelpers.parseInventoryTimestamp(value);
}

function parseInventoryBoundary(value, endOfDay = false) {
  return SharedHelpers.parseInventoryBoundary(value, endOfDay);
}

function formatInventoryTimestamp(value) {
  return SharedHelpers.formatInventoryTimestamp(value);
}

function inventoryAgeInfo(value, now = new Date()) {
  return SharedHelpers.inventoryAgeInfo(value, now, state.service.heatMap);
}

function inventoryAgeDisplay(days) {
  return SharedHelpers.inventoryAgeDisplay(days);
}

function heatBucketClass(bucket) {
  return SharedHelpers.heatBucketClass(bucket);
}

const AUDIT_STATUS_ORDER = SharedConstants.AUDIT_STATUS_ORDER;

function inAuditWorkspace() {
  return state.viewMode === "audit";
}

function currentAuditSubview() {
  return inAuditWorkspace() ? (state.audit.subview || "overview") : "";
}

function effectiveViewMode() {
  return inAuditWorkspace() ? currentAuditSubview() : state.viewMode;
}

function auditEntryMap(entries = state.audit.entries) {
  return SharedAudit.auditEntryMap(entries);
}

function auditEntryForLocation(locationCode) {
  return state.audit.entryMap[String(locationCode || "").trim()] || null;
}

function auditStatusFromEntry(entry) {
  return SharedAudit.auditStatusFromEntry(entry);
}

function worstAuditStatus(statuses) {
  return SharedAudit.worstAuditStatus(statuses, AUDIT_STATUS_ORDER);
}

function applyAuditClass(node, status) {
  if (!inAuditWorkspace() || !node || !status) {
    return;
  }
  node.classList.add("audit-mode", `audit-${status}`);
}

function auditAggregateStatus(type, entity) {
  if (!inAuditWorkspace() || !state.audit.session) {
    return "";
  }
  const entryMap = state.audit.entryMap;
  if (type === "row") {
    const total = Number(entity?.counts?.total || 0);
    const entries = Object.values(entryMap).filter((entry) => entry.location_type === "rack" && entry.container_id === entity.name);
    if (entries.length < total) {
      return worstAuditStatus(["uncounted", ...entries.map(auditStatusFromEntry)]);
    }
    return worstAuditStatus(entries.map(auditStatusFromEntry));
  }
  if (type === "zone") {
    const total = Number(entity?.counts?.total || 0);
    const entries = Object.values(entryMap).filter((entry) => entry.location_type === "floor" && entry.container_id === entity.zone_id);
    if (entries.length < total) {
      return worstAuditStatus(["uncounted", ...entries.map(auditStatusFromEntry)]);
    }
    return worstAuditStatus(entries.map(auditStatusFromEntry));
  }
  if (type === "slotted") {
    const total = Number(entity?.counts?.total || 0);
    const entries = Object.values(entryMap).filter((entry) => entry.location_type === "slotted_pallet" && entry.container_id === entity.group_id);
    if (entries.length < total) {
      return worstAuditStatus(["uncounted", ...entries.map(auditStatusFromEntry)]);
    }
    return worstAuditStatus(entries.map(auditStatusFromEntry));
  }
  if (type === "movable") {
    return auditStatusFromEntry(auditEntryForLocation(entity.id || entity.location_code));
  }
  return "";
}

function auditStatusForCell(cellData) {
  if (!inAuditWorkspace() || !state.audit.session || !cellData) {
    return "";
  }
  return auditStatusFromEntry(auditEntryForLocation(cellData.location_code || cellData.id));
}

function auditExpectedDisplay(cellData) {
  const id = cellData?.location_code || cellData?.id;
  const frozen = (state.audit.expectedLocations || []).find(target => target.location_id === id);
  return SharedAudit.auditExpectedDisplay(frozen || cellData);
}

async function loadAuditStatus() {
  const payload = await apiGet("/api/audit/status");
  applyAuditPayload(payload);
  return payload;
}

async function startAuditSession() {
  if (!state.audit.capabilities?.can_start_session) {
    throw new Error("This client cannot start audit sessions.");
  }
  const name = String(el.auditNameInput?.value || state.audit.startName || "").trim() || "Audit Session";
  const mode = String(el.auditModeSelect?.value || state.audit.startMode || "assisted").trim() || "assisted";
  const assignedPerson = String(el.auditAssigneeSelect?.value || "").trim();
  const assignedDepartment = String(el.auditTargetDepartmentSelect?.value || "").trim();
  const targetProfile = (state.departments || []).find((department) => department.name === assignedDepartment);
  const targetAreas = departmentAreas(targetProfile);
  const selectedOption = el.auditTargetDepartmentSelect?.selectedOptions?.[0];
  const ownDepartmentOverrideRequired = selectedOption?.dataset?.ownDepartment === "1";
  if (ownDepartmentOverrideRequired && !el.auditOwnDepartmentOverride?.checked) {
    throw new Error("Acknowledge own-department override before requesting this audit.");
  }
  const scopeType = assignedDepartment ? "area" : (state.area === "All Areas" ? "warehouse" : "area");
  const scopeValues = assignedDepartment ? (targetAreas.length ? targetAreas : [assignedDepartment]) : (state.area === "All Areas" ? [] : [state.area]);
  const payload = await apiPost("/api/audit/session/start", {
    name,
    mode,
    scope_type: scopeType,
    scope_values: scopeValues,
    assigned_person: assignedPerson,
    assigned_department: assignedDepartment,
    own_department_override: !!el.auditOwnDepartmentOverride?.checked,
  });
  applyAuditPayload(payload);
  syncControlVisibility();
  renderGrid();
}

function printAuditAssignment() {
  const session = state.audit.session;
  if (!session) {
    setStatus("Create an audit request before printing an assignment.");
    return;
  }
  const popup = window.open("", "_blank");
  if (!popup) {
    setStatus("Print window was blocked.");
    return;
  }
  const assignedPerson = String(session.assigned_person || "Unassigned").trim() || "Unassigned";
  const targetDepartment = String(session.assigned_department || "").trim() || "Current selection";
  const scopeText = auditSessionScopeText(session);
  const mode = String(session.mode || "assisted") === "blind" ? "Blind" : "Assisted";
  const createdAt = session.created_at ? new Date(session.created_at).toLocaleString() : new Date().toLocaleString();
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Audit Assignment - ${escapeHtml(session.name || "Audit")}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
          h1 { margin-bottom: 4px; }
          .meta { margin: 16px 0; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; }
          .meta div { margin: 8px 0; }
          .instructions { margin-top: 24px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Audit Assignment</h1>
        <p>${escapeHtml(session.name || "Audit Request")}</p>
        <div class="meta">
          <div><strong>Assigned To:</strong> ${escapeHtml(assignedPerson)}</div>
          <div><strong>Target Department:</strong> ${escapeHtml(targetDepartment)}</div>
          <div><strong>Mode:</strong> ${escapeHtml(mode)}</div>
          <div><strong>Scope:</strong> ${escapeHtml(scopeText)}</div>
          <div><strong>Created:</strong> ${escapeHtml(createdAt)}</div>
        </div>
        <div class="instructions">
          <h2>Instructions</h2>
          <p>Count only the assigned scope. Do not change rack layout, bay type, or department setup during the audit.</p>
          <p>Return this sheet to the supervisor after the count is complete.</p>
        </div>
        <button onclick="window.print()">Print</button>
      </body>
    </html>
  `);
  popup.document.close();
  popup.focus();
}

async function closeAuditSession() {
  if (!state.audit.capabilities?.can_close_session) {
    throw new Error("This client cannot close audit sessions.");
  }
  const payload = await apiPost("/api/audit/session/close", {
    audit_id: state.audit.session?.audit_id || "",
  });
  applyAuditPayload(payload);
  selectCell(null);
  syncControlVisibility();
  renderGrid();
}

function requestAuditNote(title, explanation, actionLabel) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "audit-decision-dialog";
    dialog.innerHTML = `<form><h2></h2><p></p><label>Reason or review note<textarea required maxlength="2000" rows="4"></textarea></label><div><button type="button">Back</button> <button type="submit"></button></div></form>`;
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector("p").textContent = explanation;
    dialog.querySelector('[type="submit"]').textContent = actionLabel;
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelector('[type="button"]').onclick = () => finish(null);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    dialog.querySelector("form").onsubmit = event => {
      event.preventDefault();
      const note = dialog.querySelector("textarea").value.trim();
      if (note) finish(note);
    };
    document.body.append(dialog); dialog.showModal(); dialog.querySelector("textarea").focus();
  });
}

async function cancelAuditSession() {
  const session = state.audit.session;
  if (!session || !state.audit.capabilities?.can_close_session) return;
  const reason = await requestAuditNote(`Cancel ${session.name}`, "The audit will be marked incomplete. Counts and review history will be retained; live inventory will not change.", "Cancel audit");
  if (!reason) return;
  const payload = await apiPost("/api/audit/session/cancel", { audit_id: session.audit_id, reason });
  applyAuditPayload(payload); selectCell(null); syncControlVisibility(); renderGrid();
  setStatus(`Cancelled ${session.name}. Its evidence has been retained.`);
}

async function completeAuditScope() {
  if (!state.audit.capabilities?.can_complete_scope) {
    throw new Error("This client cannot complete audit scopes.");
  }
  const scope = auditScopeForCurrentView();
  if (!scope) {
    setStatus("Select a rack, floor zone, slotted pallet, or area to export audit results.");
    return;
  }
  const payload = await apiPost("/api/audit/complete-scope", {
    scope_type: scope.scopeType,
    scope_value: scope.scopeValue,
  });
  applyAuditPayload(payload);
  syncControlVisibility();
  renderGrid();
  setStatus(`Completed ${scope.label}. Exported ${payload.rows_exported || 0} audit rows to ${payload.path}.`);
}

function auditScopeForCurrentView() {
  return SharedAudit.auditScopeForCurrentView(state, currentAuditSubview);
}

function worstInventoryAgeBucket(buckets) {
  return SharedHeatVisualAge.worstInventoryAgeBucket(buckets, INVENTORY_AGE_BUCKET_ORDER);
}

function buildVisualAgeCache(warehouse, movableItems = []) {
  return SharedHeatVisualAge.buildVisualAgeCache(warehouse, movableItems, {
    bucketOrder: INVENTORY_AGE_BUCKET_ORDER,
    inventoryAgeInfo,
    isDeprecatedPalletZoneId
  });
}

function updateVisualAgeForRackModel(rackModel = state.rackModel) {
  SharedHeatVisualAge.updateVisualAgeForRackModel(state, rackModel, {
    bucketOrder: INVENTORY_AGE_BUCKET_ORDER,
    inventoryAgeInfo
  });
}

function updateVisualAgeForZoneModel(zoneModel = state.zoneModel) {
  SharedHeatVisualAge.updateVisualAgeForZoneModel(state, zoneModel, {
    bucketOrder: INVENTORY_AGE_BUCKET_ORDER,
    inventoryAgeInfo
  });
}

function updateVisualAgeForSlottedModel(slottedModel = state.slottedModel) {
  SharedHeatVisualAge.updateVisualAgeForSlottedModel(state, slottedModel, {
    bucketOrder: INVENTORY_AGE_BUCKET_ORDER,
    inventoryAgeInfo
  });
}

function updateVisualAgeForMovableItems(items = state.movableItems) {
  SharedHeatVisualAge.updateVisualAgeForMovableItems(state, items, { inventoryAgeInfo });
}

function entityHeatBucket(type, entity) {
  return SharedHeatVisualAge.entityHeatBucket(state, type, entity, { inventoryAgeInfo });
}

function applyHeatClass(node, bucket) {
  SharedHeatVisualAge.applyHeatClass(state, node, bucket, { heatBucketClass });
}

function updateHeatLegend() {
  if (!el.heatModeToggleBtn) {
    return;
  }
  if (inAuditWorkspace()) {
    el.heatModeToggleBtn.classList.add("hidden");
    const auditLegend = [
      ["swatch-heat-never", "Uncounted"],
      ["swatch-heat-0_7_days", "Counted Match"],
      ["swatch-heat-8_30_days", "Variance"],
      ["swatch-selected", "Selected"],
      ["swatch-heat-over_90_days", "Review"]
    ];
    const swatches = [
      [el.legendSwatch1, el.legendLabel1],
      [el.legendSwatch2, el.legendLabel2],
      [el.legendSwatch3, el.legendLabel3],
      [el.legendSwatch4, el.legendLabel4],
      [el.legendSwatch5, el.legendLabel5]
    ];
    swatches.forEach(([swatch, label], index) => {
      if (!swatch || !label) {
        return;
      }
      swatch.className = "swatch";
      const [cls, text] = auditLegend[index];
      swatch.classList.add(cls);
      label.textContent = text;
    });
    return;
  }
  el.heatModeToggleBtn.classList.remove("hidden");
  el.heatModeToggleBtn.textContent = state.heatMapEnabled ? "Heat Map: On" : "Heat Map: Off";
  const labels = inventoryAgeBucketLabels(state.service.heatMap);
  const swatches = [
    [el.legendSwatch1, el.legendLabel1],
    [el.legendSwatch2, el.legendLabel2],
    [el.legendSwatch3, el.legendLabel3],
    [el.legendSwatch4, el.legendLabel4],
    [el.legendSwatch5, el.legendLabel5]
  ];
  const occupancy = [
    ["swatch-empty", "Empty"],
    ["swatch-occupied", "Occupied"],
    ["swatch-mixed", "Mixed"],
    ["swatch-selected", "Selected"],
    ["swatch-hover", "Hover"]
  ];
  const heat = [
    ["swatch-heat-never", labels.never],
    ["swatch-heat-0_7_days", labels["0_7_days"]],
    ["swatch-heat-8_30_days", labels["8_30_days"]],
    ["swatch-heat-31_90_days", labels["31_90_days"]],
    ["swatch-heat-over_90_days", labels.over_90_days]
  ];
  swatches.forEach(([swatch, label], index) => {
    if (!swatch || !label) {
      return;
    }
    swatch.className = "swatch";
    const [cls, text] = (state.heatMapEnabled ? heat : occupancy)[index];
    swatch.classList.add(cls);
    label.textContent = text;
  });
}

function managementRowsFromWarehouse(warehouse, movableItems = []) {
  return SharedManagement.managementRowsFromWarehouse(warehouse, movableItems, {
    inventoryAgeInfo,
    toSafeInt
  });
}

function rowFieldValueForTerm(row, field) {
  return SharedManagement.rowFieldValueForTerm(row, field);
}

function rowMatchesSmartQuery(row, parsedQuery) {
  return SharedManagement.rowMatchesSmartQuery(row, parsedQuery);
}

function applyManagementFilters(rows, filters, parsedQuery) {
  return SharedManagement.applyManagementFilters(rows, filters, parsedQuery, {
    inventoryAgeInfo,
    isTrue,
    parseInventoryBoundary,
    parseInventoryTimestamp,
    toSafeInt
  });
}

function summarizeManagementRows(rows) {
  return SharedManagement.summarizeManagementRows(rows, { inventoryAgeInfo, isTrue, toSafeInt });
}

function managementDefaultExportPath(format) {
  return SharedManagement.managementDefaultExportPath(format, state.area, new Date());
}

function managementFiltersFromUi() {
  const chips = state.management.filters.chips;
  return {
    area: state.area,
    query: (document.getElementById("mgmtQuery")?.value || "").trim(),
    location_type: document.getElementById("mgmtType")?.value || "all",
    container_id: (document.getElementById("mgmtContainer")?.value || "").trim(),
    po_number: (document.getElementById("mgmtPo")?.value || "").trim(),
    recorded_location: (document.getElementById("mgmtRecorded")?.value || "").trim(),
    inventory_source: (document.getElementById("mgmtInventorySource")?.value || "").trim(),
    inventory_before: (document.getElementById("mgmtInventoryBefore")?.value || "").trim(),
    inventory_after: (document.getElementById("mgmtInventoryAfter")?.value || "").trim(),
    age_bucket: document.getElementById("mgmtAgeBucket")?.value || "all",
    older_than_days: (document.getElementById("mgmtOlderThanDays")?.value || "").trim(),
    min_qty: (document.getElementById("mgmtMinQty")?.value || "").trim(),
    max_qty: (document.getElementById("mgmtMaxQty")?.value || "").trim(),
    low_qty_threshold: Number.parseInt(document.getElementById("mgmtLowQtyThreshold")?.value || "5", 10) || 5,
    chips: {
      low_qty: !!chips.low_qty,
      empty_only: !!chips.empty_only,
      mixed_only: !!chips.mixed_only,
      has_po: !!chips.has_po,
      rack_only: !!chips.rack_only,
      floor_only: !!chips.floor_only,
      never_inventoried: !!chips.never_inventoried
    }
  };
}

async function loadManagementPreview() {
  const filters = state.management.filters;
  const payload = {
    filters: {
      ...filters,
      parsed_query: state.management.parsedQuery
    }
  };
  const reportsSupported = state.service.capabilities
    ? state.service.capabilities.reports !== false
    : true;
  if (!reportsSupported) {
    const warehouseData = await apiGet("/api/warehouse");
    const allRows = managementRowsFromWarehouse(warehouseData.warehouse || {}, warehouseData.movable_items || []);
    const filteredRows = applyManagementFilters(allRows, filters, state.management.parsedQuery);
    state.management.rows = filteredRows;
    state.management.summary = summarizeManagementRows(filteredRows);
    state.management.lastGeneratedAt = new Date().toISOString();
    state.management.previewSource = "fallback";
    state.management.previewError = "Backend reports capability disabled";
    return;
  }
  try {
    const data = await apiPost("/api/reports/preview", payload);
    state.management.rows = data.rows || [];
    state.management.summary = data.summary || null;
    state.management.lastGeneratedAt = data.generated_at || "";
    state.management.previewSource = "api";
    state.management.previewError = "";
    return;
  } catch (error) {
    const warehouseData = await apiGet("/api/warehouse");
    const allRows = managementRowsFromWarehouse(warehouseData.warehouse || {}, warehouseData.movable_items || []);
    const filteredRows = applyManagementFilters(allRows, filters, state.management.parsedQuery);
    state.management.rows = filteredRows;
    state.management.summary = summarizeManagementRows(filteredRows);
    state.management.lastGeneratedAt = new Date().toISOString();
    state.management.previewSource = "fallback";
    state.management.previewError = String(error?.message || "Preview API unavailable");
  }
}

function renderManagementOverview() {
  el.gridWrap.innerHTML = "";
  el.viewTitle.textContent = `Management Overview - ${state.area}`;
  const summary = state.management.summary || {
    row_count: 0,
    total_qty: 0,
    unique_items: 0,
    unique_areas: 0,
    unique_locations: 0,
    mixed_locations: 0,
    empty_locations: 0,
    occupied_locations: 0,
    inventory_age_counts: {
      never: 0,
      "0_7_days": 0,
      "8_30_days": 0,
      "31_90_days": 0,
      over_90_days: 0
    }
  };
  const generatedText = state.management.lastGeneratedAt
    ? new Date(state.management.lastGeneratedAt).toLocaleString()
    : "not generated yet";
  const ageLabels = inventoryAgeBucketLabels(state.service.heatMap);
  state.management.summary = summary;
  updateManagementSummary();
  el.viewSummary.textContent += ` | Updated ${generatedText}`;
  if (state.management.previewSource === "fallback") {
    el.viewSummary.textContent += " | Preview fallback active";
  }

  const wrap = document.createElement("div");
  wrap.className = "management-wrap";

  const kpis = document.createElement("div");
  kpis.className = "management-kpis";
  [
    ["Total Qty", summary.total_qty],
    ["Unique Items", summary.unique_items],
    ["Unique Locations", summary.unique_locations],
    ["Occupied", summary.occupied_locations],
    ["Empty", summary.empty_locations],
    ["Mixed", summary.mixed_locations],
    ["Areas", summary.unique_areas],
    ["Never Inventoried", summary.inventory_age_counts?.never || 0],
    [ageLabels["0_7_days"], summary.inventory_age_counts?.["0_7_days"] || 0],
    [ageLabels["8_30_days"], summary.inventory_age_counts?.["8_30_days"] || 0],
    [ageLabels["31_90_days"], summary.inventory_age_counts?.["31_90_days"] || 0],
    [ageLabels.over_90_days, summary.inventory_age_counts?.over_90_days || 0]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `<div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${formatInteger(value)}</div>`;
    kpis.appendChild(card);
  });
  wrap.appendChild(kpis);
  if (state.management.previewSource === "fallback" && state.management.previewError) {
    const fallbackHint = document.createElement("p");
    fallbackHint.className = "hint";
    fallbackHint.textContent = `Using local fallback preview because report endpoint is unavailable (${state.management.previewError}).`;
    wrap.appendChild(fallbackHint);
  }

  const filters = state.management.filters;
  const parsed = state.management.parsedQuery;
  const filterBlock = document.createElement("div");
  filterBlock.innerHTML = `
    <div class="management-filter-grid">
      <div>
        <label for="mgmtQuery">Smart Query</label>
        <input id="mgmtQuery" type="text" value="${escapeHtml(filters.query)}" placeholder="B33, item:ABC, -po:old">
        <div class="management-query-hints">Comma-separated terms. Prefix <code>-</code> excludes. Use <code>item:</code>, <code>po:</code>, <code>rack:</code>, <code>zone:</code>, <code>area:</code>.</div>
      </div>
      <div>
        <label for="mgmtType">Location Type</label>
        <select id="mgmtType">
          <option value="all"${filters.location_type === "all" ? " selected" : ""}>All</option>
          <option value="rack"${filters.location_type === "rack" ? " selected" : ""}>Rack</option>
          <option value="floor"${filters.location_type === "floor" ? " selected" : ""}>Floor</option>
          <option value="slotted_pallet"${filters.location_type === "slotted_pallet" ? " selected" : ""}>Slotted Pallet</option>
          <option value="movable"${filters.location_type === "movable" ? " selected" : ""}>Movable</option>
        </select>
      </div>
      <div>
        <label for="mgmtContainer">Rack/Zone Contains</label>
        <input id="mgmtContainer" type="text" value="${escapeHtml(filters.container_id)}">
      </div>
      <div>
        <label for="mgmtPo">PO Contains</label>
        <input id="mgmtPo" type="text" value="${escapeHtml(filters.po_number)}">
      </div>
      <div>
        <label for="mgmtRecorded">Recorded Contains</label>
        <input id="mgmtRecorded" type="text" value="${escapeHtml(filters.recorded_location)}">
      </div>
      <div>
        <label for="mgmtInventorySource">Inventory Source</label>
        <input id="mgmtInventorySource" type="text" value="${escapeHtml(filters.inventory_source)}" placeholder="web_ui">
      </div>
      <div>
        <label for="mgmtInventoryAfter">Inventoried After</label>
        <input id="mgmtInventoryAfter" type="date" value="${escapeHtml(filters.inventory_after)}">
      </div>
      <div>
        <label for="mgmtInventoryBefore">Inventoried Before</label>
        <input id="mgmtInventoryBefore" type="date" value="${escapeHtml(filters.inventory_before)}">
      </div>
      <div>
        <label for="mgmtAgeBucket">Age Bucket</label>
        <select id="mgmtAgeBucket">
          <option value="all"${filters.age_bucket === "all" ? " selected" : ""}>All Ages</option>
          <option value="never"${filters.age_bucket === "never" ? " selected" : ""}>Never</option>
          <option value="0_7_days"${filters.age_bucket === "0_7_days" ? " selected" : ""}>${escapeHtml(ageLabels["0_7_days"])}</option>
          <option value="8_30_days"${filters.age_bucket === "8_30_days" ? " selected" : ""}>${escapeHtml(ageLabels["8_30_days"])}</option>
          <option value="31_90_days"${filters.age_bucket === "31_90_days" ? " selected" : ""}>${escapeHtml(ageLabels["31_90_days"])}</option>
          <option value="over_90_days"${filters.age_bucket === "over_90_days" ? " selected" : ""}>${escapeHtml(ageLabels.over_90_days)}</option>
        </select>
      </div>
      <div>
        <label for="mgmtOlderThanDays">Older Than Days</label>
        <input id="mgmtOlderThanDays" type="number" min="1" step="1" value="${escapeHtml(filters.older_than_days)}">
      </div>
      <div>
        <label for="mgmtMinQty">Min Qty</label>
        <input id="mgmtMinQty" type="number" min="0" step="1" value="${escapeHtml(filters.min_qty)}">
      </div>
      <div>
        <label for="mgmtMaxQty">Max Qty</label>
        <input id="mgmtMaxQty" type="number" min="0" step="1" value="${escapeHtml(filters.max_qty)}">
      </div>
      <div>
        <label for="mgmtLowQtyThreshold">Low Qty Threshold</label>
        <input id="mgmtLowQtyThreshold" type="number" min="1" step="1" value="${escapeHtml(filters.low_qty_threshold)}">
      </div>
    </div>
    <div class="management-chips">
      <label class="management-chip"><input id="mgmtChipLowQty" type="checkbox"${filters.chips.low_qty ? " checked" : ""}> Low qty</label>
      <label class="management-chip"><input id="mgmtChipEmpty" type="checkbox"${filters.chips.empty_only ? " checked" : ""}> Empty only</label>
      <label class="management-chip"><input id="mgmtChipMixed" type="checkbox"${filters.chips.mixed_only ? " checked" : ""}> Mixed only</label>
      <label class="management-chip"><input id="mgmtChipHasPo" type="checkbox"${filters.chips.has_po ? " checked" : ""}> Has PO</label>
      <label class="management-chip"><input id="mgmtChipRack" type="checkbox"${filters.chips.rack_only ? " checked" : ""}> Rack only</label>
      <label class="management-chip"><input id="mgmtChipFloor" type="checkbox"${filters.chips.floor_only ? " checked" : ""}> Floor only</label>
      <label class="management-chip"><input id="mgmtChipNever" type="checkbox"${filters.chips.never_inventoried ? " checked" : ""}> Never inventoried</label>
      <span class="management-query-hints">Parsed terms: +${parsed.includes.length} / -${parsed.excludes.length}</span>
    </div>
    <div class="management-actions">
      <div>
        <label for="mgmtExportPath">Report Path</label>
        <input id="mgmtExportPath" type="text" value="${escapeHtml(state.management.export.path || managementDefaultExportPath(state.management.export.format))}">
      </div>
      <div>
        <label for="mgmtExportScope">Scope</label>
        <select id="mgmtExportScope">
          <option value="filtered"${state.management.export.scope === "filtered" ? " selected" : ""}>Filtered</option>
          <option value="full"${state.management.export.scope === "full" ? " selected" : ""}>Full</option>
        </select>
      </div>
      <div>
        <label for="mgmtExportFormat">Format</label>
        <select id="mgmtExportFormat">
          <option value="csv"${state.management.export.format === "csv" ? " selected" : ""}>CSV</option>
          <option value="xlsx"${state.management.export.format === "xlsx" ? " selected" : ""}>XLSX</option>
        </select>
      </div>
      <button id="mgmtApplyBtn" type="button">Apply Filters</button>
      <button id="mgmtExportBtn" type="button">Export</button>
      <button id="mgmtPrintBtn" type="button">Print Report</button>
    </div>
  `;
  wrap.appendChild(filterBlock);

  const tableWrap = document.createElement("div");
  tableWrap.className = "management-table-wrap";
  const rows = state.management.rows || [];
  if (!rows.length) {
    tableWrap.innerHTML = `<p class="hint" style="padding: 10px;">No rows match current filters.</p>`;
  } else {
    const body = rows
      .map(
        (row) => `
      <tr>
        <td>${escapeHtml(row.location_type)}</td>
        <td>${escapeHtml(row.area)}</td>
        <td>${escapeHtml(row.container_id)}</td>
        <td>${escapeHtml(row.bay_or_slot)}</td>
        <td>${escapeHtml(row.level)}</td>
        <td>${escapeHtml(row.location_code)}</td>
        <td>${escapeHtml(row.item_number)}</td>
        <td>${formatInteger(row.qty)}</td>
        <td>${escapeHtml(row.recorded_location)}</td>
        <td>${escapeHtml(row.po_number)}</td>
        <td>${escapeHtml(formatInventoryTimestamp(row.last_inventory_at))}</td>
        <td>${escapeHtml(inventoryAgeDisplay(row.inventory_age_days ?? inventoryAgeInfo(row.last_inventory_at).days))}</td>
        <td>${escapeHtml(row.last_inventory_source || "")}</td>
        <td>${row.is_mixed ? "Yes" : "No"}</td>
      </tr>`
      )
      .join("");
    tableWrap.innerHTML = `
      <table class="management-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Area</th>
            <th>Rack/Zone</th>
            <th>Bay/Slot</th>
            <th>Level</th>
            <th>Location</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Recorded</th>
            <th>PO</th>
            <th>Last Inventoried</th>
            <th>Age</th>
            <th>Source</th>
            <th>Mixed</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }
  wrap.appendChild(tableWrap);
  el.gridWrap.appendChild(wrap);
  if (window.WarehouseManageHooks?.afterManagementRender) {
    window.WarehouseManageHooks.afterManagementRender(tableWrap);
  }

  const applyFilters = async () => {
    state.management.filters = managementFiltersFromUi();
    state.management.parsedQuery = parseSmartQuery(state.management.filters.query);
    try {
      await loadManagementPreview();
      renderGrid();
    } catch (error) {
      setStatus(`Management preview failed: ${error.message}`);
    }
  };
  const resetFilters = () => {
    state.management.filters = {
      area: state.area,
      query: "",
      location_type: "all",
      container_id: "",
      po_number: "",
      recorded_location: "",
      inventory_source: "",
      inventory_before: "",
      inventory_after: "",
      age_bucket: "all",
      older_than_days: "",
      min_qty: "",
      max_qty: "",
      low_qty_threshold: 5,
      chips: {
        low_qty: false,
        empty_only: false,
        mixed_only: false,
        has_po: false,
        rack_only: false,
        floor_only: false,
        never_inventoried: false
      }
    };
    state.management.parsedQuery = parseSmartQuery("");
  };
  const bindChip = (id, key) => {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    node.addEventListener("change", () => {
      state.management.filters.chips[key] = !!node.checked;
    });
  };
  document.getElementById("mgmtApplyBtn")?.addEventListener("click", applyFilters);
  document.getElementById("mgmtQuery")?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await applyFilters();
    }
  });
  bindChip("mgmtChipLowQty", "low_qty");
  bindChip("mgmtChipEmpty", "empty_only");
  bindChip("mgmtChipMixed", "mixed_only");
  bindChip("mgmtChipHasPo", "has_po");
  bindChip("mgmtChipRack", "rack_only");
  bindChip("mgmtChipFloor", "floor_only");
  bindChip("mgmtChipNever", "never_inventoried");
  document.getElementById("mgmtType")?.addEventListener("change", () => {
    state.management.filters.location_type = document.getElementById("mgmtType")?.value || "all";
  });
  document.getElementById("mgmtExportScope")?.addEventListener("change", () => {
    state.management.export.scope = document.getElementById("mgmtExportScope")?.value || "filtered";
  });
  document.getElementById("mgmtExportFormat")?.addEventListener("change", () => {
    const formatNode = document.getElementById("mgmtExportFormat");
    state.management.export.format = formatNode?.value || "csv";
  });
  document.getElementById("mgmtExportBtn")?.addEventListener("click", async () => {
    const pathNode = document.getElementById("mgmtExportPath");
    const path = (pathNode?.value || "").trim() || managementDefaultExportPath(state.management.export.format);
    state.management.export.path = path;
    try {
      const response = await apiPost("/api/reports/export", {
        path,
        format: state.management.export.format,
        scope: state.management.export.scope,
        filters: {
          ...state.management.filters,
          parsed_query: state.management.parsedQuery
        }
      });
      setStatus(`Exported ${response.row_count || 0} rows to ${response.path}`);
    } catch (error) {
      setStatus(`Export failed: ${error.message}`);
    }
  });
  document.getElementById("mgmtPrintBtn")?.addEventListener("click", async () => {
    try {
      const printData = await apiPost("/api/reports/print-data", {
        scope: state.management.export.scope,
        filters: {
          ...state.management.filters,
          parsed_query: state.management.parsedQuery
        }
      });
      const popup = window.open("", "_blank");
      if (!popup) {
        setStatus("Pop-up blocked. Allow pop-ups to print.");
        return;
      }
      const rowsHtml = (printData.rows || [])
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.location_type)}</td>
            <td>${escapeHtml(row.area)}</td>
            <td>${escapeHtml(row.container_id)}</td>
            <td>${escapeHtml(row.bay_or_slot)}</td>
            <td>${escapeHtml(row.level)}</td>
            <td>${escapeHtml(row.location_code)}</td>
            <td>${escapeHtml(row.item_number)}</td>
            <td>${formatInteger(row.qty)}</td>
            <td>${escapeHtml(row.po_number)}</td>
          </tr>`
        )
        .join("");
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Management Report</title>
        <style>body{font-family:Segoe UI,Arial,sans-serif;padding:16px;}h1{margin:0 0 8px;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;}thead{display:table-header-group;}@media print{body{padding:0;}}</style>
      </head><body>
        <h1>Management Report</h1>
        <p>Generated: ${escapeHtml(new Date(printData.generated_at || Date.now()).toLocaleString())}</p>
        <p>Rows: ${formatInteger(printData.summary?.row_count || 0)} | Total Qty: ${formatInteger(printData.summary?.total_qty || 0)} | Unique Locations: ${formatInteger(printData.summary?.unique_locations || 0)}</p>
        <table><thead><tr><th>Type</th><th>Area</th><th>Rack/Zone</th><th>Bay/Slot</th><th>Level</th><th>Location</th><th>Item</th><th>Qty</th><th>PO</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      setStatus(`Print data failed: ${error.message}`);
    }
  });
  const queryNode = document.getElementById("mgmtQuery");
  queryNode?.addEventListener("input", () => {
    state.management.parsedQuery = parseSmartQuery(queryNode.value || "");
  });
  const maxNode = document.getElementById("mgmtChipRack");
  maxNode?.addEventListener("change", () => {
    if (maxNode.checked) {
      const floor = document.getElementById("mgmtChipFloor");
      if (floor) {
        floor.checked = false;
        state.management.filters.chips.floor_only = false;
      }
    }
  });
  const floorNode = document.getElementById("mgmtChipFloor");
  floorNode?.addEventListener("change", () => {
    if (floorNode.checked) {
      const rack = document.getElementById("mgmtChipRack");
      if (rack) {
        rack.checked = false;
        state.management.filters.chips.rack_only = false;
      }
    }
  });
  document.getElementById("mgmtQuery")?.addEventListener("dblclick", () => {
    resetFilters();
    renderGrid();
  });
}

function isInspectorVisible() {
  return SharedInspector.isInspectorVisible(state);
}

function closeInspector() {
  return SharedInspector.closeInspector(state, el);
}

function clampInspectorToViewport(left, top, width, height) {
  return SharedInspector.clampInspectorToViewport(left, top, width, height, clamp);
}

function syncInspectorFromSelection() {
  return SharedInspector.syncInspectorFromSelection(state, el);
}

function openInspectorNearSelection() {
  return SharedInspector.openInspectorNearSelection({ state, el, clamp });
}

function keepSelectedRackSlotInView(options = {}) {
  return SharedInspector.keepSelectedRackSlotInView({ state, el, options });
}

function isRackPanInteractiveTarget(target) {
  if (state.rackBeamEdit) {
    return true;
  }
  return SharedRackPan.isRackPanInteractiveTarget(target);
}

function startRackPan(event) {
  return SharedRackPan.startRackPan({
    state,
    gridWrap: el.gridWrap,
    event,
    isInteractiveTarget: isRackPanInteractiveTarget
  });
}

function moveRackPan(event) {
  return SharedRackPan.moveRackPan({
    state,
    gridWrap: el.gridWrap,
    event,
    threshold: 5
  });
}

function endRackPan() {
  return SharedRackPan.endRackPan({ state, gridWrap: el.gridWrap });
}

function setMixedVisible(isVisible) {
  return SharedDetailPanel.setMixedVisible(el, isVisible);
}

function clearMixedRows() {
  return SharedDetailPanel.clearMixedRows(el);
}

function addMixedRow(itemNumber = "", qty = 0) {
  return SharedDetailPanel.addMixedRow(el, itemNumber, qty);
}

function collectMixedRows() {
  return SharedDetailPanel.collectMixedRows(el);
}

function isSelectedOverviewPallet() {
  return (
    effectiveViewMode() === "overview" &&
    state.selectedCell &&
    state.selectedCell.location_type === "movable" &&
    configMovableItemKind(state.selectedCell) === "pallet"
  );
}

function currentSelectionSupportsMixed() {
  const mode = effectiveViewMode();
  return mode === "rack" || mode === "floor" || mode === "slotted" || isSelectedOverviewPallet();
}

function selectedSlottedSlotCanPullOut() {
  if (inAuditWorkspace() || effectiveViewMode() !== "slotted" || !state.selectedCell) {
    return false;
  }
  if (String(state.selectedCell.location_type || "") !== "slotted_pallet") {
    return false;
  }
  if (Array.isArray(state.selectedCell.mixed_items) && state.selectedCell.mixed_items.length) {
    return true;
  }
  if (String(state.selectedCell.item_number || "").trim()) {
    return true;
  }
  if (Number(state.selectedCell.qty || 0) > 0) {
    return true;
  }
  if (String(state.selectedCell.po_number || "").trim()) {
    return true;
  }
  return false;
}

function pendingRackItem() {
  const pending = state.rackPendingAdd;
  if (!pending) {
    return null;
  }
  return findMovableItem(pending.item_id) || state.movableItems.find((entry) => entry.id === pending.item_id) || null;
}

function setDetailInputsDisabled(disabled) {
  [
    el.itemInput,
    el.qtyInput,
    el.recordedInput,
    el.poInput,
    el.mixedToggle,
    el.addMixedRowBtn,
    el.auditNotesInput
  ].forEach((node) => {
    if (node) {
      node.disabled = !!disabled;
    }
  });
}

function syncRackPendingAddDetailPanel() {
  const pending = state.rackPendingAdd;
  if (state.viewMode !== "rack" || !pending) {
    setDetailInputsDisabled(false);
    if (el.saveBtn) {
      el.saveBtn.disabled = false;
      el.saveBtn.hidden = false;
    }
    return;
  }
  const item = pendingRackItem();
  const selectedIsConfigured = !!state.selectedCell && !state.selectedCell.is_virtual;
  const selectedIsOccupied = selectedIsConfigured && !state.selectedCell.is_empty;
  const sourceMixedItems = Array.isArray(item?.mixed_items) ? item.mixed_items : [];
  const targetMixedItems = Array.isArray(state.selectedCell?.mixed_items) ? state.selectedCell.mixed_items : [];
  const detailSource = selectedIsConfigured ? state.selectedCell : item;
  const targetLocation = selectedIsConfigured ? (state.selectedCell?.location_code || "-") : "-";
  el.detailTitle.textContent = "Add Pallet To Rack";
  el.locationCode.textContent = targetLocation;
  el.itemInput.value = String(detailSource?.item_number || "").trim();
  el.qtyInput.value = String(Number(detailSource?.qty || 0));
  el.recordedInput.value = String(detailSource?.recorded_location || "").trim();
  el.poInput.value = String(detailSource?.po_number || "").trim();
  if (el.lastInventoriedOutput) {
    el.lastInventoriedOutput.textContent = formatInventoryTimestamp(detailSource?.last_inventory_at);
  }
  el.mixedToggle.checked = selectedIsConfigured ? !!state.selectedCell?.is_mixed : !!item?.is_mixed;
  clearMixedRows();
  const mixedRows = selectedIsConfigured ? targetMixedItems : sourceMixedItems;
  if (mixedRows.length) {
    mixedRows.forEach((entry) => addMixedRow(entry.item_number || "", entry.qty || 0));
  }
  setMixedVisible(!!el.mixedToggle.checked);
  setDetailInputsDisabled(true);
  if (el.saveBtn) {
    el.saveBtn.hidden = false;
    el.saveBtn.textContent = selectedIsOccupied ? "Merge Into Bay" : "Place Pallet";
    el.saveBtn.disabled = !selectedIsConfigured;
  }
  if (!state.selectedCell) {
    setStatus(`Adding pallet ${pending.item_label} to rack ${pending.row}. Click an empty bay to place it or an occupied bay to merge it.`);
  } else if (state.selectedCell.is_virtual) {
    setStatus("That slot is not configured. Choose a bay with a full location code.");
  } else if (selectedIsOccupied) {
    setStatus(`Ready to merge pallet ${pending.item_label} into ${state.selectedCell.location_code}. Review the destination bay and click Merge Into Bay.`);
  } else {
    setStatus(`Adding pallet ${pending.item_label} to ${state.selectedCell.location_code}.`);
  }
}

function setAuditDetailRowsVisible(visible, blind = false) {
  el.auditSessionRow?.classList.toggle("hidden", !visible);
  el.auditResultRow?.classList.toggle("hidden", !visible);
  el.auditNotesRow?.classList.toggle("hidden", !visible);
  el.auditExpectedItemRow?.classList.toggle("hidden", !visible || blind);
  el.auditExpectedQtyRow?.classList.toggle("hidden", !visible || blind);
}

function syncAuditDetailPanel() {
  if (!inAuditWorkspace()) {
    setAuditDetailRowsVisible(false);
    return;
  }
  const session = state.audit.session;
  const entry = state.selectedCell ? auditEntryForLocation(state.selectedCell.location_code || state.selectedCell.id) : null;
  const status = auditStatusFromEntry(entry);
  const blind = session?.mode === "blind";
  setAuditDetailRowsVisible(true, blind);
  if (el.auditSessionOutput) {
    el.auditSessionOutput.textContent = session ? `${session.name} (${session.mode === "blind" ? "Blind" : "Assisted"})` : "No active audit";
  }
  if (el.auditResultOutput) {
    el.auditResultOutput.textContent = status.replaceAll("_", " ");
  }
  if (el.auditExpectedItemOutput || el.auditExpectedQtyOutput) {
    const expected = auditExpectedDisplay(state.selectedCell);
    if (el.auditExpectedItemOutput) {
      el.auditExpectedItemOutput.textContent = expected.item;
    }
    if (el.auditExpectedQtyOutput) {
      el.auditExpectedQtyOutput.textContent = expected.qty;
    }
  }
  if (!state.selectedCell) {
    el.detailTitle.textContent = "Audit Details";
    el.locationCode.textContent = "-";
    el.itemInput.value = "";
    el.qtyInput.value = "0";
    el.recordedInput.value = "";
    el.poInput.value = "";
    if (el.auditNotesInput) {
      el.auditNotesInput.value = "";
    }
    if (el.lastInventoriedOutput) {
      el.lastInventoriedOutput.textContent = "Never";
    }
    el.mixedToggle.checked = false;
    clearMixedRows();
    setMixedVisible(false);
    setDetailInputsDisabled(true);
    el.recordedInput.disabled = true;
    el.poInput.disabled = true;
    setStatus(session ? "Select a location or pallet to record a count." : "Start an audit session to begin counting.");
    return;
  }
  const countedMixed = Array.isArray(entry?.counted_mixed_items) ? entry.counted_mixed_items : [];
  const countedIsMixed = countedMixed.length > 0;
  el.detailTitle.textContent = "Audit Count";
  el.locationCode.textContent = state.selectedCell.location_code || state.selectedCell.id || "-";
  el.itemInput.value = countedIsMixed ? "" : String(entry?.counted_item_number || (blind ? "" : state.selectedCell.item_number || "")).trim();
  el.qtyInput.value = entry && entry.review_status !== "recount_requested" ? String(entry.counted_qty) : "";
  el.qtyInput.placeholder = "Enter observed count (0 if empty)";
  el.recordedInput.value = "";
  el.poInput.value = "";
  if (el.auditNotesInput) {
    el.auditNotesInput.value = String(entry?.notes || "");
  }
  if (el.lastInventoriedOutput) {
    el.lastInventoriedOutput.textContent = formatInventoryTimestamp(state.selectedCell.last_inventory_at);
  }
  el.mixedToggle.checked = countedIsMixed;
  clearMixedRows();
  if (countedIsMixed) {
    countedMixed.forEach((row) => addMixedRow(row.item_number || "", row.qty || 0));
  }
  syncMixedLabels();
  setMixedVisible(el.mixedToggle.checked);
  setDetailInputsDisabled(!session);
  el.recordedInput.disabled = true;
  el.poInput.disabled = true;
  if (!session) {
    setStatus("Start an audit session to record counts.");
  } else if (blind) {
    setStatus(`Blind count active for ${el.locationCode.textContent}. Enter observed values and record the count.`);
  } else {
    setStatus(`Assisted audit for ${el.locationCode.textContent}. Review the expected values and record the observed count.`);
  }
}

function syncDetailActionButtons() {
  if (!el.saveBtn || !el.pullOutBtn) {
    return;
  }
  const movableSelectedInOverview =
    state.viewMode === "overview" &&
    !inAuditWorkspace() &&
    state.selectedCell &&
    (state.selectedCell.location_type === "movable" || !!state.selectedCell.id);
  const selectedStackInOverview =
    movableSelectedInOverview &&
    configMovableItemKind(state.selectedCell) === "pallet_stack";
  if (el.overviewActionPanel) {
    const focusedArea = String(state.overview.focusedArea || "").trim();
    const showOverviewActions = state.viewMode === "overview" && !inAuditWorkspace() && !!focusedArea && !state.selectedCell;
    const showStackActions = !!selectedStackInOverview;
    el.overviewActionPanel.classList.toggle("hidden", !showOverviewActions && !showStackActions);
    if (showStackActions) {
      const stack = state.selectedCell;
      const stackLabel = String(stack.label || stack.id || "Pallet Stack").trim();
      el.detailTitle.textContent = `${stackLabel} Actions`;
      el.overviewActionPanel.innerHTML = `
        <h3>${escapeHtml(stackLabel)}</h3>
        <p>Pull pallets from this stack into ${escapeHtml(stack.area || focusedArea || "this area")}.</p>
        <div class="overview-action-buttons">
          <button id="detailPullStackPalletBtn" type="button">Pull 1 Pallet</button>
        </div>
        <div class="stack-batch-row">
          <label for="detailStackBatchInput">Batch size</label>
          <input id="detailStackBatchInput" type="text" value="${escapeHtml(stack.stack_size || "8x2")}" placeholder="8x2 or 16">
          <button id="detailCreateStackBatchBtn" type="button">Create Batch</button>
        </div>
        <p class="hint">Use dimensions like 8x2 to create 16 pallets laid out near the stack.</p>
      `;
      el.detailForm.classList.remove("hidden");
      document.getElementById("detailPullStackPalletBtn")?.addEventListener("click", async () => {
        await createPalletsFromStack(stack, "1");
      });
      document.getElementById("detailCreateStackBatchBtn")?.addEventListener("click", async () => {
        const size = String(document.getElementById("detailStackBatchInput")?.value || "").trim();
        await createPalletsFromStack(stack, size);
      });
    } else if (showOverviewActions) {
      el.detailTitle.textContent = `${focusedArea} Actions`;
      const adminBtns = isAdmin ? `
          <button id="detailOpenOverlayBtn" type="button">Open Overlay Editor</button>` : "";
      el.overviewActionPanel.innerHTML = `
        <h3>${escapeHtml(focusedArea)}</h3>
        <p>Create and place pallets and pallet stacks in this area.</p>
        <div class="overview-action-buttons">
          <button id="detailAddPalletBtn" type="button">Add Pallet</button>
          <button id="detailAddStackBtn" type="button">Add Pallet Stack</button>${adminBtns}
          <button id="detailReturnOverviewBtn" type="button">Return to Overview</button>
        </div>
        <div id="stackSizePicker" class="stack-size-picker hidden">
          <label>Select stack size:</label>
          <button type="button" class="stack-size-opt" data-size="4x4">4 × 4</button>
          <button type="button" class="stack-size-opt" data-size="4x8">4 × 8</button>
          <button type="button" class="stack-size-cancel">Cancel</button>
        </div>
      `;
      el.detailForm.classList.add("hidden");
      document.getElementById("detailAddPalletBtn")?.addEventListener("click", async () => {
        try {
          await openConfigPlacementFromOverview("pallet");
        } catch (error) {
          setStatus(error.message);
        }
      });
      document.getElementById("detailAddStackBtn")?.addEventListener("click", () => {
        const picker = document.getElementById("stackSizePicker");
        if (picker) picker.classList.toggle("hidden");
      });
      document.querySelectorAll(".stack-size-opt").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const size = btn.dataset.size;
          document.getElementById("stackSizePicker")?.classList.add("hidden");
          try {
            await openConfigPlacementFromOverview("pallet_stack", size);
          } catch (error) {
            setStatus(error.message);
          }
        });
      });
      document.querySelector(".stack-size-cancel")?.addEventListener("click", () => {
        document.getElementById("stackSizePicker")?.classList.add("hidden");
      });
      document.getElementById("detailOpenOverlayBtn")?.addEventListener("click", async () => {
        try {
          await openConfigEditorFromOverview();
        } catch (error) {
          setStatus(error.message);
        }
      });
      document.getElementById("detailReturnOverviewBtn")?.addEventListener("click", async () => {
        el.overviewBackBtn?.click();
      });
    } else {
      el.overviewActionPanel.innerHTML = "";
      el.detailForm.classList.remove("hidden");
    }
  }
  if (el.moveAreaBtn) {
    el.moveAreaBtn.classList.toggle("hidden", !isAdmin || !movableSelectedInOverview);
    el.moveAreaBtn.onclick = movableSelectedInOverview
      ? async () => {
          try {
            await startOverviewAreaTransfer(state.selectedCell);
          } catch (error) {
            setStatus(`Move failed: ${error.message}`);
          }
        }
      : null;
  }
  if (inAuditWorkspace()) {
    const active = !!state.audit.session;
    const scope = auditScopeForCurrentView();
    const canCloseAudit = isAdmin && !!state.audit.capabilities?.can_close_session;
    const canCompleteScope = isAdmin && !!state.audit.capabilities?.can_complete_scope;
    el.pullOutBtn.classList.add("hidden");
    el.saveBtn.hidden = !active || !state.selectedCell;
    el.saveBtn.disabled = !active || !state.selectedCell;
    el.saveBtn.textContent = "Record Count";
    el.auditCloseBtn?.classList.toggle("hidden", !active || !canCloseAudit);
    document.getElementById("auditCancelBtn")?.classList.toggle("hidden", !active || !canCloseAudit);
    el.auditCompleteScopeBtn?.classList.toggle("hidden", !active || !scope || currentAuditSubview() === "overview" || !canCompleteScope);
    if (el.auditSessionPill) {
      el.auditSessionPill.classList.toggle("hidden", false);
    }
    syncAuditDetailPanel();
    return;
  }
  setAuditDetailRowsVisible(false);
  el.recordedInput.disabled = false;
  el.poInput.disabled = false;
  if (state.rackPendingAdd) {
    el.pullOutBtn.classList.add("hidden");
    syncRackPendingAddDetailPanel();
    return;
  }
  if (state.viewMode === "rack") {
    el.saveBtn.textContent = "Save Bay";
  } else if (state.viewMode === "floor") {
    el.saveBtn.textContent = "Save Slot";
  } else if (state.viewMode === "slotted") {
    el.saveBtn.textContent = "Save Slot";
  } else {
    el.saveBtn.textContent = "Save Item";
  }
  el.pullOutBtn.classList.toggle("hidden", !selectedSlottedSlotCanPullOut());
  el.auditCloseBtn?.classList.add("hidden");
  document.getElementById("auditCancelBtn")?.classList.add("hidden");
  el.auditCompleteScopeBtn?.classList.add("hidden");
  syncRackPendingAddDetailPanel();
}

function syncMixedLabels() {
  const label = (isSelectedOverviewPallet() || state.viewMode === "slotted" || !!state.rackPendingAdd) ? "Mixed Pallet" : "Mixed Bay";
  document.querySelectorAll('label[for="mixedToggle"]').forEach((node) => {
    node.textContent = label;
  });
  document.querySelectorAll('label[for="fiMixedToggle"]').forEach((node) => {
    node.textContent = label;
  });
}

function renderAreas(areas) {
  el.areaSelect.innerHTML = "";
  const visibleAreas = (areas || []).map((name) => String(name || "").trim()).filter(Boolean);
  const options = ["All Areas", ...visibleAreas];
  options.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    el.areaSelect.appendChild(option);
  });
  if (!options.includes(state.area)) {
    state.area = options[0] || "All Areas";
  }
  el.areaSelect.value = state.area;
}

function renderRacks(rows) {
  state.racks = rows;
  el.rackSelect.innerHTML = "";
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.name;
    option.textContent = row.name;
    el.rackSelect.appendChild(option);
  });

  if (!rows.length) {
    state.selectedRack = "";
    state.rackModel = null;
    return;
  }
  if (!rows.some((row) => row.name === state.selectedRack)) {
    state.selectedRack = rows[0].name;
  }
  el.rackSelect.value = state.selectedRack;
}

function renderZones(zones) {
  state.zones = Array.isArray(zones) ? zones.filter((zone) => !isDeprecatedPalletZoneId(zone?.zone_id)) : [];
  el.zoneSelect.innerHTML = "";
  state.zones.forEach((zone) => {
    const option = document.createElement("option");
    option.value = zone.zone_id;
    option.textContent = zone.zone_id;
    el.zoneSelect.appendChild(option);
  });
  if (!state.zones.length) {
    state.selectedZone = "";
    state.zoneModel = null;
    return;
  }
  if (!state.zones.some((zone) => zone.zone_id === state.selectedZone)) {
    state.selectedZone = state.zones[0].zone_id;
  }
  el.zoneSelect.value = state.selectedZone;
}

function renderNullSpaces(nullSpaces) {
  state.nullSpaces = Array.isArray(nullSpaces) ? nullSpaces : [];
}

function renderSlottedPallets(slottedPallets) {
  state.slottedPallets = Array.isArray(slottedPallets) ? slottedPallets : [];
  el.slottedSelect.innerHTML = "";
  state.slottedPallets.forEach((pallet) => {
    const option = document.createElement("option");
    option.value = pallet.group_id;
    option.textContent = pallet.label || pallet.group_id;
    el.slottedSelect.appendChild(option);
  });
  if (!state.slottedPallets.length) {
    state.selectedSlottedPallet = "";
    state.slottedModel = null;
    return;
  }
  if (!state.slottedPallets.some((pallet) => pallet.group_id === state.selectedSlottedPallet)) {
    state.selectedSlottedPallet = state.slottedPallets[0].group_id;
  }
  el.slottedSelect.value = state.selectedSlottedPallet;
}

function isDeprecatedPalletZoneId(zoneId) {
  const normalized = String(zoneId || "").trim().toUpperCase();
  return normalized.startsWith("PAL-") || normalized.includes("-PAL-");
}

function renderOverviewItems(movableItems) {
  state.movableItems = Array.isArray(movableItems) ? movableItems : [];
  state.visualAge.movable = {};
  updateVisualAgeForMovableItems(state.movableItems);
  if (state.selectedCell?.location_type === "movable" || state.selectedCell?.id) {
    const selectedId = String(state.selectedCell?.id || "").trim();
    if (selectedId) {
      const refreshed = findMovableItem(selectedId);
      if (refreshed) {
        state.selectedCell = refreshed;
        state.selectedCellKey = movableItemKey(selectedId);
      } else if (state.viewMode === "overview") {
        selectCell(null);
      }
    }
  }
}

function findCell(bay, level) {
  if (!state.rackModel) {
    return null;
  }
  return state.rackModel.cells.find((cell) => cell.bay === bay && cell.level === level) || null;
}

function findFloorCell(slot) {
  if (!state.zoneModel) {
    return null;
  }
  return state.zoneModel.cells.find((cell) => cell.slot === slot) || null;
}

function findSlottedCell(slot) {
  if (!state.slottedModel) {
    return null;
  }
  return state.slottedModel.cells.find((cell) => cell.slot === slot) || null;
}

function findMovableItem(itemId) {
  return state.movableItems.find((item) => item.id === itemId) || null;
}

function configClearDropTargets() {
  document.querySelectorAll(".config-entity.drop-target,.config-entity.drop-blocked").forEach((node) => {
    node.classList.remove("drop-target", "drop-blocked");
  });
  state.config.drag.dropTargetId = "";
  state.config.drag.dropTargetType = "";
}

function slottedHasEmptySlot() {
  return !!(state.slottedModel?.cells || []).some((cell) => cell.is_empty);
}

function rackHasEmptySlot(rowName) {
  const row = state.racks.find((entry) => entry.name === rowName);
  return Number(row?.counts?.empty || 0) > 0;
}

async function startSlottedPendingAdd(groupId, itemId) {
  const pallet = state.slottedPallets.find((entry) => entry.group_id === groupId) || null;
  const item = findMovableItem(itemId) || state.movableItems.find((entry) => entry.id === itemId) || null;
  if (!pallet || !item) {
    throw new Error("Unable to start slotted pallet add flow.");
  }
  if (pallet.area && pallet.area !== state.area) {
    state.area = pallet.area;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "slotted";
  el.viewMode.value = "slotted";
  state.selectedSlottedPallet = pallet.group_id;
  el.slottedSelect.value = pallet.group_id;
  state.slottedPendingAdd = {
    group_id: pallet.group_id,
    item_id: item.id,
    item_label: item.label || item.id
  };
  await loadSlottedModel();
  selectCell(null);
  syncControlVisibility();
  renderGrid();
  setStatus(`Adding pallet ${item.label || item.id}. Select an empty slot${slottedHasEmptySlot() ? "." : " or click any slot to create a new one."}`);
}

async function completeSlottedPendingAdd(slot) {
  const pending = state.slottedPendingAdd;
  if (!pending || !state.slottedModel) {
    return;
  }
  const hasEmpty = slottedHasEmptySlot();
  const selectedSlot = typeof slot === "number" ? findSlottedCell(slot) : null;
  if (hasEmpty && selectedSlot && !selectedSlot.is_empty) {
    setStatus("Select an empty slot to add the pallet.");
    return;
  }
  const payload = {
    group_id: pending.group_id,
    item_id: pending.item_id
  };
  if (hasEmpty && selectedSlot) {
    payload.slot = selectedSlot.slot;
  }
  const response = await apiPost("/api/config/slotted-pallet/add-item", payload);
  state.slottedPendingAdd = null;
  state.slottedModel = response.slotted_pallet || state.slottedModel;
  renderSlottedPallets(response.slotted_pallets || state.slottedPallets);
  renderOverviewItems(response.movable_items || state.movableItems);
  updateVisualAgeForSlottedModel(state.slottedModel);
  const updatedCell = findSlottedCell(response.slot);
  selectCell(updatedCell);
  syncControlVisibility();
  renderGrid();
  setStatus(`Added pallet to slot ${response.slot}.`);
}

async function startRackPendingAdd(rowName, itemId, areaName = "") {
  const item = findMovableItem(itemId) || state.movableItems.find((entry) => entry.id === itemId) || null;
  if (!item) {
    throw new Error("Unable to start rack add flow.");
  }
  const nextArea = String(areaName || state.area || "").trim();
  if (nextArea && nextArea !== state.area) {
    state.area = nextArea;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "rack";
  el.viewMode.value = "rack";
  state.selectedRack = rowName;
  el.rackSelect.value = rowName;
  state.rackPendingAdd = {
    row: rowName,
    item_id: item.id,
    item_label: item.label || item.id
  };
  await loadRackModel();
  selectCell(null);
  syncControlVisibility();
  renderGrid();
  syncRackPendingAddDetailPanel();
}

async function completeRackPendingAdd(bay, level) {
  const pending = state.rackPendingAdd;
  if (!pending || !state.rackModel) {
    return;
  }
  const cell = findCell(bay, level);
  if (!cell || !cell.is_empty) {
    setStatus("Select an empty bay to add the pallet.");
    return;
  }
  const response = await apiPost("/api/config/rack/add-item", {
    row: pending.row,
    bay,
    level,
    item_id: pending.item_id
  });
  state.rackPendingAdd = null;
  state.rackModel = response.rack || state.rackModel;
  renderOverviewItems(response.movable_items || state.movableItems);
  updateVisualAgeForRackModel(state.rackModel);
  const updatedCell = findCell(bay, level);
  selectCell(updatedCell);
  syncControlVisibility();
  renderGrid();
  openInspectorNearSelection();
  setStatus(`Added pallet to ${pending.row} bay ${bay} level ${level}.`);
}

async function cancelRackPendingAdd(message = "Pallet placement canceled.", options = {}) {
  if (!state.rackPendingAdd) {
    return false;
  }
  state.rackPendingAdd = null;
  if (options.reloadLayout) {
    await loadAreasAndRacks();
  }
  if (options.reloadRack && state.selectedRack) {
    await loadRackModel();
  }
  selectCell(null);
  syncControlVisibility();
  if (options.render !== false) {
    renderGrid();
  }
  setStatus(message);
  return true;
}

function supportAfterSet(row, bays) {
  return SharedGeometry.supportSet(row, bays);
}

function rackLevelPostVisibility(bays, supports, levelBays) {
  return SharedGeometry.postVisibility(bays, supports, levelBays);
}

async function loadConfigModel() {
  try {
    const previousSelection = { ...state.config.selection };
    const previousFocusedArea = String(state.config.focusedArea || "");
    const data = await apiGet("/api/config");
    state.config.areas = Array.isArray(data.areas) ? data.areas : [];
    state.config.rows = Array.isArray(data.rows) ? data.rows : [];
    state.config.zones = Array.isArray(data.zones) ? data.zones.filter((zone) => !isDeprecatedPalletZoneId(zone?.zone_id)) : [];
    state.config.slotted_pallets = Array.isArray(data.slotted_pallets) ? data.slotted_pallets : [];
    state.config.null_spaces = Array.isArray(data.null_spaces) ? data.null_spaces : [];
    state.config.movable_items = Array.isArray(data.movable_items) ? data.movable_items : [];
    state.config.layout = data.layout || {};
    state.config.current_path = String(data.current_path || "");
    state.config.dirty = false;
    if (previousSelection.type && previousSelection.id) {
      const stillExists =
        (previousSelection.type === "area" && configAreaNames().includes(previousSelection.id)) ||
        (previousSelection.type === "row" && state.config.rows.some((r) => r.name === previousSelection.id)) ||
        (previousSelection.type === "zone" && state.config.zones.some((z) => z.zone_id === previousSelection.id)) ||
        (previousSelection.type === "slotted_pallet" && state.config.slotted_pallets.some((p) => p.group_id === previousSelection.id)) ||
        (previousSelection.type === "movable_item" && state.config.movable_items.some((item) => item.id === previousSelection.id)) ||
        (previousSelection.type === "null_space" && state.config.null_spaces.some((s) => s.space_id === previousSelection.id));
      state.config.selection = stillExists ? previousSelection : { type: "", id: "" };
    } else {
      state.config.selection = { type: "", id: "" };
    }
    state.config.focusedArea = configAreaNames().includes(previousFocusedArea) ? previousFocusedArea : "";
  } catch (_error) {
    state.config.areas = [];
    state.config.rows = [];
    state.config.zones = [];
    state.config.slotted_pallets = [];
    state.config.null_spaces = [];
    state.config.movable_items = [];
    state.config.layout = {};
    state.config.current_path = "";
    state.config.selection = { type: "", id: "" };
    state.config.dirty = false;
    state.config.focusedArea = "";
  }
}

async function refreshAfterConfigChange(message) {
  await loadConfigModel();
  await loadAreasAndRacks();
  await loadRackModel();
  await loadZoneModel();
  await loadSlottedModel();
  if (state.viewMode === "config") {
    renderGrid();
  }
  setStatus(message);
}

function nullSpaceRect(space) {
  return SharedGeometry.entityRect("null_space", space);
}

function movableItemRect(item) {
  return SharedGeometry.entityRect("movable_item", item);
}

function slottedPalletRect(item) {
  return SharedGeometry.entityRect("slotted_pallet", item);
}

function configEntityRect(type, entity) {
  if (!entity) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  if (type === "row") {
    return rowRect(entity);
  }
  if (type === "zone") {
    return zoneRect(entity);
  }
  if (type === "slotted_pallet") {
    return slottedPalletRect(entity);
  }
  if (type === "movable_item") {
    return movableItemRect(entity);
  }
  return nullSpaceRect(entity);
}

function configAreaOverviewMap() {
  const raw = state.config.layout?.area_overview;
  return raw && typeof raw === "object" ? raw : {};
}

function configAreaNames() {
  const names = new Set(state.config.areas || []);
  state.config.rows.forEach((row) => {
    const areaName = String(row.area || "").trim();
    if (areaName) {
      names.add(areaName);
    }
  });
  state.config.zones.forEach((zone) => {
    const areaName = String(zone.area || "").trim();
    if (areaName) {
      names.add(areaName);
    }
  });
  state.config.null_spaces.forEach((space) => {
    const areaName = String(space.area || "").trim();
    if (areaName) {
      names.add(areaName);
    }
  });
  const visibleArea = String(state.config.focusedArea || "").trim() || (state.area === "All Areas" ? "" : state.area);
  return Array.from(names).filter((name) => !visibleArea || name === visibleArea);
}

function configAreaBoxes() {
  const areaOverviewMap = configAreaOverviewMap();
  const padding = 18;
  return configAreaNames().map((areaName, index) => {
    const entry = areaOverviewMap[areaName] || {};
    const rects = [];
    state.config.rows
      .filter((row) => String(row.area || "").trim() === areaName)
      .forEach((row) => rects.push(configEntityRect("row", row)));
    state.config.zones
      .filter((zone) => String(zone.area || "").trim() === areaName)
      .forEach((zone) => rects.push(configEntityRect("zone", zone)));
    state.config.null_spaces
      .filter((space) => String(space.area || "").trim() === areaName)
      .forEach((space) => rects.push(configEntityRect("null_space", space)));
    if (rects.length) {
      const minX = Math.min(...rects.map((rect) => rect.x));
      const minY = Math.min(...rects.map((rect) => rect.y));
      const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
      const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
      return {
        name: areaName,
        x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (minX - padding),
        y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (minY - padding - 22),
        width: Math.max(120, Number(entry.width || (maxX - minX + padding * 2))),
        height: Math.max(100, Number(entry.height || (maxY - minY + padding * 2 + 22)))
      };
    }
    return {
      name: areaName,
      x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (40 + (index % 3) * 320),
      y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (40 + Math.floor(index / 3) * 240),
      width: Math.max(120, Number(entry.width || 260)),
      height: Math.max(100, Number(entry.height || 180))
    };
  });
}

function configAreaBoxByName(areaName) {
  return configAreaBoxes().find((box) => box.name === areaName) || null;
}

async function clearConfigAreaBox(areaName) {
  const currentMap = configAreaOverviewMap();
  const nextAreaOverview = { ...currentMap };
  delete nextAreaOverview[areaName];
  const response = await apiPost("/api/config/layout", {
    layout: {
      area_overview: nextAreaOverview
    }
  });
  state.layout = { ...(state.layout || {}), ...(response.layout || {}), area_overview: nextAreaOverview };
  state.config.layout = { ...(state.config.layout || {}), ...(response.layout || {}), area_overview: nextAreaOverview };
}

function configGetEntity(type, id) {
  if (type === "area") {
    return configAreaBoxByName(id);
  }
  if (type === "row") {
    return state.config.rows.find((r) => r.name === id) || null;
  }
  if (type === "zone") {
    return state.config.zones.find((z) => z.zone_id === id) || null;
  }
  if (type === "slotted_pallet") {
    return state.config.slotted_pallets.find((p) => p.group_id === id) || null;
  }
  if (type === "null_space") {
    return state.config.null_spaces.find((s) => s.space_id === id) || null;
  }
  if (type === "movable_item") {
    return state.config.movable_items.find((item) => item.id === id) || null;
  }
  return null;
}

function configSelectionKey(type, id) {
  if (!type || !id) {
    return "";
  }
  return `${type}:${id}`;
}

function configIsFixedEntityType(type) {
  return type === "row" || type === "zone" || type === "null_space" || type === "area";
}

function configIsDragLocked(type) {
  if (!configIsFixedEntityType(type)) {
    return false;
  }
  if (type === "area") {
    return false;
  }
  return !state.config.layoutUnlocked;
}

function configVisibleAreaName() {
  const focusedArea = String(state.config.focusedArea || "").trim();
  if (focusedArea) {
    return focusedArea;
  }
  return state.area === "All Areas" ? "" : String(state.area || "").trim();
}

function configVisibleRows() {
  const visibleArea = configVisibleAreaName();
  return state.config.rows.filter((row) => !visibleArea || String(row.area || "").trim() === visibleArea);
}

function configVisibleZones() {
  const visibleArea = configVisibleAreaName();
  return state.config.zones.filter((zone) => !visibleArea || String(zone.area || "").trim() === visibleArea);
}

function configVisibleNullSpaces() {
  const visibleArea = configVisibleAreaName();
  return state.config.null_spaces.filter((space) => !visibleArea || String(space.area || "").trim() === visibleArea);
}

function configVisibleSlottedPallets() {
  const visibleArea = configVisibleAreaName();
  return state.config.slotted_pallets.filter((pallet) => !visibleArea || String(pallet.area || "").trim() === visibleArea);
}

function configVisibleMovableItems() {
  const visibleArea = configVisibleAreaName();
  return state.config.movable_items.filter((item) => !visibleArea || String(item.area || "").trim() === visibleArea);
}

function configSetSelection(type, id, options = {}) {
  const currentKey = configSelectionKey(state.config.selection.type, state.config.selection.id);
  const nextKey = configSelectionKey(type, id);
  if (currentKey === nextKey) {
    return true;
  }
  if (!options.force && state.config.dirty) {
    const ok = window.confirm("You have unsaved inspector edits. Discard and change selection?");
    if (!ok) {
      return false;
    }
  }
  state.config.selection = { type: type || "", id: id || "" };
  state.config.dirty = false;
  return true;
}

function configApplyTransform(canvas) {
  canvas.style.transform = `translate(${state.config.viewport.panX}px, ${state.config.viewport.panY}px) scale(${state.config.viewport.zoom})`;
}

function configBounds() {
  const rects = [];
  const inAreaDetail = Boolean(configVisibleAreaName());
  configAreaBoxes().forEach((box) => rects.push({ x: box.x, y: box.y, width: box.width, height: box.height }));
  if (inAreaDetail) {
    configVisibleRows().forEach((row) => rects.push(configEntityRect("row", row)));
    configVisibleZones().forEach((zone) => rects.push(configEntityRect("zone", zone)));
    configVisibleSlottedPallets().forEach((pallet) => rects.push(configEntityRect("slotted_pallet", pallet)));
    configVisibleNullSpaces().forEach((space) => rects.push(configEntityRect("null_space", space)));
    configVisibleMovableItems().forEach((item) => rects.push(configEntityRect("movable_item", item)));
  }
  if (!rects.length) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  rects.forEach((rect) => {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function fitConfigViewport(viewport, canvas) {
  const bounds = configBounds();
  if (!bounds) {
    return;
  }
  const margin = 24;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const zx = (vw - margin * 2) / bounds.width;
  const zy = (vh - margin * 2) / bounds.height;
  state.config.viewport.zoom = clamp(Math.min(zx, zy), CONFIG_MIN_ZOOM, CONFIG_MAX_ZOOM);
  state.config.viewport.panX = margin - bounds.minX * state.config.viewport.zoom;
  state.config.viewport.panY = margin - bounds.minY * state.config.viewport.zoom;
  configApplyTransform(canvas);
}

function configWorldFromClient(viewport, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left - state.config.viewport.panX) / state.config.viewport.zoom),
    y: Math.round((clientY - rect.top - state.config.viewport.panY) / state.config.viewport.zoom)
  };
}

function configZoomAtClientPoint(viewport, canvas, nextZoom, clientX, clientY) {
  const prevZoom = state.config.viewport.zoom;
  const clampedZoom = clamp(nextZoom, CONFIG_MIN_ZOOM, CONFIG_MAX_ZOOM);
  if (clampedZoom === prevZoom) {
    return;
  }
  const rect = viewport.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  state.config.viewport.panX = x - ((x - state.config.viewport.panX) * clampedZoom) / prevZoom;
  state.config.viewport.panY = y - ((y - state.config.viewport.panY) * clampedZoom) / prevZoom;
  state.config.viewport.zoom = clampedZoom;
  configApplyTransform(canvas);
}

function nextConfigId(prefix, existing) {
  let i = 1;
  while (existing.has(`${prefix}${i}`)) {
    i += 1;
  }
  return `${prefix}${i}`;
}

function configNullSpaceKind(space) {
  const explicit = String(space?.kind || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }
  const id = String(space?.space_id || "").trim().toUpperCase();
  if (id.startsWith("PAL-")) {
    return "pallet";
  }
  if (id.startsWith("CART-")) {
    return "cart";
  }
  if (id.startsWith("ITEM-")) {
    return "custom";
  }
  return "obstruction";
}

function configMovableItemKind(item) {
  const explicit = String(item?.kind || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }
  const id = String(item?.id || "").trim().toUpperCase();
  if (id.startsWith("STK-")) {
    return "pallet_stack";
  }
  if (id.startsWith("PAL-")) {
    return "pallet";
  }
  if (id.startsWith("CART-")) {
    return "cart";
  }
  return "custom";
}

function movableInventoryEntries(item) {
  const mixedItems = Array.isArray(item?.mixed_items)
    ? item.mixed_items
        .map((entry) => ({
          item_number: String(entry?.item_number || "").trim(),
          qty: Math.max(0, Number.parseInt(entry?.qty || 0, 10) || 0)
        }))
        .filter((entry) => entry.item_number)
    : [];
  if (mixedItems.length) {
    return mixedItems;
  }
  const itemNumber = String(item?.item_number || "").trim();
  if (!itemNumber) {
    return [];
  }
  return [{ item_number: itemNumber, qty: Math.max(0, Number.parseInt(item?.qty || 0, 10) || 0) }];
}

function buildInventoryMergePrompt(sourceLabel, sourceEntries, targetLabel, targetEntries, mixedLabel) {
  if (!sourceEntries.length) {
    return `${sourceLabel} has no inventory to combine.`;
  }
  if (!targetEntries.length) {
    return `Move ${sourceLabel} inventory into empty ${targetLabel}?`;
  }
  if (
    sourceEntries.length === 1 &&
    targetEntries.length === 1 &&
    sourceEntries[0].item_number === targetEntries[0].item_number
  ) {
    return `Merge ${sourceLabel} into ${targetLabel}? ${sourceEntries[0].item_number} quantities will be combined.`;
  }
  if (targetEntries.length > 1) {
    return `Add ${sourceLabel} into ${mixedLabel} ${targetLabel}?`;
  }
  return `Combine ${sourceLabel} into ${targetLabel}? The destination will become a ${mixedLabel}.`;
}

function buildPalletMergePrompt(source, target) {
  const sourceLabel = `pallet ${String(source?.label || source?.id || "source pallet").trim()}`;
  const targetLabel = String(target?.label || target?.id || "destination pallet").trim();
  return buildInventoryMergePrompt(
    sourceLabel,
    movableInventoryEntries(source),
    targetLabel,
    movableInventoryEntries(target),
    "mixed pallet"
  );
}

function buildRackMergePrompt(source, cell) {
  const sourceLabel = `pallet ${String(source?.label || source?.id || "source pallet").trim()}`;
  const targetLabel = String(cell?.location_code || `bay ${cell?.bay || ""} level ${cell?.level || ""}`).trim();
  return buildInventoryMergePrompt(
    sourceLabel,
    movableInventoryEntries(source),
    targetLabel,
    movableInventoryEntries(cell),
    "mixed bay"
  );
}

async function mergeConfigPallets(sourceId, targetId) {
  const source = configGetEntity("movable_item", sourceId) || findMovableItem(sourceId);
  const target = configGetEntity("movable_item", targetId) || findMovableItem(targetId);
  if (!source || !target) {
    throw new Error("Unable to find both pallets for consolidation.");
  }
  if (configMovableItemKind(source) !== "pallet" || configMovableItemKind(target) !== "pallet") {
    throw new Error("Only pallet items can be combined.");
  }
  const confirmed = window.confirm(buildPalletMergePrompt(source, target));
  if (!confirmed) {
    renderGrid();
    setStatus("Pallet consolidation canceled.");
    return;
  }
  const response = await apiPost("/api/config/movable-item/merge", {
    source_id: sourceId,
    target_id: targetId
  });
  const targetItem = response.target_item || target;
  if (Array.isArray(response.movable_items)) {
    state.config.movable_items = response.movable_items;
    renderOverviewItems(response.movable_items);
  }
  state.config.selection = { type: "movable_item", id: String(targetItem.id || targetId) };
  state.config.dirty = false;
  syncControlVisibility();
  renderGrid();
  setStatus(`Merged pallet ${source.label || source.id} into ${targetItem.label || targetItem.id}.`);
}

async function mergeRackPendingAdd(bay, level) {
  const pending = state.rackPendingAdd;
  if (!pending || !state.rackModel) {
    return;
  }
  const cell = findCell(bay, level);
  const item = pendingRackItem();
  if (!cell || !item) {
    throw new Error("Unable to find both the target bay and the pallet being added.");
  }
  if (cell.is_virtual) {
    setStatus("That slot is not configured. Choose a bay with a full location code.");
    return;
  }
  if (cell.is_empty) {
    setStatus("The selected bay is empty. Use Place Pallet instead.");
    return;
  }
  const confirmed = window.confirm(buildRackMergePrompt(item, cell));
  if (!confirmed) {
    setStatus("Rack consolidation canceled.");
    renderGrid();
    return;
  }
  const response = await apiPost("/api/config/rack/merge-item", {
    row: pending.row,
    bay,
    level,
    item_id: pending.item_id
  });
  state.rackPendingAdd = null;
  state.rackModel = response.rack || state.rackModel;
  renderOverviewItems(response.movable_items || state.movableItems);
  updateVisualAgeForRackModel(state.rackModel);
  const updatedCell = findCell(bay, level);
  selectCell(updatedCell);
  syncControlVisibility();
  renderGrid();
  openInspectorNearSelection();
  setStatus(`Merged pallet into ${pending.row} bay ${bay} level ${level}.`);
}

function configToolSpec(kind) {
  const specs = {
    pallet: {
      kind: "pallet",
      label: "Pallet",
      prefix: "PAL-",
      defaultLabel: "Pallet",
      width: 48,
      height: 36,
      color: "#fef3c7",
      stripe: "none"
    },
    slotted_pallet: {
      kind: "slotted_pallet",
      label: "Slotted Pallet",
      prefix: "SP-",
      defaultLabel: "Slotted Pallet",
      width: 280,
      height: 160,
      color: "#fef3c7",
      stripe: "grid"
    },
    cart: {
      kind: "cart",
      label: "Cart",
      prefix: "CART-",
      defaultLabel: "Cart",
      width: 44,
      height: 32,
      color: "#dbeafe",
      stripe: "none"
    },
    custom: {
      kind: "custom",
      label: "Custom Item",
      prefix: "ITEM-",
      defaultLabel: "Custom Item",
      width: 48,
      height: 36,
      color: "#e2e8f0",
      stripe: "none"
    },
    pallet_stack: {
      kind: "pallet_stack",
      label: "Pallet Stack",
      prefix: "STK-",
      defaultLabel: "Pallet Stack",
      width: 56,
      height: 44,
      color: "#fde68a",
      stripe: "none"
    },
    obstruction: {
      kind: "obstruction",
      label: "Obstruction",
      prefix: "NS-",
      defaultLabel: "Obstruction",
      width: 160,
      height: 120,
      color: "#e5e7eb",
      stripe: "diagonal"
    }
  };
  if (specs[kind]) {
    return specs[kind];
  }
  // Asset templates extend the built-in toolbox: any template id can be used
  // as a placement type. See frontend/modules/asset-templates.js.
  const template = SharedAssetTemplates.templateById ? SharedAssetTemplates.templateById(kind) : null;
  if (template) {
    return {
      kind: template.kind || template.id,
      label: template.label,
      prefix: template.idPrefix || "ITEM-",
      defaultLabel: template.label,
      width: template.footprint?.width || 48,
      height: template.footprint?.height || 36,
      color: template.color || "#e2e8f0",
      stripe: template.stripe || "none",
      template
    };
  }
  return specs.custom;
}

function configAreaNameForPoint(x, y) {
  const hit = configAreaBoxes().find((box) =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
  );
  if (hit) {
    return hit.name;
  }
  return state.area === "All Areas" ? "" : state.area;
}

function configDefaultToolLabel(kind, spaceId) {
  const spec = configToolSpec(kind);
  const suffix = String(spaceId || "").replace(spec.prefix, "").trim();
  return suffix ? `${spec.defaultLabel} ${suffix}` : spec.defaultLabel;
}

function resetConfigToDefaultLanding() {
  state.config.focusedArea = "";
  state.config.selection = { type: "", id: "" };
  state.config.placementType = "";
  state.config.autoFitOnRender = true;
  state.area = "All Areas";
  if (el.areaSelect) {
    el.areaSelect.value = "All Areas";
  }
}

async function openConfigPlacementFromOverview(kind = "pallet", stackSize = "") {
  const focusedArea = String(state.overview.focusedArea || state.area || "").trim();
  if (!focusedArea || focusedArea === "All Areas") {
    throw new Error("Select an area before placing a movable item.");
  }
  const spec = configToolSpec(kind);
  if (kind === "slotted_pallet") {
    state.viewMode = "config";
    el.viewMode.value = "config";
    state.area = focusedArea;
    el.areaSelect.value = focusedArea;
    state.config.focusedArea = focusedArea;
    state.config.selection = { type: "", id: "" };
    state.config.placementType = kind;
    state.config.autoFitOnRender = true;
    await loadConfigModel();
    await loadAreasAndRacks();
    renderGrid();
    setStatus(`Click inside ${focusedArea} to place a ${spec.label.toLowerCase()}.`);
    return;
  }
  const ghost = document.createElement("div");
  ghost.className = `area-transfer-ghost kind-${kind}`;
  ghost.style.width = `${spec.width}px`;
  ghost.style.height = `${spec.height}px`;
  const ghostLabel = stackSize ? `${spec.label} (${stackSize})` : spec.label;
  ghost.innerHTML = `<div class="overview-title">${escapeHtml(ghostLabel)}</div>`;
  document.body.appendChild(ghost);
  document.body.style.cursor = "grabbing";
  state.overview.areaTransfer = {
    active: true,
    phase: "placing_new",
    item: { kind, area: focusedArea, width: spec.width, height: spec.height, label: spec.label, stackSize },
    sourceArea: focusedArea,
    destArea: focusedArea,
    ghostNode: ghost
  };
  const onMove = (moveEvent) => {
    ghost.style.left = `${moveEvent.clientX}px`;
    ghost.style.top = `${moveEvent.clientY}px`;
  };
  const onCancel = (event) => {
    event.preventDefault();
    cleanup();
    setStatus(`Cancelled ${spec.label.toLowerCase()} placement.`);
  };
  const onEscape = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
      setStatus(`Cancelled ${spec.label.toLowerCase()} placement.`);
    }
  };
  const onClick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = el.gridWrap.querySelector(".overview-viewport");
    if (!viewport) {
      cleanup();
      return;
    }
    const vpRect = viewport.getBoundingClientRect();
    const zoom = Math.max(state.overview.zoom || 1, 0.01);
    const rawX = Math.round((event.clientX - vpRect.left - state.overview.panX) / zoom);
    const rawY = Math.round((event.clientY - vpRect.top - state.overview.panY) / zoom);
    const snapped = overviewSnapPosition(rawX, rawY, spec.width, spec.height);
    cleanup();
    try {
      const existingIds = new Set(state.movableItems.map((item) => item.id));
      const itemId = nextConfigId(spec.prefix, existingIds);
      const label = configDefaultToolLabel(kind, itemId);
      const displayLabel = stackSize ? `${label} (${stackSize})` : label;
      const payload = {
        id: itemId,
        area: focusedArea,
        label: displayLabel,
        kind,
        x: snapped.x,
        y: snapped.y,
        width: spec.width,
        height: spec.height,
        stack_size: stackSize || ""
      };
      const response = await apiPost("/api/config/movable-item", payload);
      renderOverviewItems(response.movable_items || state.movableItems);
      const created = findMovableItem(itemId);
      if (created) {
        selectCell(created);
        syncControlVisibility();
      }
      await loadAreasAndRacks();
      renderGrid();
      setStatus(`${displayLabel} placed in ${focusedArea}.`);
    } catch (error) {
      setStatus(`Failed to create ${spec.label.toLowerCase()}: ${error.message}`);
      renderGrid();
    }
  };
  function cleanup() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onCancel);
    document.removeEventListener("keydown", onEscape);
    if (ghost.parentNode) {
      ghost.parentNode.removeChild(ghost);
    }
    document.body.style.cursor = "";
    state.overview.areaTransfer = {
      active: false, phase: "", item: null, sourceArea: "", destArea: "", ghostNode: null
    };
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onCancel);
  document.addEventListener("keydown", onEscape);
  setStatus(`Click to place a ${spec.label.toLowerCase()} in ${focusedArea}. Right-click or Escape to cancel.`);
}

function dispensePalletFromStack(mouseEvent, stackItem) {
  const focusedArea = String(state.overview.focusedArea || stackItem.area || "").trim();
  if (!focusedArea) return;
  const stackSize = String(stackItem.stack_size || "4x4").trim();
  const spec = configToolSpec("pallet");
  const ghost = document.createElement("div");
  ghost.className = "area-transfer-ghost kind-pallet";
  ghost.style.width = `${spec.width}px`;
  ghost.style.height = `${spec.height}px`;
  ghost.innerHTML = `<div class="overview-title">Pallet (${escapeHtml(stackSize)})</div>`;
  ghost.style.left = `${mouseEvent.clientX}px`;
  ghost.style.top = `${mouseEvent.clientY}px`;
  document.body.appendChild(ghost);
  document.body.style.cursor = "grabbing";
  state.overview.areaTransfer = {
    active: true,
    phase: "placing_new",
    item: { kind: "pallet", area: focusedArea, width: spec.width, height: spec.height, label: spec.label, stackSize },
    sourceArea: focusedArea,
    destArea: focusedArea,
    ghostNode: ghost
  };
  const onMove = (e) => {
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
  };
  const onCancel = (e) => { e.preventDefault(); cleanup(); setStatus("Dispense cancelled."); };
  const onEscape = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(); setStatus("Dispense cancelled."); } };
  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const viewport = el.gridWrap.querySelector(".overview-viewport");
    if (!viewport) { cleanup(); return; }
    const vpRect = viewport.getBoundingClientRect();
    const zoom = Math.max(state.overview.zoom || 1, 0.01);
    const rawX = Math.round((e.clientX - vpRect.left - state.overview.panX) / zoom);
    const rawY = Math.round((e.clientY - vpRect.top - state.overview.panY) / zoom);
    const snapped = overviewSnapPosition(rawX, rawY, spec.width, spec.height);
    cleanup();
    try {
      const existingIds = new Set(state.movableItems.map((item) => item.id));
      const itemId = nextConfigId(spec.prefix, existingIds);
      const label = configDefaultToolLabel("pallet", itemId);
      const payload = {
        id: itemId,
        area: focusedArea,
        label,
        kind: "pallet",
        x: snapped.x,
        y: snapped.y,
        width: spec.width,
        height: spec.height
      };
      const response = await apiPost("/api/config/movable-item", payload);
      renderOverviewItems(response.movable_items || state.movableItems);
      await loadAreasAndRacks();
      renderGrid();
      setStatus(`${label} dispensed from stack in ${focusedArea}.`);
    } catch (error) {
      setStatus(`Failed to dispense pallet: ${error.message}`);
      renderGrid();
    }
  };
  function cleanup() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onCancel);
    document.removeEventListener("keydown", onEscape);
    if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    document.body.style.cursor = "";
    state.overview.areaTransfer = { active: false, phase: "", item: null, sourceArea: "", destArea: "", ghostNode: null };
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("click", onClick, true);
  document.addEventListener("contextmenu", onCancel);
  document.addEventListener("keydown", onEscape);
  setStatus(`Click to place a pallet from stack. Right-click or Escape to cancel.`);
}

function closePalletStackMenu() {
  document.querySelectorAll(".pallet-stack-menu").forEach((node) => node.remove());
  document.removeEventListener("click", closePalletStackMenu, true);
  document.removeEventListener("keydown", closePalletStackMenuOnEscape, true);
}

function closePalletStackMenuOnEscape(event) {
  if (event.key === "Escape") {
    closePalletStackMenu();
  }
}

function openPalletStackMenu(mouseEvent, stackItem) {
  closePalletStackMenu();
  const menu = document.createElement("div");
  menu.className = "pallet-stack-menu";
  menu.setAttribute("role", "menu");
  const stackLabel = String(stackItem.label || stackItem.id || "Pallet Stack").trim();
  const stackSize = String(stackItem.stack_size || "8x2").trim();
  menu.innerHTML = `
    <div class="pallet-stack-menu-title">${escapeHtml(stackLabel)}</div>
    <button type="button" data-action="pull-one">Pull 1 Pallet</button>
    <div class="pallet-stack-menu-batch">
      <label for="palletStackMenuBatchInput">Batch</label>
      <input id="palletStackMenuBatchInput" type="text" value="${escapeHtml(stackSize)}" placeholder="8x2 or 16">
      <button type="button" data-action="batch">Create Batch</button>
    </div>
  `;
  const runAction = async (size) => {
    closePalletStackMenu();
    await createPalletsFromStack(stackItem, size);
  };
  menu.querySelector('[data-action="pull-one"]')?.addEventListener("click", () => {
    runAction("1");
  });
  menu.querySelector('[data-action="batch"]')?.addEventListener("click", () => {
    const size = String(menu.querySelector("#palletStackMenuBatchInput")?.value || "").trim();
    runAction(size);
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(menu);
  const left = Math.min(mouseEvent.clientX, window.innerWidth - 260);
  const top = Math.min(mouseEvent.clientY, window.innerHeight - 190);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  requestAnimationFrame(() => {
    menu.querySelector("input")?.select();
  });
  document.addEventListener("click", closePalletStackMenu, true);
  document.addEventListener("keydown", closePalletStackMenuOnEscape, true);
  setStatus(`Stack actions opened for ${stackLabel}.`);
}

async function createPalletsFromStack(stackItem, requestedSize) {
  const focusedArea = String(state.overview.focusedArea || stackItem.area || "").trim();
  const size = String(requestedSize || "").trim().toLowerCase().replace("×", "x");
  if (!focusedArea || !stackItem?.id) {
    setStatus("Select a pallet stack inside an area first.");
    return;
  }
  if (!size) {
    setStatus("Enter a pallet batch size such as 8x2 or 16.");
    return;
  }
  const spec = configToolSpec("pallet");
  const stackWidth = Math.max(1, Number(stackItem.width || 120));
  const startX = Math.round(Number(stackItem.x || 100) + stackWidth + 24);
  const startY = Math.round(Number(stackItem.y || 100));
  try {
    const response = await apiPost("/api/config/movable-item/batch", {
      stack_id: stackItem.id,
      area: focusedArea,
      size,
      count: /^\d+$/.test(size) ? Number(size) : undefined,
      x: startX,
      y: startY,
      width: spec.width,
      height: spec.height
    });
    renderOverviewItems(response.movable_items || state.movableItems);
    await loadAreasAndRacks();
    renderGrid();
    const createdCount = Array.isArray(response.created_items) ? response.created_items.length : 0;
    setStatus(`${createdCount || "Batch"} pallet${createdCount === 1 ? "" : "s"} created from ${stackItem.label || stackItem.id}.`);
  } catch (error) {
    setStatus(`Failed to create pallets from stack: ${error.message}`);
  }
}

async function openConfigEditorFromOverview() {
  const focusedArea = String(state.overview.focusedArea || state.area || "").trim();
  if (!focusedArea || focusedArea === "All Areas") {
    throw new Error("Select an area before opening the movable editor.");
  }
  state.viewMode = "config";
  el.viewMode.value = "config";
  state.area = focusedArea;
  el.areaSelect.value = focusedArea;
  state.config.focusedArea = focusedArea;
  state.config.selection = { type: "", id: "" };
  state.config.placementType = "";
  state.config.autoFitOnRender = true;
  await loadConfigModel();
  await loadAreasAndRacks();
  renderGrid();
  setStatus(`Opened movable item editor for ${focusedArea}.`);
}

async function createConfigToolEntity(kind, world) {
  const spec = configToolSpec(kind);
  const area = configAreaNameForPoint(world.x, world.y);
  const template = spec.template || null;
  // Template-backed entities that are not movable items get their own
  // creation paths; movable/slotted templates fall through to the legacy
  // flows below (their template ids line up with the legacy kinds).
  if (template && template.entity === "row") {
    const names = new Set(state.config.rows.map((row) => row.name));
    const name = nextConfigId(spec.prefix, names);
    const payload = {
      name,
      area,
      x: Math.round(world.x),
      y: Math.round(world.y),
      orientation: "horizontal",
      bay_count: Math.max(1, Number(template.create?.bay_count || 1)),
      levels_default: Math.max(1, Number(template.create?.levels_default || 1)),
      rack_height: Number(template.create?.rack_height || 144),
      support_every_bays: Math.max(1, Number(template.create?.support_every_bays || 2))
    };
    await apiPost("/api/config/row", payload);
    state.config.selection = { type: "row", id: name };
    state.config.dirty = false;
    await refreshAfterConfigChange(`${spec.label} "${name}" added with ${payload.bay_count} bays x ${payload.levels_default} levels.`);
    return;
  }
  if (template && template.entity === "zone") {
    const ids = new Set(state.config.zones.map((zone) => zone.zone_id));
    const zoneId = nextConfigId(spec.prefix, ids);
    const payload = {
      zone_id: zoneId,
      area,
      x: Math.round(world.x),
      y: Math.round(world.y),
      slot_count: Math.max(1, Number(template.create?.slot_count || 4)),
      layout: String(template.create?.layout || "grid"),
      columns: Math.max(1, Number(template.create?.columns || 4))
    };
    await apiPost("/api/config/zone", payload);
    state.config.selection = { type: "zone", id: zoneId };
    state.config.dirty = false;
    await refreshAfterConfigChange(`${spec.label} "${zoneId}" added with ${payload.slot_count} slots.`);
    return;
  }
  if (template && template.entity === "null_space") {
    const ids = new Set(state.config.null_spaces.map((space) => space.space_id));
    const spaceId = nextConfigId(spec.prefix, ids);
    const payload = {
      space_id: spaceId,
      area,
      label: configDefaultToolLabel(kind, spaceId),
      kind: template.kind || "obstruction",
      x: Math.round(world.x),
      y: Math.round(world.y),
      width: spec.width,
      height: spec.height,
      color: spec.color,
      stripe: spec.stripe
    };
    await apiPost("/api/config/null-space", payload);
    state.config.selection = { type: "null_space", id: spaceId };
    state.config.dirty = false;
    await refreshAfterConfigChange(`${spec.label} "${spaceId}" added.`);
    return;
  }
  if (spec.kind === "slotted_pallet") {
    const ids = new Set(state.config.slotted_pallets.map((item) => item.group_id));
    const groupId = nextConfigId(spec.prefix, ids);
    const payload = {
      group_id: groupId,
      area,
      label: configDefaultToolLabel(spec.kind, groupId),
      x: world.x,
      y: world.y,
      width: spec.width,
      height: spec.height,
      slot_count: 6,
      layout: "grid",
      columns: 3
    };
    const response = await apiPost("/api/config/slotted-pallet", payload);
    if (Array.isArray(response.slotted_pallets)) {
      state.config.slotted_pallets = response.slotted_pallets;
    }
    state.config.selection = { type: "slotted_pallet", id: groupId };
  } else {
    const ids = new Set(state.config.movable_items.map((item) => item.id));
    const itemId = nextConfigId(spec.prefix, ids);
    const label = configDefaultToolLabel(spec.kind, itemId);
    const payload = {
      id: itemId,
      area,
      label,
      kind: spec.kind,
      x: world.x,
      y: world.y,
      width: spec.width,
      height: spec.height
    };
    const response = await apiPost("/api/config/movable-item", payload);
    if (Array.isArray(response.movable_items)) {
      state.config.movable_items = response.movable_items;
    }
    state.config.selection = { type: "movable_item", id: itemId };
  }
  state.config.dirty = false;
  if (state.viewMode === "config") {
    renderGrid();
  }
  await refreshAfterConfigChange(`${spec.label} added.`);
}

function rowPayloadFromEntity(row, oldName = "") {
  const bayLevelsSource = row.bay_levels && typeof row.bay_levels === "object" ? row.bay_levels : {};
  const bayLevels = {};
  Object.keys(bayLevelsSource).forEach((key) => {
    const bay = Number.parseInt(key, 10);
    const level = Number.parseInt(bayLevelsSource[key], 10);
    if (Number.isFinite(bay) && Number.isFinite(level)) {
      bayLevels[String(bay)] = level;
    }
  });
  const beamOverrides = row.beam_position_overrides && typeof row.beam_position_overrides === "object"
    ? row.beam_position_overrides
    : {};
  return {
    old_name: oldName,
    name: String(row.name || "").trim(),
    area: String(row.area || "").trim(),
    bay_count: Math.max(1, Number.parseInt(row.bay_count || 1, 10) || 1),
    bay_start: Number.parseInt(row.bay_start || 1, 10) || 1,
    bay_direction: String(row.bay_direction || "up"),
    levels_default: Math.max(1, Number.parseInt(row.levels_default || 1, 10) || 1),
    bay_levels: bayLevels,
    gap_after: Number.parseInt(row.gap_after ?? 1, 10) || 0,
    align_to_prev_end: Boolean(row.align_to_prev_end),
    order: Number.parseInt(row.order || 0, 10) || 0,
    orientation: String(row.orientation || "horizontal"),
    locked: Boolean(row.locked),
    scale_x: Number.isFinite(Number(row.scale_x)) && Number(row.scale_x) > 0 ? Number(row.scale_x) : 1.0,
    scale_y: Number.isFinite(Number(row.scale_y)) && Number(row.scale_y) > 0 ? Number(row.scale_y) : 1.0,
    x: Number.parseInt(row.x || 40, 10) || 40,
    y: Number.parseInt(row.y || 40, 10) || 40,
    support_every_bays: Math.max(1, Number.parseInt(row.support_every_bays || 2, 10) || 2),
    support_after_bays: Array.isArray(row.support_after_bays) ? row.support_after_bays : [],
    rack_height: Number.isFinite(Number(row.rack_height)) && Number(row.rack_height) > 0 ? Number(row.rack_height) : 144.0,
    beam_positions: Array.isArray(row.beam_positions) ? row.beam_positions.map((v) => Number(v) || 0).filter((v) => v > 0) : [],
    beam_position_overrides: beamOverrides
  };
}

function zonePayloadFromEntity(zone, oldId = "") {
  return {
    old_id: oldId,
    zone_id: String(zone.zone_id || "").trim(),
    area: String(zone.area || "").trim(),
    slot_count: Math.max(1, Number.parseInt(zone.slot_count || 1, 10) || 1),
    slot_start: Number.parseInt(zone.slot_start || 1, 10) || 1,
    slot_direction: String(zone.slot_direction || "up"),
    gap_after: Number.parseInt(zone.gap_after ?? 1, 10) || 0,
    align_to_prev_end: Boolean(zone.align_to_prev_end),
    order: Number.parseInt(zone.order || 0, 10) || 0,
    layout: String(zone.layout || "line"),
    columns: Math.max(1, Number.parseInt(zone.columns || 4, 10) || 1),
    orientation: String(zone.orientation || "horizontal"),
    locked: Boolean(zone.locked),
    scale_x: Number.isFinite(Number(zone.scale_x)) && Number(zone.scale_x) > 0 ? Number(zone.scale_x) : 1.0,
    scale_y: Number.isFinite(Number(zone.scale_y)) && Number(zone.scale_y) > 0 ? Number(zone.scale_y) : 1.0,
    x: Number.parseInt(zone.x || 40, 10) || 40,
    y: Number.parseInt(zone.y || 40, 10) || 40
  };
}

function nullPayloadFromEntity(space, oldId = "") {
  return {
    old_id: String(oldId || "").trim(),
    space_id: String(space.space_id || "").trim(),
    area: String(space.area || "").trim(),
    label: String(space.label || "").trim(),
    kind: configNullSpaceKind(space),
    shape: String(space.shape || "rectangle"),
    x: Number.parseInt(space.x || 100, 10) || 100,
    y: Number.parseInt(space.y || 100, 10) || 100,
    width: Math.max(1, Number.parseInt(space.width || 160, 10) || 1),
    height: Math.max(1, Number.parseInt(space.height || 120, 10) || 1),
    order: Number.parseInt(space.order || 0, 10) || 0,
    color: String(space.color || "#e5e7eb"),
    stripe: String(space.stripe || "none"),
    stripe_density: Math.max(1, Number.parseInt(space.stripe_density || 12, 10) || 12),
    label_size: Math.max(1, Number.parseInt(space.label_size || 10, 10) || 10),
    label_pos: String(space.label_pos || "center"),
    locked: Boolean(space.locked)
  };
}

function movableItemPayloadFromEntity(item, oldId = "") {
  return {
    old_id: String(oldId || "").trim(),
    id: String(item.id || "").trim(),
    area: String(item.area || "").trim(),
    label: String(item.label || "").trim(),
    kind: configMovableItemKind(item),
    x: Number.parseInt(item.x || 100, 10) || 100,
    y: Number.parseInt(item.y || 100, 10) || 100,
    width: Math.max(1, Number.parseInt(item.width || 120, 10) || 1),
    height: Math.max(1, Number.parseInt(item.height || 90, 10) || 1)
  };
}

function syncConfigMovableItem(item) {
  if (!item || !item.id || !Array.isArray(state.config?.movable_items)) {
    return;
  }
  const index = state.config.movable_items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    state.config.movable_items[index] = { ...state.config.movable_items[index], ...item };
  }
}

async function persistOverviewMovableItem(item, overrides = {}) {
  const payload = movableItemPayloadFromEntity({ ...item, ...overrides }, item.id);
  const response = await apiPost("/api/config/movable-item", payload);
  renderOverviewItems(response.movable_items || state.movableItems);
  if (response.movable_item) {
    syncConfigMovableItem(response.movable_item);
    return response.movable_item;
  }
  const refreshed = findMovableItem(item.id);
  if (refreshed) {
    syncConfigMovableItem(refreshed);
    return refreshed;
  }
  return { ...item, ...overrides };
}

function overviewItemInsideFocusedArea(rect) {
  const areaName = String(state.overview.focusedArea || "").trim();
  if (!areaName) {
    return true;
  }
  const areaBox = overviewAreaBoxByName(areaName);
  if (!areaBox) {
    return true;
  }
  return (
    rect.x >= areaBox.x &&
    rect.y >= areaBox.y &&
    rect.x + rect.width <= areaBox.x + areaBox.width &&
    rect.y + rect.height <= areaBox.y + areaBox.height
  );
}

async function startOverviewAreaTransfer(item) {
  const sourceArea = String(item?.area || state.overview.focusedArea || "").trim();
  const areaChoices = (state.areas || []).map((name) => String(name || "").trim()).filter(Boolean);
  const destinations = areaChoices.filter((name) => name !== sourceArea);
  if (!destinations.length) {
    setStatus("No other areas available for transfer.");
    return false;
  }
  state.overview.areaTransfer = {
    active: true,
    phase: "pick_area",
    item: { ...item },
    sourceArea,
    destArea: "",
    ghostNode: null
  };
  state.area = "All Areas";
  el.areaSelect.value = "All Areas";
  state.overview.focusedArea = "";
  state.overview.selectedArea = "";
  selectCell(null);
  syncControlVisibility();
  document.addEventListener("keydown", onTransferKeydown);
  document.body.style.cursor = "grabbing";
  await loadAreasAndRacks();
  renderGrid();
  fitOverview();
  setStatus(`Pick a destination area for ${item.label || item.id}. Press Escape to cancel.`);
  return true;
}

function cancelAreaTransfer() {
  const transfer = state.overview.areaTransfer;
  if (!transfer.active) {
    return;
  }
  const itemLabel = transfer.item?.label || transfer.item?.id || "item";
  const sourceArea = transfer.sourceArea;
  cleanupTransferGhost();
  document.body.style.cursor = "";
  state.overview.areaTransfer = {
    active: false,
    phase: "",
    item: null,
    sourceArea: "",
    destArea: "",
    ghostNode: null
  };
  state.area = sourceArea;
  el.areaSelect.value = sourceArea;
  state.overview.selectedArea = sourceArea;
  state.overview.focusedArea = sourceArea;
  state.management.filters.area = sourceArea;
  loadAreasAndRacks().then(() => {
    renderGrid();
    requestAnimationFrame(() => {
      const bounds = overviewBounds();
      if (bounds) {
        fitOverviewRect({ x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
      }
    });
  });
  setStatus(`Transfer cancelled. ${itemLabel} stayed in ${sourceArea}.`);
}

function cleanupTransferGhost() {
  const ghost = state.overview.areaTransfer.ghostNode;
  if (ghost && ghost.parentNode) {
    ghost.parentNode.removeChild(ghost);
  }
  state.overview.areaTransfer.ghostNode = null;
  document.removeEventListener("mousemove", onTransferGhostMove);
  document.removeEventListener("click", onTransferGhostPlace, true);
  document.removeEventListener("contextmenu", onTransferGhostCancel);
  document.removeEventListener("keydown", onTransferKeydown);
}

function onTransferKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancelAreaTransfer();
  }
}

function onTransferGhostMove(event) {
  const ghost = state.overview.areaTransfer.ghostNode;
  if (!ghost) {
    return;
  }
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
}

function onTransferGhostCancel(event) {
  event.preventDefault();
  cancelAreaTransfer();
}

async function onTransferGhostPlace(event) {
  const transfer = state.overview.areaTransfer;
  if (!transfer.active || transfer.phase !== "placing") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const viewport = el.gridWrap.querySelector(".overview-viewport");
  if (!viewport) {
    cancelAreaTransfer();
    return;
  }
  const vpRect = viewport.getBoundingClientRect();
  const zoom = Math.max(state.overview.zoom || 1, 0.01);
  const canvasX = Math.round((event.clientX - vpRect.left - state.overview.panX) / zoom);
  const canvasY = Math.round((event.clientY - vpRect.top - state.overview.panY) / zoom);
  const item = transfer.item;
  const destArea = transfer.destArea;
  cleanupTransferGhost();
  document.body.style.cursor = "";
  state.overview.areaTransfer = {
    active: false,
    phase: "",
    item: null,
    sourceArea: "",
    destArea: "",
    ghostNode: null
  };
  try {
    const moved = await persistOverviewMovableItem(item, {
      area: destArea,
      x: canvasX,
      y: canvasY
    });
    state.area = destArea;
    el.areaSelect.value = destArea;
    state.overview.selectedArea = destArea;
    state.overview.focusedArea = destArea;
    state.management.filters.area = destArea;
    await loadAreasAndRacks();
    selectCell(findMovableItem(moved.id) || moved);
    syncControlVisibility();
    renderGrid();
    requestAnimationFrame(() => {
      const bounds = overviewBounds();
      if (bounds) {
        fitOverviewRect({ x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
      }
    });
    setStatus(`Placed ${item.label || item.id} in ${destArea}.`);
  } catch (error) {
    setStatus(`Transfer failed: ${error.message}`);
    renderGrid();
  }
}

async function enterTransferPlacingPhase(destArea) {
  const transfer = state.overview.areaTransfer;
  transfer.phase = "placing";
  transfer.destArea = destArea;
  state.area = destArea;
  el.areaSelect.value = destArea;
  state.overview.selectedArea = destArea;
  state.overview.focusedArea = destArea;
  state.management.filters.area = destArea;
  await loadAreasAndRacks();
  renderGrid();
  requestAnimationFrame(() => {
    const bounds = overviewBounds();
    if (bounds) {
      fitOverviewRect({ x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
    }
  });
  const item = transfer.item;
  const rect = movableItemRect(item);
  const ghost = document.createElement("div");
  const kind = configMovableItemKind(item);
  ghost.className = `area-transfer-ghost kind-${kind}`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.innerHTML = `<div class="overview-title">${escapeHtml(item.label || item.id)}</div>`;
  document.body.appendChild(ghost);
  transfer.ghostNode = ghost;
  document.addEventListener("mousemove", onTransferGhostMove);
  document.addEventListener("click", onTransferGhostPlace, true);
  document.addEventListener("contextmenu", onTransferGhostCancel);
  setStatus(`Click to place ${item.label || item.id} in ${destArea}. Right-click or Escape to cancel.`);
}

function overviewRackUnderPoint(x, y) {
  const focusedArea = String(state.overview.focusedArea || "").trim();
  for (const row of state.racks) {
    if (String(row.area || "").trim() !== focusedArea) {
      continue;
    }
    const r = rowRect(row);
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      return row;
    }
  }
  return null;
}

function overviewSnapPosition(x, y, itemWidth, itemHeight) {
  const snapDist = 12;
  const gap = 4;
  const focusedArea = String(state.overview.focusedArea || "").trim();
  let bestX = x;
  let bestY = y;
  let bestDist = snapDist + 1;
  const targets = [];
  state.racks
    .filter((row) => String(row.area || "").trim() === focusedArea)
    .forEach((row) => targets.push(rowRect(row)));
  state.zones
    .filter((zone) => String(zone.area || "").trim() === focusedArea)
    .forEach((zone) => targets.push(zoneRect(zone)));
  state.slottedPallets
    .filter((sp) => String(sp.area || "").trim() === focusedArea)
    .forEach((sp) => targets.push(slottedPalletRect(sp)));
  for (const t of targets) {
    const candidates = [
      { sx: x, sy: t.y + t.height + gap, d: Math.abs(y - (t.y + t.height + gap)) },
      { sx: x, sy: t.y - itemHeight - gap, d: Math.abs(y - (t.y - itemHeight - gap)) },
      { sx: t.x + t.width + gap, sy: y, d: Math.abs(x - (t.x + t.width + gap)) },
      { sx: t.x - itemWidth - gap, sy: y, d: Math.abs(x - (t.x - itemWidth - gap)) }
    ];
    for (const c of candidates) {
      if (c.d < snapDist && c.d < bestDist) {
        bestX = Math.round(c.sx);
        bestY = Math.round(c.sy);
        bestDist = c.d;
      }
    }
    if (Math.abs(x - t.x) < snapDist) {
      bestX = t.x;
    } else if (Math.abs((x + itemWidth) - (t.x + t.width)) < snapDist) {
      bestX = t.x + t.width - itemWidth;
    }
  }
  return { x: bestX, y: bestY };
}

function startOverviewMovableDrag(event, item, node) {
  if (event.button !== 0 || !state.overview.focusedArea) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  selectCell(item);
  syncControlVisibility();
  if (inAuditWorkspace()) {
    document.querySelectorAll(".overview-entity.movable-item.selected").forEach((selected) => {
      if (selected !== node) {
        selected.classList.remove("selected");
      }
    });
    node.classList.add("selected");
    return;
  }
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = Number(item.x || 0);
  const originY = Number(item.y || 0);
  const rect = movableItemRect(item);
  let nextX = originX;
  let nextY = originY;
  let moved = false;
  state.overview.movableDrag = {
    active: true,
    itemId: item.id,
    originX,
    originY
  };
  node.classList.add("dragging", "selected");

  const onMove = (moveEvent) => {
    if (!state.overview.movableDrag.active) {
      return;
    }
    const dx = (moveEvent.clientX - startX) / Math.max(state.overview.zoom || 1, 0.01);
    const dy = (moveEvent.clientY - startY) / Math.max(state.overview.zoom || 1, 0.01);
    if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      return;
    }
    moved = true;
    const rawX = Math.round(originX + dx);
    const rawY = Math.round(originY + dy);
    const snapped = overviewSnapPosition(rawX, rawY, rect.width, rect.height);
    nextX = snapped.x;
    nextY = snapped.y;
    node.style.left = `${nextX}px`;
    node.style.top = `${nextY}px`;
    const overRack = overviewRackUnderPoint(nextX + rect.width / 2, nextY + rect.height / 2);
    if (overRack && configMovableItemKind(item) === "pallet") {
      node.classList.add("search-hit");
      setStatus(`Release on ${overRack.name} to add pallet to rack.`);
    } else {
      node.classList.remove("search-hit");
      setStatus(`Dragging ${item.label || item.id} inside ${state.overview.focusedArea}.`);
    }
  };

  const onUp = async () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    state.overview.movableDrag.active = false;
    node.classList.remove("dragging", "search-hit");
    if (!moved) {
      document.querySelectorAll(".overview-entity.movable-item.selected").forEach((selected) => {
        if (selected !== node) {
          selected.classList.remove("selected");
        }
      });
      node.classList.add("selected");
      return;
    }
    try {
      const overRack = overviewRackUnderPoint(nextX + rect.width / 2, nextY + rect.height / 2);
      if (overRack && configMovableItemKind(item) === "pallet") {
        await startRackPendingAdd(overRack.name, item.id, state.overview.focusedArea);
        return;
      }
      const movedItem = await persistOverviewMovableItem(item, { x: nextX, y: nextY });
      selectCell(findMovableItem(movedItem.id) || movedItem);
      syncControlVisibility();
      renderGrid();
      setStatus(`Moved ${item.label || item.id} within ${state.overview.focusedArea}.`);
    } catch (error) {
      renderGrid();
      setStatus(`Move failed: ${error.message}`);
    }
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function slottedPalletPayloadFromEntity(item, oldId = "") {
  return {
    old_id: String(oldId || "").trim(),
    group_id: String(item.group_id || item.id || "").trim(),
    area: String(item.area || "").trim(),
    label: String(item.label || "").trim(),
    x: Number.parseInt(item.x || 100, 10) || 100,
    y: Number.parseInt(item.y || 100, 10) || 100,
    width: Math.max(80, Number.parseInt(item.width || 280, 10) || 80),
    height: Math.max(80, Number.parseInt(item.height || 160, 10) || 80),
    slot_count: Math.max(1, Number.parseInt(item.slot_count || 1, 10) || 1),
    slot_start: Number.parseInt(item.slot_start || 1, 10) || 1,
    layout: String(item.layout || "line"),
    columns: Math.max(1, Number.parseInt(item.columns || 4, 10) || 1),
    orientation: String(item.orientation || "horizontal")
  };
}

async function saveConfigSelectionIfDirty(options = {}) {
  if (!state.config.dirty) {
    return false;
  }
  if (state.viewMode !== "config") {
    return false;
  }
  const selected = configGetEntity(state.config.selection.type, state.config.selection.id);
  const selectedEditor = document.getElementById("cfgSelectedEditor");
  if (!selected || !selectedEditor) {
    state.config.dirty = false;
    return false;
  }
  if (configIsFixedEntityType(state.config.selection.type) && !SharedApi.context?.draft) {
    state.config.dirty = false;
    setStatus("Fixed layout is read-only in the movable overlay editor.");
    return false;
  }
  const quiet = !!options.quiet;
  const message = options.message || "Entity saved.";
  const read = (field) => selectedEditor.querySelector(`[data-f='${field}']`)?.value || "";
  try {
    if (state.config.selection.type === "area") {
      await saveOverviewAreaBox(selected.name, {
        x: Number.parseInt(read("x"), 10) || 0,
        y: Number.parseInt(read("y"), 10) || 0,
        width: Math.max(120, Number.parseInt(read("width"), 10) || 120),
        height: Math.max(100, Number.parseInt(read("height"), 10) || 100)
      });
      state.config.selection = { type: "area", id: selected.name };
    } else if (state.config.selection.type === "row") {
      const updated = { ...selected };
      updated.name = read("name").trim();
      updated.area = read("area").trim();
      updated.bay_count = Number.parseInt(read("bay_count"), 10) || 1;
      updated.levels_default = Number.parseInt(read("levels_default"), 10) || 1;
      updated.x = Number.parseInt(read("x"), 10) || 40;
      updated.y = Number.parseInt(read("y"), 10) || 40;
      if (!updated.name) {
        throw new Error("Rack name is required.");
      }
      await apiPost("/api/config/row", rowPayloadFromEntity(updated, selected.name));
      state.config.selection = { type: "row", id: updated.name };
    } else if (state.config.selection.type === "slotted_pallet") {
      const updated = { ...selected };
      updated.group_id = read("group_id").trim();
      updated.label = read("label").trim();
      updated.area = read("area").trim();
      updated.slot_count = Number.parseInt(read("slot_count"), 10) || 1;
      updated.columns = Number.parseInt(read("columns"), 10) || 1;
      updated.x = Number.parseInt(read("x"), 10) || 100;
      updated.y = Number.parseInt(read("y"), 10) || 100;
      updated.width = Number.parseInt(read("width"), 10) || 280;
      updated.height = Number.parseInt(read("height"), 10) || 160;
      updated.layout = read("layout") || "line";
      if (!updated.group_id) {
        throw new Error("Group ID is required.");
      }
      await apiPost("/api/config/slotted-pallet", slottedPalletPayloadFromEntity(updated, selected.group_id));
      state.config.selection = { type: "slotted_pallet", id: updated.group_id };
    } else if (state.config.selection.type === "zone") {
      const updated = { ...selected };
      updated.zone_id = read("zone_id").trim();
      updated.area = read("area").trim();
      updated.slot_count = Number.parseInt(read("slot_count"), 10) || 1;
      updated.columns = Number.parseInt(read("columns"), 10) || 1;
      updated.x = Number.parseInt(read("x"), 10) || 40;
      updated.y = Number.parseInt(read("y"), 10) || 40;
      if (!updated.zone_id) {
        throw new Error("Zone ID is required.");
      }
      await apiPost("/api/config/zone", zonePayloadFromEntity(updated, selected.zone_id));
      state.config.selection = { type: "zone", id: updated.zone_id };
    } else if (state.config.selection.type === "movable_item") {
      const updated = { ...selected };
      updated.id = read("id").trim();
      updated.area = read("area").trim();
      updated.label = read("label").trim();
      updated.kind = read("kind") || configMovableItemKind(selected);
      const previousKind = configMovableItemKind(selected);
      const previousDefaultLabel = configDefaultToolLabel(previousKind, selected.id);
      updated.x = Number.parseInt(read("x"), 10) || 100;
      updated.y = Number.parseInt(read("y"), 10) || 100;
      updated.width = Number.parseInt(read("width"), 10) || 120;
      updated.height = Number.parseInt(read("height"), 10) || 90;
      if (!updated.id) {
        throw new Error("Item ID is required.");
      }
      if (!updated.label || updated.label === previousDefaultLabel) {
        updated.label = configDefaultToolLabel(updated.kind, updated.id);
      }
      await apiPost("/api/config/movable-item", movableItemPayloadFromEntity(updated, selected.id));
      state.config.selection = { type: "movable_item", id: updated.id };
    } else if (state.config.selection.type === "null_space") {
      const updated = { ...selected };
      updated.space_id = read("space_id").trim();
      updated.area = read("area").trim();
      updated.label = read("label").trim();
      updated.kind = read("kind") || configNullSpaceKind(selected);
      const previousKind = configNullSpaceKind(selected);
      const previousDefaultLabel = configDefaultToolLabel(previousKind, selected.space_id);
      updated.shape = read("shape") || selected.shape || "rectangle";
      updated.x = Number.parseInt(read("x"), 10) || 100;
      updated.y = Number.parseInt(read("y"), 10) || 100;
      updated.width = Number.parseInt(read("width"), 10) || 160;
      updated.height = Number.parseInt(read("height"), 10) || 120;
      if (!updated.space_id) {
        throw new Error("Item ID is required.");
      }
      if (!updated.label || updated.label === previousDefaultLabel) {
        updated.label = configDefaultToolLabel(updated.kind, updated.space_id);
      }
      await apiPost("/api/config/null-space", nullPayloadFromEntity(updated, selected.space_id));
      state.config.selection = { type: "null_space", id: updated.space_id };
    } else {
      return false;
    }
    state.config.dirty = false;
    await refreshAfterConfigChange(message);
    if (quiet) {
      setStatus(message);
    }
    return true;
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
    throw error;
  }
}

const TEMPLATE_CATEGORY_LABELS = {
  rack: "Racks",
  storage: "Cabinets & Shelving",
  zone: "Floor Zones",
  movable: "Movable Items",
  fixture: "Fixtures & Layout",
  custom: "My Custom Assets"
};

/**
 * Flyout listing every asset template grouped by category. Clicking a
 * template arms placement mode: the next click inside the layout creates
 * that asset at the clicked spot (same flow as the legacy toolbox chips).
 */
function toggleTemplatePicker(toolbar) {
  const existing = toolbar.querySelector(".template-picker");
  if (existing) {
    existing.remove();
    return;
  }
  const panel = document.createElement("div");
  panel.className = "template-picker";
  const groups = SharedAssetTemplates.templatesByCategory ? SharedAssetTemplates.templatesByCategory() : {};
  Object.keys(TEMPLATE_CATEGORY_LABELS).forEach((category) => {
    const templates = (groups[category] || []).filter(template => !SharedApi.context?.draft || template.entity !== "movable_item");
    if (!templates.length) {
      return;
    }
    const heading = document.createElement("div");
    heading.className = "template-picker-heading";
    heading.textContent = TEMPLATE_CATEGORY_LABELS[category];
    panel.appendChild(heading);
    const grid = document.createElement("div");
    grid.className = "template-picker-grid";
    templates.forEach((template) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "template-picker-item";
      btn.textContent = template.label;
      btn.title = template.notes || template.label;
      if (state.config.placementType === template.id) {
        btn.classList.add("active-tool");
      }
      btn.addEventListener("click", () => {
        state.config.placementType = state.config.placementType === template.id ? "" : template.id;
        panel.remove();
        renderGrid();
        if (state.config.placementType) {
          setStatus(`Click inside ${state.config.focusedArea || "the layout"} to place a ${template.label.toLowerCase()}.`);
        } else {
          setStatus("Placement mode cleared.");
        }
      });
      grid.appendChild(btn);
    });
    panel.appendChild(grid);
  });
  const newCustomBtn = document.createElement("button");
  newCustomBtn.type = "button";
  newCustomBtn.className = "template-picker-new-custom";
  newCustomBtn.textContent = "+ New Custom Asset (image + grid)";
  newCustomBtn.addEventListener("click", () => {
    panel.remove();
    openCustomAssetForm(() => renderGrid());
  });
  panel.appendChild(newCustomBtn);
  toolbar.appendChild(panel);
}

async function loadCustomAssetTemplates() {
  try {
    const response = await apiGet("/api/asset-templates");
    if (SharedAssetTemplates.setCustomTemplates) {
      SharedAssetTemplates.setCustomTemplates(response.templates || []);
    }
  } catch (_error) {
    // Custom templates are optional; the built-in registry still works.
  }
}

function customAssetTemplateForSpace(space) {
  const kind = String(space?.kind || "");
  if (!kind.startsWith("custom-asset:")) {
    return null;
  }
  const templateId = kind.slice("custom-asset:".length);
  return SharedAssetTemplates.templateById ? SharedAssetTemplates.templateById(templateId) : null;
}

/**
 * Front-facing view for a custom asset: the uploaded image with the
 * template's rows x columns grid of clickable zones overlaid. Zones are
 * addressable (R1C1...) but do not carry inventory yet — see README.
 */
function openCustomAssetViewer(space) {
  const template = customAssetTemplateForSpace(space);
  document.querySelector(".custom-asset-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-asset-overlay";
  const title = String(space.label || space.space_id || "Custom Asset");
  const rows = Math.max(1, Number(template?.grid?.rows || 1));
  const columns = Math.max(1, Number(template?.grid?.columns || 1));
  const realW = Number(template?.real_width_inches || 0);
  const realH = Number(template?.real_height_inches || 0);
  const dimsText = realW && realH ? `${realW}" wide x ${realH}" tall` : "";
  overlay.innerHTML = `
    <div class="custom-asset-dialog">
      <div class="custom-asset-header">
        <strong>${escapeHtml(title)}</strong>
        <span class="custom-asset-dims">${escapeHtml(dimsText)}</span>
        <button type="button" class="custom-asset-close">Close</button>
      </div>
      <div class="custom-asset-stage">
        ${template?.image ? `<img class="custom-asset-image" alt="${escapeHtml(title)}" src="${template.image}">` : `<div class="custom-asset-placeholder">No image uploaded for this asset.</div>`}
        <div class="custom-asset-grid" style="grid-template-rows: repeat(${rows}, 1fr); grid-template-columns: repeat(${columns}, 1fr);"></div>
      </div>
      <p class="custom-asset-hint">Click a zone to identify it. ${escapeHtml(template?.notes || "")}</p>
    </div>`;
  const grid = overlay.querySelector(".custom-asset-grid");
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= columns; c += 1) {
      const zone = document.createElement("button");
      zone.type = "button";
      zone.className = "custom-asset-zone";
      zone.title = `Zone R${r}C${c}`;
      zone.addEventListener("click", () => {
        grid.querySelectorAll(".custom-asset-zone.selected").forEach((n) => n.classList.remove("selected"));
        zone.classList.add("selected");
        setStatus(`${title} - zone R${r}C${c} selected.`);
      });
      grid.appendChild(zone);
    }
  }
  overlay.querySelector(".custom-asset-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

/** Small admin form: upload an image, set real size and grid, save template. */
function openCustomAssetForm(afterSave) {
  document.querySelector(".custom-asset-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-asset-overlay";
  overlay.innerHTML = `
    <div class="custom-asset-dialog custom-asset-form">
      <div class="custom-asset-header">
        <strong>New Custom Asset</strong>
        <button type="button" class="custom-asset-close">Cancel</button>
      </div>
      <label>Name <input type="text" data-f="label" placeholder="Hardware cabinet"></label>
      <label>Front-view image (PNG, JPG, or SVG, under 1 MB) <input type="file" data-f="image" accept="image/png,image/jpeg,image/svg+xml"></label>
      <div class="custom-asset-form-row">
        <label>Real width (inches) <input type="number" data-f="width" value="48" min="1"></label>
        <label>Real height (inches) <input type="number" data-f="height" value="72" min="1"></label>
      </div>
      <div class="custom-asset-form-row">
        <label>Shelf rows <input type="number" data-f="rows" value="3" min="1" max="50"></label>
        <label>Columns per row <input type="number" data-f="columns" value="4" min="1" max="50"></label>
      </div>
      <label>Notes <input type="text" data-f="notes" placeholder="Optional description"></label>
      <button type="button" class="custom-asset-save">Save Asset Template</button>
      <p class="custom-asset-error hidden"></p>
    </div>`;
  const read = (field) => overlay.querySelector(`[data-f='${field}']`);
  const showError = (message) => {
    const node = overlay.querySelector(".custom-asset-error");
    node.textContent = message;
    node.classList.remove("hidden");
  };
  overlay.querySelector(".custom-asset-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector(".custom-asset-save").addEventListener("click", async () => {
    const label = String(read("label").value || "").trim();
    if (!label) {
      showError("Give the asset a name.");
      return;
    }
    const file = read("image").files[0] || null;
    let image = "";
    if (file) {
      if (file.size > 1_000_000) {
        showError("Image is larger than 1 MB. Resize it and try again.");
        return;
      }
      image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the image file."));
        reader.readAsDataURL(file);
      });
    }
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || `asset_${Date.now()}`;
    // Footprint world units ~= half-inches, matching the shipped maps' scale.
    const realWidth = Math.max(1, Number(read("width").value || 48));
    const realHeight = Math.max(1, Number(read("height").value || 72));
    try {
      const response = await apiPost("/api/asset-templates", {
        id,
        label,
        image,
        real_width_inches: realWidth,
        real_height_inches: realHeight,
        footprint: { width: Math.round(realWidth / 2), height: Math.round(Math.max(12, realHeight / 6)) },
        grid: {
          rows: Math.max(1, Number(read("rows").value || 1)),
          columns: Math.max(1, Number(read("columns").value || 1))
        },
        notes: String(read("notes").value || "").trim()
      });
      if (SharedAssetTemplates.setCustomTemplates) {
        SharedAssetTemplates.setCustomTemplates(response.templates || []);
      }
      overlay.remove();
      setStatus(`Custom asset "${label}" saved. Place it from Asset Templates.`);
      if (typeof afterSave === "function") {
        afterSave();
      }
    } catch (error) {
      showError(`Save failed: ${error.message}`);
    }
  });
  document.body.appendChild(overlay);
}

function renderConfigEditor() {
  el.gridWrap.innerHTML = "";
  el.viewTitle.textContent = SharedApi.context?.draft ? "Layout studio" : "Movable Overlay Editor";

  const shell = document.createElement("div");
  shell.className = "config-editor-shell";

  const viewerPane = document.createElement("section");
  viewerPane.className = "config-viewer-pane";
  const inspectorPane = document.createElement("section");
  inspectorPane.className = "config-inspector-pane";

  const toolbar = document.createElement("div");
  toolbar.className = "config-toolbar";
  toolbar.innerHTML = `
    <button type="button" id="cfgBackToOverviewBtn"${state.config.focusedArea ? "" : " hidden"}>Return to Overlay Editor</button>
    <div class="config-toolbox">
      <span class="config-toolbox-label">Movable Toolbox</span>
      <div class="config-tool" draggable="true" data-tool-kind="pallet">Pallet</div>
      <div class="config-tool" draggable="true" data-tool-kind="slotted_pallet">Slotted Pallet</div>
      <div class="config-tool" draggable="true" data-tool-kind="cart">Cart</div>
      <div class="config-tool" draggable="true" data-tool-kind="custom">Custom Item</div>
      <button type="button" id="cfgTemplatePickerBtn" title="Place racks, zones, cabinets, machines, and other assets from templates">Asset Templates...</button>
    </div>
    <button type="button" id="cfgUnlockLayoutBtn" class="${state.config.layoutUnlocked ? "active-toggle" : ""}" title="When unlocked you can reposition existing racks, zones, and obstructions by dragging. Resizing, renaming, and deletion stay disabled.">${state.config.layoutUnlocked ? "Lock Layout" : "Unlock Layout"}</button>
    <button type="button" id="cfgFitBtn">Fit</button>
    <button type="button" id="cfgZoomOutBtn">-</button>
    <button type="button" id="cfgZoomInBtn">+</button>
    <span class="config-toolbar-hint" id="cfgToolHint"></span>
  `;
  viewerPane.appendChild(toolbar);

  const viewport = document.createElement("div");
  viewport.className = "config-viewport";
  const canvas = document.createElement("div");
  canvas.className = "config-canvas";
  const layoutWidth = Math.max(Number(state.config.layout.width || 1200), 600);
  const layoutHeight = Math.max(Number(state.config.layout.height || 800), 500);
  canvas.style.width = `${layoutWidth}px`;
  canvas.style.height = `${layoutHeight}px`;

  const selectedKey = configSelectionKey(state.config.selection.type, state.config.selection.id);
  configAreaBoxes().forEach((box) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "config-area-box";
    node.dataset.entityType = "area";
    node.dataset.entityId = box.name;
    node.style.left = `${box.x}px`;
    node.style.top = `${box.y}px`;
    node.style.width = `${Math.max(120, box.width)}px`;
    node.style.height = `${Math.max(100, box.height)}px`;
    if (false && configSelectionKey("area", box.name) === selectedKey) {
      node.classList.add("selected");
    }

    const label = document.createElement("span");
    label.className = "config-area-label";
    label.textContent = box.name;
    node.appendChild(label);

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.config.placementType) {
        const kind = state.config.placementType;
        const world = configWorldFromClient(viewport, event.clientX, event.clientY);
        createConfigToolEntity(kind, world)
          .then(() => {
            state.config.placementType = "";
            renderGrid();
          })
          .catch((error) => {
            setStatus(`Add item failed: ${error.message}`);
          });
        return;
      }
      if (configSetSelection("area", box.name)) {
        if (state.config.focusedArea !== box.name) {
          state.config.focusedArea = box.name;
          state.config.autoFitOnRender = true;
        }
        renderGrid();
      }
    });

    if (configSelectionKey("area", box.name) === selectedKey) {
      const resizeHandle = document.createElement("div");
      resizeHandle.className = "config-area-resize";
      resizeHandle.title = "Drag to resize area outline";
      resizeHandle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const startRect = { ...box };
        const startX = event.clientX;
        const startY = event.clientY;
        const onMove = (moveEvent) => {
          const dx = (moveEvent.clientX - startX) / state.config.viewport.zoom;
          const dy = (moveEvent.clientY - startY) / state.config.viewport.zoom;
          const previewW = Math.max(120, Math.round(startRect.width + dx));
          const previewH = Math.max(100, Math.round(startRect.height + dy));
          node.style.width = `${previewW}px`;
          node.style.height = `${previewH}px`;
        };
        const onUp = async (upEvent) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const dx = (upEvent.clientX - startX) / state.config.viewport.zoom;
          const dy = (upEvent.clientY - startY) / state.config.viewport.zoom;
          try {
            await saveOverviewAreaBox(box.name, {
              x: startRect.x,
              y: startRect.y,
              width: Math.max(120, Math.round(startRect.width + dx)),
              height: Math.max(100, Math.round(startRect.height + dy))
            });
            await refreshAfterConfigChange("Area outline resized.");
          } catch (error) {
            setStatus(`Area outline resize failed: ${error.message}`);
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      node.appendChild(resizeHandle);
    }
    canvas.appendChild(node);
  });

  const addEntityNode = (type, id, entity) => {
    const isFixedEntity = configIsFixedEntityType(type);
    const rect = configEntityRect(type, entity);
    const node = document.createElement("button");
    node.type = "button";
    node.className = `config-entity ${type}`;
    if (isFixedEntity) {
      node.classList.add("fixed-context");
    }
    node.dataset.entityType = type;
    node.dataset.entityId = id;
    node.style.left = `${rect.x}px`;
    node.style.top = `${rect.y}px`;
    node.style.width = `${Math.max(24, rect.width)}px`;
    node.style.height = `${Math.max(24, rect.height)}px`;
    const isSelected = configSelectionKey(type, id) === selectedKey;
    if (isSelected) {
      node.classList.add("selected");
    }
    const title = type === "row"
      ? id
      : (type === "zone" ? id : (entity.label || entity.id || id));
    let subtitle = "";
    if (type === "movable_item") {
      const kind = configMovableItemKind(entity);
      node.classList.add(`kind-${kind}`);
      node.dataset.itemKind = kind;
      subtitle = configToolSpec(kind).label;
    } else if (type === "slotted_pallet") {
      node.classList.add("kind-slotted_pallet");
      subtitle = "Slotted Pallet";
    } else if (type === "null_space") {
      const kind = configNullSpaceKind(entity);
      node.classList.add(`kind-${kind}`);
      node.dataset.itemKind = kind;
      subtitle = configToolSpec(kind).label;
    }
    node.innerHTML = `
      <span class="config-entity-title">${escapeHtml(title)}</span>
      ${subtitle ? `<span class="config-entity-subtitle">${escapeHtml(subtitle)}</span>` : ""}
    `;

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (configSetSelection(type, id)) {
        renderGrid();
      }
    });
    if (!configIsDragLocked(type)) {
      if (isFixedEntity && state.config.layoutUnlocked) {
        node.classList.add("layout-unlocked");
      }
      node.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest(".config-resize-handle")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      configSetSelection(type, id, { force: true });
      state.config.drag.active = true;
      state.config.drag.type = type;
      state.config.drag.id = id;
      state.config.drag.startX = event.clientX;
      state.config.drag.startY = event.clientY;
      state.config.drag.originX = Number(entity.x || 0);
      state.config.drag.originY = Number(entity.y || 0);
      state.config.drag.moved = false;
      state.config.drag.dropTargetId = "";
      state.config.drag.dropTargetType = "";

      const onMove = (moveEvent) => {
        if (!state.config.drag.active) {
          return;
        }
        const dx = (moveEvent.clientX - state.config.drag.startX) / state.config.viewport.zoom;
        const dy = (moveEvent.clientY - state.config.drag.startY) / state.config.viewport.zoom;
        if (!state.config.drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) {
          return;
        }
        state.config.drag.moved = true;
        let nextX = Math.round(state.config.drag.originX + dx);
        let nextY = Math.round(state.config.drag.originY + dy);
        if (isFixedEntity && state.config.focusedArea) {
          const areaBox = configAreaBoxByName(state.config.focusedArea);
          if (areaBox) {
            const rect = configEntityRect(type, entity);
            const w = Math.max(1, Number(rect.width) || 0);
            const h = Math.max(1, Number(rect.height) || 0);
            const dxFromEntity = (Number(rect.x) || 0) - Number(entity.x || 0);
            const dyFromEntity = (Number(rect.y) || 0) - Number(entity.y || 0);
            const minX = areaBox.x - dxFromEntity;
            const minY = areaBox.y - dyFromEntity;
            const maxX = areaBox.x + areaBox.width - w - dxFromEntity;
            const maxY = areaBox.y + areaBox.height - h - dyFromEntity;
            nextX = Math.min(Math.max(nextX, minX), Math.max(minX, maxX));
            nextY = Math.min(Math.max(nextY, minY), Math.max(minY, maxY));
          }
        }
        entity.x = nextX;
        entity.y = nextY;
        node.style.left = `${entity.x}px`;
        node.style.top = `${entity.y}px`;
        if (type === "movable_item" && configMovableItemKind(entity) === "pallet") {
          const previousPointerEvents = node.style.pointerEvents;
          node.style.pointerEvents = "none";
          const dropTarget = document
            .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
            ?.closest(".config-entity.slotted_pallet,.config-entity.row,.config-entity.movable_item");
          node.style.pointerEvents = previousPointerEvents;
          configClearDropTargets();
          if (dropTarget) {
            const dropType = String(dropTarget.dataset.entityType || "");
            const dropId = String(dropTarget.dataset.entityId || "");
            const targetEntity = dropType === "movable_item" ? configGetEntity("movable_item", dropId) : null;
            const allowed =
              dropType === "slotted_pallet" ||
              (dropType === "row" && rackHasEmptySlot(dropId)) ||
              (dropType === "movable_item" &&
                dropId !== id &&
                targetEntity &&
                configMovableItemKind(targetEntity) === "pallet");
            dropTarget.classList.add(allowed ? "drop-target" : "drop-blocked");
            if (allowed) {
              state.config.drag.dropTargetId = dropId;
              state.config.drag.dropTargetType = dropType;
            }
          }
        }
      };
      const onUp = async () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const moved = state.config.drag.moved;
        const dropTargetId = state.config.drag.dropTargetId;
        const dropTargetType = state.config.drag.dropTargetType;
        state.config.drag.active = false;
        configClearDropTargets();
        if (!moved) {
          return;
        }
        const swallowClick = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          document.removeEventListener("click", swallowClick, true);
        };
        document.addEventListener("click", swallowClick, true);
        setTimeout(() => document.removeEventListener("click", swallowClick, true), 350);
        try {
          if (type === "movable_item" && configMovableItemKind(entity) === "pallet" && dropTargetId) {
            entity.x = state.config.drag.originX;
            entity.y = state.config.drag.originY;
            if (dropTargetType === "slotted_pallet") {
              await startSlottedPendingAdd(dropTargetId, id);
              return;
            } else if (dropTargetType === "row") {
              if (!rackHasEmptySlot(dropTargetId)) {
                renderGrid();
                setStatus(`Rack ${dropTargetId} has no empty bays. Resolve occupancy first.`);
                return;
              }
              await startRackPendingAdd(dropTargetId, id, entity.area);
              return;
            } else if (dropTargetType === "movable_item") {
              await mergeConfigPallets(id, dropTargetId);
              return;
            }
          } else if (type === "row") {
            await apiPost("/api/config/row", rowPayloadFromEntity(entity, entity.name));
          } else if (type === "zone") {
            await apiPost("/api/config/zone", zonePayloadFromEntity(entity, entity.zone_id));
          } else if (type === "slotted_pallet") {
            await apiPost("/api/config/slotted-pallet", slottedPalletPayloadFromEntity(entity, entity.group_id));
          } else if (type === "movable_item") {
            await apiPost("/api/config/movable-item", movableItemPayloadFromEntity(entity));
          } else {
            await apiPost("/api/config/null-space", nullPayloadFromEntity(entity));
          }
          await refreshAfterConfigChange("Entity moved.");
        } catch (error) {
          setStatus(`Move failed: ${error.message}`);
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      });
    }

    if (isSelected && !isFixedEntity) {
      const resizeHandle = document.createElement("div");
      resizeHandle.className = "config-resize-handle";
      resizeHandle.title = "Drag to resize";
      resizeHandle.addEventListener("mousedown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const startRect = configEntityRect(type, entity);
        const startX = event.clientX;
        const startY = event.clientY;
        const onMove = (moveEvent) => {
          const dx = (moveEvent.clientX - startX) / state.config.viewport.zoom;
          const dy = (moveEvent.clientY - startY) / state.config.viewport.zoom;
          const previewW = Math.max(24, Math.round(startRect.width + dx));
          const previewH = Math.max(24, Math.round(startRect.height + dy));
          node.style.width = `${previewW}px`;
          node.style.height = `${previewH}px`;
        };
        const onUp = async (upEvent) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const dx = (upEvent.clientX - startX) / state.config.viewport.zoom;
          const dy = (upEvent.clientY - startY) / state.config.viewport.zoom;
          const finalW = Math.max(24, Math.round(startRect.width + dx));
          const finalH = Math.max(24, Math.round(startRect.height + dy));
          try {
            if (type === "row") {
              const bayEstimate = entity.orientation === "vertical"
                ? Math.max(1, Math.round(finalH / 22))
                : Math.max(1, Math.round(finalW / 22));
              entity.bay_count = bayEstimate;
              await apiPost("/api/config/row", rowPayloadFromEntity(entity, entity.name));
            } else if (type === "zone") {
              if (entity.layout === "grid") {
                const columns = Math.max(1, Math.round((finalW - 20) / 24));
                const rows = Math.max(1, Math.round((finalH - 20) / 24));
                entity.columns = columns;
                entity.slot_count = Math.max(1, columns * rows);
              } else {
                entity.slot_count = Math.max(1, Math.round((finalW - 30) / 16));
              }
              await apiPost("/api/config/zone", zonePayloadFromEntity(entity, entity.zone_id));
            } else if (type === "slotted_pallet") {
              entity.width = finalW;
              entity.height = finalH;
              if (entity.layout === "grid") {
                entity.columns = Math.max(1, Math.round((finalW - 20) / 80));
                const rows = Math.max(1, Math.round((finalH - 20) / 56));
                entity.slot_count = Math.max(1, entity.columns * rows);
              } else {
                entity.slot_count = Math.max(1, Math.round((finalW - 20) / 48));
              }
              await apiPost("/api/config/slotted-pallet", slottedPalletPayloadFromEntity(entity, entity.group_id));
            } else if (type === "movable_item") {
              entity.width = finalW;
              entity.height = finalH;
              await apiPost("/api/config/movable-item", movableItemPayloadFromEntity(entity));
            } else {
              entity.width = finalW;
              entity.height = finalH;
              await apiPost("/api/config/null-space", nullPayloadFromEntity(entity));
            }
            await refreshAfterConfigChange("Entity resized.");
          } catch (error) {
            setStatus(`Resize failed: ${error.message}`);
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      node.appendChild(resizeHandle);
    }
    canvas.appendChild(node);
  };

  const showAreaContents = Boolean(configVisibleAreaName());
  if (showAreaContents) {
    canvas.classList.add("area-floor");
    configVisibleRows().forEach((row) => addEntityNode("row", String(row.name || ""), row));
    configVisibleZones().forEach((zone) => addEntityNode("zone", String(zone.zone_id || ""), zone));
    configVisibleNullSpaces().forEach((space) => addEntityNode("null_space", String(space.space_id || ""), space));
    configVisibleSlottedPallets().forEach((pallet) => addEntityNode("slotted_pallet", String(pallet.group_id || ""), pallet));
    configVisibleMovableItems().forEach((item) => addEntityNode("movable_item", String(item.id || ""), item));
  }

  configApplyTransform(canvas);
  viewport.appendChild(canvas);
  viewerPane.appendChild(viewport);
  shell.appendChild(viewerPane);

  const selected = configGetEntity(state.config.selection.type, state.config.selection.id);
  const areaCsv = state.config.areas.join(", ");
  const selectionHint = selected ? `${state.config.selection.type}: ${state.config.selection.id}` : "No selection";
  inspectorPane.innerHTML = `
    <details class="config-details" open>
      <summary>Fixed Layout Context</summary>
      <div class="config-inspector-grid">
        <div><label for="cfgLayoutWidth">Width</label><input id="cfgLayoutWidth" type="number" min="200" value="${escapeHtml(state.config.layout.width || 1200)}" readonly></div>
        <div><label for="cfgLayoutHeight">Height</label><input id="cfgLayoutHeight" type="number" min="200" value="${escapeHtml(state.config.layout.height || 800)}" readonly></div>
        <div><label for="cfgLayoutGrid">Grid</label><input id="cfgLayoutGrid" type="number" min="1" value="${escapeHtml(state.config.layout.grid || 40)}" readonly></div>
        <div><label for="cfgAreas">Areas (csv)</label><input id="cfgAreas" type="text" value="${escapeHtml(areaCsv)}" readonly></div>
      </div>
      <p class="hint">Desktop-authored layout is read-only here. Use this editor to place and move movable operational items on top of the saved map.</p>
    </details>
    <details class="config-details" open>
      <summary>Selected Entity</summary>
      <p class="hint">${escapeHtml(selectionHint)}</p>
      <div id="cfgSelectedEditor"></div>
      <div class="config-actions-row">
        <button id="cfgSaveEntityBtn" type="button">Save Entity</button>
        <button id="cfgDuplicateEntityBtn" type="button">Duplicate</button>
        <button id="cfgDeleteEntityBtn" type="button">Delete</button>
      </div>
    </details>
  `;
  shell.appendChild(inspectorPane);
  el.gridWrap.appendChild(shell);

  const toolHint = document.getElementById("cfgToolHint");
  toolHint.textContent = state.config.placementType
    ? `Click inside ${state.config.focusedArea || "the layout"} to place a ${configToolSpec(state.config.placementType).label.toLowerCase()}. Fixed layout is read-only.`
    : (state.config.focusedArea
      ? `Create and place pallets, carts, and custom movable items in ${state.config.focusedArea}. Fixed layout is read-only.`
      : "Select an area to zoom into it, then add and place pallets, slotted pallets, carts, or custom items in the read-only layout.");
  if (SharedApi.context?.draft) {
    toolHint.textContent = state.config.placementType ? "Click inside the area to place the selected layout asset." : "Select an area. Add assets, drag to position, or select an object to edit its structure.";
    toolbar.querySelector(".config-toolbox-label").textContent = "Layout assets";
    toolbar.querySelectorAll(".config-tool[data-tool-kind]").forEach(tool => {
      tool.hidden = tool.dataset.toolKind !== "slotted_pallet";
    });
    document.getElementById("cfgUnlockLayoutBtn").title = "Lock or unlock dragging of the layout.";
    inspectorPane.querySelector("summary").textContent = "Map settings";
    inspectorPane.querySelector(".hint").textContent = "Edit this draft. Published layout and current stock stay unchanged until you publish.";
    ["cfgLayoutWidth", "cfgLayoutHeight", "cfgLayoutGrid", "cfgAreas"].forEach(id => document.getElementById(id).removeAttribute("readonly"));
    if (state.config.mapSettingsDraft) {
      Object.entries(state.config.mapSettingsDraft).forEach(([id, value]) => document.getElementById(id).value = value);
    }
    const saveLayout = document.createElement("button");
    saveLayout.textContent = "Save map settings";
    saveLayout.type = "button";
    saveLayout.addEventListener("click", async () => {
      try {
        const areas = document.getElementById("cfgAreas").value.split(",").map(s => s.trim()).filter(Boolean);
        const used = [...state.config.rows, ...state.config.zones, ...state.config.slotted_pallets].map(r => r.area).filter(Boolean);
        if (used.some(area => !areas.includes(area))) throw new Error("Move the locations out of an area before removing its name.");
        await apiPost("/api/config/layout", {areas, layout:{...state.config.layout,
          width:Math.max(200, Number(document.getElementById("cfgLayoutWidth").value)),
          height:Math.max(200, Number(document.getElementById("cfgLayoutHeight").value)),
          grid:Math.max(1, Number(document.getElementById("cfgLayoutGrid").value))}});
        state.config.mapSettingsDraft=null;
        await refreshAfterConfigChange("Draft map settings saved.");
      } catch(error) { setStatus(error.message); }
    });
    inspectorPane.querySelector("details").append(saveLayout);
    inspectorPane.querySelectorAll("#cfgLayoutWidth,#cfgLayoutHeight,#cfgLayoutGrid,#cfgAreas").forEach(input => input.addEventListener("input", () => {
      state.config.mapSettingsDraft=Object.fromEntries(["cfgLayoutWidth","cfgLayoutHeight","cfgLayoutGrid","cfgAreas"].map(id => [id, document.getElementById(id).value]));
      setStatus("Unsaved map settings. Use Save map settings to apply them to the draft.");
    }));
  }

  document.getElementById("cfgBackToOverviewBtn")?.addEventListener("click", () => {
    resetConfigToDefaultLanding();
    loadAreasAndRacks()
      .then(() => {
        renderGrid();
      })
      .catch((error) => {
        setStatus(`Return failed: ${error.message}`);
      });
  });
  document.getElementById("cfgBreakApartBtn")?.addEventListener("click", async () => {
    if (state.config.selection.type !== "slotted_pallet") {
      return;
    }
    try {
      await apiPost("/api/config/slotted-pallet/break-apart", { group_id: state.config.selection.id });
      state.config.selection = { type: "", id: "" };
      await refreshAfterConfigChange("Slotted pallet broken apart.");
    } catch (error) {
      setStatus(`Break apart failed: ${error.message}`);
    }
  });

  const selectedEditor = document.getElementById("cfgSelectedEditor");
  if (!selected) {
    selectedEditor.innerHTML = `<p class="hint">Select a rack, floor zone, obstruction, slotted pallet, or movable item in the viewer.</p>`;
  } else if (state.config.selection.type === "area") {
    selectedEditor.innerHTML = `
      <p class="hint">Area outlines are read-only in the movable overlay editor.</p>
      <div class="config-inspector-grid">
        <div><label>Area</label><input data-f="name" type="text" value="${escapeHtml(selected.name || "")}" readonly></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 0)}" readonly></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 0)}" readonly></div>
        <div><label>Width</label><input data-f="width" type="number" min="120" value="${escapeHtml(selected.width || 120)}" readonly></div>
        <div><label>Height</label><input data-f="height" type="number" min="100" value="${escapeHtml(selected.height || 100)}" readonly></div>
      </div>
    `;
  } else if (state.config.selection.type === "row") {
    selectedEditor.innerHTML = `
      <p class="hint">Racks are desktop-authored fixed layout. Their geometry is shown here as read-only context for movable placement.</p>
      <div class="config-inspector-grid">
        <div><label>Name</label><input data-f="name" type="text" value="${escapeHtml(selected.name || "")}" readonly></div>
        <div><label>Area</label><input data-f="area" type="text" value="${escapeHtml(selected.area || "")}" readonly></div>
        <div><label>Bays</label><input data-f="bay_count" type="number" min="1" value="${escapeHtml(selected.bay_count || 1)}" readonly></div>
        <div><label>Levels</label><input data-f="levels_default" type="number" min="1" value="${escapeHtml(selected.levels_default || 1)}" readonly></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 40)}" readonly></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 40)}" readonly></div>
        <div><label>Width</label><input type="number" value="${escapeHtml(selected.width || rowRect(selected).width)}" readonly></div>
        <div><label>Height</label><input type="number" value="${escapeHtml(selected.height || rowRect(selected).height)}" readonly></div>
      </div>
    `;
  } else if (state.config.selection.type === "slotted_pallet") {
    selectedEditor.innerHTML = `
      <div class="config-inspector-grid">
        <div><label>Group ID</label><input data-f="group_id" type="text" value="${escapeHtml(selected.group_id || "")}"></div>
        <div><label>Label</label><input data-f="label" type="text" value="${escapeHtml(selected.label || "")}"></div>
        <div><label>Area</label><input data-f="area" type="text" value="${escapeHtml(selected.area || "")}"></div>
        <div><label>Slots</label><input data-f="slot_count" type="number" min="1" value="${escapeHtml(selected.slot_count || 1)}"></div>
        <div><label>Columns</label><input data-f="columns" type="number" min="1" value="${escapeHtml(selected.columns || 1)}"></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 100)}"></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 100)}"></div>
        <div><label>Width</label><input data-f="width" type="number" min="80" value="${escapeHtml(selected.width || 280)}"></div>
        <div><label>Height</label><input data-f="height" type="number" min="80" value="${escapeHtml(selected.height || 160)}"></div>
        <div><label>Layout</label><select data-f="layout"><option value="line"${selected.layout === "line" ? " selected" : ""}>line</option><option value="grid"${selected.layout === "grid" ? " selected" : ""}>grid</option></select></div>
      </div>
      <div class="config-actions-row">
        <button id="cfgBreakApartBtn" type="button">Break Apart</button>
      </div>
    `;
  } else if (state.config.selection.type === "zone") {
    selectedEditor.innerHTML = `
      <p class="hint">Floor zones are desktop-authored fixed layout. Their geometry is read-only in the movable overlay editor.</p>
      <div class="config-inspector-grid">
        <div><label>Zone ID</label><input data-f="zone_id" type="text" value="${escapeHtml(selected.zone_id || "")}" readonly></div>
        <div><label>Area</label><input data-f="area" type="text" value="${escapeHtml(selected.area || "")}" readonly></div>
        <div><label>Slots</label><input data-f="slot_count" type="number" min="1" value="${escapeHtml(selected.slot_count || 1)}" readonly></div>
        <div><label>Columns</label><input data-f="columns" type="number" min="1" value="${escapeHtml(selected.columns || 4)}" readonly></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 40)}" readonly></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 40)}" readonly></div>
        <div><label>Width</label><input type="number" value="${escapeHtml(selected.width || zoneRect(selected).width)}" readonly></div>
        <div><label>Height</label><input type="number" value="${escapeHtml(selected.height || zoneRect(selected).height)}" readonly></div>
      </div>
    `;
  } else if (state.config.selection.type === "movable_item") {
    selectedEditor.innerHTML = `
      <div class="config-inspector-grid">
        <div><label>ID</label><input data-f="id" type="text" value="${escapeHtml(selected.id || "")}"></div>
        <div><label>Type</label><select data-f="kind"><option value="pallet"${configMovableItemKind(selected) === "pallet" ? " selected" : ""}>Pallet</option><option value="cart"${configMovableItemKind(selected) === "cart" ? " selected" : ""}>Cart</option><option value="custom"${configMovableItemKind(selected) === "custom" ? " selected" : ""}>Custom Item</option></select></div>
        <div><label>Area</label><input data-f="area" type="text" value="${escapeHtml(selected.area || "")}"></div>
        <div><label>Name</label><input data-f="label" type="text" value="${escapeHtml(selected.label || "")}"></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 100)}"></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 100)}"></div>
        <div><label>Width</label><input data-f="width" type="number" min="1" value="${escapeHtml(selected.width || 120)}"></div>
        <div><label>Height</label><input data-f="height" type="number" min="1" value="${escapeHtml(selected.height || 90)}"></div>
      </div>
    `;
  } else {
    selectedEditor.innerHTML = `
      <p class="hint">Obstructions and fixed context objects are desktop-authored and read-only here.</p>
      <div class="config-inspector-grid">
        <div><label>ID</label><input data-f="space_id" type="text" value="${escapeHtml(selected.space_id || "")}" readonly></div>
        <div><label>Type</label><input type="text" value="${escapeHtml(configToolSpec(configNullSpaceKind(selected)).label)}" readonly></div>
        <div><label>Area</label><input data-f="area" type="text" value="${escapeHtml(selected.area || "")}" readonly></div>
        <div><label>Name</label><input data-f="label" type="text" value="${escapeHtml(selected.label || "")}" readonly></div>
        <div><label>Shape</label><input type="text" value="${escapeHtml(selected.shape || "rectangle")}" readonly></div>
        <div><label>X</label><input data-f="x" type="number" value="${escapeHtml(selected.x || 100)}" readonly></div>
        <div><label>Y</label><input data-f="y" type="number" value="${escapeHtml(selected.y || 100)}" readonly></div>
        <div><label>Width</label><input data-f="width" type="number" min="1" value="${escapeHtml(selected.width || 160)}" readonly></div>
        <div><label>Height</label><input data-f="height" type="number" min="1" value="${escapeHtml(selected.height || 120)}" readonly></div>
      </div>
    `;
  }

  if (SharedApi.context?.draft && selected) {
    selectedEditor.querySelectorAll("input[data-f]").forEach(input => {
      if (!(state.config.selection.type === "area" && input.dataset.f === "name")) input.removeAttribute("readonly");
    });
    selectedEditor.querySelectorAll("p.hint").forEach(hint => hint.textContent = "Changes are saved to this layout draft. Inventory stays with its location when renamed.");
  }
  selectedEditor.querySelectorAll("input,select").forEach((input) => {
    if (input.hasAttribute("readonly") || input.disabled) {
      return;
    }
    input.addEventListener("input", () => {
      state.config.dirty = true;
      setStatus("Unsaved config changes.");
    });
  });

  const fixedSelection = (configIsFixedEntityType(state.config.selection.type) && !SharedApi.context?.draft) || (SharedApi.context?.draft && state.config.selection.type === "movable_item");
  const saveEntityBtn = document.getElementById("cfgSaveEntityBtn");
  const duplicateEntityBtn = document.getElementById("cfgDuplicateEntityBtn");
  const deleteEntityBtn = document.getElementById("cfgDeleteEntityBtn");
  if (saveEntityBtn) {
    saveEntityBtn.disabled = fixedSelection || !selected;
    saveEntityBtn.hidden = fixedSelection;
  }
  if (duplicateEntityBtn) {
    duplicateEntityBtn.disabled = fixedSelection || !selected;
    duplicateEntityBtn.hidden = fixedSelection;
  }
  if (deleteEntityBtn) {
    deleteEntityBtn.disabled = fixedSelection || !selected;
    deleteEntityBtn.hidden = fixedSelection;
  }

  saveEntityBtn?.addEventListener("click", async () => {
    try {
      if (!selected) {
        setStatus("Select an entity first.");
        return;
      }
      if (fixedSelection) {
        setStatus("Fixed layout is read-only in the movable overlay editor.");
        return;
      }
      await saveConfigSelectionIfDirty({ message: "Entity saved." });
    } catch (_error) {
      return;
    }
  });

  deleteEntityBtn?.addEventListener("click", async () => {
    if (!selected) {
      setStatus("Select an entity first.");
      return;
    }
    if (fixedSelection) {
      setStatus("Fixed layout is read-only in the movable overlay editor.");
      return;
    }
    const targetLabel = state.config.selection.type === "area"
      ? `clear outline override for area ${state.config.selection.id}`
      : `delete ${state.config.selection.type} ${state.config.selection.id}`;
    const confirmed = window.confirm(`Confirm ${targetLabel}?`);
    if (!confirmed) {
      return;
    }
    try {
      if (state.config.selection.type === "area") {
        await clearConfigAreaBox(selected.name);
      } else if (state.config.selection.type === "row") {
        await apiPost("/api/config/row/delete", { name: selected.name });
      } else if (state.config.selection.type === "zone") {
        await apiPost("/api/config/zone/delete", { zone_id: selected.zone_id });
      } else if (state.config.selection.type === "slotted_pallet") {
        await apiPost("/api/config/slotted-pallet/delete", { group_id: selected.group_id });
      } else if (state.config.selection.type === "movable_item") {
        await apiPost("/api/config/movable-item/delete", { id: selected.id });
      } else {
        await apiPost("/api/config/null-space/delete", { space_id: selected.space_id });
      }
      state.config.selection = { type: "", id: "" };
      state.config.dirty = false;
      await refreshAfterConfigChange("Entity deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  });

  duplicateEntityBtn?.addEventListener("click", async () => {
    if (!selected) {
      return;
    }
    if (fixedSelection) {
      setStatus("Fixed layout is read-only in the movable overlay editor.");
      return;
    }
    try {
      if (state.config.selection.type === "area") {
        setStatus("Area outlines cannot be duplicated.");
        return;
      }
      if (state.config.selection.type === "row") {
        const names = new Set(state.config.rows.map((r) => r.name));
        const copy = { ...selected, name: nextConfigId("R", names), x: Number(selected.x || 0) + 40, y: Number(selected.y || 0) + 40 };
        await apiPost("/api/config/row", rowPayloadFromEntity(copy));
        state.config.selection = { type: "row", id: copy.name };
      } else if (state.config.selection.type === "zone") {
        const ids = new Set(state.config.zones.map((z) => z.zone_id));
        const copy = { ...selected, zone_id: nextConfigId("Z", ids), x: Number(selected.x || 0) + 40, y: Number(selected.y || 0) + 40 };
        await apiPost("/api/config/zone", zonePayloadFromEntity(copy));
        state.config.selection = { type: "zone", id: copy.zone_id };
      } else if (state.config.selection.type === "slotted_pallet") {
        const ids = new Set(state.config.slotted_pallets.map((item) => item.group_id));
        const copy = { ...selected, group_id: nextConfigId("SP-", ids), x: Number(selected.x || 0) + 40, y: Number(selected.y || 0) + 40 };
        if (!copy.label || copy.label === configDefaultToolLabel("slotted_pallet", selected.group_id)) {
          copy.label = configDefaultToolLabel("slotted_pallet", copy.group_id);
        }
        await apiPost("/api/config/slotted-pallet", slottedPalletPayloadFromEntity(copy));
        state.config.selection = { type: "slotted_pallet", id: copy.group_id };
      } else if (state.config.selection.type === "movable_item") {
        const ids = new Set(state.config.movable_items.map((item) => item.id));
        const prefix = configToolSpec(configMovableItemKind(selected)).prefix;
        const copy = { ...selected, id: nextConfigId(prefix, ids), x: Number(selected.x || 0) + 40, y: Number(selected.y || 0) + 40 };
        if (!copy.label || copy.label === configDefaultToolLabel(configMovableItemKind(selected), selected.id)) {
          copy.label = configDefaultToolLabel(configMovableItemKind(copy), copy.id);
        }
        await apiPost("/api/config/movable-item", movableItemPayloadFromEntity(copy));
        state.config.selection = { type: "movable_item", id: copy.id };
      } else {
        const ids = new Set(state.config.null_spaces.map((s) => s.space_id));
        const prefix = configToolSpec(configNullSpaceKind(selected)).prefix;
        const copy = { ...selected, space_id: nextConfigId(prefix, ids), x: Number(selected.x || 0) + 40, y: Number(selected.y || 0) + 40 };
        await apiPost("/api/config/null-space", nullPayloadFromEntity(copy));
        state.config.selection = { type: "null_space", id: copy.space_id };
      }
      await refreshAfterConfigChange("Entity duplicated.");
    } catch (error) {
      setStatus(`Duplicate failed: ${error.message}`);
    }
  });

  toolbar.querySelectorAll(".config-tool").forEach((tool) => {
    const kind = tool.getAttribute("data-tool-kind") || "";
    tool.classList.toggle("active-tool", state.config.placementType === kind);
    tool.addEventListener("click", () => {
      state.config.placementType = state.config.placementType === kind ? "" : kind;
      renderGrid();
      if (state.config.placementType) {
        setStatus(`Click inside ${state.config.focusedArea || "the layout"} to place a ${configToolSpec(kind).label.toLowerCase()}.`);
      } else {
        setStatus("Placement mode cleared.");
      }
    });
    tool.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-config-tool", kind);
      event.dataTransfer?.setData("text/plain", kind);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "copy";
      }
      viewport.classList.add("tool-drag-active");
    });
    tool.addEventListener("dragend", () => {
      viewport.classList.remove("tool-drag-active", "tool-drop-target");
    });
  });
  document.getElementById("cfgZoomInBtn")?.addEventListener("click", () => {
    const rect = viewport.getBoundingClientRect();
    configZoomAtClientPoint(viewport, canvas, state.config.viewport.zoom * 1.15, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById("cfgZoomOutBtn")?.addEventListener("click", () => {
    const rect = viewport.getBoundingClientRect();
    configZoomAtClientPoint(viewport, canvas, state.config.viewport.zoom * 0.85, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById("cfgFitBtn")?.addEventListener("click", () => {
    fitConfigViewport(viewport, canvas);
  });
  document.getElementById("cfgUnlockLayoutBtn")?.addEventListener("click", () => {
    state.config.layoutUnlocked = !state.config.layoutUnlocked;
    setStatus(state.config.layoutUnlocked
      ? "Layout unlocked \u2014 drag racks, zones, and obstructions to reposition. Resizing stays disabled."
      : "Layout locked. Racks, zones, and obstructions are fixed in place.");
    renderGrid();
  });
  document.getElementById("cfgTemplatePickerBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTemplatePicker(toolbar);
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    configZoomAtClientPoint(viewport, canvas, state.config.viewport.zoom * factor, event.clientX, event.clientY);
  }, { passive: false });

  viewport.addEventListener("dragover", (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes("application/x-config-tool") && !types.includes("text/plain")) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    viewport.classList.add("tool-drop-target");
  });

  viewport.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && viewport.contains(event.relatedTarget)) {
      return;
    }
    viewport.classList.remove("tool-drop-target");
  });

  viewport.addEventListener("drop", async (event) => {
    const kind = event.dataTransfer?.getData("application/x-config-tool") || event.dataTransfer?.getData("text/plain") || "";
    viewport.classList.remove("tool-drag-active", "tool-drop-target");
    if (!kind) {
      return;
    }
    event.preventDefault();
    try {
      const world = configWorldFromClient(viewport, event.clientX, event.clientY);
      await createConfigToolEntity(kind, world);
    } catch (error) {
      setStatus(`Add item failed: ${error.message}`);
    }
  });

  viewport.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest(".config-entity") || event.target.closest(".config-area-box")) {
      return;
    }
    if (state.config.placementType) {
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const panX = state.config.viewport.panX;
    const panY = state.config.viewport.panY;
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      state.config.viewport.panX = panX + dx;
      state.config.viewport.panY = panY + dy;
      configApplyTransform(canvas);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  viewport.addEventListener("click", (event) => {
    if (event.target.closest(".config-entity") || event.target.closest(".config-area-box")) {
      return;
    }
    if (state.config.placementType) {
      const kind = state.config.placementType;
      const world = configWorldFromClient(viewport, event.clientX, event.clientY);
      createConfigToolEntity(kind, world)
        .then(() => {
          state.config.placementType = "";
          renderGrid();
        })
        .catch((error) => {
          setStatus(`Add item failed: ${error.message}`);
        });
      return;
    }
    configSetSelection("", "", { force: true });
    renderGrid();
  });

  if (state.config.autoFitOnRender) {
    requestAnimationFrame(() => {
      fitConfigViewport(viewport, canvas);
      state.config.autoFitOnRender = false;
    });
  }

  const visibleRows = configVisibleRows();
  const visibleZones = configVisibleZones();
  const visibleNullSpaces = configVisibleNullSpaces();
  const visibleSlottedPallets = configVisibleSlottedPallets();
  const visibleMovableItems = configVisibleMovableItems();
  el.viewSummary.textContent =
    `Rows ${visibleRows.length} | Zones ${visibleZones.length} | Obstacles ${visibleNullSpaces.length} | ` +
    `Slotted ${visibleSlottedPallets.length} | Items ${visibleMovableItems.length}`;
  viewport.classList.toggle("placement-armed", !!state.config.placementType);
}

function rowRect(row) {
  return SharedGeometry.entityRect("row", row);
}

function zoneRect(zone) {
  return SharedGeometry.entityRect("zone", zone);
}

function applyOverviewTransform(canvas) {
  // Screen = world * zoom + pan (see geometry.js worldToScreen). Rotation of
  // individual entities happens on the entity nodes, not the canvas.
  canvas.style.transform = `translate(${state.overview.panX}px, ${state.overview.panY}px) scale(${state.overview.zoom})`;
}

function overviewBounds() {
  const rects = [];
  if (!state.overview.focusedArea) {
    overviewAreaBoxes().forEach((box) => {
      rects.push({ x: box.x, y: box.y, width: box.width, height: box.height });
    });
  }
  if (state.overview.focusedArea) {
    state.racks
      .filter((row) => String(row.area || "").trim() === state.overview.focusedArea)
      .forEach((row) => rects.push(rowRect(row)));
    state.zones
      .filter((zone) => String(zone.area || "").trim() === state.overview.focusedArea)
      .forEach((zone) => rects.push(zoneRect(zone)));
    state.nullSpaces
      .filter((space) => String(space.area || "").trim() === state.overview.focusedArea)
      .forEach((space) => rects.push(nullSpaceRect(space)));
    state.slottedPallets
      .filter((pallet) => String(pallet.area || "").trim() === state.overview.focusedArea)
      .forEach((pallet) => rects.push(slottedPalletRect(pallet)));
    state.movableItems
      .filter((item) => String(item.area || "").trim() === state.overview.focusedArea)
      .forEach((item) => rects.push(movableItemRect(item)));
  }
  return SharedGeometry.boundsOf(rects);
}

const OVERVIEW_CANVAS_PADDING = 40;

function overviewCanvasSize() {
  const bounds = overviewBounds();
  const padding = OVERVIEW_CANVAS_PADDING;
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    return {
      width: Math.max(Math.ceil(bounds.maxX + padding), Math.ceil(bounds.minX + bounds.width + padding)),
      height: Math.max(Math.ceil(bounds.maxY + padding), Math.ceil(bounds.minY + bounds.height + padding))
    };
  }
  return {
    width: Math.max(Number(state.layout?.width || 1200), 600),
    height: Math.max(Number(state.layout?.height || 800), 500)
  };
}

function overviewAreaOverviewMap() {
  const raw = state.layout?.area_overview;
  return raw && typeof raw === "object" ? raw : {};
}

function overviewAreaNames() {
  const authoredAreas = (state.areas || []).map((name) => String(name || "").trim()).filter(Boolean);
  if (authoredAreas.length) {
    return authoredAreas;
  }
  const names = new Set(Object.keys(overviewAreaOverviewMap()).map((name) => String(name || "").trim()).filter(Boolean));
  return Array.from(names);
}

function overviewAreaBoxes() {
  const areaOverviewMap = overviewAreaOverviewMap();
  const visibleArea = String(state.overview.focusedArea || "").trim() || (state.area === "All Areas" ? "" : state.area);
  const areaNames = overviewAreaNames().filter((name) => !visibleArea || name === visibleArea);
  const padding = 18;
  return areaNames.map((areaName, index) => {
    const entry = areaOverviewMap[areaName] || {};
    const rects = [];
    state.racks.filter((row) => String(row.area || "").trim() === areaName).forEach((row) => rects.push(rowRect(row)));
    state.zones.filter((zone) => String(zone.area || "").trim() === areaName).forEach((zone) => rects.push(zoneRect(zone)));
    if (rects.length) {
      const minX = Math.min(...rects.map((rect) => rect.x));
      const minY = Math.min(...rects.map((rect) => rect.y));
      const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
      const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
      return {
        name: areaName,
        x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (minX - padding),
        y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (minY - padding - 22),
        width: Math.max(120, Number(entry.width || (maxX - minX + padding * 2))),
        height: Math.max(100, Number(entry.height || (maxY - minY + padding * 2 + 22)))
      };
    }
    return {
      name: areaName,
      x: Number.isFinite(Number(entry.x)) ? Number(entry.x) : (40 + (index % 3) * 360),
      y: Number.isFinite(Number(entry.y)) ? Number(entry.y) : (40 + Math.floor(index / 3) * 260),
      width: Math.max(120, Number(entry.width || 260)),
      height: Math.max(100, Number(entry.height || 180))
    };
  });
}

function overviewAreaBoxByName(areaName) {
  return overviewAreaBoxes().find((box) => box.name === areaName) || null;
}

function fitOverviewRect(rect) {
  const viewport = el.gridWrap.querySelector(".overview-viewport");
  if (!viewport || !rect) {
    return;
  }
  const fitted = SharedGeometry.fitTransform(
    rect,
    { width: viewport.clientWidth, height: viewport.clientHeight },
    { margin: 24, minZoom: OVERVIEW_MIN_ZOOM, maxZoom: OVERVIEW_FOCUS_MAX_ZOOM }
  );
  if (!fitted) {
    return;
  }
  state.overview.zoom = fitted.zoom;
  state.overview.panX = fitted.panX;
  state.overview.panY = fitted.panY;
  const canvas = viewport.querySelector(".overview-canvas");
  if (canvas) {
    applyOverviewTransform(canvas);
  }
}

async function saveOverviewAreaBox(areaName, box) {
  const currentMap = overviewAreaOverviewMap();
  const nextAreaOverview = {
    ...currentMap,
    [areaName]: {
      ...(currentMap[areaName] || {}),
      x: Math.round(Number(box.x || 0)),
      y: Math.round(Number(box.y || 0)),
      width: Math.max(120, Math.round(Number(box.width || 120))),
      height: Math.max(100, Math.round(Number(box.height || 100)))
    }
  };
  const response = await apiPost("/api/config/layout", {
    layout: {
      area_overview: nextAreaOverview
    }
  });
  state.layout = { ...(state.layout || {}), ...(response.layout || {}), area_overview: nextAreaOverview };
  if (state.config?.layout) {
    state.config.layout = { ...(state.config.layout || {}), area_overview: nextAreaOverview };
  }
}

function fitOverview() {
  if (state.overview.focusedArea) {
    const bounds = overviewBounds();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      fitOverviewRect({ x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height });
      return;
    }
    const focusRect = overviewAreaBoxByName(state.overview.focusedArea);
    if (focusRect) {
      fitOverviewRect(focusRect);
      return;
    }
  }
  const viewport = el.gridWrap.querySelector(".overview-viewport");
  if (!viewport) {
    return;
  }
  const bounds = overviewBounds();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return;
  }
  const fitted = SharedGeometry.fitTransform(
    { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height },
    { width: viewport.clientWidth, height: viewport.clientHeight },
    { margin: 30, minZoom: OVERVIEW_MIN_ZOOM, maxZoom: OVERVIEW_MAX_ZOOM }
  );
  if (!fitted) {
    return;
  }
  state.overview.zoom = fitted.zoom;
  state.overview.panX = fitted.panX;
  state.overview.panY = fitted.panY;
  const canvas = viewport.querySelector(".overview-canvas");
  if (canvas) {
    applyOverviewTransform(canvas);
  }
}

function createRendererContext() {
  return {
    state,
    el,
    OVERVIEW_MIN_ZOOM,
    OVERVIEW_MAX_ZOOM,
    apiGet,
    apiPost,
    applyAuditClass,
    applyHeatClass,
    applyManagementFilters,
    applyOverviewTransform,
    auditAggregateStatus,
    auditStatusForCell,
    clamp,
    closeInspector,
    completeSlottedPendingAdd,
    configMovableItemKind,
    configToolSpec,
    effectiveViewMode,
    entityHeatBucket,
    escapeHtml,
    findCell,
    fitOverview,
    fitOverviewRect,
    floorCellKey,
    formatInteger,
    inventoryAgeBucketLabels,
    inventoryAgeDisplay,
    inventoryAgeInfo,
    inAuditWorkspace,
    isAdmin,
    isInspectorVisible,
    isSearchModeActive,
    jumpToMovableItemResult,
    loadAreasAndRacks,
    loadManagementPreview,
    loadRackModel,
    loadSlottedModel,
    loadZoneModel,
    managementDefaultExportPath,
    managementFiltersFromUi,
    managementRowsFromWarehouse,
    movableItemKey,
    movableItemRect,
    nullSpaceRect,
    openCustomAssetViewer,
    overviewItemInsideFocusedArea,
    openInspectorNearSelection,
    overviewAreaBoxByName,
    overviewAreaBoxes,
    overviewBounds,
    overviewCanvasSize,
    persistUserLastArea,
    startOverviewMovableDrag,
    dispensePalletFromStack,
    openPalletStackMenu,
    enterTransferPlacingPhase,
    parseSmartQuery,
    rackCellKey,
    rackLevelPostVisibility,
    rackSearchHitSet,
    renderGrid,
    rowRect,
    selectCell,
    setStatus,
    slottedCellKey,
    slottedHasEmptySlot,
    slottedPalletRect,
    supportAfterSet,
    summarizeManagementRows,
    syncControlVisibility,
    updateFloorSummary,
    updateManagementSummary,
    updateOverviewSummary,
    updateRackSummary,
    zoneRect
  };
}

function renderOverview() {
  return SharedRenderers.renderOverview(createRendererContext());
}

function bindOverviewInteraction(viewport, canvas) {
  return SharedRenderers.bindOverviewInteraction({
    state,
    viewport,
    canvas,
    applyOverviewTransform,
    clamp,
    minZoom: OVERVIEW_MIN_ZOOM,
    maxZoom: OVERVIEW_MAX_ZOOM
  });
}

function renderRackGrid() {
  return SharedRenderers.renderRackGrid(createRendererContext());
}

function renderFloorGrid() {
  return SharedRenderers.renderFloorGrid(createRendererContext());
}

function renderSlottedGrid() {
  return SharedRenderers.renderSlottedGrid(createRendererContext());
}

function renderGrid() {
  const mode = effectiveViewMode();
  const rackMode = mode === "rack";
  const managementMode = state.viewMode === "management";
  const configMode = state.viewMode === "config";
  el.gridWrap.classList.toggle("rack-pan-enabled", rackMode);
  if (!rackMode) {
    endRackPan();
  }
  updateSearchModeBarText();
  if (state.viewMode === "audit") {
    closeInspector();
    if (mode === "overview") {
      renderOverview();
    } else if (mode === "floor") {
      renderFloorGrid();
    } else if (mode === "slotted") {
      renderSlottedGrid();
    } else {
      renderRackGrid();
    }
  } else if (state.viewMode === "overview") {
    closeInspector();
    renderOverview();
  } else if (managementMode) {
    closeInspector();
    renderManagementOverview();
  } else if (configMode) {
    closeInspector();
    renderConfigEditor();
  } else if (state.viewMode === "floor") {
    closeInspector();
    renderFloorGrid();
  } else if (state.viewMode === "slotted") {
    closeInspector();
    renderSlottedGrid();
  } else {
    renderRackGrid();
  }
}

function selectCell(cellData) {
  const mode = effectiveViewMode();
  if (!cellData) {
    state.selectedCellKey = "";
    state.selectedCell = null;
    el.locationCode.textContent = "-";
    el.itemInput.value = "";
    el.qtyInput.value = "0";
    el.recordedInput.value = "";
    el.poInput.value = "";
    if (el.lastInventoriedOutput) {
      el.lastInventoriedOutput.textContent = "Never";
    }
    el.mixedToggle.checked = false;
    clearMixedRows();
    syncMixedLabels();
    setMixedVisible(false);
    if (inAuditWorkspace()) {
      syncAuditDetailPanel();
    } else {
      setStatus("No location selected.");
    }
    closeInspector();
    syncDetailActionButtons();
    return;
  }

  state.selectedCell = cellData;
  if (mode === "rack") {
    state.selectedCellKey = rackCellKey(cellData.bay, cellData.level);
  } else if (mode === "floor") {
    state.selectedCellKey = floorCellKey(cellData.slot);
  } else if (mode === "slotted") {
    state.selectedCellKey = slottedCellKey(cellData.slot);
  } else {
    state.selectedCellKey = movableItemKey(cellData.id);
  }
  el.locationCode.textContent = cellData.location_code || cellData.id || "-";
  el.itemInput.value = cellData.item_number || "";
  el.qtyInput.value = String(cellData.qty || 0);
  el.recordedInput.value = cellData.recorded_location || "";
  el.poInput.value = cellData.po_number || "";
  if (el.lastInventoriedOutput) {
    el.lastInventoriedOutput.textContent = formatInventoryTimestamp(cellData.last_inventory_at);
  }
  syncMixedLabels();
  el.mixedToggle.checked = !!cellData.is_mixed && currentSelectionSupportsMixed();
  clearMixedRows();
  if (currentSelectionSupportsMixed() && cellData.is_mixed) {
    const items = cellData.mixed_items || [];
    items.forEach((entry) => addMixedRow(entry.item_number || "", entry.qty || 0));
    if (!items.length) {
      addMixedRow("", 0);
    }
  }
  setMixedVisible(currentSelectionSupportsMixed() && el.mixedToggle.checked);
  if (inAuditWorkspace()) {
    syncAuditDetailPanel();
  } else if (mode === "rack") {
    el.detailTitle.textContent = "Bay Details";
    if (cellData.is_virtual) {
      setStatus(`Level ${cellData.level} is not configured for Bay ${cellData.bay}.`);
    } else {
      setStatus(`Editing Bay ${cellData.bay}, Level ${cellData.level}`);
    }
    if (isInspectorVisible()) {
      syncInspectorFromSelection();
    }
  } else if (mode === "floor") {
    el.detailTitle.textContent = "Floor Slot Details";
    setStatus(`Editing Slot ${cellData.slot}`);
  } else if (mode === "slotted") {
    el.detailTitle.textContent = "Slotted Pallet Slot Details";
    setStatus(`Editing slot ${cellData.slot}`);
  } else {
    const kind = configMovableItemKind(cellData);
    el.detailTitle.textContent = kind === "pallet" ? "Pallet Details" : "Movable Item Details";
    setStatus(`Editing ${cellData.label || cellData.id}`);
  }
  syncDetailActionButtons();
}

function renderSearchResults() {
  el.searchResults.innerHTML = "";
  updateSearchSummary();
  if (!state.searchResults.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No results.";
    el.searchResults.appendChild(p);
    return;
  }
  state.searchResults.forEach((result) => {
    const card = document.createElement("div");
    card.className = "search-item";
    let middleLine = "";
    if (result.location_type === "rack") {
      const levelText = result.level == null ? "" : ` L${result.level}`;
      middleLine = `RACK ${result.container_id} B${result.bay_or_slot}${levelText}`;
    } else if (result.location_type === "floor") {
      middleLine = `FLOOR ${result.container_id} Slot ${result.bay_or_slot}`;
    } else if (result.location_type === "slotted_pallet") {
      middleLine = `SLOTTED ${result.container_id} Slot ${result.bay_or_slot}`;
    } else {
      middleLine = `${configToolSpec(configMovableItemKind(result)).label.toUpperCase()} ${result.container_id}`;
    }
    card.innerHTML = `
      <div><strong>${escapeHtml(result.item_number || "(blank item)")}</strong></div>
      <div>${escapeHtml(middleLine)}</div>
      <div>Qty ${Number(result.qty)} | ${escapeHtml(result.area || "No area")}</div>
      <div class="hint">Last counted: ${escapeHtml(formatInventoryTimestamp(result.last_inventory_at))}</div>
    `;
    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    if (result.location_type === "rack") {
      jumpBtn.textContent = "Jump to Rack Cell";
      jumpBtn.addEventListener("click", () => jumpToRackResult(result));
    } else if (result.location_type === "floor") {
      jumpBtn.textContent = "Jump to Floor Slot";
      jumpBtn.addEventListener("click", () => jumpToFloorResult(result));
    } else if (result.location_type === "slotted_pallet") {
      jumpBtn.textContent = "Jump to Slot";
      jumpBtn.addEventListener("click", () => jumpToSlottedResult(result));
    } else {
      jumpBtn.textContent = "Jump to Item";
      jumpBtn.addEventListener("click", () => jumpToMovableItemResult(result));
    }
    card.appendChild(jumpBtn);
    el.searchResults.appendChild(card);
  });
}

async function loadAreasAndRacks() {
  const areaData = await apiGet("/api/areas");
  if (state.area !== "All Areas" && !areaData.areas.includes(state.area)) {
    state.area = "All Areas";
  }
  renderAreas(areaData.areas || []);
  const [layoutData, warehouseData] = await Promise.all([
    apiGet(`/api/layout-items?area=${encodeURIComponent(state.area)}`),
    apiGet("/api/warehouse")
  ]);
  state.layout = layoutData.layout || null;
  state.areas = Array.isArray(layoutData.areas) ? layoutData.areas : (areaData.areas || []);
  renderRacks(layoutData.rows || []);
  renderZones(layoutData.zones || []);
  renderNullSpaces(layoutData.null_spaces || []);
  renderSlottedPallets(layoutData.slotted_pallets || []);
  renderOverviewItems(layoutData.movable_items || []);
  state.visualAge = buildVisualAgeCache(warehouseData.warehouse || {}, warehouseData.movable_items || []);
}

async function loadMapCatalog() {
  if (SharedApi.context) return;
  try {
    const data = await apiGet("/api/file/maps");
    state.mapFiles = data.maps || [];
    state.currentMapPath = data.current_path || "";
    renderMapOptions();
  } catch (error) {
    state.mapFiles = [];
    state.currentMapPath = "";
    renderMapOptions();
    setStatus(`Map list unavailable: ${error.message}`);
  }
}

async function reloadAfterMapLoad() {
  state.selectedCell = null;
  state.selectedCellKey = "";
  setSearchMode(false);
  state.searchResults = [];
  await loadAuditStatus();
  await loadAreasAndRacks();
  await loadDepartments();
  ensureUserDepartmentSelection();
  await loadAreasAndRacks();
  await loadRackModel();
  await loadZoneModel();
  await loadSlottedModel();
  await loadConfigModel();
  state.management.filters.area = state.area;
  state.management.parsedQuery = parseSmartQuery(state.management.filters.query);
  await loadManagementPreview();
  renderSearchResults();
  syncControlVisibility();
  renderGrid();
  if (state.viewMode === "overview") {
    fitOverview();
  }
}

async function loadMapByPath(pathValue) {
  const path = String(pathValue || "").trim();
  if (!path) {
    setStatus("Select a map file to load.");
    return;
  }
  setStatus("Loading map…");
  const data = await apiPost("/api/file/load", { path });
  state.currentMapPath = data.current_path || path;
  await loadMapCatalog();
  await reloadAfterMapLoad();
  setStatus(`Loaded map: ${shortPathLabel(state.currentMapPath)}`);
}

async function loadLatestMap(options = {}) {
  if (SharedApi.context) return;
  const silent = !!options.silent;
  const data = await apiPost("/api/file/load-latest", {
    preferred_names: [],
    prefer_names_first: true
  });
  if (data.loaded) {
    state.currentMapPath = data.current_path || "";
    await loadAuditStatus();
    if (!silent) {
      setStatus(`Loaded latest map: ${shortPathLabel(state.currentMapPath)}`);
    }
  } else if (!silent) {
    setStatus("No map files were found to load.");
  }
}

async function loadRackModel() {
  if (!state.selectedRack) {
    state.rackModel = null;
    state.rackBeamEdit = false;
    return;
  }
  const previousRack = state.rackModel?.row?.name || "";
  const data = await apiGet(`/api/rack/${encodeURIComponent(state.selectedRack)}`);
  state.rackModel = data;
  if (previousRack && previousRack !== (data?.row?.name || "")) {
    state.rackBeamEdit = false;
  }
  updateVisualAgeForRackModel(state.rackModel);
  const selected = state.selectedCell && state.viewMode === "rack" ? state.selectedCell : null;
  if (selected && selected.bay != null) {
    const refreshed = findCell(selected.bay, selected.level);
    selectCell(refreshed);
  }
}

async function loadZoneModel() {
  if (!state.selectedZone) {
    state.zoneModel = null;
    return;
  }
  const data = await apiGet(`/api/zone/${encodeURIComponent(state.selectedZone)}`);
  state.zoneModel = data;
  updateVisualAgeForZoneModel(state.zoneModel);
  const selected = state.selectedCell && state.viewMode === "floor" ? state.selectedCell : null;
  if (selected && selected.slot != null) {
    const refreshed = findFloorCell(selected.slot);
    selectCell(refreshed);
  }
}

async function loadSlottedModel() {
  if (!state.selectedSlottedPallet) {
    state.slottedModel = null;
    return;
  }
  const data = await apiGet(`/api/slotted-pallet/${encodeURIComponent(state.selectedSlottedPallet)}`);
  state.slottedModel = data;
  updateVisualAgeForSlottedModel(state.slottedModel);
  const selected = state.selectedCell && state.viewMode === "slotted" ? state.selectedCell : null;
  if (selected && selected.slot != null) {
    const refreshed = findSlottedCell(selected.slot);
    selectCell(refreshed);
  }
}

async function jumpToRackResult(result) {
  if (result.area && result.area !== state.area) {
    state.area = result.area;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "rack";
  el.viewMode.value = "rack";
  state.selectedRack = result.container_id;
  el.rackSelect.value = state.selectedRack;
  await loadRackModel();
  const target = findCell(result.bay_or_slot, result.level);
  selectCell(target);
  syncControlVisibility();
  renderGrid();
}

async function jumpToFloorResult(result) {
  if (result.area && result.area !== state.area) {
    state.area = result.area;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "floor";
  el.viewMode.value = "floor";
  state.selectedZone = result.container_id;
  el.zoneSelect.value = state.selectedZone;
  await loadZoneModel();
  const target = findFloorCell(result.bay_or_slot);
  selectCell(target);
  syncControlVisibility();
  renderGrid();
}

async function jumpToSlottedResult(result) {
  if (result.area && result.area !== state.area) {
    state.area = result.area;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "slotted";
  el.viewMode.value = "slotted";
  state.selectedSlottedPallet = result.container_id;
  el.slottedSelect.value = state.selectedSlottedPallet;
  await loadSlottedModel();
  const target = findSlottedCell(result.bay_or_slot);
  selectCell(target);
  syncControlVisibility();
  renderGrid();
}

async function jumpToMovableItemResult(result) {
  if (result.area && result.area !== state.area) {
    state.area = result.area;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "overview";
  el.viewMode.value = "overview";
  const target = findMovableItem(result.container_id);
  selectCell(target);
  syncControlVisibility();
  renderGrid();
  if (target) {
    const rect = movableItemRect(target);
    fitOverviewRect({
      x: rect.x - 24,
      y: rect.y - 24,
      width: rect.width + 48,
      height: rect.height + 48
    });
  }
}

async function jumpToConfigMovableItem(itemId, areaName = "") {
  const nextArea = String(areaName || state.area || "").trim();
  if (nextArea && nextArea !== state.area) {
    state.area = nextArea;
    el.areaSelect.value = state.area;
    await loadAreasAndRacks();
  }
  state.viewMode = "config";
  el.viewMode.value = "config";
  state.selectedCell = null;
  state.selectedCellKey = "";
  selectCell(null);
  state.config.focusedArea = nextArea && nextArea !== "All Areas" ? nextArea : "";
  state.config.selection = { type: "movable_item", id: itemId };
  state.config.autoFitOnRender = true;
  await loadConfigModel();
  state.config.focusedArea = nextArea && nextArea !== "All Areas" ? nextArea : "";
  state.config.selection = { type: "movable_item", id: itemId };
  syncControlVisibility();
  renderGrid();
}

async function performSearch() {
  const query = el.searchInput.value.trim();
  if (!query) {
    clearSearchMode();
    return;
  }
  const match = document.getElementById("searchMatchMode")?.value || "contains";
  const data = await apiGet(`/api/search?q=${encodeURIComponent(query)}&area=${encodeURIComponent(state.area)}&match=${match}`);
  state.searchResults = data.results || [];
  setSearchMode(true, query, state.searchResults);
  state.viewMode = "overview";
  el.viewMode.value = "overview";
  syncControlVisibility();
  renderSearchResults();
  renderGrid();
  setStatus(`Search mode active for "${query}".`);
}

async function saveSelectedCell(event) {
  event.preventDefault();
  await saveSelection({ source: "panel", advance: 0 });
}

function moveRackSelection(deltaBay, deltaLevel) {
  if (!state.rackModel || !state.selectedCell) {
    return false;
  }
  const bays = state.rackModel.bays || [];
  let bayIdx = bays.indexOf(state.selectedCell.bay);
  if (bayIdx < 0) {
    return false;
  }
  let level = state.selectedCell.level;
  let bay = state.selectedCell.bay;
  if (deltaBay !== 0) {
    const nextIdx = bayIdx + deltaBay;
    if (nextIdx < 0 || nextIdx >= bays.length) {
      return false;
    }
    bayIdx = nextIdx;
    bay = bays[bayIdx];
  }
  if (deltaLevel !== 0) {
    level = level + deltaLevel;
    if (level < 1) {
      return false;
    }
  }
  const target = findCell(bay, level);
  if (!target) {
    return false;
  }
  selectCell(target);
  renderGrid();
  keepSelectedRackSlotInView({ smooth: true });
  openInspectorNearSelection();
  return true;
}

function moveSequentialBay(direction) {
  return moveRackSelection(direction, 0);
}

async function saveSelection(options = {}) {
  const source = options.source || "panel";
  const advance = Number(options.advance || 0);
  if (state.rackPendingAdd) {
    if (!state.selectedCell) {
      setStatus("Click a configured bay to place or merge the pallet.");
      return false;
    }
    if (state.selectedCell.is_virtual) {
      setStatus("That slot is not configured. Choose a bay with a full location code.");
      return false;
    }
    try {
      if (state.selectedCell.is_empty) {
        await completeRackPendingAdd(state.selectedCell.bay, state.selectedCell.level);
      } else {
        await mergeRackPendingAdd(state.selectedCell.bay, state.selectedCell.level);
      }
      return true;
    } catch (error) {
      setStatus(`Add to rack failed: ${error.message}`);
      return false;
    }
  }
  if (!state.selectedCell) {
    setStatus("Select a location before saving.");
    return false;
  }
  try {
    if (source === "panel" && currentSelectionSupportsMixed() && el.mixedToggle.checked) {
      if (!collectMixedRows().length) throw new Error("Add at least one mixed item or turn off mixed mode.");
    } else {
      const value = String(source === "inspector" ? el.fiQtyInput.value : el.qtyInput.value).trim();
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error("Enter a non-negative whole-number count, including 0 for an empty location.");
      }
    }
  } catch (error) { setStatus(error.message); return false; }
  if (inAuditWorkspace()) {
    if (!state.audit.session) {
      setStatus("Start an audit session before recording counts.");
      return false;
    }
    if (!state.audit.capabilities?.can_record_entry) {
      setStatus("This client cannot record audit counts.");
      return false;
    }
    const mode = effectiveViewMode();
    let locationType = "";
    let containerId = "";
    let bayOrSlot = null;
    let level = null;
    if (mode === "rack") {
      locationType = "rack";
      containerId = state.rackModel?.row?.name || "";
      bayOrSlot = state.selectedCell.bay;
      level = state.selectedCell.level;
    } else if (mode === "floor") {
      locationType = "floor";
      containerId = state.zoneModel?.zone?.zone_id || "";
      bayOrSlot = state.selectedCell.slot;
    } else if (mode === "slotted") {
      locationType = "slotted_pallet";
      containerId = state.slottedModel?.slotted_pallet?.group_id || "";
      bayOrSlot = state.selectedCell.slot;
    } else if (state.selectedCell.location_type === "movable") {
      locationType = "movable";
      containerId = state.selectedCell.id;
    }
    if (!locationType || !containerId) {
      setStatus("Select a valid audit target before recording counts.");
      return false;
    }
    const mixedItems = currentSelectionSupportsMixed() && el.mixedToggle.checked ? collectMixedRows() : [];
    const payload = {
      location_type: locationType,
      container_id: containerId,
      bay_or_slot: bayOrSlot,
      level,
      counted_item_number: mixedItems.length ? "" : el.itemInput.value.trim(),
      counted_qty: mixedItems.length ? mixedItems.reduce((sum, row) => sum + Number(row.qty || 0), 0) : Math.max(0, Number.parseInt(el.qtyInput.value || "0", 10) || 0),
      counted_mixed_items: mixedItems,
      notes: el.auditNotesInput ? el.auditNotesInput.value.trim() : "",
    };
    try {
      const response = await apiPost("/api/audit/entry", payload);
      applyAuditPayload(response);
      syncDetailActionButtons();
      renderGrid();
      setStatus(`Audit count recorded for ${state.selectedCell.location_code || state.selectedCell.id}.`);
      return true;
    } catch (error) {
      setStatus(`Audit save failed: ${error.message}`);
      return false;
    }
  }
  try {
    if (state.viewMode === "rack") {
      if (!state.rackModel) {
        setStatus("Select a rack before saving.");
        return false;
      }
      if (state.selectedCell.is_virtual) {
        setStatus("This bay level is not configured in the map yet.");
        return false;
      }
      const qtyVal = source === "inspector" ? el.fiQtyInput.value : el.qtyInput.value;
      const safeQty = Math.max(0, Number.parseInt(qtyVal || "0", 10) || 0);
      const itemVal = source === "inspector" ? el.fiItemInput.value.trim() : el.itemInput.value.trim();
      const recVal = source === "inspector" ? el.fiRecordedInput.value.trim() : el.recordedInput.value.trim();
      const payload = {
        row: state.rackModel.row.name,
        bay: state.selectedCell.bay,
        level: state.selectedCell.level,
        item_number: itemVal,
        qty: safeQty,
        recorded_location: recVal,
        po_number: el.poInput.value.trim()
      };
      if (source === "inspector" && el.fiMixedToggle.checked) {
        let mixedItems = [];
        if (state.selectedCell.is_mixed && Array.isArray(state.selectedCell.mixed_items) && state.selectedCell.mixed_items.length) {
          mixedItems = state.selectedCell.mixed_items;
        } else {
          if (!itemVal && safeQty <= 0) {
            setStatus("Provide item/qty or use Edit Mixed.");
            return false;
          }
          mixedItems = [{ item_number: itemVal, qty: safeQty }];
        }
        payload.mixed_items = mixedItems;
      } else if (source === "panel" && el.mixedToggle.checked) {
        const mixedItems = collectMixedRows();
        if (!mixedItems.length) {
          setStatus("Add at least one mixed item or disable mixed mode.");
          return false;
        }
        payload.mixed_items = mixedItems;
      }
      const response = await apiPost("/api/rack-location", payload);
      state.rackModel = response.rack;
      updateVisualAgeForRackModel(state.rackModel);
      const updatedCell = findCell(state.selectedCell.bay, state.selectedCell.level);
      selectCell(updatedCell);
      renderGrid();
      openInspectorNearSelection();
      if (advance !== 0) {
        moveSequentialBay(advance > 0 ? 1 : -1);
      }
    } else if (state.viewMode === "floor") {
      if (!state.zoneModel) {
        setStatus("Select a floor zone before saving.");
        return false;
      }
      const safeQty = Math.max(0, Number.parseInt(el.qtyInput.value || "0", 10) || 0);
      const payload = {
        zone: state.zoneModel.zone.zone_id,
        slot: state.selectedCell.slot,
        item_number: el.itemInput.value.trim(),
        qty: safeQty,
        recorded_location: el.recordedInput.value.trim(),
        po_number: el.poInput.value.trim()
      };
      if (el.mixedToggle.checked) {
        payload.mixed_items = collectMixedRows();
        if (!payload.mixed_items.length) { setStatus("Add mixed items or turn off mixed mode."); return false; }
      }
      const response = await apiPost("/api/floor-location", payload);
      state.zoneModel = response.zone;
      updateVisualAgeForZoneModel(state.zoneModel);
      const updatedCell = findFloorCell(state.selectedCell.slot);
      selectCell(updatedCell);
      renderGrid();
    } else if (state.viewMode === "slotted") {
      if (!state.slottedModel) {
        setStatus("Select a slotted pallet before saving.");
        return false;
      }
      const safeQty = Math.max(0, Number.parseInt(el.qtyInput.value || "0", 10) || 0);
      const itemValue = el.itemInput.value.trim();
      const payload = {
        group_id: state.slottedModel.slotted_pallet.group_id,
        slot: state.selectedCell.slot,
        item_number: itemValue,
        qty: safeQty,
        recorded_location: el.recordedInput.value.trim(),
        po_number: el.poInput.value.trim()
      };
      if (el.mixedToggle.checked) {
        let mixedItems = collectMixedRows();
        if (!mixedItems.length) {
          if (!itemValue && safeQty <= 0) {
            setStatus("Add at least one mixed item or disable mixed mode.");
            return false;
          }
          mixedItems = [{ item_number: itemValue, qty: safeQty }];
        }
        payload.mixed_items = mixedItems;
      }
      const response = await apiPost("/api/slotted-pallet-location", payload);
      state.slottedModel = response.slotted_pallet;
      renderSlottedPallets(response.slotted_pallets || state.slottedPallets);
      updateVisualAgeForSlottedModel(state.slottedModel);
      const updatedCell = findSlottedCell(state.selectedCell.slot);
      selectCell(updatedCell);
      renderGrid();
    } else if (state.viewMode === "overview" && state.selectedCell.location_type === "movable") {
      const safeQty = Math.max(0, Number.parseInt(el.qtyInput.value || "0", 10) || 0);
      const itemValue = el.itemInput.value.trim();
      const payload = {
        id: state.selectedCell.id,
        item_number: itemValue,
        qty: safeQty,
        recorded_location: el.recordedInput.value.trim(),
        po_number: el.poInput.value.trim()
      };
      if (configMovableItemKind(state.selectedCell) === "pallet" && el.mixedToggle.checked) {
        let mixedItems = collectMixedRows();
        if (!mixedItems.length) {
          if (!itemValue && safeQty <= 0) {
            setStatus("Add at least one mixed item or disable mixed mode.");
            return false;
          }
          mixedItems = [{ item_number: itemValue, qty: safeQty }];
        }
        payload.mixed_items = mixedItems;
      }
      const response = await apiPost("/api/movable-item-location", payload);
      renderOverviewItems(response.movable_items || []);
      const updatedCell = findMovableItem(state.selectedCell.id);
      selectCell(updatedCell);
      renderGrid();
    } else {
      setStatus("Select rack, floor zone, slotted pallet, or movable item to edit location data.");
      return false;
    }
    setStatus("Saved.");
    return true;
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
    return false;
  }
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  const tag = (target.tagName || "").toLowerCase();
  const editable = target.isContentEditable;
  return editable || tag === "input" || tag === "textarea" || tag === "select";
}

function handleGlobalKeydown(event) {
  if (state.viewMode !== "rack" || !state.selectedCell) {
    return;
  }
  const insideInspector = !!event.target.closest("#floatingInspector");
  if (isTypingTarget(event.target) && !insideInspector) {
    return;
  }
  if (event.key === "Escape") {
    closeInspector();
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveRackSelection(-1, 0);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveRackSelection(1, 0);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveRackSelection(0, 1);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveRackSelection(0, -1);
    return;
  }
  if (event.key === "]") {
    event.preventDefault();
    moveSequentialBay(1);
    return;
  }
  if (event.key === "[") {
    event.preventDefault();
    moveSequentialBay(-1);
    return;
  }
  if (event.key === "Enter" && insideInspector) {
    event.preventDefault();
    saveSelection({ source: "inspector", advance: 0 });
  }
}

function syncControlVisibility() {
  const mode = effectiveViewMode();
  const isAudit = inAuditWorkspace();
  const isOverview = mode === "overview" && !isAudit;
  const isRack = mode === "rack";
  const isFloor = mode === "floor";
  const isSlotted = mode === "slotted";
  const isManagement = state.viewMode === "management";
  const isConfig = state.viewMode === "config";
  const supportsMixed = currentSelectionSupportsMixed();
  el.rackSelect.disabled = !isRack;
  el.zoneSelect.disabled = !isFloor;
  el.slottedSelect.disabled = !isSlotted;
  el.mixedToggleRow?.classList.toggle("hidden", !supportsMixed);
  if (!supportsMixed && el.mixedToggle) {
    el.mixedToggle.checked = false;
  }
  syncMixedLabels();
  setMixedVisible(supportsMixed && el.mixedToggle?.checked);
  el.detailViewControls?.classList.toggle("hidden", !(isRack || isFloor || isSlotted));
  el.overviewControls?.classList.toggle("hidden", !(mode === "overview"));
  el.auditToolbar?.classList.toggle("hidden", !isAudit);
  syncAuditRoleSummary();
  if (el.detailBackBtn) {
    el.detailBackBtn.textContent = isAudit ? "Return to Audit Overview" : "Return to Overview";
  }
  if (el.overviewBackBtn) {
    el.overviewBackBtn.hidden = !(mode === "overview") || !String(state.overview.focusedArea || "").trim();
  }
  if (el.overviewAddPalletBtn) {
    const showAreaAction = isAdmin && mode === "overview" && !isAudit && !!String(state.overview.focusedArea || "").trim();
    el.overviewAddPalletBtn.hidden = !showAreaAction;
    el.overviewAddPalletBtn.classList.toggle("primary-action", showAreaAction);
  }
  if (el.overviewOpenOverlayBtn) {
    el.overviewOpenOverlayBtn.hidden = !(isAdmin && mode === "overview" && !isAudit && !!String(state.overview.focusedArea || "").trim());
  }
  el.legendBar?.classList.toggle("hidden", isManagement || isConfig);
  updateHeatLegend();
  el.searchModeBar?.classList.toggle("hidden", isManagement || isConfig || !isSearchModeActive());
  el.searchResultsPanel?.classList.toggle("hidden", isManagement || isConfig);
  el.detailPanel?.classList.toggle("hidden", isManagement || isConfig);
  if (!isRack || isAudit) {
    closeInspector();
  } else if (state.rackPendingAdd) {
    closeInspector();
  } else if (state.selectedCell) {
    state.inspector.open = true;
    openInspectorNearSelection();
  }
  if (el.auditStartBtn) {
    const canStartAudit = isAdmin && !!state.audit.capabilities?.can_start_session;
    el.auditStartBtn.classList.toggle("hidden", !isAudit || !!state.audit.session || !canStartAudit);
    if (el.auditNameInput) {
      el.auditNameInput.disabled = !canStartAudit;
    }
    if (el.auditModeSelect) {
      el.auditModeSelect.disabled = !canStartAudit;
    }
  }
  syncAuditPrintAssignmentButton();
  syncDetailActionButtons();
}

function updateRackSummary() {
  if (!state.rackModel) {
    el.viewSummary.textContent = "No rack locations loaded.";
    return;
  }
  const cells = state.rackModel.cells || [];
  const bayCount = Array.isArray(state.rackModel.bays) ? state.rackModel.bays.length : 0;
  const maxLevels = Math.max(0, Number(state.rackModel.max_levels || 0));
  const total = Math.max(cells.length, bayCount * maxLevels);
  const mixed = cells.filter((c) => c.is_mixed).length;
  const configuredEmpty = cells.filter((c) => c.is_empty).length;
  const unconfigured = Math.max(0, total - cells.length);
  const empty = configuredEmpty + unconfigured;
  const occupied = cells.filter((c) => !c.is_empty && !c.is_mixed).length;
  el.viewSummary.textContent = `Total ${total} | Empty ${empty} | Occupied ${occupied} | Mixed ${mixed} | Unconfigured ${unconfigured}`;
  if (inAuditWorkspace()) {
    const entries = cells.filter((cell) => auditEntryForLocation(cell.location_code));
    const remaining = Math.max(0, cells.length - entries.length);
    const variance = entries.filter((cell) => auditStatusForCell(cell) === "counted_variance" || auditStatusForCell(cell) === "review_needed").length;
    el.viewSummary.textContent += ` | Counted ${entries.length} | Remaining ${remaining} | Issues ${variance}`;
  }
}

function updateFloorSummary() {
  if (!state.zoneModel) {
    el.viewSummary.textContent = "No floor locations loaded.";
    return;
  }
  const cells = state.zoneModel.cells || [];
  const total = cells.length;
  const empty = cells.filter((c) => c.is_empty).length;
  const occupied = total - empty;
  el.viewSummary.textContent = `Total ${total} | Empty ${empty} | Occupied ${Math.max(0, occupied)} | Mixed 0`;
  if (inAuditWorkspace()) {
    const entries = cells.filter((cell) => auditEntryForLocation(cell.location_code));
    const remaining = Math.max(0, cells.length - entries.length);
    const variance = entries.filter((cell) => auditStatusForCell(cell) === "counted_variance" || auditStatusForCell(cell) === "review_needed").length;
    el.viewSummary.textContent += ` | Counted ${entries.length} | Remaining ${remaining} | Issues ${variance}`;
  }
}

function updateOverviewSummary() {
  const visibleRacks = state.racks.filter((row) => !state.overview.focusedArea || String(row.area || "").trim() === state.overview.focusedArea);
  const visibleZones = state.zones.filter((zone) => !state.overview.focusedArea || String(zone.area || "").trim() === state.overview.focusedArea);
  const visibleSlotted = state.slottedPallets.filter((pallet) => !state.overview.focusedArea || String(pallet.area || "").trim() === state.overview.focusedArea);
  const visibleItems = state.movableItems.filter((item) => !state.overview.focusedArea || String(item.area || "").trim() === state.overview.focusedArea);
  const rackCounts = visibleRacks.reduce(
    (acc, r) => {
      const c = r.counts || {};
      acc.total += Number(c.total || 0);
      acc.empty += Number(c.empty || 0);
      acc.occupied += Number(c.occupied || 0);
      acc.mixed += Number(c.mixed || 0);
      return acc;
    },
    { total: 0, empty: 0, occupied: 0, mixed: 0 }
  );
  const zoneCounts = visibleZones.reduce(
    (acc, z) => {
      const c = z.counts || {};
      acc.total += Number(c.total || 0);
      acc.empty += Number(c.empty || 0);
      acc.occupied += Number(c.occupied || 0);
      return acc;
    },
    { total: 0, empty: 0, occupied: 0 }
  );
  const slottedCounts = visibleSlotted.reduce(
    (acc, pallet) => {
      const c = pallet.counts || {};
      acc.total += Number(c.total || 0);
      acc.empty += Number(c.empty || 0);
      acc.occupied += Number(c.occupied || 0);
      acc.mixed += Number(c.mixed || 0);
      return acc;
    },
    { total: 0, empty: 0, occupied: 0, mixed: 0 }
  );
  el.viewSummary.textContent =
    `Racks ${visibleRacks.length} | Zones ${visibleZones.length} | Slotted ${visibleSlotted.length} | Items ${visibleItems.length} | ` +
    `Rack Occ ${rackCounts.occupied} | Rack Emp ${rackCounts.empty} | Rack Mix ${rackCounts.mixed} | ` +
    `Zone Occ ${zoneCounts.occupied} | Zone Emp ${zoneCounts.empty} | Slot Occ ${slottedCounts.occupied} | Slot Emp ${slottedCounts.empty} | Slot Mix ${slottedCounts.mixed}`;
  if (inAuditWorkspace()) {
    const allEntryCount = Array.isArray(state.audit.entries) ? state.audit.entries.length : 0;
    const issues = (state.audit.entries || []).filter((entry) => auditStatusFromEntry(entry) !== "counted_match").length;
    el.viewSummary.textContent += ` | Audit Entries ${allEntryCount} | Issues ${issues}`;
  }
  if (state.heatMapEnabled) {
    el.viewSummary.textContent += " | Heat Map On";
  }
}

function updateManagementSummary() {
  const s = state.management.summary;
  if (!s) {
    el.viewSummary.textContent = "No management report loaded.";
    return;
  }
  el.viewSummary.textContent =
    `Rows ${formatInteger(s.row_count)} | Qty ${formatInteger(s.total_qty)} | ` +
    `Unique Items ${formatInteger(s.unique_items)} | Unique Locations ${formatInteger(s.unique_locations)} | ` +
    `Never ${formatInteger(s.inventory_age_counts?.never || 0)} | 90+ ${formatInteger(s.inventory_age_counts?.over_90_days || 0)}`;
}

function zoomOverview(multiplier) {
  const viewport = el.gridWrap.querySelector(".overview-viewport");
  const canvas = viewport ? viewport.querySelector(".overview-canvas") : null;
  if (!viewport || !canvas) {
    return;
  }
  // Zoom about the viewport center so button zoom feels anchored.
  const next = SharedGeometry.zoomAtPoint(
    state.overview,
    { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
    state.overview.zoom * multiplier,
    { minZoom: OVERVIEW_MIN_ZOOM, maxZoom: OVERVIEW_MAX_ZOOM }
  );
  state.overview.zoom = next.zoom;
  state.overview.panX = next.panX;
  state.overview.panY = next.panY;
  applyOverviewTransform(canvas);
}

async function initialLoad() {
  try {
    if (SharedApi.context) {
      const access = await apiGet("/api/places/access");
      // The backend is authoritative. Local mode already permits editing; shared
      // installations use the verified role instead of the legacy browser password.
      setStoredAccessMode(!access.role_split || access.role === "admin" ? "admin" : "user");
    }
    if (!requireAccessMode()) {
      return;
    }
    await loadServiceStatus();
    await ensureAuditRoleSession();
    await SharedApi.loadPlaceContext?.();
    if (SharedApi.context?.draft) state.config.layoutUnlocked = true;
    if (!state.service.capabilities?.audit_role_split || !!auditClientRole()) {
      await loadAuditStatus();
    }
    setSearchMode(false);
    state.searchResults = [];
    if (!state.currentMapPath) {
      try {
        await loadLatestMap({ silent: true });
      } catch (error) {
        setStatus(`Auto-load latest map skipped: ${error.message}`);
      }
    }
    await loadAreasAndRacks();
    await loadDepartments();
    await loadCustomAssetTemplates();
    ensureUserDepartmentSelection();
    initializeUserAreaNavigation(state.areas || []);
    await loadAreasAndRacks();
    try {
      await loadRackModel();
      await loadZoneModel();
    } catch (error) {
      setStatus(`Location model preload skipped: ${error.message}`);
    }
    await loadMapCatalog();
    await loadConfigModel();
    state.management.filters.area = state.area;
    state.management.parsedQuery = parseSmartQuery(state.management.filters.query);
    if (isAdmin || isManageShell) {
      await loadManagementPreview();
    }
    if (isManageShell) {
      state.viewMode = "management";
      el.viewMode.value = "management";
    } else if (isFieldShell) {
      state.viewMode = "overview";
      el.viewMode.value = "overview";
    } else {
      state.viewMode = SharedApi.context?.draft ? "config" : (isAuditOperatorClient ? "audit" : "overview");
      el.viewMode.value = state.viewMode;
    }
    if (isAuditOperatorClient) {
      state.audit.subview = "overview";
    }
    applyAccessModeControls();
    syncControlVisibility();
    renderGrid();
    if (state.viewMode === "overview" || state.viewMode === "audit") {
      fitOverview();
    }
  const modeLabel = state.service.apiVersion ? `API ${state.service.apiVersion}` : "API ready";
  if (!state.service.capabilities || !Object.keys(state.service.capabilities).length) {
      setStatus(`Ready. ${modeLabel}. Limited capability metadata from backend.`);
    } else {
      setStatus(`Ready. ${modeLabel}.`);
    }
    if (isFieldShell && window.WarehouseFieldHooks?.afterInitialLoad) {
      await window.WarehouseFieldHooks.afterInitialLoad();
    }
    if (isManageShell && window.WarehouseManageHooks?.afterInitialLoad) {
      await window.WarehouseManageHooks.afterInitialLoad();
    }
  } catch (error) {
    if (SharedApi.context && el.landingError) el.landingError.textContent = error.message + " Open the place library to sign in, then return to this map.";
    setStatus(`Unable to connect to backend API: ${error.message}`);
  }
}

el.viewMode.addEventListener("change", async () => {
  const previousViewMode = state.viewMode;
  const nextViewMode = el.viewMode.value;
  if (previousViewMode === "config" && nextViewMode !== "config" && state.config.dirty) {
    try {
      await saveConfigSelectionIfDirty({ quiet: true, message: "Configuration changes saved." });
    } catch (_error) {
      el.viewMode.value = previousViewMode;
      state.viewMode = previousViewMode;
      return;
    }
  }
  if (!isAdmin && !isManageShell && (nextViewMode === "management" || nextViewMode === "config")) {
    el.viewMode.value = previousViewMode;
    return;
  }
  if (!isAdmin && !isAuditOperatorClient && (nextViewMode === "floor" || nextViewMode === "slotted")) {
    el.viewMode.value = previousViewMode;
    setStatus("Floor and slotted pallet work now happens from the visual overview.");
    return;
  }
  if (isAuditOperatorClient && nextViewMode !== "audit") {
    el.viewMode.value = previousViewMode;
    return;
  }
  if (!isAdmin && !isAuditOperatorClient && nextViewMode === "audit" && !auditRequestAppliesToCurrentUser()) {
    el.viewMode.value = previousViewMode;
    setStatus("Audit counts appear here when Admin assigns your department an audit request.");
    return;
  }
  if (state.service.capabilities?.audit_role_split && !isAdmin && !isAuditOperatorClient && nextViewMode === "audit") {
    el.viewMode.value = previousViewMode;
    setStatus("Audit tool is available from /audit operator client or /admin.");
    return;
  }
  if (previousViewMode === "rack" && nextViewMode !== "rack" && state.rackPendingAdd) {
    await cancelRackPendingAdd("Pallet placement canceled.", { reloadLayout: true, reloadRack: false, render: false });
  }
  state.viewMode = nextViewMode;
  if (nextViewMode === "audit") {
    state.audit.subview = "overview";
    await loadAuditStatus();
  }
  if (previousViewMode === "config" && nextViewMode === "overview") {
    state.overview.focusedArea = "";
    state.overview.selectedArea = "";
  }
  state.selectedCell = null;
  state.selectedCellKey = "";
  selectCell(null);
  syncControlVisibility();
  if (state.viewMode === "overview") {
    await loadAreasAndRacks();
  } else if (state.viewMode === "rack") {
    await loadRackModel();
  } else if (state.viewMode === "floor") {
    await loadZoneModel();
  } else if (state.viewMode === "slotted") {
    await loadSlottedModel();
  } else if (state.viewMode === "management") {
    state.management.filters.area = state.area;
    state.management.parsedQuery = parseSmartQuery(state.management.filters.query);
    await loadManagementPreview();
  } else if (state.viewMode === "audit") {
    await loadAreasAndRacks();
    await loadRackModel();
    await loadZoneModel();
    await loadSlottedModel();
  } else if (state.viewMode === "config") {
    resetConfigToDefaultLanding();
    await loadConfigModel();
    await loadAreasAndRacks();
  }
  renderGrid();
  if (state.viewMode === "overview" || state.viewMode === "audit") {
    fitOverview();
  }
});

el.areaSelect.addEventListener("change", async () => {
  if (state.rackPendingAdd) {
    await cancelRackPendingAdd("Pallet placement canceled.", { reloadLayout: false, reloadRack: false, render: false });
  }
  state.area = el.areaSelect.value;
  state.overview.focusedArea = state.area === "All Areas" ? "" : state.area;
  state.overview.selectedArea = state.area === "All Areas" ? "" : state.area;
  persistUserLastArea(state.area);
  if (state.viewMode === "config") {
    state.config.focusedArea = "";
    state.config.selection = { type: "", id: "" };
    state.config.autoFitOnRender = true;
  }
  state.selectedCell = null;
  state.selectedCellKey = "";
  setSearchMode(false);
  state.searchResults = [];
  await loadAreasAndRacks();
  await loadRackModel();
  await loadZoneModel();
  await loadSlottedModel();
  state.management.filters.area = state.area;
  state.management.parsedQuery = parseSmartQuery(state.management.filters.query);
  await loadManagementPreview();
  renderSearchResults();
  renderGrid();
  if (state.viewMode === "overview" || state.viewMode === "audit") {
    fitOverview();
  }
});

el.rackSelect.addEventListener("change", async () => {
  if (state.rackPendingAdd) {
    await cancelRackPendingAdd("Pallet placement canceled.", { reloadLayout: false, reloadRack: false, render: false });
  }
  state.selectedRack = el.rackSelect.value;
  state.selectedCell = null;
  state.selectedCellKey = "";
  if (state.viewMode === "rack" || state.viewMode === "audit") {
    if (state.viewMode === "audit") {
      state.audit.subview = "rack";
    }
    selectCell(null);
    await loadRackModel();
    renderGrid();
  }
});

el.zoneSelect.addEventListener("change", async () => {
  state.selectedZone = el.zoneSelect.value;
  state.selectedCell = null;
  state.selectedCellKey = "";
  if (state.viewMode === "floor" || state.viewMode === "audit") {
    if (state.viewMode === "audit") {
      state.audit.subview = "floor";
    }
    selectCell(null);
    await loadZoneModel();
    renderGrid();
  }
});

el.slottedSelect.addEventListener("change", async () => {
  state.selectedSlottedPallet = el.slottedSelect.value;
  state.selectedCell = null;
  state.selectedCellKey = "";
  if (state.viewMode === "slotted" || state.viewMode === "audit") {
    if (state.viewMode === "audit") {
      state.audit.subview = "slotted";
    }
    selectCell(null);
    await loadSlottedModel();
    renderGrid();
  }
});

el.searchBtn?.addEventListener("click", async () => {
  try {
    await performSearch();
  } catch (error) {
    setStatus(`Search failed: ${error.message}`);
  }
});
el.clearSearchBtn?.addEventListener("click", () => clearSearchMode({ resetQuery: false }));
el.searchModeExitBtn?.addEventListener("click", () => clearSearchMode({ resetQuery: false }));

el.searchInput?.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    try {
      await performSearch();
    } catch (error) {
      setStatus(`Search failed: ${error.message}`);
    }
  }
});

el.refreshBtn.addEventListener("click", async () => {
  await initialLoad();
});
el.mapLoadBtn?.addEventListener("click", async () => {
  try {
    await loadMapByPath(el.mapSelect.value);
  } catch (error) {
    setStatus(`Load map failed: ${error.message}`);
  }
});
el.mapLatestBtn?.addEventListener("click", async () => {
  try {
    await loadLatestMap({ silent: false });
    await loadMapCatalog();
    await reloadAfterMapLoad();
  } catch (error) {
    setStatus(`Load latest map failed: ${error.message}`);
  }
});

el.mixedToggle.addEventListener("change", () => {
  if (!currentSelectionSupportsMixed()) {
    el.mixedToggle.checked = false;
  }
  syncMixedLabels();
  setMixedVisible(currentSelectionSupportsMixed() && el.mixedToggle.checked);
  if (el.mixedToggle.checked && !el.mixedRows.children.length) {
    addMixedRow("", 0);
  }
});

el.zoomInBtn.addEventListener("click", () => zoomOverview(1.15));
el.zoomOutBtn.addEventListener("click", () => zoomOverview(0.85));
el.fitBtn.addEventListener("click", () => fitOverview());
el.detailBackBtn?.addEventListener("click", async () => {
  if (state.rackPendingAdd) {
    await cancelRackPendingAdd("Pallet placement canceled.", { reloadLayout: true, reloadRack: false, render: false });
  }
  if (inAuditWorkspace()) {
    state.audit.subview = "overview";
  } else {
    state.viewMode = "overview";
    el.viewMode.value = "overview";
  }
  state.selectedCell = null;
  state.selectedCellKey = "";
  selectCell(null);
  syncControlVisibility();
  renderGrid();
  fitOverview();
  setStatus(inAuditWorkspace() ? "Returned to audit overview." : "Returned to overview.");
});
el.overviewBackBtn?.addEventListener("click", async () => {
  if (state.overview.areaTransfer && state.overview.areaTransfer.active) {
    cancelAreaTransfer();
    return;
  }
  state.area = "All Areas";
  el.areaSelect.value = "All Areas";
  state.overview.focusedArea = "";
  state.overview.selectedArea = "";
  persistUserLastArea("All Areas");
  state.management.filters.area = state.area;
  try {
    await loadAreasAndRacks();
    await loadRackModel();
    await loadZoneModel();
    renderGrid();
    fitOverview();
    setStatus(inAuditWorkspace() ? "Returned to audit overview." : "Returned to overview.");
  } catch (error) {
    setStatus(`Return to overview failed: ${error.message}`);
  }
});
el.overviewAddPalletBtn?.addEventListener("click", async () => {
  try {
    await openConfigPlacementFromOverview("pallet");
  } catch (error) {
    setStatus(error.message);
  }
});
el.overviewOpenOverlayBtn?.addEventListener("click", async () => {
  try {
    await openConfigEditorFromOverview();
  } catch (error) {
    setStatus(error.message);
  }
});
el.resetPanBtn.addEventListener("click", () => {
  const reset = SharedGeometry.resetPanTransform(state.overview, { margin: 20 });
  state.overview.panX = reset.panX;
  state.overview.panY = reset.panY;
  const canvas = el.gridWrap.querySelector(".overview-canvas");
  if (canvas) {
    applyOverviewTransform(canvas);
  }
});
el.heatModeToggleBtn?.addEventListener("click", () => {
  state.heatMapEnabled = !state.heatMapEnabled;
  updateHeatLegend();
  renderGrid();
});
el.auditStartBtn?.addEventListener("click", async () => {
  try {
    await startAuditSession();
    setStatus(`Requested audit ${state.audit.session?.name || ""}.`);
  } catch (error) {
    setStatus(`Audit request failed: ${error.message}`);
  }
});
el.auditPrintAssignmentBtn?.addEventListener("click", printAuditAssignment);
if (el.auditCloseBtn) {
  const cancel = document.createElement("button");
  cancel.id = "auditCancelBtn"; cancel.type = "button"; cancel.className = "hidden"; cancel.textContent = "Cancel incomplete audit";
  cancel.onclick = () => cancelAuditSession().catch(error => setStatus(error.message));
  el.auditCloseBtn.after(cancel);
}
el.auditCloseBtn?.addEventListener("click", async () => {
  try {
    const closingName = state.audit.session?.name || "audit session";
    await closeAuditSession();
    setStatus(`Closed ${closingName}.`);
  } catch (error) {
    setStatus(`Close audit failed: ${error.message}`);
  }
});
el.auditCompleteScopeBtn?.addEventListener("click", async () => {
  try {
    await completeAuditScope();
  } catch (error) {
    setStatus(`Audit export failed: ${error.message}`);
  }
});
el.landingUserBtn?.addEventListener("click", async () => {
  setAccessMode("user");
  applyAccessModeControls();
  await initialLoad();
});
el.landingAdminBtn?.addEventListener("click", () => {
  el.landingAdminForm?.classList.remove("hidden");
  if (el.landingError) {
    el.landingError.textContent = "";
  }
  setTimeout(() => el.landingAdminPassword?.focus(), 0);
});
el.landingAdminCancelBtn?.addEventListener("click", () => {
  el.landingAdminForm?.classList.add("hidden");
  if (el.landingAdminPassword) {
    el.landingAdminPassword.value = "";
  }
});
el.landingDepartmentCancelBtn?.addEventListener("click", () => {
  setStoredAccessMode("");
  state.accessMode = "";
  showLandingOverlay();
});
el.landingDepartmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const department = String(el.landingDepartmentSelect?.value || "").trim();
  if (!department) {
    if (el.landingError) {
      el.landingError.textContent = "Select a department to continue.";
    }
    return;
  }
  state.selectedDepartment = department;
  setStoredDepartment(department);
  state.userAreaInitialized = false;
  hideLandingOverlay();
  await loadDepartments();
  const areaData = await apiGet("/api/areas");
  initializeUserAreaNavigation(areaData.areas || [], { force: true });
  await loadAreasAndRacks();
  syncControlVisibility();
  renderGrid();
  fitOverview();
});
el.landingAdminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(el.landingAdminPassword?.value || "");
  if (password !== ADMIN_PASSWORD) {
    if (el.landingError) {
      el.landingError.textContent = "Incorrect admin password.";
    }
    el.landingAdminPassword?.focus();
    return;
  }
  setAccessMode("admin");
  applyAccessModeControls();
  await initialLoad();
});
el.accessSwitchBtn?.addEventListener("click", () => {
  setStoredAccessMode("");
  setStoredDepartment("");
  setStoredLastArea("");
  state.accessMode = "";
  state.selectedDepartment = "";
  state.userAreaInitialized = false;
  isAdmin = false;
  isAuditOperatorClient = false;
  showLandingOverlay();
});
el.auditAssigneeSelect?.addEventListener("change", syncAuditAssignmentControls);
el.auditTargetDepartmentSelect?.addEventListener("change", syncAuditAssignmentControls);
el.auditRequestStartBtn?.addEventListener("click", async () => {
  state.viewMode = "audit";
  state.audit.subview = "overview";
  el.viewMode.value = "audit";
  await loadAuditStatus();
  syncControlVisibility();
  renderGrid();
  fitOverview();
});

el.addMixedRowBtn.addEventListener("click", () => addMixedRow("", 0));
el.detailForm.addEventListener("submit", saveSelectedCell);
  el.pullOutBtn?.addEventListener("click", async () => {
    if (!selectedSlottedSlotCanPullOut() || !state.slottedModel || !state.selectedCell) {
      return;
    }
    const slotNumber = state.selectedCell.slot;
  try {
      const response = await apiPost("/api/config/slotted-pallet/pull-out", {
        group_id: state.slottedModel.slotted_pallet.group_id,
        slot: slotNumber
      });
      const createdItem = response.created_item || null;
      state.selectedSlottedPallet = "";
      if (createdItem) {
        await jumpToConfigMovableItem(createdItem.id, createdItem.area);
      } else {
        state.viewMode = "config";
        el.viewMode.value = "config";
        selectCell(null);
        await loadConfigModel();
        syncControlVisibility();
        renderGrid();
      }
      const createdId = createdItem?.id || "new pallet";
  setStatus(`Pulled out slot ${slotNumber} as pallet ${createdId} and opened it in the movable overlay editor.`);
    } catch (error) {
      setStatus(`Pull out failed: ${error.message}`);
    }
  });
el.fiCloseBtn?.addEventListener("click", () => closeInspector());
el.fiSaveBtn?.addEventListener("click", () => saveSelection({ source: "inspector", advance: 0 }));
el.fiPrevBtn?.addEventListener("click", () => moveSequentialBay(-1));
el.fiNextBtn?.addEventListener("click", () => moveSequentialBay(1));
el.fiMinusBtn?.addEventListener("click", () => {
  const val = Number.parseInt(el.fiQtyInput?.value || "0", 10) || 0;
  if (el.fiQtyInput) {
    el.fiQtyInput.value = String(Math.max(0, val - 1));
  }
});
el.fiPlusBtn?.addEventListener("click", () => {
  const val = Number.parseInt(el.fiQtyInput?.value || "0", 10) || 0;
  if (el.fiQtyInput) {
    el.fiQtyInput.value = String(Math.max(0, val + 1));
  }
});
el.fiPlus5Btn?.addEventListener("click", () => {
  const val = Number.parseInt(el.fiQtyInput?.value || "0", 10) || 0;
  if (el.fiQtyInput) {
    el.fiQtyInput.value = String(Math.max(0, val + 5));
  }
});
el.fiMixedEditBtn?.addEventListener("click", () => {
  if (state.viewMode !== "rack" || !state.selectedCell) {
    return;
  }
  el.mixedToggle.checked = true;
  setMixedVisible(true);
  if (!el.mixedRows.children.length) {
    addMixedRow(el.fiItemInput.value.trim(), Number.parseInt(el.fiQtyInput.value || "0", 10) || 0);
  }
  setStatus("Mixed editor enabled in details panel.");
});
el.fiMixedToggle?.addEventListener("change", () => {
  if (!state.selectedCell) {
    if (el.fiMixedToggle) {
      el.fiMixedToggle.checked = false;
    }
    return;
  }
  if (el.fiMixedToggle.checked) {
    setStatus("Mixed mode enabled. Save or use Edit Mixed.");
  } else {
    setStatus("Mixed mode disabled for next save.");
  }
});
document.addEventListener("keydown", handleGlobalKeydown);
el.gridWrap.addEventListener("mousedown", startRackPan);
document.addEventListener("mousemove", moveRackPan);
document.addEventListener("mouseup", endRackPan);
document.addEventListener("mousedown", (event) => {
  if (!isInspectorVisible()) {
    return;
  }
  if (event.target.closest("#floatingInspector")) {
    return;
  }
  if (event.target.closest(".rack-slot")) {
    return;
  }
  closeInspector();
});
window.addEventListener("resize", () => {
  if (isInspectorVisible()) {
    openInspectorNearSelection();
  }
});

window.WarehouseAppBridge = {
  requestAuditNote,
  applyAuditPayload,
  loadAuditStatus,
  cancelAuditSession,
  jumpToRackResult,
  jumpToFloorResult,
  jumpToSlottedResult,
  jumpToMovableItemResult,
  state,
  el,
  isAdmin,
  focusOverviewArea,
  loadAreasAndRacks,
  loadRackModel,
  loadManagementPreview,
  syncControlVisibility,
  renderGrid,
  fitOverview,
  setStatus
};

initialLoad();
