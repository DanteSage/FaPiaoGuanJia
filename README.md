# FaPiaoGuanJia - 发票管家

一款面向 Windows 桌面的本地发票管理工具，包含 `Electron + React` 前端、`Python` 后端服务和 `Java` OFD/PDF 工具模块。项目覆盖发票 OCR 识别、归档、验真、报销管理、统计分析、预览打印与导出等常用流程。

[![CI](https://github.com/DanteSage/FaPiaoGuanJia/actions/workflows/ci.yml/badge.svg)](https://github.com/DanteSage/FaPiaoGuanJia/actions/workflows/ci.yml)

## 功能概览

- 支持图片、PDF、OFD 和电子发票 XML 的本地识别与预览
- 提供发票归档、标签、目录、检索和统计分析
- 管理报销单与发票关联关系，支持批量导入、导出和打印
- 提供发票验真流程，可按需启用 RPA 浏览器引擎
- 业务数据默认保存在本机，敏感配置使用系统安全能力保护

> 当前版本仍在持续完善中。验真、OCR 和打印能力可能依赖系统浏览器、Java 或平台组件，使用前请先阅读下方环境与构建说明。

## 目录

- `docs/`
- `config/`
- `frontend/`
- `python-backend/`
- `java/`
- `jre-min/`
- `scripts/`

## 开发环境

- Node.js 20+
- Python 3.13
- Java 17
- Maven 3.9+

## 环境配置

- 开发环境：`config/env/dev.env`
- 生产环境：`config/env/prod.env`
- 环境加载入口：`config/index.js`

默认配置下：

- RPA 验真默认优先使用系统 `Microsoft Edge`
- 可直接使用系统 `Chrome`，或在设置中显式指定 `Chrome` 可执行文件

## 启动与检查

- 前端开发：`npm --prefix frontend run dev`
- 前端检查：`npm --prefix frontend run lint`
- 前端单测：`npm --prefix frontend run test:unit`
- 前端 E2E：`npm --prefix frontend run test:e2e`
- 前端覆盖率：`npm --prefix frontend run coverage`
- Python 检查：`python -m black --check python-backend && python -m flake8 python-backend && python -m pytest --cov=python-backend/src --cov-report=term-missing --cov-fail-under=60 python-backend/tests/unit python-backend/tests/integration`
- Java 检查：`mvn -f java/pom.xml verify`
- RPA 组件依赖：`python-backend/requirements/rpa.txt`

## 构建与发布

- 默认完整构建（含 RPA，安装即用）：
  - Windows：`powershell -ExecutionPolicy Bypass -File scripts/build.ps1`
  - macOS / Linux：`bash scripts/build.sh`
  - Node 入口：`npm run build`
- 瘦身构建（不含 RPA）：`$env:FAPIAO_SKIP_RPA_BUNDLE="1"; npm run build`
- RPA 热更新组件（用于线上单独升级 RPA，不改主包）：`npm run build:rpa-component`
- 发布校验：`node scripts/verify-release.js`

构建流程依次执行：

1. Java 模块 `mvn verify`
2. Python 后端 `PyInstaller`
3. 将 RPA 引擎（`playwright` 等）按 `python-backend/requirements/rpa.txt` 安装到 `python-backend/dist/service/rpa-runtime/python/`
4. 前端 `electron-builder`（`extraResources` 会把整个 `python-backend/dist/service/**` 一起打入 `resources/python-backend/service/`）
5. 复制跨平台依赖
6. 发布产物归档与完整性校验

## RPA 引擎分发策略

- **默认（推荐）**：主包自带 `Playwright` 引擎，用户安装主包后开箱可用；Python 后端通过 `_rpa_component.py` 自动从 `resources/python-backend/service/rpa-runtime/` 激活
- **瘦身版主包**：设置 `FAPIAO_SKIP_RPA_BUNDLE=1` 构建时不注入 RPA，此时主包不含 `Playwright`
- **独立热更新包**（`npm run build:rpa-component`）：生成 `invoice-tool-rpa-component-<version>-<platform>.zip`，解压后把 `rpa-runtime/` 放到 `resources/python-backend/service/` 即可升级 RPA，无需重装主包
- 无论哪种方式，都只分发 Python 引擎，不携带浏览器；用户机器仍需系统 `Microsoft Edge` 或 `Chrome`
- 体积参考：完整包含 RPA 时主包约增加 **30 MB**

## RPA 验真浏览器策略

- 默认优先使用系统 `Microsoft Edge`
- 可直接使用系统 `Chrome`，或在设置中显式指定 `Chrome` 可执行文件

## 合规文档

- `docs/legal/PRIVACY.md`
- `docs/legal/USER_AGREEMENT.md`
- `docs/legal/THIRD_PARTY_NOTICES.md`
- `docs/legal/NOTICE.md`

应用首次启动会要求用户确认隐私政策与用户协议，安装包会一并携带上述文档。
