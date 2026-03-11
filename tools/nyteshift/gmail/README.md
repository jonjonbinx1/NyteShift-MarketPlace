# Gmail Tool — NyteShift README

## Overview

Integrates with Gmail via **IMAP** (reading) and **SMTP** (sending), authenticated with a **Gmail App Password**. No Google Cloud project, OAuth client ID, or browser consent flow is required.

## Prerequisites

1. Enable **2-Step Verification** on the Google account (required for App Passwords).
2. Go to **Google Account → Security → App passwords**.
3. Select "Mail" → "Other (custom name)" → Generate.
4. Copy the 16-character password shown (spaces are optional).

## Required credentials

| Config key    | Description                                      |
|---------------|--------------------------------------------------|
| `email`       | Full Gmail address, e.g. `you@gmail.com`         |
| `appPassword` | 16-character App Password (spaces are stripped)  |

## Servers

| Protocol | Host              | Port | Security    |
|----------|-------------------|------|-------------|
| IMAP     | imap.gmail.com    | 993  | TLS         |
| SMTP     | smtp.gmail.com    | 587  | STARTTLS    |

## Gmail IMAP mailbox paths

| Folder          | IMAP path              |
|-----------------|------------------------|
| Inbox           | `INBOX`                |
| Sent Mail       | `[Gmail]/Sent Mail`    |
| Drafts          | `[Gmail]/Drafts`       |
| All Mail        | `[Gmail]/All Mail`     |
| Trash           | `[Gmail]/Trash`        |
| Spam            | `[Gmail]/Spam`         |
| Starred         | `[Gmail]/Starred`      |
| Custom labels   | appear as top-level folders, e.g. `Work` |

## Tool configuration example

```json
{
  "email": "you@gmail.com",
  "appPassword": "abcd efgh ijkl mnop",
  "allowedOperations": ["read","search","send","reply","create-draft","move","delete","create-template","list-templates","list-mailboxes"],
  "maxResults": 20,
  "defaultMailbox": "INBOX",
  "trashOnDelete": true,
  "templateMailbox": "NyteShiftTemplates"
}
```

## npm dependencies

Install in this directory before running:

```bash
npm install
```

Packages: `imapflow`, `nodemailer`, `mailparser`.

Example runtime calls (payloads to the tool's `run` entry)
- Create a label (folder equivalent)
```json
{ "action": "createLabel", "name": "Project X" }
```
- List labels
```json
{ "action": "listLabels" }
```
- Move (label) and archive (remove INBOX)
```json
{ "action": "moveMessage", "messageId": "<MSG_ID>", "addLabelIds": ["<LABEL_ID>"], "removeLabelIds": ["INBOX"] }
```
- Create a template
```json
{ "action": "createTemplate", "name": "follow-up", "subject": "Follow-up", "body": "Hi, following up..." }
```

Security & best practices
- Store `clientSecret` and `refreshToken` as secrets; never commit them to source control.
- Limit OAuth scopes to the minimum set required by your use case.
- Use the tool's `allowedOperations` config to enforce least privilege at runtime even if OAuth scopes are broader.
- Rotate credentials regularly and revoke tokens if a machine or user is compromised.

Limits & behavior notes
- The Gmail API does not create a new system "Inbox" view; use labels as folder-equivalents. Labels appear as IMAP folders when IMAP is enabled.
- Some actions (e.g., modifying mailbox settings or Gmail UI features like Multiple Inboxes) are not supported by the Gmail REST API.
- The tool exchanges `refreshToken` for `access_token` at each run; ensure network access to `https://oauth2.googleapis.com/token`.

Troubleshooting
- `401` / `invalid_grant`: refresh token may be revoked or expired — generate a fresh refresh token.
- `insufficientPermissions`: verify the OAuth client was granted the requested scopes.
- If you see HTML or unexpected errors, enable request logging in your runtime and inspect API responses.

Next steps (optional)
- Add a small helper script to automate refresh-token generation for a local dev flow.
- Add integration tests (mock Gmail responses) to exercise each action.

File locations
- Gmail tool implementation: [tools/nyteshift/gmail/tool.js](tools/nyteshift/gmail/tool.js)
- Email skill: [skills/nyteshift/email/skill.md](skills/nyteshift/email/skill.md)
