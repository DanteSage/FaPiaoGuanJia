export type LegalDocumentId = "privacy" | "agreement" | "third-party";

export type LegalDocumentSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  updatedAt: string;
  summary: string;
  sections: LegalDocumentSection[];
};

export const API_EXTERNAL_SERVICE_CONSENT_LABEL =
  "我已知悉：API 查验会将当前发票字段发送至外部验真服务；在文件查验场景下，PDF/OFD 文件内容也可能被发送至外部服务；切换到 RPA 后，本次启用的查验方式会改为 RPA。";

export const API_EXTERNAL_SERVICE_NOTICE =
  "API 查验依赖外部验真服务。手动查验会发送发票代码、发票号码、开票日期、校验码或金额等必要字段；文件查验会在需要时发送 PDF/OFD 文件内容。当前时刻只能启用一种查验方式，切换到 API 后，后续查验将只使用 API。";

export const RPA_EXTERNAL_SERVICE_CONSENT_LABEL =
  "我已知悉：RPA 验真会将验证码图片发送至第三方识别服务，仅在启用 RPA 验真时发生；我可以随时关闭 RPA 配置或切换回 API 查验。";

export const RPA_EXTERNAL_SERVICE_NOTICE =
  "RPA 验真依赖自动化浏览器访问税务查验页面，并会将验证码图片发送至第三方识别服务以完成自动输入。你可以在设置页关闭 RPA 配置，或改用 API 查验。";

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: "privacy",
    title: "隐私与数据处理说明",
    updatedAt: "2026-05-10",
    summary: "说明本地保存的数据、外部传输触发条件与用户控制项。",
    sections: [
      {
        title: "1. 本地保存的数据",
        bullets: [
          "导入或归档的发票文件、发票明细、报销单、标签、文件夹、查验记录等业务数据会保存在本机目录中。",
          "应用运行日志、RPA 查验截图、OFD 预览缓存、导出文件等也会保存在本机。",
          "API 验真或 RPA 验证码识别所需凭据会保存在本机配置目录中；Windows 平台使用 DPAPI 加密，macOS 平台使用系统钥匙串加密。",
        ],
      },
      {
        title: "2. 何时会向外部发送数据",
        bullets: [
          "使用 API 验真时，会向你选择的验真服务发送发票字段，或在文件验真模式下发送 PDF/OFD 文件内容。",
          "使用 RPA 验真时，程序会自动访问税务查验页面，并将验证码图片发送给第三方验证码识别服务完成识别。",
          "如果你不启用 API 验真或 RPA 验真，上述外部数据传输不会发生。",
        ],
      },
      {
        title: "3. 数据最小化与范围限制",
        bullets: [
          "本工具不内置用户行为分析、遥测或与发票处理无关的数据上报能力。",
          "除发票识别、验真、归档、报销、导出所必需的数据外，本工具不会主动收集与业务无关的个人信息。",
          "启用外部验真服务时，仅传输完成当次查验所必需的数据字段、文件内容或验证码图片。",
        ],
      },
      {
        title: "4. RPA 验真特别说明",
        bullets: [
          "RPA 验真依赖自动化浏览器和第三方验证码识别服务。验证码图片、颜色提示等数据仅用于完成当次查验。",
          "RPA 查验结果页面截图可能会保存到本地查验记录中，便于复核；你可以在设置页或查验页清理相关记录。",
          "如果你不再使用该服务，可以在设置页退出 RPA 配置，或切换到 API 查验模式。",
        ],
      },
      {
        title: "5. 用户控制项",
        bullets: [
          "你可以在“设置 > 验真配置”中退出 API 配置或 RPA 配置。",
          "你可以在“设置 > 验真配置”中切换 API 查验与 RPA 查验模式。",
          "你可以在“设置 > 存储与数据”中查看本地数据目录，并清理本地缓存。",
          "你可以在“发票验真”页或“设置”页中清理查验记录。",
        ],
      },
    ],
  },
  agreement: {
    id: "agreement",
    title: "用户使用协议",
    updatedAt: "2026-05-10",
    summary: "说明本地工具的使用边界、用户责任、外部服务依赖与版本更新约束。",
    sections: [
      {
        title: "1. 使用范围",
        bullets: [
          "本工具用于发票识别、归档、报销、统计、导出与验真等办公处理场景。",
          "你应仅处理自己有权访问、保存或提交的票据与相关业务数据。",
          "本工具不承诺替代法定票据保管义务，重要数据请自行做好备份。",
        ],
      },
      {
        title: "2. 用户责任",
        bullets: [
          "你应自行校对 OCR、验真、报销汇总与导出结果，避免将未复核数据直接用于正式报销或审计材料。",
          "你不得利用本工具处理违法、侵权、伪造或与业务无关的票据数据。",
          "你应妥善保管 API 验真与 RPA 验证码识别等外部服务凭据。",
        ],
      },
      {
        title: "3. 外部服务与限制",
        bullets: [
          "启用 API 验真或 RPA 验真时，程序会按所选模式向外部服务发送必要数据。",
          "RPA 验真依赖自动化浏览器与第三方验证码识别服务，可能受网络、平台策略或服务额度限制影响。",
          "如外部服务不可用、限流或返回异常，本工具不保证查验一定成功。",
        ],
      },
      {
        title: "4. 版本与更新",
        bullets: [
          "当隐私说明、协议条款或关键外部服务依赖发生实质变化时，应用可能要求重新确认后方可继续使用。",
          "继续使用新版本应用即表示你已阅读并接受最新条款。",
        ],
      },
      {
        title: "5. 数据与合规边界",
        bullets: [
          "本工具默认仅处理发票识别、验真、归档、报销、导出所必需的数据，不用于采集与业务无关的个人信息。",
          "如你启用外部验真服务，即表示你确认对相关数据的处理、传输与使用具有合法依据。",
          "如你所在组织存在额外制度要求，你应先满足内部合规要求后再使用本工具。",
        ],
      },
    ],
  },
  "third-party": {
    id: "third-party",
    title: "第三方组件与运行时说明",
    updatedAt: "2026-05-10",
    summary: "说明基础包与可选 RPA 组件的运行时边界、默认轻量包策略，以及系统浏览器的使用方式。",
    sections: [
      {
        title: "1. 基础发行物包含的关键组件",
        bullets: [
          "Electron / Node.js 运行时：用于桌面端界面与主进程能力。",
          "Python 后端服务：用于 OCR、验真、文件存储、报销与数据处理。",
          "JRE 与 Java JAR：用于 OFD 解析、PDF 打印等能力。",
          "PyMuPDF、NumPy 等二进制依赖：用于文档渲染、图像处理与底层能力支持。",
        ],
      },
      {
        title: "2. 可选 RPA 组件",
        bullets: [
          "RPA 可选组件按需分发，不随基础包默认提供。",
          "安装后会提供 Playwright 引擎，用于 RPA 验真自动化浏览器流程。",
          "该组件本身不额外内置浏览器运行时，仍依赖系统 Microsoft Edge、系统 Chrome 或设置中指定的 Chrome 可执行文件。",
        ],
      },
      {
        title: "3. 浏览器使用方式",
        bullets: [
          "可直接使用系统 Chrome。",
          "可在运行环境中显式提供 Chrome 可执行文件。",
          "可在应用设置中切换默认执行浏览器，并执行浏览器环境检测。",
        ],
      },
      {
        title: "4. 许可证与原始说明文件",
        bullets: [
          "JRE 自带的许可证与第三方说明文件位于 `jre-min/<platform>/legal`。",
          "前端 Node 依赖的许可证信息可从 `frontend/package-lock.json` 和各依赖包 LICENSE 文件追溯。",
          "基础包中的 Python 运行时许可证与说明文件应随发行物一并保留，并在正式发布材料中汇总。",
          "若单独分发 RPA 可选组件，应同时保留 Playwright 及其依赖的许可证与说明文件。",
        ],
      },
    ],
  },
};

export const LEGAL_DOCUMENT_LIST = Object.values(LEGAL_DOCUMENTS);
