# 知时课表 · 教师极简智能课程表 (PWA)

专为中小学与职校教师打造的极简 Web / WAP (PWA) 课程表系统。零前端构建链、零后端第三方依赖（纯 Python 3 标准库 + SQLite），一条命令即可部署运行。

## 核心亮点

- **一眼全局 vs 此刻聚焦**：
  - **电脑 Web 端**：左侧聚焦「当前/下一节进度」，右侧一屏铺开整周清爽网格课表，支持点击空白格秒排课、拖拽格子互换课程、打印输出。
  - **手机 WAP / PWA 端**：默认展示当日时间线，**今日课程全部上完（或当天无课）后自动无缝切换为「明日课程预告」**。
- **教师专属设计**：
  - **按「授课班级」自动着色**：带多个班教同一门课也能一眼区分去几班，点击班级标签可一键高亮筛选。
  - **单次「调课 / 代课 / 停课」微调**：仅修改本周某一天，绝不破坏整学期常规课表，支持一键恢复。
  - **随堂一句话备忘贴**：给任意课挂上如「收周末卷子」「讲评P42」，在网页卡片、苹果日历提醒与桌面小组件同步呈现。
- **拍照添加课程表 + 可视化网格校对**：
  - 支持接入任意 OpenAI 兼容多模态视觉大模型（如通义千问 `qwen-vl-max`、GLM-4V、GPT-4o）一键拍照识别纸质/截图课表；
  - 内置免 Key 兜底（一键复制专属识图提示词配合豆包/Kimi，或直接从 Excel/WPS 框选粘贴表格）；
  - 识别结果进入**分屏可视化网格校对台**，原图对照点选微调后再入库。
- **免开发 App 打通 iPhone 提醒与桌面小组件**：
  - **6 位数字同步码**：免注册登录，电脑排课手机输 6 位码秒同步，自动保留最近 20 份历史快照。
  - **`webcal://` 苹果系统日历动态订阅**：课前准时系统级闹钟弹窗（锁屏、静音震动、Apple Watch 全支持），调课与备忘自动同步。
  - **专属 Scriptable 桌面小组件**：网页内提供实时 iPhone 桌面效果模拟器与一键复制定制脚本，完美实现「今日有课看今天，下课/没课自动看明天」。

## 目录结构

```text
teacher-timetable/
├── server/
│   ├── app.py                  # HTTP 静态托管 + 6位同步码 SQLite + REST API
│   ├── ics_builder.py          # RFC 5545 动态 iCalendar (.ics) 日历流生成器
│   ├── scriptable_template.py  # iOS Scriptable 桌面小组件脚本与 JSON 生成器
│   └── vision_parser.py        # 多模态 AI 视觉识图 + Excel/文本/JSON 解析器
├── web/
│   ├── index.html              # PWA 应用外壳与弹窗视图
│   ├── manifest.webmanifest    # PWA 安装配置清单
│   ├── sw.js                   # 离线缓存与通知 Service Worker
│   ├── styles/index.css        # 原生 CSS 设计系统（支持深浅模式与打印样式）
│   ├── js/data.js              # 作息预设、班级配色与今日/明日状态引擎
│   ├── js/app.js               # 前端核心交互控制器
│   └── icons/                  # PWA 与 iOS Apple Touch 图标
├── scripts/
│   ├── generate_assets.py      # 生成图标与示例纸质教师课表照片
│   └── package_release.py      # 打包交付物至 ../../outputs/ 并归档旧快照至 ../../archive/
├── tests/
│   ├── test_server.py          # 后端 API、ICS、小组件与解析器集成测试
│   └── test_frontend_logic.mjs # 前端今日/明日自动切换与单次调课单元测试
├── Dockerfile
├── .env.example
└── start.sh
```

## 快速运行与测试

```bash
# 启动服务（默认 http://0.0.0.0:8780）
chmod +x start.sh
./start.sh

# 运行全套自动化测试
python3 -m unittest discover -s tests -v
node tests/test_frontend_logic.mjs
```
