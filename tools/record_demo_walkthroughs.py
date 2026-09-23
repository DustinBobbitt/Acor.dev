"""Record interactive portfolio demo walkthroughs with Playwright video.

Produces webm (Playwright native), then remuxes/encodes to H.264 MP4 with ffmpeg.
"""
from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "rsc" / "media"
RAW = ROOT / "tools" / "_recordings"
BASE = "http://127.0.0.1:8765"
VIEWPORT = {"width": 1600, "height": 1000}


def ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise SystemExit("ffmpeg not on PATH")
    return exe


def to_mp4(webm: Path, mp4: Path) -> None:
    cmd = [
        ffmpeg(),
        "-y",
        "-i",
        str(webm),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(mp4),
    ]
    subprocess.run(cmd, check=True)


def pause(page, seconds: float = 0.7) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def record_cut_health(page) -> None:
    page.goto(f"{BASE}/demos/cut-health/", wait_until="networkidle")
    pause(page, 1.4)
    # Hero tiles + morning workflow on the real Cut UI
    tile = page.locator("#completedTodayTile")
    if tile.count():
        tile.click()
        pause(page, 1.2)
        page.keyboard.press("Escape")
        pause(page, 0.5)
    morning = page.locator("button:has-text('Open Morning Plan')")
    if morning.count():
        morning.first.click()
        pause(page, 1.6)
        page.keyboard.press("Escape")
        pause(page, 0.5)
    refresh = page.locator("button:has-text('Refresh plan')")
    if refresh.count():
        refresh.first.click()
        pause(page, 1.2)
    omni = page.locator("button:has-text('Omni Queue'), [role='tab']:has-text('Omni Queue')")
    if omni.count():
        omni.first.click()
        pause(page, 1.2)
    morning_tab = page.locator("button:has-text('Morning'), [role='tab']:has-text('Morning')")
    if morning_tab.count():
        morning_tab.first.click()
        pause(page, 0.8)
    page.mouse.wheel(0, 700)
    pause(page, 1.0)
    page.mouse.wheel(0, -700)
    pause(page, 0.8)


def record_pallet_locator(page) -> None:
    page.goto(f"{BASE}/demos/pallet-locator/", wait_until="networkidle")
    pause(page, 1.2)
    page.locator('[data-job="JOB-2101"]').click()
    pause(page, 1.0)
    page.locator("#jobSearchInput").fill("2105")
    pause(page, 0.8)
    page.locator('[data-job="JOB-2105"]').click()
    pause(page, 0.8)
    area = page.locator('button[data-area="Assembly"], #areaAllBtn')
    if area.count():
        area.first.click()
        pause(page, 0.6)
    page.locator("#placeModeBtn").click()
    pause(page, 1.0)
    page.locator("#placeJobName").fill("JOB-2120")
    pause(page, 0.4)
    page.locator("#placeConfirmBtn").click()
    pause(page, 0.8)
    canvas = page.locator("#mapCanvas")
    box = canvas.bounding_box()
    assert box
    page.mouse.click(box["x"] + box["width"] * 0.42, box["y"] + box["height"] * 0.38)
    pause(page, 1.2)
    if page.locator("#undoBtn:not([disabled])").count():
        page.locator("#undoBtn").click()
        pause(page, 0.9)
    page.locator("#jobSearchInput").fill("")
    page.locator("#jobFilterSelect").select_option("all")
    pause(page, 0.9)


def record_wood_usage(page) -> None:
    page.goto(f"{BASE}/demos/wood-usage/", wait_until="networkidle")
    pause(page, 1.0)
    upcoming = page.locator('button[data-view="upcoming"]')
    if upcoming.count():
        upcoming.click()
        pause(page, 0.8)
    search = page.locator("#jobSearch")
    if search.count():
        search.fill("214")
        pause(page, 0.8)
        search.fill("")
    all_btn = page.locator('button[data-view="all"]')
    if all_btn.count():
        all_btn.click()
        pause(page, 0.5)
    sku = page.locator("#skuInput")
    if sku.count():
        sku.fill("B36[3]\nW3624[2]\nCB33\nUNKNOWN-99")
        pause(page, 0.6)
        submit = page.locator("#calculateForm button[type='submit']")
        if submit.count():
            submit.click()
            pause(page, 1.2)
    similar = page.locator("#similarInput")
    if similar.count():
        similar.fill("B3")
        form = page.locator("#similarForm button[type='submit']")
        if form.count():
            form.click()
            pause(page, 1.0)
    page.mouse.wheel(0, 500)
    pause(page, 1.0)
    page.mouse.wheel(0, -500)
    pause(page, 0.8)


def record_one(name: str, action, screenshot_name: str | None = None) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)
    IMG = ROOT / "rsc" / "img"
    IMG.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(RAW),
            record_video_size=VIEWPORT,
        )
        page = context.new_page()
        action(page)
        if screenshot_name:
            tmp_shot = RAW / f"_shot_{screenshot_name}"
            page.screenshot(path=str(tmp_shot), full_page=False)
            dest = IMG / screenshot_name
            try:
                if dest.exists():
                    dest.unlink()
                tmp_shot.replace(dest)
            except OSError:
                # File may be locked by a viewer; keep temp and copy best-effort.
                try:
                    shutil.copy2(tmp_shot, dest)
                except OSError:
                    print(f"warning: could not update {dest}; shot left at {tmp_shot}")
        video_path = Path(page.video.path())
        context.close()
        browser.close()
        # Playwright finalizes webm on context close.
        target_webm = RAW / f"{name}.webm"
        if video_path.exists():
            if target_webm.exists():
                target_webm.unlink()
            video_path.replace(target_webm)
        mp4 = MEDIA / f"demo_{name}_walkthrough.mp4"
        to_mp4(target_webm, mp4)
        return mp4


def build_montage(clips: list[Path], out: Path) -> None:
    """Concat walkthrough clips into one montage MP4."""
    listing = RAW / "montage_list.txt"
    lines = []
    for clip in clips:
        lines.append(f"file '{clip.resolve().as_posix()}'")
    listing.write_text("\n".join(lines), encoding="utf-8")
    cmd = [
        ffmpeg(),
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(listing),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out),
    ]
    subprocess.run(cmd, check=True)


def record_warehouse_mapper(page) -> None:
    page.goto(f"{BASE}/demos/warehouse-mapper/", wait_until="networkidle")
    pause(page, 1.0)
    # Real mapper opens behind a User/Admin landing gate.
    user = page.locator("#landingUserBtn")
    if user.count() and user.is_visible():
        user.click()
        pause(page, 0.6)
        submit = page.locator("#landingDepartmentForm button[type='submit']")
        if submit.count() and submit.is_visible():
            submit.click()
            pause(page, 1.2)
        else:
            # Some builds enter user mode with a single click.
            pause(page, 0.8)
    overview = page.locator("#viewMode")
    if overview.count():
        try:
            overview.select_option("overview")
            pause(page, 1.0)
        except Exception:
            pass
    grid = page.locator("#gridWrap, .rack-grid-wrap, canvas, #mapCanvas").first
    try:
        box = grid.bounding_box(timeout=5000)
    except Exception:
        box = None
    if box:
        page.mouse.click(box["x"] + box["width"] * 0.35, box["y"] + box["height"] * 0.4)
        pause(page, 1.0)
        page.mouse.click(box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.45)
        pause(page, 1.0)
    search = page.locator("#searchInput")
    if search.count():
        search.fill("DEMO")
        pause(page, 0.5)
        btn = page.locator("#searchBtn")
        if btn.count():
            btn.click()
            pause(page, 1.0)
        search.fill("")
        clear = page.locator("#clearSearchBtn")
        if clear.count():
            clear.click()
            pause(page, 0.5)
    page.mouse.wheel(0, 400)
    pause(page, 0.8)
    page.mouse.wheel(0, -400)
    pause(page, 0.8)


def main() -> None:
    started = time.time()
    clips = [
        record_one("cut_health", record_cut_health, "demo_cut_health.png"),
        record_one("pallet_locator", record_pallet_locator, "demo_pallet_locator.png"),
        record_one("wood_usage", record_wood_usage, "demo_wood_usage.png"),
        record_one("warehouse_mapper", record_warehouse_mapper, "demo_warehouse_mapper.png"),
    ]
    montage = MEDIA / "portfolio_demo_montage.mp4"
    build_montage(clips, montage)
    elapsed = time.time() - started
    for clip in clips:
        print(f"wrote {clip} ({clip.stat().st_size} bytes)")
    print(f"wrote {montage} ({montage.stat().st_size} bytes) in {elapsed:.1f}s")


if __name__ == "__main__":
    main()