import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export default {
  name: "editor",
  version: "1.0.0",
  contributor: "base",
  description:
    "Apply patches and diffs to files safely using search-and-replace or line-range operations.",

  run: async ({ input, context }) => {
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
  },
};
