---
name: reflection
version: "1.1.0"
contributor: base
description: "Evaluate whether the last step succeeded and decide what to do next."
tags:
  - core
  - reasoning
  - self-evaluation

inputs:
  - name: lastStep
    type: string
    required: true
    description: "Description of the step that was just executed."
  - name: toolResult
    type: object
    required: true
    description: "The raw output returned by the tool or action."
    properties:
      ok: { type: boolean }
      error: { type: string, nullable: true }
  - name: currentPlan
    type: array
    required: false
    description: "The remaining planned steps, if available."
    items:
      type: object

outputs:
  lastStep: string
  result:
    type: string
    enum: [success, partial, failure]
  observation: string
  nextAction: string
  planChange:
    type: string
    nullable: true

verify: []
---

# Reflection

After completing any action or step, pause and reflect before proceeding. Reflection prevents cascading errors and ensures steady progress.

## Process

1. **Review the outcome.** Look at the result of the last action:
   - Did it return the expected output?
   - Were there errors, warnings, or unexpected side effects?
   - Did the output match the success criteria from the plan?

2. **Classify the result.**
   - **Success** — The step completed as intended. Move to the next step.
   - **Partial success** — Some parts worked but others did not. Identify what remains.
   - **Failure** — The step did not produce the desired result. Diagnose why.

3. **Diagnose failures.** If the step failed:
   - Re-read the error message carefully.
   - Check inputs—were they correct?
   - Check assumptions—did the environment match expectations?
   - Determine whether to retry, adjust, or skip.

4. **Decide next action.**
   - If successful: proceed to the next planned step.
   - If partially successful: complete the remaining parts, then proceed.
   - If failed: fix the root cause and retry, or revise the plan.

5. **Update the plan.** If reflection reveals a flaw in the original plan, revise it before continuing.

## Output Format

```
Last step: <description>
Result: success | partial | failure
Observation: <what happened>
Next action: <what to do next>
Plan change: <none | description of revision>
```

## Guidelines

- Never skip reflection after a tool invocation.
- Be honest about failures — hiding them leads to compounding errors.
- If you are stuck after two retries, step back and reconsider the approach.
- Use reflection to confirm you are still on track toward the original goal.
