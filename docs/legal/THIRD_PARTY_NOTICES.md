# 发票管家第三方组件与运行时说明

更新日期：2026-05-10

## 1. 基础发行物包含的关键组件

- Electron / Node.js 运行时：用于桌面端界面与主进程能力。
- Python 后端服务：用于 OCR、验真、文件存储、报销与数据处理。
- JRE 与 Java JAR：用于 OFD 解析、PDF 打印等能力。
- PyMuPDF、NumPy 等二进制依赖：用于文档渲染、图像处理与底层能力支持。

## 2. 可选 RPA 组件

- `RPA` 可选组件按需分发，不随基础包默认提供。
- 安装后会提供 `Playwright` 引擎，用于 RPA 验真自动化浏览器流程。
- 该组件本身不额外内置浏览器运行时，仍依赖系统 `Microsoft Edge`、系统 `Chrome` 或设置中指定的 `Chrome` 可执行文件。

## 3. 许可证与原始说明文件

- JRE 自带的许可证与第三方说明文件位于 `jre-min/<platform>/legal`。
- 前端 Node 依赖的许可证信息可从 `frontend/package-lock.json` 和各依赖包 LICENSE 文件追溯。
- 基础包中的 Python 运行时许可证与说明文件应随发行物一并保留，并在正式发布材料中汇总。
- 若单独分发 `RPA` 可选组件，应同时保留 `Playwright` 及其依赖的许可证与说明文件。
