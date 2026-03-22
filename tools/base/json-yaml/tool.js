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
  version: "1.1.0",
  contributor: "base",
  description: "Parse, modify, and write JSON and YAML data.",

  config: [
    {
      key: "jsonIndent",
      label: "JSON Indent Spaces",
      type: "number",
      default: 2,
      min: 0,
      max: 8,
      step: 1,
      description: "Number of spaces for JSON indentation when stringifying or writing.",
    },
    {
      key: "yamlIndent",
      label: "YAML Indent Spaces",
      type: "number",
      default: 2,
      min: 0,
      max: 8,
      step: 1,
      description: "Number of spaces for YAML indentation when stringifying or writing.",
    },
    {
      key: "sortKeys",
      label: "Sort Keys",
      type: "boolean",
      default: false,
      description: "Alphabetically sort object keys when writing JSON or YAML.",
    },
    {
      key: "trailingNewline",
      label: "Trailing Newline",
      type: "boolean",
      default: true,
      description: "Append a trailing newline when writing files.",
    },
  ],

  run: async ({ input, context }) => {
    const { action } = input;

    try {
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
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
};

/**
 * Interface contract — consumed by the NyteShift runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "json-yaml",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: [
          "json-parse",
          "json-stringify",
          "json-read",
          "json-write",
          "yaml-parse",
          "yaml-stringify",
          "yaml-read",
          "yaml-write",
        ],
        description: "Operation to perform.",
      },
      text: {
        type: "string",
        description: "Raw JSON or YAML text to parse. Required for action=json-parse and action=yaml-parse.",
      },
      data: {
        description: "Data to serialize. Required for action=json-stringify, json-write, yaml-stringify, yaml-write.",
      },
      path: {
        type: "string",
        description: "File path to read from or write to. Required for action=*-read and action=*-write.",
      },
      indent: {
        type: "number",
        description: "JSON indentation spaces. Applies to action=json-stringify and action=json-write. Defaults to 2.",
        default: 2,
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      data: { description: "Parsed data object. Returned for action=*-parse and action=*-read." },
      text: { type: "string", description: "Serialized string. Returned for action=*-stringify." },
      path: { type: "string", description: "Written file path. Returned for action=*-write." },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: false,
  verify: [],
};
