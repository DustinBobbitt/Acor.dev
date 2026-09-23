(function () {
  "use strict";

  const geometry = window.WarehouseModules && window.WarehouseModules.geometry;
  const areaOptions = document.getElementById("areaOptions");
  const mapsHost = document.getElementById("maps");
  const message = document.getElementById("message");
  const printMeta = document.getElementById("printMeta");
  let mapData = null;
  let placements = [];

  function svgEl(name, attrs = {}, text = null) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== null) node.textContent = text;
    return node;
  }

  function placementNames(placement) {
    const raw = [...(Array.isArray(placement.job_names) ? placement.job_names : []), placement.job_name];
    return [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function placementCabinets(placement) {
    if (!Array.isArray(placement.reclaimed_cabinets)) return [];
    return placement.reclaimed_cabinets.filter((cabinet) => {
      return cabinet && cabinet.cabinet_id && cabinet.item_number;
    });
  }

  function cabinetLabel(cabinet) {
    const item = String(cabinet?.item_number || "Cabinet");
    return Number(cabinet?.quantity || 1) > 1
      ? `${item} #${Number(cabinet?.occurrence || 1)}`
      : item;
  }

  function shortName(value) {
    const name = String(value || "");
    return name.length > 24 ? `${name.slice(0, 21)}…` : name;
  }

  function areas() {
    return (mapData?.areas || []).map((area) => String(area.id || area.label || "").trim()).filter(Boolean);
  }

  function selectedAreas() {
    return [...areaOptions.querySelectorAll("input:checked")].map((input) => input.value);
  }

  function entityRect(type, entity) {
    return geometry.entityRect(type, entity);
  }

  function placementRect(placement) {
    const width = placement.is_single_cabinet_rack ? Number(placement.rack_width || 104) : 70;
    const height = placement.is_single_cabinet_rack ? Number(placement.rack_height || 64) : 50;
    return {
      x: Number(placement.x || 0) - width / 2,
      y: Number(placement.y || 0) - height / 2,
      width,
      height,
      rotation: Number(placement.rotation || 0),
    };
  }

  function entitiesForArea(areaName) {
    const sameArea = (entity) => String(entity.area || "").trim().toLowerCase() === areaName.toLowerCase();
    const entities = [];
    (mapData.null_spaces || []).filter(sameArea).forEach((data) => entities.push({ kind: "null", data, rect: entityRect("null_space", data) }));
    (mapData.zones || []).filter(sameArea).forEach((data) => entities.push({ kind: "zone", data, rect: entityRect("zone", data) }));
    (mapData.slotted_pallets || []).filter(sameArea).forEach((data) => entities.push({ kind: "slotted", data, rect: entityRect("slotted_pallet", data) }));
    (mapData.rows || []).filter(sameArea).forEach((data) => entities.push({ kind: "rack", data, rect: entityRect("row", data) }));
    placements.filter(sameArea).filter((data) => !data.is_single_cabinet || data.is_single_cabinet_rack).forEach((data) => entities.push({ kind: "pallet", data, rect: placementRect(data) }));
    return entities;
  }

  function rotationTransform(rect) {
    if (!rect.rotation) return "";
    return `rotate(${rect.rotation} ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})`;
  }

  function addRackDividers(svg, entity) {
    const { data, rect } = entity;
    const bays = Math.max(1, Number(data.bay_count || 1));
    const group = svgEl("g", { transform: rotationTransform(rect) });
    for (let bay = 1; bay < bays; bay += 1) {
      if (data.orientation === "vertical") {
        const y = rect.y + (rect.height * bay) / bays;
        group.appendChild(svgEl("line", { x1: rect.x, y1: y, x2: rect.x + rect.width, y2: y, class: "map-bay-line" }));
      } else {
        const x = rect.x + (rect.width * bay) / bays;
        group.appendChild(svgEl("line", { x1: x, y1: rect.y, x2: x, y2: rect.y + rect.height, class: "map-bay-line" }));
      }
    }
    svg.appendChild(group);
  }

  function entityLabel(entity) {
    const { kind, data } = entity;
    if (kind === "pallet") {
      if (data.is_single_cabinet_rack) return "Single Cabinet Jobs";
      const cabinets = placementCabinets(data);
      if (data.is_reclaimed && cabinets.length) {
        return cabinets.length > 1 ? `MIX ×${cabinets.length}` : cabinetLabel(cabinets[0]);
      }
      const names = placementNames(data);
      return names.length > 1 ? `MIX ×${names.length}` : shortName(names[0] || "Pallet");
    }
    return data.label || data.name || data.id || data.group_id || data.space_id || data.zone_id || "";
  }

  function renderArea(areaName) {
    const entities = entitiesForArea(areaName);
    const bounds = geometry.boundsOf(entities.map((entity) => entity.rect));
    const section = document.createElement("section");
    section.className = "area-sheet";
    const heading = document.createElement("div");
    heading.className = "sheet-heading";
    const count = entities.filter((entity) => entity.kind === "pallet" && !entity.data.is_single_cabinet_rack).length;
    heading.innerHTML = `<h2>Cut Pallet Locator · ${areaName}</h2><p>${count} live pallet${count === 1 ? "" : "s"} · Printed ${new Date().toLocaleString()}</p>`;
    section.appendChild(heading);
    if (!bounds) {
      section.appendChild(document.createTextNode("No mapped entities in this area."));
      return section;
    }
    const pad = Math.max(35, Math.min(bounds.width, bounds.height) * 0.035);
    const svg = svgEl("svg", {
      viewBox: `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": `Warehouse map for ${areaName}`,
    });
    entities.forEach((entity) => {
      const { kind, data, rect } = entity;
      const className = kind === "pallet"
        ? `map-pallet${data.is_reclaimed ? " reclaimed" : data.is_paint_job ? " paint" : ""}`
        : `map-${kind}`;
      svg.appendChild(svgEl("rect", {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rx: kind === "pallet" ? 5 : 2,
        class: className,
        transform: rotationTransform(rect),
      }));
      if (kind === "rack") addRackDividers(svg, entity);
    });
    entities.forEach((entity) => {
      const label = entityLabel(entity);
      if (!label) return;
      const { rect, kind, data } = entity;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      svg.appendChild(svgEl("text", { x: cx, y: cy, class: "map-label", "text-anchor": "middle", "dominant-baseline": "middle" }, label));
      if (kind === "rack") {
        const start = Number(data.bay_start || 1);
        const end = data.bay_direction === "down" ? start - Number(data.bay_count || 0) + 1 : start + Number(data.bay_count || 0) - 1;
        svg.appendChild(svgEl("text", { x: cx, y: cy + 19, class: "map-sublabel", "text-anchor": "middle" }, `Bays ${Math.min(start, end)}–${Math.max(start, end)}`));
      }
    });
    section.appendChild(svg);
    const legend = document.createElement("div");
    legend.className = "legend";
    legend.innerHTML = '<span class="rack">Rack row</span><span class="slot">Slotted pallet area</span><span class="pallet">Live pallet</span><span class="reclaimed">Reclaimed pallet</span><span class="obstruction">Machine / obstruction</span>';
    section.appendChild(legend);
    return section;
  }

  function renderSelected() {
    mapsHost.innerHTML = "";
    const selected = selectedAreas();
    if (!selected.length) {
      message.hidden = false;
      message.textContent = "Select at least one warehouse area to print.";
      return;
    }
    message.hidden = true;
    selected.forEach((area) => mapsHost.appendChild(renderArea(area)));
    const params = new URLSearchParams(location.search);
    params.set("areas", selected.join(","));
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }

  function buildAreaOptions() {
    const requested = new Set((new URLSearchParams(location.search).get("areas") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
    areaOptions.innerHTML = "";
    areas().forEach((area) => {
      const label = document.createElement("label");
      label.className = "area-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = area;
      input.checked = !requested.size || requested.has(area.toLowerCase());
      input.addEventListener("change", renderSelected);
      label.append(input, document.createTextNode(area));
      areaOptions.appendChild(label);
    });
  }

  async function load() {
    if (!geometry) throw new Error("The current Mapping Tool geometry module could not be loaded.");
    const [mapResponse, placementsResponse, statusResponse] = await Promise.all([
      fetch("/api/map"),
      fetch("/api/placements"),
      fetch("/api/status"),
    ]);
    if (!mapResponse.ok || !placementsResponse.ok) throw new Error("The locator server did not return the warehouse map.");
    mapData = await mapResponse.json();
    placements = await placementsResponse.json();
    const status = statusResponse.ok ? await statusResponse.json() : {};
    buildAreaOptions();
    renderSelected();
    const format = mapData.source_format === "mapping-tool-v3" ? "Mapping Tool v3 geometry" : "warehouse geometry";
    printMeta.textContent = `${format} · ${mapData.rows?.length || 0} rack rows · ${mapData.rack_location_count || 0} rack locations`;
    document.title = `Print Cut Pallet Map · ${areas().join(" + ")}`;
    if (status.map_path) printMeta.title = status.map_path;
    if (new URLSearchParams(location.search).get("autoprint") === "1") setTimeout(() => window.print(), 250);
  }

  document.getElementById("printButton").addEventListener("click", () => {
    if (!selectedAreas().length) {
      renderSelected();
      return;
    }
    window.print();
  });
  document.getElementById("backButton").addEventListener("click", () => { location.href = "/"; });
  load().catch((error) => {
    message.hidden = false;
    message.textContent = `Could not load the map: ${error.message}`;
    printMeta.textContent = "Map unavailable";
  });
})();
