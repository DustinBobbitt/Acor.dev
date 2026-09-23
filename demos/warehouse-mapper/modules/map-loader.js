(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  const DEFAULT_PREFERRED_MAPS = [];

  async function loadLatestMap(apiPost, state, options = {}) {
    const silent = !!options.silent;
    const preferredNames = options.preferred_names || DEFAULT_PREFERRED_MAPS;
    const data = await apiPost("/api/file/load-latest", {
      preferred_names: preferredNames,
      prefer_names_first: options.prefer_names_first !== false
    });
    if (data.loaded) {
      state.currentMapPath = data.current_path || "";
      if (!silent && typeof options.onStatus === "function") {
        options.onStatus(`Loaded latest map: ${data.current_path || ""}`);
      }
    } else if (!silent && typeof options.onStatus === "function") {
      options.onStatus("No map files were found to load.");
    }
    return data;
  }

  async function loadMapByPath(apiPost, state, pathValue, options = {}) {
    const path = String(pathValue || "").trim();
    if (!path) {
      if (typeof options.onStatus === "function") {
        options.onStatus("Select a map file to load.");
      }
      return null;
    }
    const data = await apiPost("/api/file/load", { path });
    state.currentMapPath = data.current_path || path;
    if (typeof options.onStatus === "function") {
      options.onStatus(`Loaded map: ${state.currentMapPath}`);
    }
    return data;
  }

  async function loadMapCatalog(apiGet, state, options = {}) {
    try {
      const data = await apiGet("/api/file/maps");
      state.mapFiles = data.maps || [];
      state.currentMapPath = data.current_path || state.currentMapPath || "";
      return data;
    } catch (error) {
      state.mapFiles = [];
      if (typeof options.onStatus === "function") {
        options.onStatus(`Map list unavailable: ${error.message}`);
      }
      throw error;
    }
  }

  modules.mapLoader = {
    DEFAULT_PREFERRED_MAPS,
    loadLatestMap,
    loadMapByPath,
    loadMapCatalog
  };
})();
