/**
 * Gmail Tool — SolixAI Marketplace
 * Contributor : solix
    // If runtime configuration explicitly enables the in-process callback
    // server, use the previous behavior. Otherwise avoid starting a server in
    // the main process to prevent blocking the UI. The UI or operator can
    // instead open the returned `authUrl` and use the helper script to
    // exchange the code for a refresh token.
    const useCallbackServer = !!cfg.useCallbackServer;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `http://localhost:${port}/oauth2callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', defaultScopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    const urlStr = authUrl.toString();

    console.log('[gmail] useCallbackServer=', useCallbackServer);
    if (!useCallbackServer) {
      console.log('[gmail] not starting in-process callback server; returning authUrl immediately');
      return { ok: true, authUrl: urlStr, message: 'Open this URL in your browser to complete Gmail consent. Use tools/solix/gmail/get_refresh_token.js to exchange the code for a refresh token if needed.' };
    }

    console.log('[gmail] useCallbackServer=true — starting legacy in-process server');
    // FALLBACK: previous behavior (kept for compatibility) — start server.
    return new Promise((resolve) => {
      const http = require('node:http');

      const server = http.createServer(async (req, res) => {
        console.log('[gmail] incoming HTTP request:', req.url);
        try {
          const u = new URL(req.url, `http://localhost:${port}`);
          if (u.pathname !== '/oauth2callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          const code = u.searchParams.get('code');
          const error = u.searchParams.get('error');
          console.log('[gmail] oauth callback parameters, code?', !!code, 'error?', !!error);
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`Error from provider: ${error}`);
            server.close();
            console.error('[gmail] oauth provider error:', error);
            resolve({ ok: false, error });
            return;
          }
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing code in callback.');
            server.close();
            console.error('[gmail] missing code in callback');
            resolve({ ok: false, message: 'Missing code in callback.' });
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Authorization received. You can close this tab.');

          // Exchange code for tokens
          try {
            console.log('[gmail] exchanging code for tokens');
            const tokenRes = await fetch(TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret ? '***REDACTED***' : '',
                code,
                grant_type: 'authorization_code',
                redirect_uri: `http://localhost:${port}/oauth2callback`,
              }),
            });
            const data = await tokenRes.json();
            console.log('[gmail] token endpoint responded, status=', tokenRes.status);
            server.close();
            if (!tokenRes.ok) {
              console.error('[gmail] token exchange failed:', data);
              resolve({ ok: false, error: data });
              return;
            }
            const refreshToken = data.refresh_token ?? null;
            if (!refreshToken) {
              console.error('[gmail] no refresh_token in response', data);
              resolve({ ok: false, message: 'No refresh_token returned. Ensure access_type=offline and prompt=consent were used.', data});
              return;
            }
            console.log('[gmail] obtained refresh token (preview):', refreshToken.slice(0,8) + '…');
            resolve({ ok: true, message: `Refresh token obtained: ${refreshToken.slice(0,8)}…`, refreshToken });
          } catch (e) {
            console.error('[gmail] error exchanging token:', e);
            server.close();
            resolve({ ok: false, error: e.message ?? String(e) });
          }
        } catch (e) {
          console.error('[gmail] unexpected error in request handler:', e);
          server.close();
          resolve({ ok: false, error: e.message ?? String(e) });
        }
      });

      let settled = false;
      const finish = (resObj) => {
        if (settled) return;
        settled = true;
        try { resolve(resObj); } catch (e) { /* ignore */ }
      };

      server.once('listening', () => {
        console.log('[gmail] server listening on port', port);
        finish({ ok: true, authUrl: urlStr, message: 'Open this URL in your browser to complete Gmail consent.' });
      });

      server.once('error', (err) => {
        console.error('[gmail] server error while binding port:', err?.message ?? err);
        finish({ ok: false, error: err?.message ?? String(err), authUrl: urlStr, message: 'Failed to bind callback port. Open the URL manually and use the helper script if needed.' });
      });

      const timeout = setTimeout(() => {
        console.warn('[gmail] listen timed out after 5s');
        finish({ ok: false, error: 'listen_timeout', authUrl: urlStr, message: 'Timed out while binding callback port; open the URL manually.' });
      }, 5000);

      try {
        server.listen(port);
      } catch (e) {
        console.error('[gmail] synchronous server.listen threw:', e);
        finish({ ok: false, error: e?.message ?? String(e), authUrl: urlStr, message: 'Failed to start callback server synchronously.' });
      }
    });

  config: [
    // ── Authentication ──────────────────────────────────────────────────────
    {
      key: "clientId",
      label: "OAuth 2.0 Client ID",
      type: "string",
      placeholder: "your-client-id.apps.googleusercontent.com",
      description:
        "Google OAuth 2.0 Client ID. Create credentials at console.cloud.google.com → APIs & Services → Credentials.",
    },
    {
      key: "clientSecret",
      label: "OAuth 2.0 Client Secret",
      type: "secret",
      placeholder: "GOCSPX-…",
      description: "OAuth 2.0 Client Secret for the above Client ID.",
    },
    {
      key: "refreshToken",
      label: "OAuth 2.0 Refresh Token",
      type: "secret",
      placeholder: "1//0g…",
      description:
        "Long-lived refresh token obtained via the OAuth consent flow. " +
        "Use the Google OAuth Playground (oauth.googleapis.com/oauthplayground) to generate one.",
    },
    {
      key: "userEmail",
      label: "Mailbox Address",
      type: "string",
      placeholder: "you@gmail.com",
      description:
        "The Gmail address to operate on. Use 'me' to always target the authenticated account.",
      default: "me",
    },

    // ── Permission gates ─────────────────────────────────────────────────────
    {
      key: "allowedOperations",
      label: "Allowed Operations",
      type: "multiselect",
      options: [
        "read",
        "search",
        "send",
        "reply",
        "create-draft",
        "move",
        "label",
        "delete",
        "create-template",
        "list-templates",
      ],
      default: ["read", "search"],
      description:
        "Controls which Gmail operations the agent is permitted to perform. " +
        "Operations not listed here will be refused at runtime, even if the OAuth scope allows them.",
    },

    // ── Behaviour ────────────────────────────────────────────────────────────
    {
      key: "maxResults",
      label: "Max Messages per Request",
      type: "number",
      default: 20,
      min: 1,
      max: 500,
      step: 5,
      description: "Maximum number of messages returned by list and search actions.",
    },
    {
      key: "defaultQuery",
      label: "Default List Filter",
      type: "string",
      placeholder: "in:inbox is:unread",
      default: "in:inbox",
      description: "Gmail search query applied when no explicit query is provided to listMessages.",
    },
    {
      key: "templateLabel",
      label: "Template Label Name",
      type: "string",
      default: "SolixTemplates",
      description:
        "Gmail label used to tag messages stored as reusable templates. " +
        "The label will be created automatically if it does not exist.",
    },
    {
      key: "refreshCredentials",
      label: "Refresh credentials",
      type: "action",
      actionLabel: "Re-authenticate",
      actionConfirmText:
        "This will open a browser window to complete OAuth and return a refresh token. Continue?",
      actionCode: `// Runs the local helper to perform an OAuth consent flow and return a refresh token.
import { spawnSync } from 'node:child_process';
// The runtime will execute the tool's configAction when the user confirms.
`,
    },
    {
      key: "useCallbackServer",
      label: "Use in-process callback server",
      type: "boolean",
      default: false,
      description:
        "When true the tool will start a local HTTP server to receive the OAuth callback and complete token exchange automatically. " +
        "Default is false to avoid blocking UI processes — prefer using the helper script or pasting the code manually.",
    },
    {
      key: "trashOnDelete",
      label: "Trash Instead of Permanent Delete",
      type: "boolean",
      default: true,
      description:
        "When true, 'delete' moves messages to Trash rather than permanently expunging them.",
    },
    {
      key: "includeSpamTrash",
      label: "Include Spam & Trash in Search",
      type: "boolean",
      default: false,
      description: "Include Spam and Trash folders when searching messages.",
    },
  ],

  // ── run ─────────────────────────────────────────────────────────────────────

  run: async ({ input, context }) => {
    const cfg = context?.config ?? {};
    const { action } = input;

    // Resolve credentials
    const clientId     = cfg.clientId     ?? input.clientId;
    const clientSecret = cfg.clientSecret ?? input.clientSecret;
    const refreshToken = cfg.refreshToken ?? input.refreshToken;

    if (!clientId || !clientSecret || !refreshToken) {
      return {
        ok: false,
        error:
          "Gmail tool is not configured. " +
          "Set clientId, clientSecret, and refreshToken in the tool settings.",
       };
    }

    let accessToken;
    try {
      accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
    } catch (err) {
      return { ok: false, error: `Authentication failed: ${err.message}` };
    }

    const call = (path, opts) => gmailFetch(accessToken, path, opts);
    const maxResults = cfg.maxResults ?? 20;

    try {
      switch (action) {

        // ── READ ──────────────────────────────────────────────────────────────

        case "listMessages": {
          assertAllowed(cfg, "read");
          const q       = input.query ?? cfg.defaultQuery ?? "in:inbox";
          const include = cfg.includeSpamTrash ? "&includeSpamTrash=true" : "";
          const data    = await call(
            `/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}${include}`
          );
          const messages = data.messages ?? [];
          // Fetch metadata for each message (parallel, capped)
          const detailed = await Promise.all(
            messages.slice(0, maxResults).map((m) =>
              call(`/messages/${m.id}?format=metadata&metadataHeaders=From,To,Subject,Date`)
            )
          );
          return {
            ok: true,
            total: data.resultSizeEstimate ?? messages.length,
            messages: detailed.map((m) => ({
              id:      m.id,
              threadId: m.threadId,
              from:    header(m.payload?.headers, "From"),
              to:      header(m.payload?.headers, "To"),
              subject: header(m.payload?.headers, "Subject"),
              date:    header(m.payload?.headers, "Date"),
              snippet: m.snippet,
              labelIds: m.labelIds,
            })),
          };
        }

        case "getMessage": {
          assertAllowed(cfg, "read");
          if (!input.messageId) throw new Error("messageId is required.");
          const m = await call(`/messages/${input.messageId}?format=full`);
          return {
            ok: true,
            id:       m.id,
            threadId: m.threadId,
            from:     header(m.payload?.headers, "From"),
            to:       header(m.payload?.headers, "To"),
            subject:  header(m.payload?.headers, "Subject"),
            date:     header(m.payload?.headers, "Date"),
            body:     extractBody(m.payload),
            labelIds: m.labelIds,
            snippet:  m.snippet,
          };
        }

        case "searchMessages": {
          assertAllowed(cfg, "search");
          if (!input.query) throw new Error("query is required.");
          const include = cfg.includeSpamTrash ? "&includeSpamTrash=true" : "";
          const data    = await call(
            `/messages?maxResults=${maxResults}&q=${encodeURIComponent(input.query)}${include}`
          );
          const messages = data.messages ?? [];
          const detailed = await Promise.all(
            messages.slice(0, maxResults).map((m) =>
              call(`/messages/${m.id}?format=metadata&metadataHeaders=From,To,Subject,Date`)
            )
          );
          return {
            ok: true,
            query: input.query,
            total: data.resultSizeEstimate ?? messages.length,
            messages: detailed.map((m) => ({
              id:      m.id,
              threadId: m.threadId,
              from:    header(m.payload?.headers, "From"),
              to:      header(m.payload?.headers, "To"),
              subject: header(m.payload?.headers, "Subject"),
              date:    header(m.payload?.headers, "Date"),
              snippet: m.snippet,
            })),
          };
        }

        // ── SEND / REPLY / DRAFT ─────────────────────────────────────────────

        case "sendMessage": {
          assertAllowed(cfg, "send");
          if (!input.to || !input.subject || !input.body) {
            throw new Error("to, subject, and body are required.");
          }
          const raw = toBase64Url(buildMimeMessage(input));
          const sent = await call("/messages/send", {
            method: "POST",
            body:   { raw },
          });
          return { ok: true, id: sent.id, threadId: sent.threadId, labelIds: sent.labelIds };
        }

        case "replyMessage": {
          assertAllowed(cfg, "reply");
          if (!input.messageId || !input.body) {
            throw new Error("messageId and body are required.");
          }
          // Fetch original to get headers
          const orig = await call(`/messages/${input.messageId}?format=metadata&metadataHeaders=From,To,Subject,Message-ID`);
          const origFrom    = header(orig.payload?.headers, "From");
          const origSubject = header(orig.payload?.headers, "Subject");
          const origMsgId   = header(orig.payload?.headers, "Message-ID");
          const subject     = input.subject ?? (origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`);
          const raw = toBase64Url(buildMimeMessage({
            to:               input.to ?? origFrom,
            subject,
            body:             input.body,
            replyToMessageId: origMsgId,
            cc:               input.cc,
          }));
          const sent = await call("/messages/send", {
            method: "POST",
            body:   { raw, threadId: orig.threadId },
          });
          return { ok: true, id: sent.id, threadId: sent.threadId };
        }

        case "createDraft": {
          assertAllowed(cfg, "create-draft");
          if (!input.to || !input.subject || !input.body) {
            throw new Error("to, subject, and body are required.");
          }
          const raw   = toBase64Url(buildMimeMessage(input));
          const draft = await call("/drafts", {
            method: "POST",
            body:   { message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } },
          });
          return { ok: true, draftId: draft.id, messageId: draft.message?.id };
        }

        // ── LABELS ────────────────────────────────────────────────────────────

        case "listLabels": {
          assertAllowed(cfg, "label");
          const data = await call("/labels");
          return {
            ok: true,
            labels: (data.labels ?? []).map((l) => ({
              id:   l.id,
              name: l.name,
              type: l.type,
            })),
          };
        }

        case "createLabel": {
          assertAllowed(cfg, "label");
          if (!input.name) throw new Error("name is required.");
          const label = await call("/labels", {
            method: "POST",
            body:   { name: input.name, labelListVisibility: "labelShow", messageListVisibility: "show" },
          });
          return { ok: true, id: label.id, name: label.name };
        }

        case "addLabel": {
          assertAllowed(cfg, "label");
          if (!input.messageId || !input.labelIds?.length) {
            throw new Error("messageId and labelIds[] are required.");
          }
          await call(`/messages/${input.messageId}/modify`, {
            method: "POST",
            body:   { addLabelIds: input.labelIds },
          });
          return { ok: true, messageId: input.messageId, addedLabels: input.labelIds };
        }

        case "removeLabel": {
          assertAllowed(cfg, "label");
          if (!input.messageId || !input.labelIds?.length) {
            throw new Error("messageId and labelIds[] are required.");
          }
          await call(`/messages/${input.messageId}/modify`, {
            method: "POST",
            body:   { removeLabelIds: input.labelIds },
          });
          return { ok: true, messageId: input.messageId, removedLabels: input.labelIds };
        }

        // ── MOVE ─────────────────────────────────────────────────────────────

        case "moveMessage": {
          assertAllowed(cfg, "move");
          if (!input.messageId) throw new Error("messageId is required.");
          // Gmail 'move' = remove current location label, add destination label
          const addLabels    = input.addLabelIds    ?? [];
          const removeLabels = input.removeLabelIds ?? [];
          if (!addLabels.length && !removeLabels.length) {
            throw new Error("Provide at least one of addLabelIds or removeLabelIds.");
          }
          await call(`/messages/${input.messageId}/modify`, {
            method: "POST",
            body:   { addLabelIds: addLabels, removeLabelIds: removeLabels },
          });
          return { ok: true, messageId: input.messageId, addedLabels: addLabels, removedLabels: removeLabels };
        }

        // ── DELETE ────────────────────────────────────────────────────────────

        case "deleteMessage": {
          assertAllowed(cfg, "delete");
          if (!input.messageId) throw new Error("messageId is required.");
          if (cfg.trashOnDelete !== false) {
            await call(`/messages/${input.messageId}/trash`, { method: "POST" });
            return { ok: true, messageId: input.messageId, action: "trashed" };
          } else {
            await call(`/messages/${input.messageId}`, { method: "DELETE" });
            return { ok: true, messageId: input.messageId, action: "permanently-deleted" };
          }
        }

        // ── TEMPLATES ─────────────────────────────────────────────────────────
        // Templates are stored as Gmail drafts tagged with a configurable label.

        case "createTemplate": {
          assertAllowed(cfg, "create-template");
          if (!input.name || !input.subject || !input.body) {
            throw new Error("name, subject, and body are required.");
          }
          // 1. Ensure template label exists
          const labelName = cfg.templateLabel ?? "SolixTemplates";
          const labelsData = await call("/labels");
          let templateLabel = (labelsData.labels ?? []).find((l) => l.name === labelName);
          if (!templateLabel) {
            templateLabel = await call("/labels", {
              method: "POST",
              body:   { name: labelName, labelListVisibility: "labelHide", messageListVisibility: "hide" },
            });
          }
          // 2. Create draft with template content; embed name in subject prefix
          const raw   = toBase64Url(buildMimeMessage({
            to:      "template@solix.internal",
            subject: `[TPL:${input.name}] ${input.subject}`,
            body:    input.body,
          }));
          const draft = await call("/drafts", {
            method: "POST",
            body:   { message: { raw } },
          });
          // 3. Tag the message with the template label
          await call(`/messages/${draft.message.id}/modify`, {
            method: "POST",
            body:   { addLabelIds: [templateLabel.id] },
          });
          return {
            ok:         true,
            templateId: draft.id,
            messageId:  draft.message?.id,
            name:       input.name,
            subject:    input.subject,
          };
        }

        case "listTemplates": {
          assertAllowed(cfg, "list-templates");
          const labelName  = cfg.templateLabel ?? "SolixTemplates";
          const labelsData = await call("/labels");
          const templateLabel = (labelsData.labels ?? []).find((l) => l.name === labelName);
          if (!templateLabel) {
            return { ok: true, templates: [] };
          }
          const data = await call(
            `/messages?maxResults=${maxResults}&q=${encodeURIComponent(`label:${labelName}`)}&includeSpamTrash=true`
          );
          const messages = data.messages ?? [];
          const detailed = await Promise.all(
            messages.map((m) =>
              call(`/messages/${m.id}?format=metadata&metadataHeaders=Subject,Date`)
            )
          );
          return {
            ok: true,
            templates: detailed.map((m) => {
              const subj = header(m.payload?.headers, "Subject");
              const nameMatch = subj.match(/^\[TPL:(.+?)\]\s*(.*)/);
              return {
                messageId: m.id,
                name:      nameMatch?.[1] ?? subj,
                subject:   nameMatch?.[2] ?? subj,
                date:      header(m.payload?.headers, "Date"),
                snippet:   m.snippet,
              };
            }),
          };
        }

        default:
          return {
            ok:    false,
            error: `Unknown action "${action}". Supported: listMessages, getMessage, searchMessages, ` +
                   `sendMessage, replyMessage, createDraft, listLabels, createLabel, addLabel, ` +
                   `removeLabel, moveMessage, deleteMessage, createTemplate, listTemplates.`,
          };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
  // Called by the runtime when a user confirms a config action button in the UI.
  async configAction(key, context) {
    if (key !== "refreshCredentials") {
      throw new Error(`unknown action ${key}`);
    }

    const cfg = context?.config ?? {};
    const clientId = cfg.clientId;
    const clientSecret = cfg.clientSecret;
    const defaultScopes = cfg.scopes ?? "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send";
    const port = cfg.oauthCallbackPort ?? 3000;

    if (!clientId || !clientSecret) {
      return {
        ok: false,
        message: "Please set 'clientId' and 'clientSecret' in the Gmail tool configuration before running Re-authenticate.",
      };
    }

    // Perform the OAuth flow in-process (non-blocking) so the UI remains responsive.
    return new Promise((resolve) => {
      const http = require('node:http');

      const server = http.createServer(async (req, res) => {
        try {
          const u = new URL(req.url, `http://localhost:${port}`);
          if (u.pathname !== '/oauth2callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          const code = u.searchParams.get('code');
          const error = u.searchParams.get('error');
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`Error from provider: ${error}`);
            server.close();
            resolve({ ok: false, error });
            return;
          }
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing code in callback.');
            server.close();
            resolve({ ok: false, message: 'Missing code in callback.' });
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Authorization received. You can close this tab.');

          // Exchange code for tokens
          try {
            const tokenRes = await fetch(TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: `http://localhost:${port}/oauth2callback`,
              }),
            });
            const data = await tokenRes.json();
            server.close();
            if (!tokenRes.ok) {
              resolve({ ok: false, error: data });
              return;
            }
            const refreshToken = data.refresh_token ?? null;
            if (!refreshToken) {
              resolve({ ok: false, message: 'No refresh_token returned. Ensure access_type=offline and prompt=consent were used.' , data});
              return;
            }
            resolve({ ok: true, message: `Refresh token obtained: ${refreshToken.slice(0,8)}…`, refreshToken });
          } catch (e) {
            server.close();
            resolve({ ok: false, error: e.message ?? String(e) });
          }
        } catch (e) {
          server.close();
          resolve({ ok: false, error: e.message ?? String(e) });
        }
      });

      // Prepare the consent URL up-front so we can return it immediately.
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', `http://localhost:${port}/oauth2callback`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', defaultScopes);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      const urlStr = authUrl.toString();

      // Try to start the server and resolve promptly. Add handlers so the
      // promise always settles even if bind fails or times out.
      let settled = false;
      const finish = (resObj) => {
        if (settled) return;
        settled = true;
        try { resolve(resObj); } catch (e) { /* ignore */ }
      };

      server.once('listening', () => {
      console.log('[gmail] configAction called for key=', key);
      console.log('[gmail] config preview (clientId set?):', !!clientId, 'port=', port);
        finish({ ok: true, authUrl: urlStr, message: 'Open this URL in your browser to complete Gmail consent.' });
      });

      server.once('error', (err) => {
        // If we cannot bind the port, return the auth URL so the UI can still
        // open it; include the error so the user can choose a different port.
        finish({ ok: false, error: err?.message ?? String(err), authUrl: urlStr, message: 'Failed to bind callback port. Open the URL manually and use the helper script if needed.' });
      });

      // Safety timeout: if listen neither succeeds nor errors within 5s, return
      console.log('[gmail] starting oauth helper server (non-blocking)');
      // the URL so the UI can proceed instead of hanging.
      const timeout = setTimeout(() => {
        finish({ ok: false, error: 'listen_timeout', authUrl: urlStr, message: 'Timed out while binding callback port; open the URL manually.' });
      }, 5000);

      // Ensure the server remains running to accept the callback even after
      // we resolved to the UI. The request handler will call server.close().
      server.listen(port);
    });
    
    // helper to import inside Promise (top-level await not available everywhere)
    function awaitImport(mod) {
      return new Promise((res, rej) => {
            console.log('[gmail] oauth callback parameters, code?', !!code, 'error?', !!error);
        try {
          res(require(mod));
        } catch (e) {
          // fallback to dynamic import
          import(mod).then((m) => res(m)).catch(rej);
        }
      });
    }
  },
};

// ─── spec ─────────────────────────────────────────────────────────────────────
/**
 * Interface contract — consumed by the SolixAI runtime for call validation.
 * Schema format: JSON Schema draft-07.
 * @since 1.0.0
 */
export const spec = {
  name: "gmail",
  version: "1.0.0",
  inputSchema: {
    type: "object",
              console.log('[gmail] exchanging code for tokens');
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: [
          "listMessages",
          "getMessage",
          "searchMessages",
          "sendMessage",
          "replyMessage",
          "createDraft",
          "listLabels",
              console.log('[gmail] token endpoint responded, status=', tokenRes.status);
          "createLabel",
          "addLabel",
          "removeLabel",
          "moveMessage",
          "deleteMessage",
          "createTemplate",
          "listTemplates",
        ],
        description: "The Gmail operation to perform.",
      },

      // ── read / search ─────────────────────────────────────────────────────
      query: {
        type: "string",
        description: "Gmail search query string (e.g. 'from:alice is:unread'). Used by listMessages and searchMessages.",
      },
      messageId: {
        type: "string",
        description: "Gmail message ID. Required for getMessage, replyMessage, addLabel, removeLabel, moveMessage, deleteMessage.",
      },

      // ── compose fields ────────────────────────────────────────────────────
      to: {
        type: "string",
        description: "Recipient email address(es). Required for sendMessage, createDraft; optional for replyMessage.",
      },
      cc: { type: "string", description: "CC recipients." },
      bcc: { type: "string", description: "BCC recipients." },
      subject: {
        type: "string",
        description: "Email subject. Required for sendMessage, createDraft, createTemplate.",
      },
      body: {
        type: "string",
        description: "Plain-text message body. Required for sendMessage, replyMessage, createDraft, createTemplate.",
      },
      threadId: {
        type: "string",
        description: "Gmail thread ID. Optionally pass to createDraft to add a draft to an existing thread.",
      },

      // ── label fields ──────────────────────────────────────────────────────
      name: {
        type: "string",
        description: "Label name (createLabel) or template name (createTemplate).",
      },
      labelIds: {
        type: "array",
        items: { type: "string" },
        description: "One or more Gmail label IDs. Required for addLabel and removeLabel.",
      },

      // ── move fields ───────────────────────────────────────────────────────
      addLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to add when moving a message.",
      },
      removeLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to remove when moving a message.",
      },
    },
  },

  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok:        { type: "boolean" },
      error:     { type: "string", description: "Present when ok=false." },

      // listMessages / searchMessages
      total:     { type: "number" },
      messages:  { type: "array", items: { type: "object" } },

      // getMessage
      id:        { type: "string" },
      threadId:  { type: "string" },
      from:      { type: "string" },
      to:        { type: "string" },
      subject:   { type: "string" },
      date:      { type: "string" },
      body:      { type: "string" },
      snippet:   { type: "string" },
      labelIds:  { type: "array", items: { type: "string" } },

      // createDraft
      draftId:   { type: "string" },
      messageId: { type: "string" },

      // listLabels / createLabel
      labels:    { type: "array", items: { type: "object" } },

      // moveMessage / addLabel / removeLabel
      addedLabels:   { type: "array", items: { type: "string" } },
      removedLabels: { type: "array", items: { type: "string" } },

      // deleteMessage
      action: { type: "string", enum: ["trashed", "permanently-deleted"] },

      // createTemplate
      templateId: { type: "string" },
      name:       { type: "string" },

      // listTemplates
      templates: { type: "array", items: { type: "object" } },
    },
  },

  verify: ["gmail.listLabels"],
};

export default toolImpl;

// Backwards/alternate compatibility: export a named function that some runtimes
// invoke directly when performing config actions. Delegate to the tool's
// `configAction` method if present.
export async function configAction(key, ...args) {
  if (typeof toolImpl.configAction === "function") {
    return toolImpl.configAction(key, ...args);
  }
  throw new Error("configAction not implemented on gmail tool");
}

// Compatibility helper: some runtimes call `getTool()` to retrieve the tool
// implementation. Export it here so those callers don't fail.
export function getTool() {
  return toolImpl;
}
