import { exec } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export default {
  name: "code-exec",
  version: "1.0.0",
  contributor: "base",
  description:
    "Run Python or Node.js code snippets in a sandboxed subprocess.",

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
        tmpFile = join(tmpdir(), `solix-exec-${id}.py`);
        cmd = `python3 "${tmpFile}"`;
        break;
      }
      case "node":
      case "javascript": {
        tmpFile = join(tmpdir(), `solix-exec-${id}.mjs`);
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
