/**
 * WebFetch SPA Fallback - One-click installer
 *
 * Configures Claude Code to automatically detect SPA pages
 * and fall back to fetcher-mcp for JS-rendered content extraction.
 *
 * What it does:
 *   1. Installs fetcher-mcp globally via npm (if not already installed)
 *   2. Copies webfetch-spa-detector.js hook to ~/.claude/hooks/
 *   3. Adds fetcher-mcp MCP server to ~/.claude/settings.json
 *   4. Registers PostToolUse hook for WebFetch in settings.json
 *   5. Adds WebFetch SPA Fallback rule to ~/.claude/rules/common/
 *   6. Appends fallback instructions to ~/.claude/CLAUDE.md
 *
 * Usage:
 *   node setup.js           # Install
 *   node setup.js --check   # Check current status
 *   node setup.js --remove  # Uninstall
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const RULES_DIR = path.join(CLAUDE_DIR, "rules", "common");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const CLAUDE_MD_PATH = path.join(CLAUDE_DIR, "CLAUDE.md");
const HOOK_FILENAME = "webfetch-spa-detector.js";
const HOOK_SOURCE = path.join(__dirname, HOOK_FILENAME);
const HOOK_DEST = path.join(HOOKS_DIR, HOOK_FILENAME);

const CLAUDE_MD_MARKER = "## WebFetch SPA Fallback (CRITICAL)";

const CLAUDE_MD_BLOCK = `
## WebFetch SPA Fallback (CRITICAL)

When WebFetch returns SPA/JavaScript-only content (empty body, script tags only, framework boilerplate),
you MUST use the fetcher-mcp MCP tool (\`mcp__fetcher__fetch_url\`) to re-fetch the page with full JS rendering.
NEVER skip to alternative information sources -- the original URL contains the most authoritative information.

A PostToolUse hook automatically detects SPA content and injects a warning. When you see
"[SPA DETECTED]" in the hook output, follow its instructions immediately.

Tool hierarchy for web content:
1. WebFetch -- fast, lightweight, for static pages
2. fetcher-mcp (\`mcp__fetcher__fetch_url\`) -- JS rendering, for SPA pages (auto-triggered by hook)
3. agent-browser -- only for browser automation tasks (forms, clicks, testing), NOT for content reading
`;

const RULE_CONTENT = `# WebFetch Fallback to fetcher-mcp

## Rule

When WebFetch returns empty, JavaScript-only, or clearly incomplete content (typical of SPA/dynamic pages), do NOT silently move on to alternative sources. Instead:

1. Use the fetcher-mcp MCP tool (\`mcp__fetcher__fetch_url\`) to re-fetch the page with full JS rendering
2. If fetcher-mcp also fails, use agent-browser as a last resort
3. Only after all browser-based methods fail: seek alternative information sources

A PostToolUse hook (\`webfetch-spa-detector.js\`) automatically detects SPA content and injects a "[SPA DETECTED]" warning. When you see this warning, follow its instructions immediately.

## Fallback Order

1. WebFetch (fast, lightweight, works for static pages)
2. fetcher-mcp MCP (\`mcp__fetcher__fetch_url\`) -- full JS rendering via Playwright, content extraction with Readability
3. agent-browser -- only if fetcher-mcp is unavailable
4. Only after all fail: seek alternative information sources

## Important

- Do NOT skip fetcher-mcp and jump to alternative sources
- The target URL often contains the most authoritative information
- fetcher-mcp blocks unnecessary resources (images, CSS) for faster extraction
`;

function log(msg) {
  console.log(msg);
}

function logOk(msg) {
  console.log(`  [OK] ${msg}`);
}

function logSkip(msg) {
  console.log(`  [SKIP] ${msg}`);
}

function logAdd(msg) {
  console.log(`  [ADD] ${msg}`);
}

function logRemove(msg) {
  console.log(`  [REMOVE] ${msg}`);
}

function logError(msg) {
  console.error(`  [ERROR] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// --- Install ---

function commandExists(cmd) {
  try {
    const { execSync } = require("child_process");
    execSync(process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function findFetcherMcpEntryPoint() {
  // Find the absolute path to fetcher-mcp's entry point.
  // Claude Code's subprocess may not have the same PATH as the user's shell,
  // so we must use an absolute path in the MCP server config.
  const { execSync } = require("child_process");
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const entryPoint = path.join(globalRoot, "fetcher-mcp", "build", "index.js");
    if (fs.existsSync(entryPoint)) {
      return entryPoint.replace(/\\/g, "/");
    }
  } catch {}

  // Fallback: try to resolve from require
  try {
    const pkgDir = path.dirname(require.resolve("fetcher-mcp/package.json"));
    const entryPoint = path.join(pkgDir, "build", "index.js");
    if (fs.existsSync(entryPoint)) {
      return entryPoint.replace(/\\/g, "/");
    }
  } catch {}

  return null;
}

function install() {
  log("Installing WebFetch SPA Fallback...\n");

  // 0. Install fetcher-mcp globally if needed
  log("0. fetcher-mcp package:");
  if (commandExists("fetcher-mcp")) {
    logSkip("fetcher-mcp already installed globally");
  } else {
    logAdd("Installing fetcher-mcp globally via npm...");
    try {
      const { execSync } = require("child_process");
      execSync("npm install -g fetcher-mcp", { stdio: "inherit" });
      logOk("fetcher-mcp installed globally");
    } catch (e) {
      logError("Failed to install fetcher-mcp. Run manually: npm install -g fetcher-mcp");
      logError(e.message);
    }
  }

  // 1. Copy hook script
  log("\n1. Hook script:");
  ensureDir(HOOKS_DIR);
  if (!fs.existsSync(HOOK_SOURCE)) {
    logError(`Source file not found: ${HOOK_SOURCE}`);
    process.exit(1);
  }
  fs.copyFileSync(HOOK_SOURCE, HOOK_DEST);
  logOk(`Copied to ${HOOK_DEST}`);

  // 2. Update settings.json
  log("\n2. Settings (settings.json):");
  const settings = readJson(SETTINGS_PATH);
  if (!settings) {
    logError(`Cannot read ${SETTINGS_PATH}`);
    process.exit(1);
  }

  // 2a. Add fetcher-mcp MCP server (using node + absolute path for reliability)
  if (!settings.mcpServers) settings.mcpServers = {};

  const entryPoint = findFetcherMcpEntryPoint();
  if (!entryPoint) {
    logError("Cannot find fetcher-mcp entry point. Ensure npm install -g fetcher-mcp succeeded.");
  }

  // Always update the config to use absolute path (fixes PATH issues)
  const needsUpdate =
    !settings.mcpServers.fetcher ||
    settings.mcpServers.fetcher.command !== "node" ||
    !settings.mcpServers.fetcher.args ||
    !settings.mcpServers.fetcher.args[0] ||
    !settings.mcpServers.fetcher.args[0].includes("fetcher-mcp");

  if (needsUpdate && entryPoint) {
    settings.mcpServers.fetcher = {
      command: "node",
      args: [entryPoint],
    };
    logAdd(`fetcher-mcp MCP server (node ${entryPoint})`);
  } else if (!needsUpdate) {
    logSkip("fetcher-mcp MCP server already configured with absolute path");
  }

  // 2b. Add PostToolUse hook
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  const hookCommand = `node "${HOOK_DEST.replace(/\\/g, "/")}"`;
  const hasHook = settings.hooks.PostToolUse.some(
    (entry) =>
      entry.matcher === "WebFetch" &&
      entry.hooks &&
      entry.hooks.some((h) => h.command && h.command.includes(HOOK_FILENAME))
  );

  if (hasHook) {
    logSkip("PostToolUse hook already registered");
  } else {
    settings.hooks.PostToolUse.push({
      matcher: "WebFetch",
      hooks: [
        {
          type: "command",
          command: hookCommand,
        },
      ],
    });
    logAdd("PostToolUse hook for WebFetch");
  }

  writeJson(SETTINGS_PATH, settings);
  logOk("settings.json updated");

  // 3. Add rule file
  log("\n3. Rule file:");
  ensureDir(RULES_DIR);
  const rulePath = path.join(RULES_DIR, "web-fetch-fallback.md");
  fs.writeFileSync(rulePath, RULE_CONTENT, "utf-8");
  logOk(`Written to ${rulePath}`);

  // 4. Update CLAUDE.md
  log("\n4. CLAUDE.md:");
  const claudeMd = readText(CLAUDE_MD_PATH);
  if (claudeMd.includes(CLAUDE_MD_MARKER)) {
    logSkip("WebFetch SPA Fallback section already exists");
  } else if (claudeMd) {
    // Insert before "## Communication" if it exists, otherwise append
    const insertPoint = claudeMd.indexOf("## Communication");
    let updated;
    if (insertPoint !== -1) {
      updated =
        claudeMd.slice(0, insertPoint) +
        CLAUDE_MD_BLOCK.trim() +
        "\n\n" +
        claudeMd.slice(insertPoint);
    } else {
      updated = claudeMd.trimEnd() + "\n\n" + CLAUDE_MD_BLOCK.trim() + "\n";
    }
    fs.writeFileSync(CLAUDE_MD_PATH, updated, "utf-8");
    logOk("Added WebFetch SPA Fallback section");
  } else {
    logSkip("CLAUDE.md not found, skipping (create it manually if needed)");
  }

  log("\n---");
  log("Installation complete! Restart Claude Code to apply changes.");
  log(
    "Test: ask Claude Code to WebFetch a React/Next.js SPA page and verify the hook triggers."
  );
}

// --- Check ---

function check() {
  log("Checking WebFetch SPA Fallback status...\n");

  // 1. Hook script
  const hookExists = fs.existsSync(HOOK_DEST);
  log(`1. Hook script: ${hookExists ? "installed" : "NOT installed"}`);

  // 2. Settings
  const settings = readJson(SETTINGS_PATH);
  if (settings) {
    const hasMcp = !!(settings.mcpServers && settings.mcpServers.fetcher);
    log(`2. fetcher-mcp MCP: ${hasMcp ? "configured" : "NOT configured"}`);

    const hasHook =
      settings.hooks &&
      settings.hooks.PostToolUse &&
      settings.hooks.PostToolUse.some(
        (e) =>
          e.matcher === "WebFetch" &&
          e.hooks &&
          e.hooks.some((h) => h.command && h.command.includes(HOOK_FILENAME))
      );
    log(`3. PostToolUse hook: ${hasHook ? "registered" : "NOT registered"}`);
  } else {
    log("2. settings.json: NOT FOUND");
  }

  // 3. Rule
  const ruleExists = fs.existsSync(
    path.join(RULES_DIR, "web-fetch-fallback.md")
  );
  log(`4. Rule file: ${ruleExists ? "present" : "NOT present"}`);

  // 4. CLAUDE.md
  const claudeMd = readText(CLAUDE_MD_PATH);
  const hasSection = claudeMd.includes(CLAUDE_MD_MARKER);
  log(`5. CLAUDE.md section: ${hasSection ? "present" : "NOT present"}`);
}

// --- Remove ---

function remove() {
  log("Removing WebFetch SPA Fallback...\n");

  // 1. Remove hook script
  if (fs.existsSync(HOOK_DEST)) {
    fs.unlinkSync(HOOK_DEST);
    logRemove("Hook script");
  } else {
    logSkip("Hook script not found");
  }

  // 2. Update settings.json
  const settings = readJson(SETTINGS_PATH);
  if (settings) {
    // Remove fetcher-mcp
    if (settings.mcpServers && settings.mcpServers.fetcher) {
      delete settings.mcpServers.fetcher;
      logRemove("fetcher-mcp MCP server");
    }

    // Remove PostToolUse hook
    if (settings.hooks && settings.hooks.PostToolUse) {
      const before = settings.hooks.PostToolUse.length;
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
        (entry) =>
          !(
            entry.matcher === "WebFetch" &&
            entry.hooks &&
            entry.hooks.some(
              (h) => h.command && h.command.includes(HOOK_FILENAME)
            )
          )
      );
      if (settings.hooks.PostToolUse.length === 0) {
        delete settings.hooks.PostToolUse;
      }
      if (settings.hooks.PostToolUse?.length !== before) {
        logRemove("PostToolUse hook");
      }
    }

    writeJson(SETTINGS_PATH, settings);
    logOk("settings.json updated");
  }

  // 3. Remove rule file
  const rulePath = path.join(RULES_DIR, "web-fetch-fallback.md");
  if (fs.existsSync(rulePath)) {
    fs.unlinkSync(rulePath);
    logRemove("Rule file");
  }

  // 4. Remove CLAUDE.md section
  const claudeMd = readText(CLAUDE_MD_PATH);
  if (claudeMd.includes(CLAUDE_MD_MARKER)) {
    // Remove the block between the marker and the next ## heading
    const start = claudeMd.indexOf(CLAUDE_MD_MARKER);
    const afterMarker = claudeMd.indexOf("\n## ", start + CLAUDE_MD_MARKER.length);
    const end = afterMarker !== -1 ? afterMarker : claudeMd.length;
    const updated = (claudeMd.slice(0, start) + claudeMd.slice(end)).replace(
      /\n{3,}/g,
      "\n\n"
    );
    fs.writeFileSync(CLAUDE_MD_PATH, updated, "utf-8");
    logRemove("CLAUDE.md section");
  }

  log("\n---");
  log("Removal complete. Restart Claude Code to apply changes.");
  log("To also uninstall the fetcher-mcp package: npm uninstall -g fetcher-mcp");
}

// --- Main ---

const arg = process.argv[2];
if (arg === "--check") {
  check();
} else if (arg === "--remove") {
  remove();
} else {
  install();
}
