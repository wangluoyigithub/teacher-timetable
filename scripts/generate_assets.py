#!/usr/bin/env python3
"""Generate PWA icons (SVG + PNGs) and realistic sample paper teacher timetable photo."""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "web" / "icons"
INPUTS_DIR = ROOT.parent.parent / "inputs"

FONT_SANS = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_SERIF_BOLD = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"


def make_svg_icon() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#235E47"/>
  <rect x="64" y="80" width="384" height="360" rx="40" fill="#FAF7F0"/>
  <rect x="64" y="80" width="384" height="88" rx="40" fill="#DDF0E7"/>
  <rect x="64" y="132" width="384" height="36" fill="#DDF0E7"/>
  <circle cx="148" cy="80" r="18" fill="#1A4735"/>
  <circle cx="364" cy="80" r="18" fill="#1A4735"/>
  <rect x="140" y="48" width="16" height="48" rx="8" fill="#FAF7F0"/>
  <rect x="356" y="48" width="16" height="48" rx="8" fill="#FAF7F0"/>
  <!-- Timetable blocks -->
  <rect x="104" y="200" width="136" height="60" rx="14" fill="#2E7D5B"/>
  <rect x="268" y="200" width="140" height="60" rx="14" fill="#E8925B"/>
  <rect x="104" y="282" width="136" height="60" rx="14" fill="#5282B8"/>
  <rect x="268" y="282" width="140" height="60" rx="14" fill="#DCE4DF"/>
  <rect x="104" y="364" width="304" height="40" rx="12" fill="#EFECE4"/>
</svg>
"""


def make_png_icon(size: int, out_path: Path) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 512.0

    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(112 * s), fill="#235E47")
    draw.rounded_rectangle(
        [int(64 * s), int(84 * s), int(448 * s), int(440 * s)],
        radius=int(38 * s),
        fill="#FAF7F0",
    )
    draw.rounded_rectangle(
        [int(64 * s), int(84 * s), int(448 * s), int(170 * s)],
        radius=int(38 * s),
        fill="#DDF0E7",
    )
    draw.rectangle(
        [int(64 * s), int(134 * s), int(448 * s), int(170 * s)],
        fill="#DDF0E7",
    )
    for cx in (148, 364):
        draw.rounded_rectangle(
            [int((cx - 9) * s), int(50 * s), int((cx + 9) * s), int(102 * s)],
            radius=int(8 * s),
            fill="#173D2E",
        )

    blocks = [
        (104, 198, 242, 258, "#2E7D5B"),
        (268, 198, 408, 258, "#D9793B"),
        (104, 280, 242, 340, "#3D73A8"),
        (268, 280, 408, 340, "#DCE5E0"),
        (104, 362, 408, 404, "#EAE5D9"),
    ]
    for x1, y1, x2, y2, col in blocks:
        draw.rounded_rectangle(
            [int(x1 * s), int(y1 * s), int(x2 * s), int(y2 * s)],
            radius=int(13 * s),
            fill=col,
        )
    img.save(out_path, "PNG")


def make_sample_timetable_photo(out_path: Path) -> None:
    w, h = 1280, 940
    img = Image.new("RGB", (w, h), "#F6F2E9")
    draw = ImageDraw.Draw(img)

    # Paper sheet card with soft shadow
    draw.rounded_rectangle([46, 44, w - 34, h - 30], radius=12, fill="#E2DDD2")
    draw.rounded_rectangle([38, 36, w - 42, h - 38], radius=12, fill="#FFFDF8", outline="#D8D2C5", width=2)

    f_title = ImageFont.truetype(FONT_SERIF_BOLD, 30)
    f_sub = ImageFont.truetype(FONT_SANS, 18)
    f_head = ImageFont.truetype(FONT_SANS, 19)
    f_cell_b = ImageFont.truetype(FONT_SERIF_BOLD, 18)
    f_cell = ImageFont.truetype(FONT_SANS, 14)
    f_stamp = ImageFont.truetype(FONT_SERIF_BOLD, 16)

    draw.text((w // 2, 78), "2026-2027学年第一学期 · 教师个人任课表", fill="#1D2622", font=f_title, anchor="mm")
    draw.text(
        (w // 2, 118),
        "任课教师：林知夏      任教学科：高中数学      所属教研组：高一数学组",
        fill="#4A544F",
        font=f_sub,
        anchor="mm",
    )

    # Table grid coordinates
    left = 72
    top = 152
    col_widths = [146, 198, 198, 198, 198, 198]  # 节次 + 周一..周五
    rows = [
        ("节次 / 星期", "header"),
        ("早读 07:30-07:55", "morning_read"),
        ("第一节 08:05-08:50", "p1"),
        ("第二节 09:00-09:45", "p2"),
        ("第三节 10:05-10:50", "p3"),
        ("第四节 11:00-11:45", "p4"),
        ("午休时间", "break"),
        ("第五节 14:15-15:00", "p5"),
        ("第六节 15:10-15:55", "p6"),
        ("第七节 16:10-16:55", "p7"),
        ("第八节 17:05-17:50", "p8"),
        ("晚自习一 19:00-19:50", "p9"),
    ]
    row_heights = [46 if r[1] == "header" else (32 if r[1] == "break" else 58) for r in rows]

    cells = {
        (1, "morning_read"): ("高一(3)班", "早读巡班 · 致远楼303"),
        (1, "p1"): ("高一(3)班", "数学 · 致远楼303"),
        (1, "p3"): ("高一(5)班", "数学 · 致远楼305"),
        (1, "p6"): ("高一(8)班", "数学 · 博雅楼202"),
        (2, "p2"): ("高一(5)班", "数学 · 致远楼305"),
        (2, "p4"): ("高一(3)班", "数学 · 致远楼303"),
        (2, "p7"): ("数学教研组", "集体备课 · 行政楼401"),
        (2, "p9"): ("高一(3)班", "晚自习答疑 · 致远楼303"),
        (3, "morning_read"): ("高一(5)班", "早读巡班 · 致远楼305"),
        (3, "p1"): ("高一(8)班", "数学 · 博雅楼202"),
        (3, "p2"): ("高一(3)班", "数学 · 致远楼303"),
        (3, "p5"): ("高一(5)班", "数学 · 致远楼305"),
        (4, "p2"): ("高一(8)班", "数学 · 博雅楼202"),
        (4, "p3"): ("高一(3)班", "数学 · 致远楼303"),
        (4, "p6"): ("高一(5)班", "数学 · 致远楼305"),
        (4, "p9"): ("高一(5)班", "晚自习答疑 · 致远楼305"),
        (5, "p1"): ("高一(5)班", "数学 · 致远楼305"),
        (5, "p3"): ("高一(8)班", "数学 · 博雅楼202"),
        (5, "p5"): ("高一(3)班", "班会/周结 · 致远楼303"),
    }

    day_headers = ["节次 / 时间", "星期一", "星期二", "星期三", "星期四", "星期五"]
    total_w = sum(col_widths)

    y = top
    for r_idx, (r_label, r_key) in enumerate(rows):
        rh = row_heights[r_idx]
        if r_key == "header":
            draw.rectangle([left, y, left + total_w, y + rh], fill="#E9EFEA", outline="#5B6660", width=1)
            x = left
            for c_idx, cw in enumerate(col_widths):
                draw.rectangle([x, y, x + cw, y + rh], outline="#5B6660", width=1)
                draw.text((x + cw // 2, y + rh // 2), day_headers[c_idx], fill="#1D2622", font=f_head, anchor="mm")
                x += cw
        elif r_key == "break":
            draw.rectangle([left, y, left + total_w, y + rh], fill="#F5F1E8", outline="#5B6660", width=1)
            draw.text((left + total_w // 2, y + rh // 2), "午  间  休  息  (11:45 - 14:15)", fill="#6D7570", font=f_cell, anchor="mm")
        else:
            x = left
            for c_idx, cw in enumerate(col_widths):
                bg = "#FAF8F3" if c_idx == 0 else "#FFFDF8"
                draw.rectangle([x, y, x + cw, y + rh], fill=bg, outline="#6B756F", width=1)
                if c_idx == 0:
                    parts = r_label.split(" ")
                    draw.text((x + cw // 2, y + 20), parts[0], fill="#24302B", font=f_cell_b, anchor="mm")
                    if len(parts) > 1:
                        draw.text((x + cw // 2, y + 41), parts[1], fill="#68736D", font=f_cell, anchor="mm")
                else:
                    val = cells.get((c_idx, r_key))
                    if val:
                        draw.text((x + cw // 2, y + 21), val[0], fill="#17211D", font=f_cell_b, anchor="mm")
                        draw.text((x + cw // 2, y + 42), val[1], fill="#4D5953", font=f_cell, anchor="mm")
                x += cw
        y += rh

    # Subtle red school academic office stamp
    sx, sy = w - 210, h - 108
    draw.ellipse([sx - 56, sy - 34, sx + 56, sy + 34], outline="#C94A44", width=2)
    draw.text((sx, sy - 8), "教务处排课专用", fill="#C94A44", font=f_stamp, anchor="mm")
    draw.text((sx, sy + 13), "2026.09 核准", fill="#C94A44", font=f_cell, anchor="mm")

    draw.text((86, h - 62), "注：示例纸质教师课表照片（可直接用于测试「拍照识别 + 可视化网格校对」功能）", fill="#7A827D", font=f_cell)
    img.save(out_path, "PNG")


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    INPUTS_DIR.mkdir(parents=True, exist_ok=True)

    (ICONS_DIR / "icon.svg").write_text(make_svg_icon(), encoding="utf-8")
    make_png_icon(180, ICONS_DIR / "apple-touch-icon.png")
    make_png_icon(192, ICONS_DIR / "icon-192.png")
    make_png_icon(512, ICONS_DIR / "icon-512.png")

    sample_in = INPUTS_DIR / "sample_teacher_timetable.png"
    sample_web = ROOT / "web" / "sample-timetable.png"
    make_sample_timetable_photo(sample_in)
    sample_web.write_bytes(sample_in.read_bytes())
    print("Generated icons and sample timetable photo successfully.")


if __name__ == "__main__":
    main()
