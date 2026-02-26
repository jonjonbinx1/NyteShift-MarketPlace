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
- **MINOR** — new capabilities, backward-compatible
- **PATCH** — bug fixes and minor improvements

The version field lives inside each item's metadata (frontmatter or export object). There is no central version file.

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
