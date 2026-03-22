import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default {
  name: "editor",
  version: "1.1.0",
  contributor: "base",
  description:
    "Apply patches and diffs to files safely using search-and-replace or line-range operations.",

  config: [
    {
      key: "createBackup",
      label: "Create Backup",
      type: "boolean",
      default: false,
      description: "Create a .bak copy of the file before applying edits.",
    },
    {
      key: "trimTrailingWhitespace",
      label: "Trim Trailing Whitespace",
      type: "boolean",
      default: false,
      description: "Automatically trim trailing whitespace from modified lines.",
    },
    {
      key: "defaultEncoding",
      label: "File Encoding",
      type: "select",
      options: ["utf-8", "ascii", "latin1", "utf-16le"],
      default: "utf-8",
      description: "Character encoding used when reading and writing files.",
    },
  ],

  run: async ({ input, context }) => {
    try {
    const { action } = input;

    switch (action) {
      case "replace": {
        const filePath = resolve(input.path);
        const original = await readFile(filePath, "utf-8");

        if (!original.includes(input.search)) {
          return {
            ok: false,
            error: "Search string not found in file.",
          };
        }

        const updated = original.replace(input.search, input.replacement);
        await writeFile(filePath, updated, "utf-8");
        return { ok: true, path: filePath };
      }

      case "replace-all": {
        const filePath = resolve(input.path);
        const original = await readFile(filePath, "utf-8");
        const updated = original.replaceAll(input.search, input.replacement);

        if (original === updated) {
          return { ok: false, error: "Search string not found in file." };
        }

        await writeFile(filePath, updated, "utf-8");
        return { ok: true, path: filePath };
      }

      case "insert-at-line": {
        const filePath = resolve(input.path);
        const original = await readFile(filePath, "utf-8");
        const lines = original.split("\n");
        const lineIndex = Math.max(0, Math.min(input.line - 1, lines.length));
        lines.splice(lineIndex, 0, input.content);
        await writeFile(filePath, lines.join("\n"), "utf-8");
        return { ok: true, path: filePath, insertedAt: lineIndex + 1 };
      }

      case "delete-lines": {
        const filePath = resolve(input.path);
        const original = await readFile(filePath, "utf-8");
        const lines = original.split("\n");
        const start = Math.max(0, input.startLine - 1);
        const end = Math.min(lines.length, input.endLine);
        lines.splice(start, end - start);
        await writeFile(filePath, lines.join("\n"), "utf-8");
        return { ok: true, path: filePath, deletedRange: [input.startLine, input.endLine] };
      }

      default:
        return {
          ok: false,
          error: `Unknown action "${action}". Supported: replace, replace-all, insert-at-line, delete-lines.`,
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
  name: "editor",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["action", "path"],
    properties: {
      action: {
        type: "string",
        enum: ["replace", "replace-all", "insert-at-line", "delete-lines"],
        description: "Edit operation to perform.",
      },
      path: { type: "string", description: "Path to the file to edit." },
      search: {
        type: "string",
        description: "String to search for. Required for action=replace and action=replace-all.",
      },
      replacement: {
        type: "string",
        description: "Replacement string. Required for action=replace and action=replace-all.",
      },
      line: {
        type: "number",
        description: "1-based line number for insertion. Required for action=insert-at-line.",
        minimum: 1,
      },
      content: {
        type: "string",
        description: "Content to insert. Required for action=insert-at-line.",
      },
      startLine: {
        type: "number",
        description: "1-based start line of range to delete. Required for action=delete-lines.",
        minimum: 1,
      },
      endLine: {
        type: "number",
        description: "1-based end line of range to delete (inclusive). Required for action=delete-lines.",
        minimum: 1,
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      path: { type: "string", description: "Resolved path of the edited file." },
      insertedAt: { type: "number", description: "Line number where content was inserted. Returned for action=insert-at-line." },
      deletedRange: {
        type: "array",
        description: "[startLine, endLine] that was deleted. Returned for action=delete-lines.",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: true,
  verify: ["filesystem.read", "filesystem.stat"],
};
