import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "playwright";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SCOPE_SCRIPT = "scrape-scope";

function resolveBrowserScriptPath(name: string): string {
  const candidates = [
    join(MODULE_DIR, "browser", `${name}.js`),
    join(process.cwd(), "src/scrape/browser", `${name}.js`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(`Browser script not found: ${name}`);
}

function loadBrowserScriptSource(name: string): string {
  if (name === SCOPE_SCRIPT) {
    return readFileSync(resolveBrowserScriptPath(name), "utf8");
  }
  const scope = readFileSync(resolveBrowserScriptPath(SCOPE_SCRIPT), "utf8");
  const main = readFileSync(resolveBrowserScriptPath(name), "utf8");
  return `${scope}\n${main}`;
}

function entryFunctionName(scriptName: string): string {
  const base = scriptName.replace(/\.js$/, "");
  const camel = base
    .split("-")
    .map((part, index) => (index === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join("");
  return `${camel}InBrowser`;
}

function loadBrowserScript(name: string): string {
  const fnName = entryFunctionName(name);
  const source = loadBrowserScriptSource(name);
  if (!source.includes(`function ${fnName}(`)) {
    throw new Error(`Browser script ${name} must define function ${fnName}`);
  }
  return fnName;
}

export async function runBrowserScript<T>(page: Page, name: string, arg?: number | string): Promise<T> {
  const fnName = loadBrowserScript(name);
  const script = loadBrowserScriptSource(name);
  const expression =
    arg === undefined
      ? `(() => { ${script}; return ${fnName}(); })()`
      : `(() => { ${script}; return ${fnName}(${JSON.stringify(arg)}); })()`;
  return page.evaluate(expression) as Promise<T>;
}
