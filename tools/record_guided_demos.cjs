const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "rsc", "media");
const BASE = process.env.ACOR_PREVIEW_URL || "http://localhost:8767";
const BROWSER = process.env.ACOR_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function caption(page, text) {
  await page.evaluate((copy) => {
    let node = document.querySelector("[data-recording-caption]");
    if (!node) {
      node = document.createElement("div");
      node.dataset.recordingCaption = "true";
      Object.assign(node.style, {
        position: "fixed",
        left: "50%",
        bottom: "30px",
        transform: "translateX(-50%)",
        zIndex: "9999",
        width: "min(1100px, calc(100vw - 80px))",
        padding: "18px 26px",
        border: "1px solid rgba(58,208,255,.55)",
        borderRadius: "16px",
        background: "rgba(5,9,20,.94)",
        color: "#edf1ff",
        boxShadow: "0 18px 60px rgba(0,0,0,.55)",
        font: "700 24px/1.35 'Plus Jakarta Sans', sans-serif",
        textAlign: "center"
      });
      document.body.appendChild(node);
    }
    node.textContent = copy;
  }, text);
}

async function record(browser, name, route, run) {
  const temp = path.join(OUTPUT, `.record-${name}`);
  fs.mkdirSync(temp, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    recordVideo: { dir: temp, size: { width: 2560, height: 1440 } }
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await sleep(1500);
  await run(page);
  await sleep(1200);
  const video = page.video();
  await context.close();
  const recorded = await video.path();
  const target = path.join(OUTPUT, `${name}.webm`);
  fs.copyFileSync(recorded, target);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`${name}: ${target}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER });
  try {
    await record(browser, "geometry_pipeline_guided", "/demos/pipeline-explorer/", async (page) => {
      await caption(page, "A supported synthetic job starts with exact identity—not a loose filename.");
      await sleep(2600);
      for (const copy of [
        "Resolve the public recipe and material references.",
        "Preflight every active machining operation before any output can publish.",
        "Publish the complete DXF set atomically.",
        "Build one canonical sheet definition.",
        "Validate TAP and XPR/NC as independent sibling outcomes."
      ]) {
        await page.getByRole("button", { name: "Advance one step" }).click();
        await caption(page, copy);
        await sleep(2300);
      }
      await page.getByRole("button", { name: "Advance one step" }).click();
      await caption(page, "The complete set now has explicit artifacts, hashes, and format status.");
      await sleep(3200);
      await page.getByRole("button", { name: /DEMO-1063/ }).click();
      await caption(page, "Now select the intentionally unsupported active operation.");
      await sleep(2400);
      await page.getByRole("button", { name: "Run to outcome" }).click();
      await caption(page, "Fail closed: zero files publish, and later states remain unclaimed.");
      await sleep(4200);
    });

    await record(browser, "exact_request_receipt_guided", "/demos/request-receipt/", async (page) => {
      await caption(page, "The public request selects two exact item identities.");
      await sleep(2800);
      await page.getByRole("button", { name: "Freeze selected request" }).click();
      await caption(page, "Freeze the reviewed scope and current input as hashes.");
      await sleep(3200);
      await page.getByRole("button", { name: "Change input and test stale plan" }).click();
      await caption(page, "A changed input makes the reviewed plan stale: generation is refused.");
      await sleep(4200);
      await page.getByRole("button", { name: "Reset scenario" }).click();
      await caption(page, "Reset reconstructs the same deterministic public request.");
      await sleep(2500);
      await page.getByRole("button", { name: "Freeze selected request" }).click();
      await sleep(1800);
      await page.getByRole("button", { name: "Generate and verify receipt" }).click();
      await caption(page, "Unchanged input: verify artifact count and bytes, then record the receipt.");
      await sleep(4700);
    });

    await record(browser, "station_handoff_guided", "/demos/station-handoff/", async (page) => {
      await caption(page, "The station begins with a prior verified set still active.");
      await sleep(3000);
      await page.getByRole("button", { name: "Run interrupted load" }).click();
      await caption(page, "The copy stops after two files. The incomplete stage cannot become active.");
      await sleep(4200);
      await caption(page, "Rollback removes partial staging and restores the prior station set.");
      await sleep(3500);
      await page.getByRole("button", { name: "Retry verified load" }).click();
      await caption(page, "Retry verifies every file and byte before committing the new set.");
      await sleep(4500);
      await caption(page, "Custody is proven. Physical machine execution remains outside the claim.");
      await sleep(4200);
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
