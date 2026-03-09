/**
 * PostToolUse hook for WebFetch - SPA content detector
 *
 * Detects when WebFetch returns JavaScript-only / SPA content
 * and outputs a warning telling Claude to use fetcher-mcp instead.
 *
 * Receives PostToolUse JSON on stdin:
 *   { tool_name, tool_input, tool_output }
 *
 * Outputs warning text to stdout if SPA detected.
 * Exits silently (no output) if content looks normal.
 */

const fs = require("fs");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function extractContent(data) {
  const output = data.tool_output;
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    return output.content || output.text || output.body || JSON.stringify(output);
  }
  return "";
}

function extractUrl(data) {
  const input = data.tool_input;
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    return input.url || input.uri || "";
  }
  return "";
}

function stripHtmlTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSpa(content) {
  const indicators = [];

  if (!content || content.length < 50) {
    indicators.push("empty_response");
    return indicators;
  }

  const textOnly = stripHtmlTags(content);

  // 1. Very short meaningful text after stripping tags/scripts
  if (textOnly.length < 300 && content.length > 500) {
    indicators.push("short_text_vs_long_html");
  }

  // 2. JS framework boilerplate
  const frameworkPatterns = [
    /__NEXT_DATA__/,
    /window\.__NUXT/,
    /window\.__remixContext/,
    /window\.webpackChunk/,
    /self\.__next_f/,
    /React\.createElement/,
    /ReactDOM\.render/,
    /createApp\s*\(/,
    /Vue\.createApp/,
    /angular\.module/,
    /window\.___gatsby/,
  ];
  for (const pattern of frameworkPatterns) {
    if (pattern.test(content)) {
      indicators.push("framework_boilerplate");
      break;
    }
  }

  // 3. Script tags dominate the page
  const scriptCount = (content.match(/<script[\s>]/gi) || []).length;
  if (scriptCount > 3 && textOnly.length < 800) {
    indicators.push("script_heavy");
  }

  // 4. Explicit "requires JavaScript" messages
  if (
    /requires?\s+javascript|enable\s+javascript|javascript\s+is\s+(required|disabled|not\s+enabled)|you\s+need\s+to\s+enable\s+javascript/i.test(
      content
    )
  ) {
    indicators.push("js_required_message");
  }

  // 5. Empty container divs (SPA mount points)
  if (
    /<div\s+id=["'](root|app|__next|__nuxt|__gatsby)["']\s*>\s*<\/div>/i.test(
      content
    )
  ) {
    indicators.push("empty_spa_container");
  }

  // 6. Mostly noscript content
  if (/<noscript>/i.test(content) && textOnly.length < 500) {
    indicators.push("noscript_present");
  }

  // 7. Content is almost entirely JSON data (common in Next.js)
  if (
    content.includes("__NEXT_DATA__") &&
    /<script\s+id=["']__NEXT_DATA__["']/i.test(content)
  ) {
    indicators.push("nextjs_json_only");
  }

  return indicators;
}

function main() {
  const raw = readStdin();
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  if (data.tool_name !== "WebFetch") return;

  const content = extractContent(data);
  const url = extractUrl(data);
  const indicators = detectSpa(content);

  // Require 2+ indicators to avoid false positives,
  // unless a single strong indicator is present
  const strongIndicators = [
    "js_required_message",
    "empty_spa_container",
    "empty_response",
  ];
  const hasStrongIndicator = indicators.some((i) =>
    strongIndicators.includes(i)
  );

  if (indicators.length >= 2 || hasStrongIndicator) {
    const msg = [
      "",
      "[SPA DETECTED] WebFetch returned JavaScript-only content. The page was not rendered.",
      `Detected indicators: ${indicators.join(", ")}`,
      "",
      "You MUST use the fetcher-mcp MCP tool to re-fetch this page with full JS rendering.",
      `Use: mcp__fetcher__fetch_url with url="${url}"`,
      "",
      "Do NOT skip this step. Do NOT use alternative information sources.",
      "The original URL contains the most authoritative information.",
      "",
    ].join("\n");

    process.stdout.write(msg);
  }
}

main();
