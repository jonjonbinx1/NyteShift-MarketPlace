import { readFile, writeFile, unlink, readdir, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export default {
  name: "filesystem",
  version: "1.1.0",
  contributor: "base",
  description:
    "Read, write, and delete files; list and create directories.",

  config: [
    {
      key: "defaultEncoding",
      label: "Default Encoding",
      type: "select",
      options: ["utf-8", "ascii", "latin1", "utf-16le"],
      default: "utf-8",
      description: "Character encoding used for file read/write operations.",
    },
    {
      key: "followSymlinks",
      label: "Follow Symlinks",
      type: "boolean",
      default: true,
      description: "Follow symbolic links when reading or listing files.",
    },
    {
      key: "restrictToWorkspace",
      label: "Restrict to Workspace",
      type: "boolean",
      default: true,
      description: "Only allow file operations within the current workspace directory.",
    },
    {
      key: "maxFileSize",
      label: "Max File Size (KB)",
      type: "number",
      default: 1024,
      min: 1,
      max: 102400,
      step: 256,
      description: "Maximum file size in KB allowed for read operations.",
    },
  ],

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

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "filesystem",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["action", "path"],
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "delete", "list", "mkdir", "stat"],
        description: "Operation to perform.",
      },
      path: {
        type: "string",
        description: "Absolute or relative filesystem path.",
      },
      content: {
        type: "string",
        description: "File content to write. Required when action=write.",
      },
    },
    if: { properties: { action: { const: "write" } }, required: ["action"] },
    then: { required: ["content"] },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      content: { type: "string", description: "Returned for action=read." },
      items: {
        type: "array",
        description: "Returned for action=list.",
        items: {
          type: "object",
          required: ["name", "type"],
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["file", "directory"] },
          },
        },
      },
      path: { type: "string", description: "Resolved path. Returned for action=write, mkdir." },
      deleted: { type: "string", description: "Deleted path. Returned for action=delete." },
      created: { type: "string", description: "Created path. Returned for action=mkdir." },
      stat: {
        type: "object",
        description: "Returned for action=stat.",
        properties: {
          size: { type: "number" },
          isFile: { type: "boolean" },
          isDirectory: { type: "boolean" },
          modified: { type: "string", format: "date-time" },
          created: { type: "string", format: "date-time" },
        },
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  verify: ["filesystem.stat"],
};
