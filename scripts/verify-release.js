const fs = require("node:fs");
const path = require("node:path");

const { loadEnv } = require("../config");
const packageJson = require("../package.json");

const rootDir = path.resolve(__dirname, "..");
const appEnv = process.env.APP_ENV || "dev";

loadEnv(appEnv);

const buildPlatform = process.env.BUILD_PLATFORM || process.platform;
const releaseDir = path.resolve(
  rootDir,
  process.env.FRONTEND_RELEASE_DIR || path.join("dist", buildPlatform),
);
const archivePath = path.join(rootDir, "dist", `invoice-tool-${packageJson.version}-${buildPlatform}.zip`);
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

function findMatchingDirectory(directoryPath, pattern) {
  if (!fs.existsSync(directoryPath)) {
    return "";
  }

  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort()
    .at(-1) || "";
}

function expectedJavaExecutable() {
  return buildPlatform === "win32" ? "java.exe" : "java";
}

function expectedServiceExecutable() {
  return buildPlatform === "win32" ? "service.exe" : "service";
}

function packagedJreRoot(resourcesDir) {
  return resourcesDir ? path.join(resourcesDir, "jre", buildPlatform) : "";
}

function findPackagedAppDirectory() {
  const patterns = buildPlatform === "win32"
    ? [/^win-unpacked$/]
    : buildPlatform === "darwin"
      ? [/^mac(?:-.*)?$/]
      : [/linux/i];

  for (const pattern of patterns) {
    const matched = findMatchingDirectory(releaseDir, pattern);
    if (matched) {
      return matched;
    }
  }

  return "";
}

function findInstallerArtifact() {
  const installerPattern = buildPlatform === "win32"
    ? /\.exe$/i
    : buildPlatform === "darwin"
      ? /\.(dmg|zip)$/i
      : /\.(AppImage|deb|rpm|tar\.gz)$/i;

  return findMatchingFile(releaseDir, installerPattern);
}

const javaTargetDir = path.join(rootDir, "java", "target");
const backendServiceDir = path.join(rootDir, "python-backend", "dist", "service");
const packagedAppDir = findPackagedAppDirectory();
const packagedResourcesDir = packagedAppDir ? path.join(packagedAppDir, "resources") : "";
const packagedJavaDir = packagedResourcesDir ? path.join(packagedResourcesDir, "java") : "";
const packagedServiceDir = packagedResourcesDir
  ? path.join(packagedResourcesDir, "python-backend", "service")
  : "";
const packagedLegalDir = packagedResourcesDir ? path.join(packagedResourcesDir, "legal") : "";
const packagedJreDir = packagedJreRoot(packagedResourcesDir);
const skipRpaBundle = process.env.FAPIAO_SKIP_RPA_BUNDLE === "1";
const rpaRuntimeChecks = skipRpaBundle
  ? []
  : [
      {
        label: "Embedded RPA runtime (playwright)",
        path: path.join(backendServiceDir, "rpa-runtime", "python", "playwright"),
      },
      {
        label: "Packaged RPA runtime (playwright)",
        path: packagedServiceDir
          ? path.join(packagedServiceDir, "rpa-runtime", "python", "playwright")
          : "",
      },
    ];

const requiredItems = [
  {
    label: "Release directory",
    path: releaseDir,
  },
  {
    label: "Installer artifact",
    path: findInstallerArtifact(),
  },
  {
    label: "Packaged app directory",
    path: packagedAppDir,
  },
  {
    label: "Release archive",
    path: archivePath,
  },
  {
    label: "Java OFD JAR",
    path: findMatchingFile(javaTargetDir, /^ofdrw-cli-.*\.jar$/),
  },
  {
    label: "Java PDF JAR",
    path: findMatchingFile(javaTargetDir, /^pdf-printer-.*\.jar$/),
  },
  {
    label: "Python service directory",
    path: backendServiceDir,
  },
  {
    label: "Packaged OFD JAR",
    path: findMatchingFile(packagedJavaDir, /^ofdrw-cli-.*\.jar$/),
  },
  {
    label: "Packaged PDF JAR",
    path: findMatchingFile(packagedJavaDir, /^pdf-printer-.*\.jar$/),
  },
  {
    label: "Packaged JRE",
    path: packagedJreDir ? path.join(packagedJreDir, "bin", expectedJavaExecutable()) : "",
  },
  {
    label: "Packaged Python service",
    path: packagedServiceDir ? path.join(packagedServiceDir, expectedServiceExecutable()) : "",
  },
  ...legalDocs.map((fileName) => ({
    label: `Packaged legal document ${fileName}`,
    path: packagedLegalDir ? path.join(packagedLegalDir, fileName) : "",
  })),
  ...rpaRuntimeChecks,
];

const missing = requiredItems.filter((item) => !item.path || !fs.existsSync(item.path));
const unexpected = [];

if (missing.length > 0 || unexpected.length > 0) {
  console.error("Release verification failed.");
  if (missing.length > 0) {
    console.error("Missing required artifacts:");
    for (const item of missing) {
      console.error(`- ${item.label}`);
      if (item.path) {
        console.error(`  ${item.path}`);
      }
    }
  }
  if (unexpected.length > 0) {
    console.error("Unexpected bundled artifacts:");
    for (const item of unexpected) {
      console.error(`- ${item.label}`);
      console.error(`  ${item.path}`);
    }
  }
  process.exit(1);
}

console.log("Release verification passed.");
