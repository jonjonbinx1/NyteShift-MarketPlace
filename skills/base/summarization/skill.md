---
name: summarization
version: "1.1.0"
contributor: base
description: "Condense long context into concise, accurate summaries."
tags:
  - core
  - reasoning
  - context-management

inputs:
  - name: content
    type: string
    required: true
    description: "The text, data, or context to summarize."
  - name: purpose
    type: string
    required: false
    description: "Why the summary is needed; shapes what is preserved."
  - name: maxLength
    type: number
    required: false
    description: "Target maximum character or token length for the summary."

outputs:
  summary:
    type: array
    items:
      type: string
    description: "Bullet-point list of key findings."
  openQuestions:
    type: array
    items:
      type: string
    nullable: true
    description: "Unresolved items identified during summarization."

verify: []
---

# Summarization

When context grows too long or you need to distill information, produce a concise summary that preserves essential meaning.

## When to Summarize

- File contents exceed what is needed for the current step.
- A research phase produced many results that need distillation.
- Conversation history is long and you need to recall key decisions.
- You need to report progress or results to the user.

## Process

1. **Identify the purpose.** Why is this summary needed? What question should it answer?

2. **Extract key facts.** Pull out:
   - Main conclusions or findings
   - Important data points, names, paths, or values
   - Decisions that were made
   - Open questions or unknowns

3. **Discard noise.** Remove:
   - Redundant information
   - Intermediate reasoning that is no longer needed
   - Verbose formatting or boilerplate

4. **Organize.** Structure the summary logically:
   - Lead with the most important finding
   - Group related facts together
   - Use bullet points for lists of items

5. **Verify accuracy.** Ensure the summary does not misrepresent the source. Do not infer facts that were not present.

## Output Format

```
Summary:
- <key point 1>
- <key point 2>
- ...

Open questions:
- <anything unresolved>
```

## Guidelines

- Aim for 20–30% of the original length unless told otherwise.
- Preserve exact values (paths, numbers, names) — do not paraphrase data.
- Summaries are lossy by nature. When in doubt, keep the fact.
- Attribute information to its source when summarizing multiple inputs.
