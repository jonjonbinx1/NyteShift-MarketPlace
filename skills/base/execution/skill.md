---
name: execution
version: "1.1.0"
contributor: base
description: "Choose tools and run them effectively to accomplish tasks."
tags:
  - core
  - orchestration
  - tool-use

inputs:
  - name: planStep
    type: string
    required: true
    description: "The current plan step to execute."
  - name: availableTools
    type: array
    required: false
    items:
      type: string
    description: "Names of tools available to the agent."
  - name: previousResult
    type: object
    required: false
    description: "Output from the previous tool invocation, for context chaining."

outputs:
  tool: string
  input:
    type: object
    description: "The exact input object passed to the tool."
  result:
    type: object
    description: "The raw output returned by the tool."
    properties:
      ok: { type: boolean }
      error: { type: string, nullable: true }

verify: []

config:
  - key: retryOnFailure
    label: Retry on Failure
    type: boolean
    default: true
    description: Automatically retry a failed tool call before reporting an error.
  - key: maxRetries
    label: Max Retries
    type: number
    default: 2
    min: 0
    max: 10
    step: 1
    description: Maximum number of retry attempts for a failed tool invocation.
  - key: parallelExecution
    label: Parallel Execution
    type: boolean
    default: false
    description: Allow independent tool calls to run in parallel when possible.
  - key: verboseLogging
    label: Verbose Logging
    type: boolean
    default: false
    description: Log detailed tool inputs and outputs for debugging.
  - key: defaultTimeout
    label: Default Timeout (ms)
    type: number
    default: 30000
    min: 1000
    max: 300000
    step: 1000
    description: Default timeout in milliseconds for tool invocations.
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
