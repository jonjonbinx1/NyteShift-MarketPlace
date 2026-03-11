import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const FRAMEWORK_INDICATORS = {
  "package.json": { ecosystem: "node" },
  "requirements.txt": { ecosystem: "python" },
  "pyproject.toml": { ecosystem: "python" },
  "Pipfile": { ecosystem: "python" },
  "go.mod": { ecosystem: "go" },
  "Cargo.toml": { ecosystem: "rust" },
  "pom.xml": { ecosystem: "java", build: "maven" },
  "build.gradle": { ecosystem: "java", build: "gradle" },
  "Gemfile": { ecosystem: "ruby" },
  "composer.json": { ecosystem: "php" },
  "mix.exs": { ecosystem: "elixir" },
  "pubspec.yaml": { ecosystem: "dart" },
  "Dockerfile": { feature: "docker" },
  "docker-compose.yml": { feature: "docker-compose" },
  "docker-compose.yaml": { feature: "docker-compose" },
  ".github": { feature: "github-actions" },
  "tsconfig.json": { language: "typescript" },
};

const detectNodeFrameworks = (pkg) => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks = [];
  if (deps.react) frameworks.push("react");
  if (deps.next) frameworks.push("nextjs");
  if (deps.vue) frameworks.push("vue");
  if (deps.nuxt) frameworks.push("nuxt");
  if (deps.express) frameworks.push("express");
  if (deps.fastify) frameworks.push("fastify");
  if (deps["@nestjs/core"]) frameworks.push("nestjs");
  if (deps.svelte) frameworks.push("svelte");
  if (deps.angular || deps["@angular/core"]) frameworks.push("angular");
  if (deps.electron) frameworks.push("electron");
  if (deps.vite) frameworks.push("vite");
  if (deps.webpack) frameworks.push("webpack");
  if (deps.tailwindcss) frameworks.push("tailwindcss");
  return frameworks;
};

export default {
  name: "project-inspector",
  version: "1.1.0",
  contributor: "base",
  description:
    "Detect frameworks, languages, dependencies, and build systems in a project directory.",

  config: [
    {
      key: "scanDepth",
      label: "Scan Depth",
      type: "number",
      default: 3,
      min: 1,
      max: 10,
      step: 1,
      description: "Maximum directory depth to scan for framework indicators.",
    },
    {
      key: "ignoreDirs",
      label: "Ignore Directories",
      type: "multiselect",
      options: ["node_modules", ".git", "dist", "build", "vendor", "__pycache__"],
      description: "Directories to skip during project inspection.",
    },
    {
      key: "extraIndicators",
      label: "Extra Indicators",
      type: "textarea",
      placeholder: "{\"deno.json\": {\"ecosystem\": \"deno\"}}",
      description: "Additional framework indicator files as a JSON object mapping filename to metadata.",
    },
    {
      key: "detectLanguages",
      label: "Detect Languages",
      type: "boolean",
      default: true,
      description: "Scan file extensions to detect programming languages used in the project.",
    },
  ],

  run: async ({ input, context }) => {
    const dir = resolve(input.path || ".");

    const entries = await readdir(dir).catch(() => []);
    const detected = {
      ecosystems: [],
      languages: [],
      frameworks: [],
      features: [],
      buildSystems: [],
      dependencies: {},
    };

    for (const [file, info] of Object.entries(FRAMEWORK_INDICATORS)) {
      if (await exists(join(dir, file))) {
        if (info.ecosystem && !detected.ecosystems.includes(info.ecosystem)) {
          detected.ecosystems.push(info.ecosystem);
        }
        if (info.language && !detected.languages.includes(info.language)) {
          detected.languages.push(info.language);
        }
        if (info.build && !detected.buildSystems.includes(info.build)) {
          detected.buildSystems.push(info.build);
        }
        if (info.feature && !detected.features.includes(info.feature)) {
          detected.features.push(info.feature);
        }
      }
    }

    // Deep-inspect package.json for Node projects
    const pkgPath = join(dir, "package.json");
    if (await exists(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        detected.frameworks.push(...detectNodeFrameworks(pkg));
        detected.dependencies.node = {
          production: Object.keys(pkg.dependencies || {}),
          dev: Object.keys(pkg.devDependencies || {}),
        };
      } catch {
        // malformed package.json — skip
      }
    }

    // Detect languages from file extensions
    const extMap = {
      ".js": "javascript",
      ".mjs": "javascript",
      ".ts": "typescript",
      ".py": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".rb": "ruby",
      ".php": "php",
      ".ex": "elixir",
      ".exs": "elixir",
      ".dart": "dart",
      ".c": "c",
      ".cpp": "c++",
      ".cs": "c#",
      ".swift": "swift",
      ".kt": "kotlin",
    };

    for (const entry of entries) {
      for (const [ext, lang] of Object.entries(extMap)) {
        if (entry.endsWith(ext) && !detected.languages.includes(lang)) {
          detected.languages.push(lang);
        }
      }
    }

    return { ok: true, path: dir, ...detected };
  },
};

/**
 * Interface contract — consumed by the NyteShift runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.1.0
 */
export const spec = {
  name: "project-inspector",
  version: "1.1.0",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory to inspect. Defaults to the current working directory.",
      },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok", "path"],
    properties: {
      ok: { type: "boolean" },
      path: { type: "string", description: "Resolved directory that was inspected." },
      ecosystems: {
        type: "array",
        items: { type: "string" },
        description: "Detected package ecosystems (e.g. node, python, go, rust).",
      },
      languages: {
        type: "array",
        items: { type: "string" },
        description: "Programming languages detected from file extensions and config files.",
      },
      frameworks: {
        type: "array",
        items: { type: "string" },
        description: "Detected frameworks (e.g. react, nextjs, express).",
      },
      features: {
        type: "array",
        items: { type: "string" },
        description: "Detected tooling features (e.g. docker, github-actions).",
      },
      buildSystems: {
        type: "array",
        items: { type: "string" },
        description: "Detected build systems (e.g. maven, gradle).",
      },
      dependencies: {
        type: "object",
        description: "Per-ecosystem dependency lists keyed by ecosystem name.",
      },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: false,
  verify: [],
};
