import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export default {
  name: "code-exec",
  version: "1.1.0",
  contributor: "base",
  description:
    "Run Python or Node.js code snippets in a sandboxed subprocess.",

  config: [
    {
      key: "defaultLanguage",
      label: "Default Language",
      type: "select",
      options: ["python", "node", "javascript"],
      default: "node",
      description: "Default runtime when language is not explicitly specified.",
    },
    {
      key: "defaultTimeout",
      label: "Default Timeout (ms)",
      type: "number",
      default: 30000,
      min: 1000,
      max: 300000,
      step: 1000,
      description: "Default execution timeout in milliseconds.",
    },
    {
      key: "sandboxMode",
      label: "Sandbox Mode",
      type: "boolean",
      default: true,
      description: "Run code in a restricted sandbox with limited filesystem and network access.",
    },
    {
      key: "pythonBinary",
      label: "Python Binary",
      type: "string",
      default: "python3",
      placeholder: "/usr/bin/python3",
      description: "Path or command name for the Python interpreter.",
    },
    {
      key: "nodeBinary",
      label: "Node Binary",
      type: "string",
      default: "node",
      placeholder: "/usr/bin/node",
      description: "Path or command name for the Node.js runtime.",
    },
  ],

  run: async ({ input, context }) => {
    const { language, code, timeout = 30_000 } = input;

    if (!code || typeof code !== "string") {
      return { ok: false, error: "A non-empty code string is required." };
    }

    const id = randomUUID().slice(0, 8);
    let tmpFile;
    let cmd;

    switch (language) {
      case "python": {
        tmpFile = join(tmpdir(), `nyteshift-exec-${id}.py`);
        cmd = `python3 "${tmpFile}"`;
        break;
      }
      case "node":
      case "javascript": {
        tmpFile = join(tmpdir(), `nyteshift-exec-${id}.mjs`);
        cmd = `node "${tmpFile}"`;
        break;
      }
      default:
        return {
          ok: false,
          error: `Unsupported language "${language}". Supported: python, node, javascript.`,
        };
    }

    await writeFile(tmpFile, code, "utf-8");

    return new Promise((resolve) => {
      exec(cmd, { timeout }, async (error, stdout, stderr) => {
        // Clean up temp file
        try {
          await unlink(tmpFile);
        } catch {
          // ignore cleanup errors
        }

        resolve({
          ok: !error,
          exitCode: error ? error.code ?? 1 : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          ...(error && { error: error.message }),
        });
      });
    });
  },
};

/**
 * Interface contract — consumed by the NyteShift runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "code-exec",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["language", "code"],
    properties: {
      language: {
        type: "string",
        enum: ["python", "node", "javascript"],
        description: "Runtime to use for execution.",
      },
      code: { type: "string", description: "Source code snippet to execute." },
      timeout: {
        type: "number",
        description: "Execution timeout in milliseconds. Defaults to 30000.",
        default: 30000,
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok", "exitCode", "stdout", "stderr"],
    properties: {
      ok: { type: "boolean" },
      exitCode: { type: "number" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: true,
  verify: [],
};
