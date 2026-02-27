import { exec } from "node:child_process";

export default {
  name: "shell",
  version: "1.1.0",
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

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "shell",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    required: ["command"],
    properties: {
      command: { type: "string", description: "Shell command string to execute." },
      cwd: { type: "string", description: "Working directory for the command. Optional." },
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
