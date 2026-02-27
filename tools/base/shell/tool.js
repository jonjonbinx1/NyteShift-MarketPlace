import { exec } from "node:child_process";

export default {
  name: "shell",
  version: "1.0.0",
  contributor: "base",
  description:
    "Run shell commands, capture stdout/stderr, and return exit codes.",

  run: async ({ input, context }) => {
    const { command, cwd, timeout = 30_000 } = input;

    if (!command || typeof command !== "string") {
      return { ok: false, error: "A non-empty command string is required." };
    }

    return new Promise((resolve) => {
      exec(command, { cwd, timeout }, (error, stdout, stderr) => {
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
