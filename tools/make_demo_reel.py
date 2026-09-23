"""Build portfolio demo still reel as GIF + MP4 (requires ffmpeg on PATH)."""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "rsc" / "img"
MEDIA = ROOT / "rsc" / "media"

FRAMES = [
    IMG / "demo_cut_health.png",
    IMG / "demo_pallet_locator.png",
    IMG / "demo_pallet_place_modal.png",
    IMG / "demo_wood_usage.png",
]

TARGET_W, TARGET_H = 1280, 720
HOLD_SECONDS = 2.2


def letterbox(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    scale = min(TARGET_W / im.width, TARGET_H / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (TARGET_W, TARGET_H), (7, 11, 22))
    canvas.paste(resized, ((TARGET_W - nw) // 2, (TARGET_H - nh) // 2))
    return canvas


def write_gif(frames: list[Image.Image], out: Path) -> None:
    pals = [f.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for f in frames]
    pals[0].save(
        out,
        save_all=True,
        append_images=pals[1:],
        duration=int(HOLD_SECONDS * 1000),
        loop=0,
        optimize=True,
    )


def write_mp4(frames: list[Image.Image], out: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg not found on PATH")
    with tempfile.TemporaryDirectory(prefix="acor_demo_reel_") as tmp:
        tmp_path = Path(tmp)
        for i, frame in enumerate(frames):
            frame.save(tmp_path / f"frame_{i:03d}.png")
        # Duplicate last frame briefly so the end doesn't cut off abruptly.
        frames[-1].save(tmp_path / f"frame_{len(frames):03d}.png")
        cmd = [
            ffmpeg,
            "-y",
            "-framerate",
            f"1/{HOLD_SECONDS}",
            "-i",
            str(tmp_path / "frame_%03d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-vf",
            f"fps=30,scale={TARGET_W}:{TARGET_H}:flags=lanczos",
            str(out),
        ]
        subprocess.run(cmd, check=True)


def main() -> None:
    existing = [p for p in FRAMES if p.exists()]
    if len(existing) < 2:
        raise SystemExit(f"Need at least 2 frames, found {len(existing)}")
    frames = [letterbox(p) for p in existing]
    MEDIA.mkdir(parents=True, exist_ok=True)
    gif = MEDIA / "portfolio_demo_reel.gif"
    mp4 = MEDIA / "portfolio_demo_reel.mp4"
    write_gif(frames, gif)
    write_mp4(frames, mp4)
    print(f"wrote {gif} ({gif.stat().st_size} bytes)")
    print(f"wrote {mp4} ({mp4.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
