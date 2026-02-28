import { exec } from "node:child_process";

export default {
  name: "shell",
  version: "1.1.0",
  contributor: "base",
  description:
    "Run shell commands, capture stdout/stderr, and return exit codes.",

  config: [
    {
      key: "defaultShell",
      label: "Default Shell",
      type: "string",
      placeholder: "/bin/bash",
      description: "Shell binary path. Leave empty to use the system default.",
    },
    {
      key: "defaultTimeout",
      label: "Default Timeout (ms)",
      type: "number",
      default: 30000,
      min: 1000,
      max: 600000,
      step: 1000,
      description: "Default command execution timeout in milliseconds.",
    },
    {
      key: "allowedCommands",
      label: "Allowed Commands",
      type: "textarea",
      placeholder: "ls\ncat\ngit\nnpm",
      description: "Whitelist of allowed command prefixes, one per line. Leave empty to allow all.",
    },
    {
      key: "confirmDangerous",
      label: "Confirm Dangerous Commands",
      type: "boolean",
      default: true,
      description: "Require confirmation before running destructive commands (rm, drop, etc.).",
    },
    {
      key: "defaultCwd",
      label: "Working Directory",
      type: "string",
      placeholder: "/home/user/project",
      description: "Default working directory for shell commands. Leave empty to use agent workspace.",
    },
  ],

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
