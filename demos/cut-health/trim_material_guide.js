/** Trim stock reference for new hires — loaded before app.js */
window.buildTrimMaterialGuideHtml = function buildTrimMaterialGuideHtml() {
  return `
    <article class="trim-material-guide">
      <header class="trim-material-guide-header">
        <p class="trim-checklist-preview-eyebrow">Timberland Cabinetry · Cut Department</p>
        <h3>Trim Stock Material Guide</h3>
        <p class="trim-material-guide-intro">
          Use this sheet with the trim inventory checklist. It explains what the section headers mean,
          how to tell paint UV-1 from stain NO UV, and where each stock type is kept on the floor.
        </p>
      </header>

      <section class="trim-guide-section">
        <h4>Checklist section headers — thickness</h4>
        <ul>
          <li><strong>1/2" MATERIAL (0.5")</strong> — <strong>half-inch</strong> thick sheet stock. Used for REP, BEP, and WEP trim pieces on the checklist.</li>
          <li><strong>1/4" MATERIAL (0.25")</strong> — <strong>quarter-inch</strong> thick sheet stock. Used for Base Skin, Wall Skin (42 x 11.25 and 96 x 23.25), and Tall Skin on the checklist.</li>
        </ul>
      </section>

      <section class="trim-guide-section">
        <h4>Paint UV-1 vs Stain NO UV</h4>
        <ul>
          <li><strong>Paint UV-1</strong> — paint-grade material with a UV-cured top coat on the finished face. That face looks smoother and more sealed (often slightly glossy compared to raw plywood).</li>
          <li><strong>Stain NO UV</strong> — stain-grade material without that UV top coat on the face that receives stain.</li>
          <li><strong>How to compare:</strong> on a UV-1 piece, flip it over — the unfinished bottom side shows what NO UV looks like.</li>
        </ul>
        <p class="trim-guide-callout trim-guide-warning">
          <strong>Do not use full sheets</strong> that have UV coating on <strong>both sides</strong>.
          A small <strong>scrap</strong> with coating on both faces may still be usable — ask a lead before using it on a job.
        </p>
      </section>

      <section class="trim-guide-section">
        <h4>Where to find stock on the floor</h4>
        <div class="trim-guide-location-grid">
          <div class="trim-guide-location-card">
            <h5>1/2" Paint UV-1</h5>
            <p>Half-inch UV-1 roll / sheet stock for paint trim (REP, BEP, WEP).</p>
            <ul>
              <li>Located at the <strong>Omni</strong>.</li>
            </ul>
          </div>
          <div class="trim-guide-location-card">
            <h5>1/2" Stain NO UV</h5>
            <p>Half-inch stain-grade stock without the UV top coat.</p>
            <ul>
              <li>Typically in <strong>Cut Department</strong>, closer to <strong>Custom</strong>.</li>
            </ul>
          </div>
          <div class="trim-guide-location-card">
            <h5>1/4" Paint UV-1 &amp; Stain NO UV</h5>
            <p>Quarter-inch skins (Base Skin, Wall Skin, Tall Skin).</p>
            <ul>
              <li>Both variants are stored <strong>side-by-side behind the Northwood</strong>.</li>
              <li>A <strong>wall label</strong> marks paint UV-1 vs stain NO UV.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="trim-guide-section">
        <h4>Using the checklist</h4>
        <p>
          Each block matches one thickness + grade combination. The need list shows trim expected
          to enter Sand today. Trim tells Cut <strong>Qty wanted</strong> — how many to cut, if any.
          Cut does not record on-hand counts on this sheet. The <strong>COH/Other</strong> block is blank
          write-in rows for custom sizes and other items.
        </p>
      </section>
    </article>
  `;
};

window.buildTrimMaterialGuideDocumentHtml = function buildTrimMaterialGuideDocumentHtml() {
  const guide = window.buildTrimMaterialGuideHtml();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Trim Stock Material Guide</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #15202b; margin: 24px; line-height: 1.45; }
    h3 { margin: 0 0 8px; font-size: 24px; }
    h4 { margin: 18px 0 8px; font-size: 15px; color: #1f3344; }
    h5 { margin: 0 0 6px; font-size: 14px; }
    ul { margin: 8px 0; padding-left: 22px; }
    p { margin: 8px 0; }
    .trim-checklist-preview-eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #4a6478; }
    .trim-material-guide-intro { color: #4a6478; }
    .trim-guide-callout { border-left: 4px solid #c77800; background: #fff6df; padding: 10px 12px; margin-top: 10px; }
    .trim-guide-location-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    .trim-guide-location-card { border: 1px solid #c7d3de; border-radius: 8px; padding: 12px; background: #f8fbfd; }
    @media print { body { margin: 12mm; } .trim-guide-location-grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>${guide}</body>
</html>`;
};
