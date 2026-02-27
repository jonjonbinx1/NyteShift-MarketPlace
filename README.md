# SolixAI Marketplace

The official catalog of installable, versioned, contributor-organized extensions for the **SolixAI agentic platform**.

This repository contains **no runtime code** and **no platform internals**. Every item is atomic, self-contained, and loadable by SolixAI's extension system.

---

## Repository Structure

```
SolixAI-Marketplace/
  README.md

  skills/
    base/<skill-name>/skill.md
    <contributor>/<skill-name>/skill.md

  tools/
    base/<tool-name>/tool.js
    <contributor>/<tool-name>/tool.js

  ui-themes/
    <contributor>/<theme-name>/theme.json

  triggers/
    <contributor>/<trigger-name>/trigger.json

  soul-templates/
    <contributor>/<template-name>/soul.md
```

All folder names are **kebab-case** and must match the metadata fields inside each item.

---

## Categories

| Category | Path | Item File | Description |
|---|---|---|---|
| **Skills** | `skills/<contributor>/<name>/` | `skill.md` | Markdown prompts that teach an agent *how* to perform a task |
| **Tools** | `tools/<contributor>/<name>/` | `tool.js` | ESM JavaScript modules that give an agent executable capabilities |
| **UI Themes** | `ui-themes/<contributor>/<name>/` | `theme.json` | Visual theme definitions (colors, fonts, layout) |
| **Triggers** | `triggers/<contributor>/<name>/` | `trigger.json` | Event-driven pipeline definitions (cron, webhook, email, etc.) |
| **Soul Templates** | `soul-templates/<contributor>/<name>/` | `soul.md` | Agent personality and system-level behavior definitions |

---

## The `base` Contributor Namespace

The `base` namespace contains **first-party baseline capabilities** maintained by the SolixAI team. These are the default skills and tools every SolixAI agent has access to out of the box.

### Baseline Tools (`tools/base/`)

| Tool | Description |
|---|---|
| `filesystem` | Read, write, delete files and manage directories |
| `shell` | Run shell commands and capture output |
| `http` | HTTP requests and file downloads |
| `search` | Provider-agnostic web search |
| `code-exec` | Run Python or Node snippets in a sandbox |
| `editor` | Apply patches and diffs to files safely |
| `json-yaml` | Parse, modify, and write JSON/YAML |
| `project-inspector` | Detect frameworks, languages, and dependencies |

### Baseline Skills (`skills/base/`)

| Skill | Description |
|---|---|
| `planning` | Break tasks into steps and define a plan |
| `reflection` | Evaluate outcomes and decide next actions |
| `summarization` | Condense long context into concise summaries |
| `analysis` | Reason about tasks, constraints, and actions |
| `editing` | Modify files using the editor tool |
| `research` | Search, gather, and synthesize information |
| `execution` | Choose tools and run them effectively |

---

## How SolixAI Installs Marketplace Items

1. **Discovery** — SolixAI scans this repository (or a configured registry) by category folder.
2. **Resolution** — Each item's metadata (`name`, `version`, `contributor`) is read from its contract file.
3. **Validation** — The item is validated against its category contract (frontmatter schema, export shape, JSON schema).
4. **Installation** — The item is copied into the agent's local extension directory, namespaced by `<contributor>/<name>`.
5. **Activation** — Skills are injected into the agent's prompt context; tools are registered in the tool registry; themes/triggers/templates are loaded by their respective subsystems.

Items are resolved by `<contributor>/<name>` pairs. Version conflicts are resolved by highest semver unless pinned.

---

## Versioning

All items use [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes to the item's interface or behavior
- **MINOR** — new capabilities, backward-compatible (e.g. adding schema metadata)
- **PATCH** — bug fixes and minor improvements

The version field lives inside each item's metadata (frontmatter or export object). There is no central version file.

### Schema change rules

| Change type | Version bump | Notes |
|---|---|---|
| Add optional input field | MINOR | Backward-compatible |
| Add required input field | MAJOR | Breaks callers that omit it |
| Remove input field | MAJOR | Breaks callers that supply it |
| Change output field type | MAJOR | Breaks callers that read it |
| Add output field | MINOR | Additive; old callers ignore it |
| Add `verify` hint | MINOR | Additive |

When making a MAJOR schema change, document the incompatibility in the PR description so runtime consumers (e.g. SolixAI core) can mirror the change.

### Backward compatibility

The SolixAI runtime loads items that lack `inputs`/`outputs`/`spec` with a **deprecation warning**.  
Schema presence will be **enforced** in a future major release. Contributors are encouraged to annotate all items now.

---

## Interface Schemas

As of **v1.1.0**, every marketplace item must ship explicit interface metadata so that any SolixAI runtime can validate and verify calls without executing the item.

> **This repository supplies the metadata. The runtime consumes it.**  
> No validation logic lives here.

### Skill schemas

Add `inputs`, `outputs`, and optionally `verify` to every skill's YAML frontmatter.

| Field | Required | Description |
|---|---|---|
| `inputs` | Yes | List of input parameter descriptors |
| `outputs` | Yes | Map of output field names to types |
| `verify` | No | Tool calls the runtime may issue post-execution (e.g. `filesystem.stat`) |

**Fully annotated example** ([skills/base/editing/skill.md](skills/base/editing/skill.md)):

```yaml
---
name: editing
version: "1.1.0"
contributor: base
description: "Describe and execute file modifications using the editor tool."
tags: [core, coding, file-management]

inputs:
  - name: filePath
    type: string
    required: true
    description: "Path to the file to modify."
  - name: change
    type: object
    required: true
    description: "Describes the edit to apply."
    properties:
      action:
        type: string
        enum: [replace, replace-all, insert-at-line, delete-lines]
      search:
        type: string
      replacement:
        type: string
      line:
        type: number
      content:
        type: string
      startLine:
        type: number
      endLine:
        type: number

outputs:
  ok: boolean
  path:
    type: string
    nullable: true
  error:
    type: string
    nullable: true

verify:
  - filesystem.stat
  - filesystem.read
---
```

### Tool schemas

Export a named `spec` object from every tool module alongside the default export.

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Must match the default export `name` |
| `version` | Yes | Must match the default export `version` |
| `inputSchema` | Yes | JSON Schema draft-07 object describing the `input` argument |
| `outputSchema` | Yes | JSON Schema draft-07 object describing the return value |
| `sideEffects` | No | `true` if the tool modifies external state (files, network, processes) |
| `verify` | No | Post-execution tool hints (e.g. `["filesystem.stat"]`) |

**Fully annotated example** ([tools/base/editor/tool.js](tools/base/editor/tool.js)):

```js
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
      },
      path: { type: "string" },
      search: { type: "string" },
      replacement: { type: "string" },
      line: { type: "number", minimum: 1 },
      content: { type: "string" },
      startLine: { type: "number", minimum: 1 },
      endLine: { type: "number", minimum: 1 },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      path: { type: "string" },
      insertedAt: { type: "number" },
      deletedRange: { type: "array", items: { type: "number" } },
      error: { type: "string" },
    },
  },
  sideEffects: true,
  verify: ["filesystem.read", "filesystem.stat"],
};
```

### Schema-driven version bumps

When you add or modify schema metadata without changing the item's behavior, bump the **MINOR** version.  
See the [Versioning](#versioning) section for the full compatibility matrix.

---

## Contribution Rules

### Adding a New Item

1. **Choose a category** — `skills`, `tools`, `ui-themes`, `triggers`, or `soul-templates`.
2. **Create your contributor folder** — `<category>/<your-contributor-name>/`.
3. **Create the item folder** — `<category>/<your-contributor-name>/<item-name>/`.
4. **Add the contract file** — `skill.md`, `tool.js`, `theme.json`, `trigger.json`, or `soul.md`.
5. **Ensure metadata matches folder names** — `name` must equal the item folder name; `contributor` must equal the contributor folder name.
6. **Submit a pull request**.

### Rules

- All folder names must be **kebab-case**.
- All metadata fields must match their corresponding folder names exactly.
- YAML frontmatter and JSON must be valid and parseable.
- Tools must **not** import SolixAI platform internals.
- Tools may include an optional `package.json` for third-party dependencies.
- Do **not** add runtime code, platform code, or example agents.
- One item per folder. One contract file per item.

### Item Contracts

Each category has a strict contract. See the individual sections below.

<details>
<summary><strong>Skill Contract</strong></summary>

File: `skill.md`

```yaml
---
name: string
version: string
contributor: string
description: string
tags: string[]     # optional

# Schema metadata (required as of v1.1.0)
inputs:
  - name: string
    type: string | number | boolean | object | array
    required: true | false
    description: string
    # for type=string with allowed values:
    enum: [value1, value2]
    # for type=object:
    properties:
      field: { type: string }
    # for type=array:
    items:
      type: string

outputs:
  fieldName: type
  # or
  fieldName:
    type: string
    nullable: true

verify:              # optional: tool calls the runtime may run post-execution
  - tool.action
---
# Free-form Markdown prompt content
```

</details>

<details>
<summary><strong>Tool Contract</strong></summary>

File: `tool.js`

```js
export default {
  name: "string",
  version: "string",
  contributor: "string",
  description: "string",
  run: async ({ input, context }) => {
    // implementation
  }
}

/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * Required as of v1.1.0.
 */
export const spec = {
  name: "string",
  version: "string",
  inputSchema: {
    type: "object",
    required: ["requiredField"],
    properties: {
      requiredField: { type: "string", description: "..." },
      optionalField: { type: "number", default: 10 },
    },
  },
  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      error: { type: "string", description: "Present when ok=false." },
    },
  },
  sideEffects: true,   // optional boolean
  verify: ["tool.action"],  // optional post-execution hints
};
```

Optional: `package.json` for dependencies.

</details>

<details>
<summary><strong>UI Theme Contract</strong></summary>

File: `theme.json`

```json
{
  "name": "string",
  "version": "string",
  "contributor": "string",
  "description": "string",
  "colors": {},
  "fonts": {},
  "layout": {}
}
```

</details>

<details>
<summary><strong>Trigger Contract</strong></summary>

File: `trigger.json`

```json
{
  "name": "string",
  "version": "string",
  "contributor": "string",
  "description": "string",
  "event": "cron | email | webhook | filesystem | custom",
  "config": {},
  "pipeline": [
    { "use": "skill-name", "with": {} },
    { "use": "tool-name", "with": {} }
  ]
}
```

</details>

<details>
<summary><strong>Soul Template Contract</strong></summary>

File: `soul.md`

```yaml
---
name: string
version: string
contributor: string
description: string
---
# Free-form Markdown content
```

</details>

---

## License

See [LICENSE](LICENSE) for details.
