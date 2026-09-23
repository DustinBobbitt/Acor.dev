/** Shop-wide new-hire guide: cabinet families, depth, and nomenclature. */
window.buildCabinetWelcomeGuideHtml = function buildCabinetWelcomeGuideHtml() {
  return `
    <article class="cabinet-welcome-guide">
      <header class="cabinet-welcome-header">
        <p class="trim-checklist-preview-eyebrow">Timberland Cabinetry · Shop Training</p>
        <h3>Welcome to the World of Cabinets</h3>
        <p class="cabinet-welcome-intro">
          This guide covers general cabinet-shop knowledge that applies across Cut, Custom, Assembly,
          and other departments. It is not software training. The goal is to help you understand the
          language people use when talking about cabinets on the floor.
        </p>
      </header>

      <section class="cabinet-guide-section">
        <h4>Carcass and 3pc</h4>
        <p>A cabinet and a carcass are not the same thing.</p>
        <p>
          The <strong>carcass</strong> is the plywood box itself. It includes the sides, bottom, back,
          and the internal supports, such as nailers and stretchers.
        </p>
        <p>
          The <strong>3pc</strong>, or three-piece, is the set that finishes the cabinet: the frame,
          doors, and drawer box.
        </p>
        <p>
          A finished cabinet is made up of the carcass and the 3pc. On paperwork and in conversation,
          these terms are kept separate because they refer to different parts of the job.
        </p>
        <p>
          Inside the carcass you will hear about <strong>struts</strong> (also called
          <strong>stretchers</strong> — same part) and <strong>nailers</strong>.
        </p>
        <p>
          <strong>Struts</strong> sit inside the box, in dados in the sides, and keep the cabinet square.
        </p>
        <p>
          <strong>Nailers</strong> run across the back. The back is recessed, so the nailers give you
          something solid to screw through when hanging the cabinet on the wall. You usually get two —
          one near the top and one near the bottom.
        </p>
        <p>
          <strong>Toe kicks</strong> are the recessed strip at the bottom of a floor cabinet (base,
          vanity, tall). That notch lets your feet tuck under the cabinet when you stand at the
          counter. Without a toe kick, you would have to stand farther back from the work surface.
        </p>
      </section>

      <section class="cabinet-guide-section">
        <h4>Cabinet families and depth</h4>
        <p>
          Depth is the measurement from the wall out into the room — how far the cabinet sticks out.
          At Timberland, each family has a <strong>standard depth</strong>. Knowing the family and the
          depth together is usually enough to understand what you are looking at.
        </p>
        <p>
          If a customer orders a <strong>modified depth</strong> (something other than the standard),
          that work typically goes through the <strong>Cut Department</strong> and is produced on our
          <strong>CNC</strong> machines rather than following the usual stock construction path.
        </p>
        <figure class="cabinet-guide-figure">
          <img src="/static/cabinet_guide/depth_from_wall.svg" alt="Side view comparing wall, vanity, base, and refrigerator wall depths">
          <figcaption>Same wall. Different jobs. Different standard depths.</figcaption>
        </figure>

        <h5>Base</h5>
        <p>
          Lower kitchen cabinets. They sit on the floor, usually over a toe kick.
          <strong>Standard depth: 24 inches.</strong>
          That depth leaves room for counter space, sinks, cooktops, and storage.
          Our base cabinets are <strong>34½ inches tall</strong>.
        </p>

        <h5>Vanity</h5>
        <p>
          Bathroom lowers. Same floor-mounted idea as a base, but shallower —
          <strong>standard depth: 21 inches</strong> — because bathrooms usually do not need the box
          to stick out as far as a kitchen base. You may also see vanity-related families such as
          TVDB-style codes.
        </p>

        <h5>Wall</h5>
        <p>
          Upper cabinets mounted on the wall. <strong>Standard depth: 12 inches</strong>, so they stay
          out of the way and people are less likely to bump their heads. Item numbers often begin with
          prefixes such as <strong>CW</strong> or <strong>W</strong>.
        </p>

        <h5>Refrigerator wall (RW / CRW)</h5>
        <p>
          The cabinet over a refrigerator. It is still a wall cabinet, but the
          <strong>standard depth is 24 inches</strong> so the front lines up more closely with the
          fridge face.
        </p>

        <h5>Tall or pantry</h5>
        <p>
          Floor-to-near-ceiling storage — pantry or utility style — with full-height sides rather than
          the shorter sides used on base cabinets.
        </p>
      </section>

      <section class="cabinet-guide-section">
        <h4>Nomenclature cheat sheet</h4>
        <p>
          Item numbers and construction codes are a form of shorthand. You do not need to memorize every
          item number immediately. Start by identifying the cabinet family.
        </p>
        <table class="cabinet-guide-table">
          <thead>
            <tr>
              <th>You may see</th>
              <th>Usually means</th>
              <th>Shop note</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>B…</strong> / Base</td>
              <td>Base cabinet</td>
              <td>Kitchen lower — standard depth 24"</td>
            </tr>
            <tr>
              <td><strong>V…</strong> / Vanity / <strong>TVDB</strong></td>
              <td>Vanity or deck-vanity family</td>
              <td>Bathroom lower — standard depth 21"</td>
            </tr>
            <tr>
              <td><strong>CW…</strong> / Wall</td>
              <td>Wall cabinet</td>
              <td>Upper cabinet — standard depth 12"</td>
            </tr>
            <tr>
              <td><strong>RW</strong> / <strong>CRW</strong></td>
              <td>Refrigerator wall</td>
              <td>Cabinet over a refrigerator — standard depth 24"</td>
            </tr>
            <tr>
              <td><strong>SCB</strong></td>
              <td>Square Corner Base</td>
              <td>Base cabinet with a square-corner construction</td>
            </tr>
            <tr>
              <td><strong>SCW</strong></td>
              <td>Square Corner Wall</td>
              <td>Upper version of a square-corner cabinet</td>
            </tr>
            <tr>
              <td><strong>AB</strong></td>
              <td>Angled Base</td>
              <td>Special angled base with unique shelf and construction rules</td>
            </tr>
            <tr>
              <td><strong>AW</strong></td>
              <td>Angled Wall</td>
              <td>Special angled wall cabinet, often positioned 45 or 90 degrees from the wall depending on the item</td>
            </tr>
            <tr>
              <td><strong>DW</strong></td>
              <td>Diagonal or angled wall family</td>
              <td>Special angled upper, often discussed as a 45-degree wall cabinet</td>
            </tr>
            <tr>
              <td><strong>WBM</strong></td>
              <td>Wall or base-like rule family</td>
              <td>Check with a lead when the paperwork or construction is unfamiliar</td>
            </tr>
            <tr>
              <td><strong>DDB</strong></td>
              <td>Drawer box between bases</td>
              <td>Short drawer-box unit that spans the gap between two base cabinets</td>
            </tr>
            <tr>
              <td><strong>DDV</strong></td>
              <td>Drawer box between vanities</td>
              <td>Same idea as a DDB, but spanning the gap between two vanity cabinets</td>
            </tr>
          </tbody>
        </table>
        <p>
          If an item number starts with a <strong>C</strong>, it always refers to the
          <strong>carcass</strong> of that product. A finished product is made up of several
          components (doors, drawer boxes, and so on); the carcass is one of those components.
        </p>
        <p class="cabinet-guide-note">
          When a code is unfamiliar, start with two things: the cabinet family and the depth. Those
          usually provide enough context to understand what type of cabinet you are looking at.
        </p>
      </section>

      <section class="cabinet-guide-section">
        <h4>Reading cabinet sizes</h4>
        <p>Cabinet dimensions are described in three directions:</p>
        <ul>
          <li><strong>Width</strong> is measured from left to right as you face the cabinet.</li>
          <li><strong>Height</strong> is measured from the bottom to the top.</li>
          <li><strong>Depth</strong> is measured from the wall out into the room.</li>
        </ul>
        <p>
          Item numbers combine the cabinet family with one or more dimensions. Start with the
          letters — they tell you the family — then read the numbers in light of that family’s
          standards.
        </p>
        <p>
          For example, <strong>B24</strong> is a base cabinet 24&quot; wide. Bases are a standard
          34½&quot; tall and 24&quot; deep, so those do not need to appear in the item number unless
          the depth is modified.
        </p>
        <p>
          Walls are different: height varies, so a code like <strong>CW3012</strong> uses the first
          two numbers for width and the next two for height. When depth is called out in the item
          number, it usually appears after an <strong>X</strong> (for example, a modified depth).
        </p>
      </section>

      <section class="cabinet-guide-section">
        <h4>What comes next</h4>
        <p>
          This guide can later be expanded to include department handoffs, Insight statuses, and
          Cut-specific paperwork.
        </p>
        <p>
          For day one, the important part is being able to look at a cabinet and identify whether it
          is a base, vanity, wall, tall, or refrigerator wall—and understand why the depth is different.
        </p>
      </section>
    </article>
  `;
};

window.buildCabinetWelcomeGuideDocumentHtml = function buildCabinetWelcomeGuideDocumentHtml() {
  const guide = window.buildCabinetWelcomeGuideHtml()
    .replaceAll('src="/static/cabinet_guide/', 'src="./cabinet_guide/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Welcome to the World of Cabinets</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #15202b; margin: 24px; line-height: 1.5; max-width: 900px; }
    h3 { margin: 0 0 8px; font-size: 26px; }
    h4 { margin: 22px 0 8px; font-size: 16px; color: #1f3344; }
    h5 { margin: 14px 0 6px; font-size: 14px; color: #102030; }
    ul { margin: 8px 0; padding-left: 22px; }
    p { margin: 8px 0; }
    .trim-checklist-preview-eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #4a6478; }
    .cabinet-welcome-intro { color: #4a6478; }
    .cabinet-guide-figure { margin: 14px 0; }
    .cabinet-guide-figure img { width: 100%; max-width: 720px; height: auto; border: 1px solid #c7d3de; border-radius: 8px; background: #fff; }
    .cabinet-guide-figure figcaption { margin-top: 6px; font-size: 12px; color: #4a6478; }
    .cabinet-guide-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .cabinet-guide-table th, .cabinet-guide-table td { border: 1px solid #c7d3de; padding: 8px 10px; text-align: left; vertical-align: top; }
    .cabinet-guide-table th { background: #edf3f8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .cabinet-guide-note { background: #edf3f8; border-left: 4px solid #2a6ea8; padding: 10px 12px; }
    @media print {
      body { margin: 12mm; }
      .cabinet-guide-section { break-inside: avoid; }
    }
  </style>
</head>
<body>${guide}</body>
</html>`;
};
