// Node loader hooks so scripts can import app code: resolves the "@/" alias
// to the project root and treats src/ files as ES modules.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const file = path.join(ROOT, specifier.slice(2));
    return { url: pathToFileURL(file.endsWith(".js") ? file : `${file}.js`).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith(pathToFileURL(path.join(ROOT, "src")).href)) {
    return next(url, { ...context, format: "module" });
  }
  return next(url, context);
}
