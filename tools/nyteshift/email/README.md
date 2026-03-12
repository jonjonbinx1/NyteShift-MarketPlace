# NyteShift Email Tool (Beta)

Generic IMAP/SMTP email tool with optional OAuth2 (XOAUTH2) support for multiple providers (Microsoft, Google, etc.).

This tool provides message listing, searching, reading, moving, deleting, drafting, and sending via IMAP/SMTP. It supports both traditional username/password (including app passwords) and OAuth2 access/refresh tokens for providers that require modern authentication.

WARNING: Beta — OAuth behavior and token refresh are experimental. Test with a non-critical account.

## Features
- List mailboxes
- List messages (paged)
- Search messages (IMAP SEARCH)
- Get message (full MIME parsing)
- Mark read / unread
- Move / delete (moves to configured trash mailbox)
- Send / reply messages (SMTP)
- Create drafts (append raw message to drafts mailbox)

## OAuth2 (Beta)

- Supports refresh-token based flows. If configured with a `refresh_token` (and `client_id`), the tool will attempt to refresh access tokens automatically.
- Default token endpoints:
  - Microsoft: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
  - Google: `https://oauth2.googleapis.com/token`
- You may supply a custom `oauthTokenUrl` in the config.
- Token refresh requires either Node 18+ (global `fetch`) or the `node-fetch` package available at runtime.

## Configuration

Configure via the UI or by editing `~/.nyteshift/config.json` under `toolConfig['nyteshift/email']`.

Important configuration keys:

- `email` (string) — account email address.
- `password` (secret) — account password or app password (used when OAuth is not configured).
- `imapHost`, `imapPort` — IMAP server (defaults to `outlook.office365.com:993`).
- `smtpHost`, `smtpPort` — SMTP server (defaults to `smtp.office365.com:587`).
- `defaultMailbox` — default IMAP mailbox (default: `INBOX`).
- `trashMailbox` — mailbox to move deleted messages to (default: `Deleted Items`).
- `draftsMailbox` — mailbox used for drafts (default: `Drafts`).

OAuth keys (optional):

- `useOAuth` (boolean) — enable OAuth mode.
- `oauthProvider` (string) — `microsoft` or `google` (used to pick default token URL).
- `oauthClientId` (string) — OAuth client/application id.
- `oauthClientSecret` (secret) — OAuth client secret (if applicable).
- `oauthRefreshToken` (secret) — Refresh token used to obtain new access tokens.
- `oauthAccessToken` (secret) — Optional preconfigured access token (in-memory).
- `oauthTokenUrl` (string) — Optional token endpoint override.
- `oauthTenantId` (string) — Microsoft tenant id (default `common`).

Example `~/.nyteshift/config.json` snippet:

```json
{
  "toolConfig": {
    "nyteshift/email": {
      "email": "you@company.com",
      "useOAuth": true,
      "oauthProvider": "microsoft",
      "oauthClientId": "YOUR_CLIENT_ID",
      "oauthClientSecret": "YOUR_CLIENT_SECRET",
      "oauthRefreshToken": "YOUR_REFRESH_TOKEN",
      "imapHost": "outlook.office365.com",
      "smtpHost": "smtp.office365.com",
      "defaultMailbox": "INBOX",
      "trashMailbox": "Deleted Items"
    }
  }
}
```

## Package and Dependencies

A `package.json` has been added to this tool folder at `tools/nyteshift/email/package.json`.

Dependencies included:

- `imapflow` — IMAP client used for mailbox operations
- `nodemailer` — SMTP sending and raw message building
- `mailparser` — MIME parsing
- `node-fetch` — optional: used for token refresh on Node <18 (fetch is preferred when available)

Install dependencies by running in the tool folder:

```bash
cd tools/nyteshift/email
npm install
```

## Usage examples

- List mailboxes:

```json
{ "action": "listMailboxes" }
```

- List messages (paged):

```json
{ "action": "listMessages", "mailbox": "INBOX", "page": 1, "limit": 20 }
```

- Search messages:

```json
{ "action": "searchMessages", "query": "from:alice@example.com is:unread" }
```

- Send a message:

```json
{ "action": "sendMessage", "to": "bob@example.com", "subject": "Hi", "body": "Hello" }
```

## Notes & Limitations

- Many Exchange Online tenants disable IMAP basic auth; OAuth2 or Microsoft Graph API may be required.
- Refreshed tokens are stored in-memory only. For persistence, add tokens to `~/.nyteshift/config.json` or request persistence support.
- This implementation aims to be provider-agnostic but may need provider-specific tweaks.

## Beta / Feedback

This feature is experimental. Report issues, token refresh failures, or provider-specific problems so it can be improved.

---

File: tools/nyteshift/email/tool.js
