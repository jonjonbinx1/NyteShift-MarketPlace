---
name: email
version: "2.0.0"
contributor: solix
description: "Read, compose, send, organise and template emails using any connected mail provider."
tags:
  - communication
  - email
  - productivity

inputs:
  - name: goal
    type: string
    required: true
    description: "What the agent should accomplish (e.g. 'summarise unread emails', 'reply to Alice', 'draft a follow-up')."
  - name: providerTool
    type: string
    required: false
    default: gmail
    description: "Name of the mail provider tool to use (e.g. gmail). Falls back to the configured default."
  - name: context
    type: object
    required: false
    description: "Optional extra context such as mailbox path, message UID, or sender filter."

outputs:
  goal: string
  actions:
    type: array
    items:
      type: object
      properties:
        action: { type: string }
        result: { type: string }
  summary: string
  nextSteps:
    type: array
    items:
      type: string
    nullable: true

verify: []

config:
  - key: defaultProvider
    label: Default Mail Provider
    type: select
    options:
      - gmail
      - outlook
      - imap
    default: gmail
    description: Mail provider tool to call when none is specified at runtime.

  - key: allowedOperations
    label: Allowed Operations
    type: multiselect
    options:
      - read
      - search
      - send
      - reply
      - create-draft
      - move
      - delete
      - create-template
      - list-templates
      - list-mailboxes
    default:
      - read
      - search
    description: >
      Restrict which mail operations this skill may invoke.
      The agent will refuse to perform any operation not listed here.

  - key: maxMessagesToRead
    label: Max Messages to Read
    type: number
    default: 20
    min: 1
    max: 200
    step: 5
    description: Maximum number of messages the skill will fetch in a single list or search operation.

  - key: markReadOnFetch
    label: Mark as Read on Fetch
    type: boolean
    default: false
    description: Automatically mark messages as read when they are fetched by the agent.

  - key: summaryStyle
    label: Summary Style
    type: select
    options:
      - concise
      - detailed
      - bullets
    default: concise
    description: How to present email summaries to the user.

  - key: confirmBeforeSend
    label: Confirm Before Sending
    type: boolean
    default: true
    description: >
      Pause and ask the user for approval before issuing any send, reply,
      or create-draft action. Recommended when running autonomously.
---

# Email

Use this skill whenever the goal involves interacting with a user's email: reading messages, searching threads, composing new mail, replying, organising with labels, moving messages, or working with templates.

## Principles

- **Only perform operations the user has enabled.** Check `allowedOperations` before every action. If an operation is not permitted, explain the restriction and ask the user to adjust settings.
- **Respect privacy.** Never log, store, or forward message body content beyond what is required to complete the current goal.
- **Confirm destructive actions.** Always confirm with the user before sending, deleting, or permanently moving messages, especially when `confirmBeforeSend` is true.
- **Prefer the least-privilege path.** If a goal can be achieved by reading alone, do not compose or send.

## Process

### 1. Identify the intent

Parse `goal` into one or more discrete mail operations. Common intents:

| User says | Operations needed |
|-----------|------------------|
| "show my unread emails" | `read`, `search` |
| "reply to the last message from Alice" | `read`, `reply` |
| "summarise the project thread" | `read` |
| "send a follow-up to Bob" | `send` / `create-draft` |
| "archive anything from newsletters" | `move`, `label` |
| "save a weekly-status template" | `create-template` |

### 2. Verify permissions

Before calling the provider tool, verify that every required operation is included in `allowedOperations`. If any is missing:

```
This action requires the "<operation>" permission, which is not currently enabled.
Please enable it in the Email skill settings and try again.
```

### 3. Gather context

Use `search` or `list` to locate the relevant messages before composing or acting. Always prefer targeted queries (sender, subject, date range) over fetching the full inbox.

### 4. Act & confirm

- For **read / search**: execute immediately and present results using `summaryStyle`.
- For **send / reply / draft**: draft the content first, present it to the user for review (if `confirmBeforeSend` is true), then submit.
- For **move / label / delete**: state the scope of the change ("12 messages will be archived") before executing.
- For **templates**: list existing templates before creating a new one to avoid duplicates.

### 5. Summarise

After completing all actions, produce a brief plain-language summary:

```
Summary:
- Read 8 unread messages from the last 24 hours.
- Found 2 messages from Alice requiring a reply.
- Drafted reply to Alice's "Project Kickoff" thread — awaiting your approval.

Next steps:
- Approve or edit the draft reply.
- Review the 3 promotional emails flagged for archiving.
```

## Output Format

```
Goal: <what was requested>

Actions taken:
1. <action> — <outcome>
2. <action> — <outcome>

Summary:
<plain-language summary>

Next steps:
- <item>
```

## Guidelines

- Limit fetched messages to `maxMessagesToRead` per operation.
- When summarising messages, include: sender, date, subject, and a one-sentence synopsis. Never output full message bodies unless explicitly requested.
- If the provider tool returns an auth error, instruct the user to re-authenticate rather than retrying automatically.
- Treat all email addresses and message contents as sensitive PII.
- Do not infer or guess email addresses — always retrieve them from the message data.
