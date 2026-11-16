#!/usr/bin/env python3
"""Package final deliverables into outputs/ while safely archiving prior outputs into archive/."""

from __future__ import annotations

import datetime as dt
import shutil
import sys
import tarfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = REPO_ROOT.parent.parent
OUTPUTS_DIR = WORKSPACE_ROOT / "outputs"
ARCHIVE_DIR = WORKSPACE_ROOT / "archive"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from server.ics_builder import build_ics_feed
from server.scriptable_template import build_scriptable_js
from server.vision_parser import DEMO_SAMPLE_RESULT


DEFAULT_PERIODS = [
    {"id": "morning_read", "num": "早", "label": "早读", "section": "morning_read", "start": "07:30", "end": "07:55"},
    {"id": "p1", "num": "1", "label": "第一节", "section": "am", "start": "08:05", "end": "08:50"},
    {"id": "p2", "num": "2", "label": "第二节", "section": "am", "start": "09:00", "end": "09:45"},
    {"id": "p3", "num": "3", "label": "第三节", "section": "am", "start": "10:05", "end": "10:50"},
    {"id": "p4", "num": "4", "label": "第四节", "section": "am", "start": "11:00", "end": "11:45"},
    {"id": "p5", "num": "5", "label": "第五节", "section": "pm", "start": "14:15", "end": "15:00"},
    {"id": "p6", "num": "6", "label": "第六节", "section": "pm", "start": "15:10", "end": "15:55"},
    {"id": "p7", "num": "7", "label": "第七节", "section": "pm", "start": "16:10", "end": "16:55"},
    {"id": "p8", "num": "8", "label": "第八节", "section": "pm", "start": "17:05", "end": "17:50"},
    {"id": "p9", "num": "晚1", "label": "晚自习一", "section": "evening", "start": "19:00", "end": "19:50"},
    {"id": "p10", "num": "晚2", "label": "晚自习二", "section": "evening", "start": "20:00", "end": "20:50"},
]

GUIDE_MD = """# 知时课表 · 部署与 iPhone 提醒/小组件使用指南

## 1. 一键启动服务（零第三方依赖）

只需机器装有 Python 3.10+：

```bash
tar -xzf teacher-timetable-v1.0.0.tar.gz
cd teacher-timetable
./start.sh
```

默认监听 `http://0.0.0.0:8780`。若在公网服务器或家庭 NAS 部署，建议用 Caddy / Nginx 反代一层 HTTPS（iOS Safari 安装主屏幕 PWA 与离线缓存需要 HTTPS 或局域网信任环境）。

## 2. 配置服务端拍照 AI 识别（可选）

复制 `.env.example` 为 `.env`，填入通义千问 VL（阿里云百炼 DashScope）或任意兼容 OpenAI 多模态接口的 Key：

```ini
VISION_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_MODEL=qwen-vl-max-latest
VISION_API_KEY=sk-xxxxxxxxxxxxxxxx
```

> 即使不配置 API Key，老师依然可以在网页内点击「一键复制 AI 识图提示词」配合豆包/Kimi 免费转换，或直接从 Excel 复制表格粘贴并在可视化网格中校对导入！

## 3. iPhone 添加到主屏幕 (PWA)

1. 用 iPhone **Safari** 打开部署好的网址。
2. 点击底部工具栏中间的 **分享按钮** → 选择 **「添加到主屏幕」**。
3. 桌面将出现独立的「知时课表」图标，点开全屏无地址栏，断网也可离线查看课表。

## 4. iPhone 准时上课提醒（免开发 App · 推荐）

1. 打开网页右上角 **「📱 iPhone 提醒与组件」**。
2. 点击 **「一键生成同步码」**（6 位数字，电脑与手机通用）。
3. 选择提前时间（如课前 15 分钟），点击 **「📅 一键订阅到 iPhone 苹果日历 (webcal://)」**。
4. iPhone 系统自带日历将自动创建「XX老师的课程表」并开启课前闹钟弹窗，您在网页上操作**单次调课/停课或写随堂备忘**也会自动同步到手机！

## 5. iPhone 桌面小组件（今日课程 ⇄ 放学/没课自动看明天）

1. 在 App Store 免费下载 **Scriptable**。
2. 在网页「📱 iPhone 提醒与组件」弹窗中点击 **「📋 一键复制我的专属小组件代码」**。
3. 打开 Scriptable → 右上角 `+` 新建脚本 → 粘贴代码 → 点右上角 Done。
4. 长按 iPhone 桌面空白处 → 左上角 `+` 搜索 **Scriptable** → 添加 **中号 (Medium)** 小组件 → 长按小组件选「编辑小组件」，Script 选刚建的脚本即可！
"""


def archive_existing_outputs() -> None:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    existing = [p for p in OUTPUTS_DIR.iterdir() if p.name != ".gitkeep"]
    if not existing:
        return
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = ARCHIVE_DIR / f"outputs_snapshot_{stamp}"
    dest.mkdir(parents=True, exist_ok=True)
    for item in existing:
        shutil.move(str(item), str(dest / item.name))
    print(f"Archived {len(existing)} previous output item(s) -> {dest}")


def build_outputs() -> None:
    archive_existing_outputs()

    sample_sched = {
        "teacherName": "林知夏",
        "defaultSubject": "数学",
        "semesterStart": "2026-09-07",
        "reminderMinutes": 15,
        "periods": DEFAULT_PERIODS,
        "classColors": {"高一(3)班": 0, "高一(5)班": 1, "高一(8)班": 2, "数学教研组": 3},
        "lessons": DEMO_SAMPLE_RESULT["lessons"],
        "overrides": {},
    }

    # 1. Standalone iOS Scriptable widget script
    widget_js = build_scriptable_js("https://your-domain.example.com", "888888", sample_sched)
    (OUTPUTS_DIR / "ios-scriptable-widget.js").write_text(widget_js, encoding="utf-8")

    # 2. Sample .ics calendar file
    ics_text = build_ics_feed(sample_sched, sync_code="DEMO88")
    (OUTPUTS_DIR / "sample-teacher-schedule.ics").write_text(ics_text, encoding="utf-8")

    # 3. Deployment & iOS Usage Guide
    (OUTPUTS_DIR / "USAGE_AND_IOS_GUIDE.md").write_text(GUIDE_MD, encoding="utf-8")

    # 4. Deployable tarball bundle
    tar_path = OUTPUTS_DIR / "teacher-timetable-v1.0.0.tar.gz"
    include_items = ["server", "web", "scripts", "tests", "start.sh", ".env.example", "Dockerfile", "README.md"]
    with tarfile.open(tar_path, "w:gz") as tar:
        for rel in include_items:
            p = REPO_ROOT / rel
            if p.exists():
                tar.add(p, arcname=f"teacher-timetable/{rel}", filter=lambda ti: None if "__pycache__" in ti.name else ti)

    print(f"Packaged deliverables into {OUTPUTS_DIR}")


if __name__ == "__main__":
    build_outputs()
