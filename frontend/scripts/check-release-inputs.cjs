const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(frontendRoot, "..");
const legalDocsRoot = path.join(workspaceRoot, "docs", "legal");
const buildPlatform = process.env.BUILD_PLATFORM || process.platform;
const skipRpaBundle = process.env.FAPIAO_SKIP_RPA_BUNDLE === "1";
const legalDocs = [
  "NOTICE.md",
  "PRIVACY.md",
  "USER_AGREEMENT.md",
  "THIRD_PARTY_NOTICES.md",
];

function findMatchingFile(directoryPath, pattern) {
  if (!fs.existsSync(directoryPath)) {
    return "";
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort()
    .at(-1) || "";
}

function expectedServiceExecutable() {
  return buildPlatform === "win32" ? "service.exe" : "service";
}

function expectedJavaExecutable() {
  return buildPlatform === "win32" ? "java.exe" : "java";
}

function bundledJreRoot(rootPath) {
  return path.join(rootPath, "jre-min", buildPlatform);
}

const requiredInputs = [
  ...legalDocs.map((fileName) => ({
    label: `Legal document ${fileName}`,
    file: path.join(legalDocsRoot, fileName),
    fix: `Restore \`docs/legal/${fileName}\`.`,
  })),
  {
    label: "Python service executable",
    file: path.join(
      workspaceRoot,
      "python-backend",
      "dist",
      "service",
      expectedServiceExecutable(),
    ),
    fix: "Run `npm run build` or `python -m PyInstaller python-backend\\build.spec --noconfirm`.",
  },
  {
    label: "OFD converter JAR",
    file: findMatchingFile(path.join(workspaceRoot, "java", "target"), /^ofdrw-cli-.*\.jar$/),
    fix: "Run `mvn -f java/pom.xml verify`.",
  },
  {
    label: "PDF printer JAR",
    file: findMatchingFile(path.join(workspaceRoot, "java", "target"), /^pdf-printer-.*\.jar$/),
    fix: "Run `mvn -f java/pom.xml verify`.",
  },
  {
    label: "Bundled JRE",
    file: path.join(bundledJreRoot(workspaceRoot), "bin", expectedJavaExecutable()),
    fix: `Restore the bundled runtime under \`jre-min/${buildPlatform}\`.`,
  },
  {
    label: "Installer icon",
    file: path.join(frontendRoot, "resources", "icon.ico"),
    fix: "Restore `frontend/resources/icon.ico`.",
  },
  ...(skipRpaBundle
    ? []
    : [
        {
          label: "Embedded RPA runtime (playwright)",
          file: path.join(
            workspaceRoot,
            "python-backend",
            "dist",
            "service",
            "rpa-runtime",
            "python",
            "playwright",
          ),
          fix: "Run `npm run build` (which embeds the RPA runtime) or set `FAPIAO_SKIP_RPA_BUNDLE=1` to opt out.",
        },
      ]),
];

const missingInputs = requiredInputs.filter(({ file }) => !file || !fs.existsSync(file));

if (missingInputs.length > 0) {
  console.error("Missing release inputs:");
  for (const item of missingInputs) {
    console.error(`- ${item.label}: ${item.file}`);
    console.error(`  ${item.fix}`);
  }
  process.exit(1);
}

console.log("Release inputs look ready.");
