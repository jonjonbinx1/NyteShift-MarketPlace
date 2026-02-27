import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Minimal YAML helpers (covers common scalar/object/array cases).
// For full YAML fidelity, consumers should add a `package.json` with `yaml`.
const yamlParse = (text) => {
  const lines = text.split("\n");
  const result = {};
  let currentKey = null;
  let arrayBuffer = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;

    const arrayMatch = line.match(/^(\s*)- (.+)$/);
    if (arrayMatch && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(arrayMatch[2].trim());
      continue;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "") {
        result[currentKey] = {};
      } else if (val === "true") {
        result[currentKey] = true;
      } else if (val === "false") {
        result[currentKey] = false;
      } else if (val === "null") {
        result[currentKey] = null;
      } else if (!isNaN(Number(val))) {
        result[currentKey] = Number(val);
      } else {
        result[currentKey] = val.replace(/^['"]|['"]$/g, "");
      }
    }
  }
  return result;
};

const yamlStringify = (obj, indent = 0) => {
  const pad = " ".repeat(indent);
  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      out += `${pad}${key}:\n`;
      for (const item of value) {
        out += `${pad}  - ${item}\n`;
      }
    } else if (value !== null && typeof value === "object") {
      out += `${pad}${key}:\n${yamlStringify(value, indent + 2)}`;
    } else {
      out += `${pad}${key}: ${value}\n`;
    }
  }
  return out;
};

export default {
  name: "json-yaml",
  version: "1.0.0",
  contributor: "base",
  description: "Parse, modify, and write JSON and YAML data.",

  run: async ({ input, context }) => {
    const { action } = input;

    switch (action) {
      // ---------- JSON ----------
      case "json-parse": {
        try {
          const data = JSON.parse(input.text);
          return { ok: true, data };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }

      case "json-stringify": {
        const indent = input.indent ?? 2;
        return { ok: true, text: JSON.stringify(input.data, null, indent) };
      }

      case "json-read": {
        const filePath = resolve(input.path);
        const raw = await readFile(filePath, "utf-8");
        return { ok: true, data: JSON.parse(raw) };
      }

      case "json-write": {
        const filePath = resolve(input.path);
        const indent = input.indent ?? 2;
        await writeFile(filePath, JSON.stringify(input.data, null, indent) + "\n", "utf-8");
        return { ok: true, path: filePath };
      }

      // ---------- YAML ----------
      case "yaml-parse": {
        try {
          const data = yamlParse(input.text);
          return { ok: true, data };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }

      case "yaml-stringify": {
        return { ok: true, text: yamlStringify(input.data) };
      }

      case "yaml-read": {
        const filePath = resolve(input.path);
        const raw = await readFile(filePath, "utf-8");
        return { ok: true, data: yamlParse(raw) };
      }

      case "yaml-write": {
        const filePath = resolve(input.path);
        await writeFile(filePath, yamlStringify(input.data), "utf-8");
        return { ok: true, path: filePath };
      }

      default:
        return {
          ok: false,
          error: `Unknown action "${action}". Supported: json-parse, json-stringify, json-read, json-write, yaml-parse, yaml-stringify, yaml-read, yaml-write.`,
        };
    }
  },
};
