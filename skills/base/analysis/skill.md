---
name: analysis
version: "1.1.0"
contributor: base
description: "Reason about tasks, constraints, trade-offs, and next actions."
tags:
  - core
  - reasoning
  - decision-making

inputs:
  - name: question
    type: string
    required: true
    description: "The decision or problem to analyze."
  - name: evidence
    type: array
    required: false
    items:
      type: string
    description: "Known facts or observations relevant to the question."
  - name: options
    type: array
    required: false
    items:
      type: string
    description: "Candidate options or courses of action to evaluate."

outputs:
  question: string
  options:
    type: array
    items:
      type: object
      properties:
        option: { type: string }
        feasibility: { type: string, enum: [high, medium, low] }
        risk: { type: string, enum: [high, medium, low] }
        impact: { type: string, enum: [high, medium, low] }
  recommendation: string
  reasoning: string
  unknowns:
    type: array
    items:
      type: string
    nullable: true

verify: []

config:
  - key: depth
    label: Analysis Depth
    type: select
    options:
      - quick
      - standard
      - thorough
    default: standard
    description: How deeply to evaluate each option. "thorough" adds effort/risk matrices.
  - key: outputFormat
    label: Output Format
    type: select
    options:
      - structured
      - narrative
      - bullets
    default: structured
    description: Presentation style for the analysis output.
  - key: includeUnknowns
    label: Include Unknowns
    type: boolean
    default: true
    description: Explicitly list unknowns and assumptions in the output.
  - key: maxOptions
    label: Max Options to Evaluate
    type: number
    default: 5
    min: 2
    max: 20
    step: 1
    description: Maximum number of candidate options to evaluate per analysis.
---

# Analysis

When facing a decision, evaluating options, or diagnosing a problem, apply structured analytical reasoning.

## Process

1. **Frame the question.** State clearly what you are analyzing:
   - What decision needs to be made?
   - What problem needs to be understood?
   - What trade-offs are involved?

2. **Gather evidence.** Collect relevant facts:
   - Read files, inspect errors, check documentation.
   - Note what is known vs. what is assumed.

3. **Identify options.** List the possible courses of action or interpretations.

4. **Evaluate each option.** For each, consider:
   - **Feasibility** — Can it be done with available tools and context?
   - **Risk** — What could go wrong?
   - **Impact** — How well does it solve the problem?
   - **Effort** — How many steps or resources does it require?

5. **Recommend.** Choose the best option and explain why. If multiple options are equally viable, state the trade-off and pick one.

6. **Identify unknowns.** Explicitly note anything you are uncertain about.

## Output Format

```
Question: <what is being analyzed>

Options:
1. <option> — feasibility: high/med/low, risk: high/med/low, impact: high/med/low
2. <option> — ...

Recommendation: <chosen option>
Reasoning: <why this option is best>
Unknowns: <list>
```

## Guidelines

- Separate facts from assumptions. Label each clearly.
- Avoid analysis paralysis — if two options are close, pick one and move forward.
- Prefer reversible decisions over irreversible ones.
- If you lack information to analyze effectively, plan a discovery step first.
