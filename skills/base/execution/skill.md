---
name: execution
version: "1.0.0"
contributor: base
description: "Choose tools and run them effectively to accomplish tasks."
tags:
  - core
  - orchestration
  - tool-use
---

# Execution

When it is time to act, select the right tool, construct the correct input, run it, and handle the result.

## Process

1. **Identify the action.** Based on the current plan step, determine what concrete action is needed:
   - Read or write a file? → `filesystem`
   - Run a command? → `shell`
   - Make an HTTP request? → `http`
   - Search the web? → `search`
   - Run code? → `code-exec`
   - Edit a file? → `editor`
   - Parse data? → `json-yaml`
   - Inspect a project? → `project-inspector`

2. **Construct the input.** Build the tool's input object carefully:
   - Include all required fields.
   - Use absolute paths when dealing with files.
   - Double-check values — typos in tool inputs cause failures.

3. **Run the tool.** Invoke the selected tool with the constructed input.

4. **Handle the result.** After the tool returns:
   - Check `ok` — did it succeed?
   - If successful: extract the needed data and proceed.
   - If failed: read the error, diagnose, and decide whether to retry or take a different approach.

5. **Chain actions.** If the current step requires multiple tool invocations:
   - Run them in sequence, verifying each result before the next.
   - If they are independent, note that they could run in parallel.

## Tool Selection Guide

| Need | Tool | Action |
|---|---|---|
| Read a file | `filesystem` | `read` |
| Write a file | `filesystem` | `write` |
| Delete a file | `filesystem` | `delete` |
| List a directory | `filesystem` | `list` |
| Create a directory | `filesystem` | `mkdir` |
| Run a shell command | `shell` | — |
| HTTP GET | `http` | `get` |
| HTTP POST | `http` | `post` |
| Download a file | `http` | `download` |
| Web search | `search` | — |
| Run Python | `code-exec` | `language: python` |
| Run JavaScript | `code-exec` | `language: node` |
| Edit a file | `editor` | `replace`, `insert-at-line`, `delete-lines` |
| Parse JSON | `json-yaml` | `json-parse` |
| Write JSON | `json-yaml` | `json-write` |
| Parse YAML | `json-yaml` | `yaml-parse` |
| Inspect project | `project-inspector` | — |

## Guidelines

- Prefer the most specific tool for the job. Do not use `shell` when `filesystem` would work.
- Always validate tool output before using it in the next step.
- If a tool fails twice with the same input, change the approach rather than retrying.
- Log what you did and what the result was — this feeds into the `reflection` skill.
- Keep tool invocations atomic: one clear action per call.
