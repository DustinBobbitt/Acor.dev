(() => {
  const modules = (window.WarehouseModules = window.WarehouseModules || {});

  function setMixedVisible(el, isVisible) {
    if (!el?.mixedEditor) {
      return;
    }
    if (isVisible) {
      el.mixedEditor.classList.remove("hidden");
    } else {
      el.mixedEditor.classList.add("hidden");
    }
  }

  function clearMixedRows(el) {
    if (!el?.mixedRows) {
      return;
    }
    el.mixedRows.innerHTML = "";
  }

  function addMixedRow(el, itemNumber = "", qty = 0) {
    if (!el?.mixedRows) {
      return;
    }
    const row = document.createElement("div");
    row.className = "mixed-row";

    const itemInput = document.createElement("input");
    itemInput.type = "text";
    itemInput.placeholder = "Item number";
    itemInput.value = itemNumber;

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.value = String(qty);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => row.remove());

    row.appendChild(itemInput);
    row.appendChild(qtyInput);
    row.appendChild(removeBtn);
    el.mixedRows.appendChild(row);
  }

  function collectMixedRows(el) {
    if (!el?.mixedRows) {
      return [];
    }
    const rows = [];
    const nodes = el.mixedRows.querySelectorAll(".mixed-row");
    nodes.forEach((node) => {
      const [itemInput, qtyInput] = node.querySelectorAll("input");
      const itemNumber = itemInput.value.trim();
      const rawQty = qtyInput.value.trim();
      if (!itemNumber && (!rawQty || rawQty === "0")) {
        return;
      }
      if (!itemNumber || !/^\d+$/.test(rawQty) || !Number.isSafeInteger(Number(rawQty))) {
        throw new Error("Each mixed item needs a product code and a non-negative whole-number quantity.");
      }
      rows.push({ item_number: itemNumber, qty: Number(rawQty) });
    });
    return rows;
  }

  modules.detailPanel = {
    addMixedRow,
    clearMixedRows,
    collectMixedRows,
    setMixedVisible
  };
})();
