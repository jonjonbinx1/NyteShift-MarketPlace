# Gmail Tool — README

Purpose
- Integrates with the Gmail REST API (v1) using OAuth2 refresh-token flow.
- Provides read/search, send/reply, drafts, labels (folder-equivalent), move (add/remove labels), delete, and simple template management.

Quick summary of required credentials
- `clientId` — OAuth 2.0 Client ID
- `clientSecret` — OAuth 2.0 Client Secret (store as secret)
- `refreshToken` — OAuth2 refresh token for the account (store as secret)
- `userEmail` — Mailbox address to target (default: `me`)

Required OAuth scopes (only request what you need)
- read/search: `https://www.googleapis.com/auth/gmail.readonly`
- send/reply: `https://www.googleapis.com/auth/gmail.send`
- create-draft: `https://www.googleapis.com/auth/gmail.compose`
- modify/move/labels/delete/templates: `https://www.googleapis.com/auth/gmail.modify`

Generating a refresh token (recommended: use Google OAuth Playground for testing)
1. Open: https://developers.google.com/oauthplayground
2. Click the gear icon → check "Use your own OAuth credentials" and paste your `clientId` and `clientSecret`.
3. In Step 1, enter the scopes you need (see list above), then "Authorize APIs" and complete sign-in.
4. In Step 2, click "Exchange authorization code for tokens". Copy the `refresh_token` value.

Manual exchange (example curl to exchange an auth code for tokens)
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=AUTHORIZATION_CODE \
  -d grant_type=authorization_code \
  -d redirect_uri=YOUR_REDIRECT_URI
```
Response contains `access_token` and `refresh_token` (if `access_type=offline` and consent allowed).

Tool configuration example (tool settings / runtime config)
```json
{
  "clientId": "your-client-id.apps.googleusercontent.com",
  "clientSecret": "<secret>",
  "refreshToken": "<secret>",
  "userEmail": "me",
  "allowedOperations": ["read","search","label","move","send","reply","create-draft","create-template","list-templates"],
  "maxResults": 20,
  "templateLabel": "SolixTemplates",
  "trashOnDelete": true
}
```

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
- Gmail tool implementation: [tools/solix/gmail/tool.js](tools/solix/gmail/tool.js)
- Email skill: [skills/solix/email/skill.md](skills/solix/email/skill.md)
