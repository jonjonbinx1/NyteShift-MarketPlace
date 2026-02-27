---
name: editing
version: "1.0.0"
contributor: base
description: "Describe and execute file modifications using the editor tool."
tags:
  - core
  - coding
  - file-management
---

# Editing

When you need to modify a file, follow this structured approach to ensure safe, accurate edits.

## Process

1. **Read before writing.** Always inspect the current file contents before making changes. Use the `filesystem` tool to read the file.

2. **Identify the change.** Determine exactly what needs to change:
   - Which file?
   - Which section, function, or lines?
   - What is the current content?
   - What should the new content be?

3. **Choose the edit method.** Select the most appropriate `editor` tool action:
   - `replace` — Replace the first occurrence of an exact string.
   - `replace-all` — Replace all occurrences of a string.
   - `insert-at-line` — Insert new content at a specific line number.
   - `delete-lines` — Remove a range of lines.

4. **Construct the edit.** Build the tool input:
   - Use enough context in the search string to match uniquely.
   - Include surrounding lines if the target string is not unique.
   - Ensure the replacement preserves correct indentation and syntax.

5. **Apply the edit.** Run the `editor` tool with the chosen action.

6. **Verify the result.** Read the file again to confirm the edit was applied correctly. Check for:
   - Syntax errors
   - Broken indentation
   - Missing or duplicated content
   - Unintended side effects on surrounding code

## Guidelines

- Make one logical change at a time. Avoid large, multi-part edits in a single step.
- Prefer `replace` over `delete-lines` + `insert-at-line` when possible — it is safer.
- Never write a file without reading it first.
- If an edit fails (search string not found), re-read the file to understand the current state before retrying.
- Keep backups in mind — if the file is critical, consider reading its full contents into context before editing.

## Anti-patterns

- Editing a file you have not read.
- Using a search string that is too short and could match multiple locations.
- Making assumptions about line numbers without reading the file.
- Applying multiple unrelated edits without verifying between them.
