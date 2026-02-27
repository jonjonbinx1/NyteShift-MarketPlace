import { readFile, writeFile, unlink, readdir, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export default {
  name: "filesystem",
  version: "1.0.0",
  contributor: "base",
  description:
    "Read, write, and delete files; list and create directories.",

  run: async ({ input, context }) => {
    const { action } = input;

    switch (action) {
      case "read": {
        const content = await readFile(resolve(input.path), "utf-8");
        return { ok: true, content };
      }

      case "write": {
        await writeFile(resolve(input.path), input.content, "utf-8");
        return { ok: true, path: resolve(input.path) };
      }

      case "delete": {
        await unlink(resolve(input.path));
        return { ok: true, deleted: resolve(input.path) };
      }

      case "list": {
        const entries = await readdir(resolve(input.path), {
          withFileTypes: true,
        });
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
        return { ok: true, items };
      }

      case "mkdir": {
        await mkdir(resolve(input.path), { recursive: true });
        return { ok: true, created: resolve(input.path) };
      }

      case "stat": {
        const info = await stat(resolve(input.path));
        return {
          ok: true,
          stat: {
            size: info.size,
            isFile: info.isFile(),
            isDirectory: info.isDirectory(),
            modified: info.mtime.toISOString(),
            created: info.birthtime.toISOString(),
          },
        };
      }

      default:
        return {
          ok: false,
          error: `Unknown action "${action}". Supported: read, write, delete, list, mkdir, stat.`,
        };
    }
  },
};
