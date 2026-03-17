// nyteshift/email/index.js
// Email IMAP/SMTP tool — NyteShift Marketplace
// Contributor: nyteshift

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Read ~/.nyteshift/config.json for stored credentials */
function readNyteShiftToolConfig() {
  try {
    const cfgPath = join(homedir(), '.nyteshift', 'config.json');
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.toolConfig?.['nyteshift/email'] ?? {};
  } catch {
    return {};
  }
}

async function getToolSecret(context = {}, toolKey, name) {
  const ctx = context ?? {};
  try {
    if (typeof ctx.getSecret === 'function') {
      try { const v = await ctx.getSecret(toolKey, name); if (v != null) return v; } catch (_) {}
      try { const v = await ctx.getSecret(`${toolKey}.${name}`); if (v != null) return v; } catch (_) {}
      try { const v = await ctx.getSecret(name); if (v != null) return v; } catch (_) {}
    }
    if (ctx.secrets && typeof ctx.secrets.get === 'function') {
      try { const v = await ctx.secrets.get(toolKey, name); if (v != null) return v; } catch (_) {}
      try { const v = await ctx.secrets.get(`${toolKey}.${name}`); if (v != null) return v; } catch (_) {}
    }
    if (ctx.storage && typeof ctx.storage.get === 'function') {
      try { const v = await ctx.storage.get(`${toolKey}.${name}`); if (v != null) return v; } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

async function setToolSecret(context = {}, toolKey, name, value) {
  const ctx = context ?? {};
  try {
    if (typeof ctx.setSecret === 'function') {
      try { await ctx.setSecret(toolKey, name, value); return true; } catch (_) {}
      try { await ctx.setSecret(`${toolKey}.${name}`, value); return true; } catch (_) {}
      try { await ctx.setSecret(name, value); return true; } catch (_) {}
    }
    if (ctx.secrets && typeof ctx.secrets.set === 'function') {
      try { await ctx.secrets.set(toolKey, name, value); return true; } catch (_) {}
      try { await ctx.secrets.set(`${toolKey}.${name}`, value); return true; } catch (_) {}
    }
    if (ctx.storage && typeof ctx.storage.set === 'function') {
      try { await ctx.storage.set(`${toolKey}.${name}`, value); return true; } catch (_) {}
    }
  } catch (_) {}
  return false;
}

/** Guard: ensure operation is allowed */
function assertAllowed(config, operation) {
  const allowed = config?.allowedOperations ?? [];
  if (!allowed.includes(operation)) {
    throw new Error(`Operation "${operation}" is not enabled.`);
  }
}

/** Resolve OAuth settings from either nested `oauth` or flat keys. */
function resolveOAuth(cfg) {
  const raw = (cfg && cfg.oauth && typeof cfg.oauth === 'object') ? cfg.oauth : {};
  return {
    provider: raw.provider ?? cfg?.oauthProvider,
    clientId: raw.clientId ?? cfg?.oauthClientId,
    clientSecret: raw.clientSecret ?? cfg?.oauthClientSecret,
    refreshToken: raw.refreshToken ?? cfg?.oauthRefreshToken,
    accessToken: raw.accessToken ?? cfg?.oauthAccessToken,
    accessTokenExpiry: raw.accessTokenExpiry ?? cfg?.oauthAccessTokenExpiry,
    tokenUrl: raw.tokenUrl ?? cfg?.oauthTokenUrl,
    tenantId: raw.tenantId ?? cfg?.oauthTenantId,
  };
}

/** Ensure there is a valid access token available (refresh if needed). */
async function ensureAccessToken(cfg) {
  const oauth = resolveOAuth(cfg);
  if (!oauth) return null;

  // If we already have a fresh token, return it
  if (oauth.accessToken && oauth.accessTokenExpiry && Date.now() < oauth.accessTokenExpiry - 60000) {
    return oauth.accessToken;
  }

  // If a refresh token is available, try to refresh
  if (oauth.refreshToken && oauth.clientId) {
    const token = await refreshOAuthToken(oauth);
    // Persist refreshed token back into cfg (in-memory only)
    if (cfg && cfg.oauth && typeof cfg.oauth === 'object') {
      cfg.oauth.accessToken = token;
      cfg.oauth.accessTokenExpiry = oauth.accessTokenExpiry;
    } else {
      cfg.oauthAccessToken = token;
      cfg.oauthAccessTokenExpiry = oauth.accessTokenExpiry;
    }
    return token;
  }

  // Fallback to any statically configured access token
  if (oauth.accessToken) return oauth.accessToken;
  return null;
}

/** Refresh OAuth access token using a refresh_token grant. Returns access_token. */
async function refreshOAuthToken(oauth) {
  // Determine token endpoint
  let tokenUrl = oauth.tokenUrl;
  if (!tokenUrl) {
    if (oauth.provider === 'google') tokenUrl = 'https://oauth2.googleapis.com/token';
    else if (oauth.provider === 'microsoft') tokenUrl = `https://login.microsoftonline.com/${oauth.tenantId ?? 'common'}/oauth2/v2.0/token`;
  }
  if (!tokenUrl) throw new Error('Missing oauth.tokenUrl or unknown provider for token refresh.');

  // Obtain a fetch implementation
  let fetchFn = typeof fetch === 'function' ? fetch : null;
  if (!fetchFn) {
    try {
      // node-fetch v3 default export
      const mod = await import('node-fetch');
      fetchFn = mod.default ?? mod;
    } catch (e) {
      throw new Error('No fetch available to refresh OAuth token; please run on Node 18+ or install node-fetch.');
    }
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', oauth.refreshToken);
  params.append('client_id', oauth.clientId);
  if (oauth.clientSecret) params.append('client_secret', oauth.clientSecret);

  const res = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description || body.error || JSON.stringify(body));
  }

  const accessToken = body.access_token;
  const expiresIn = Number(body.expires_in || 3600);
  oauth.accessToken = accessToken;
  oauth.accessTokenExpiry = Date.now() + (expiresIn * 1000);
  return accessToken;
}

/** IMAP wrapper */
async function withImap(cfg, fn) {
  const { ImapFlow } = await import('imapflow');
  // Support either password auth or OAuth2 access token (XOAUTH2)
  const oauthToken = await ensureAccessToken(cfg);
  const auth = oauthToken
    ? { user: cfg.email, accessToken: oauthToken }
    : { user: cfg.email, pass: cfg.password };

  const client = new ImapFlow({
    host:   cfg.imapHost ?? 'outlook.office365.com',
    port:   cfg.imapPort ?? 993,
    secure: true,
    auth,
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** SMTP wrapper */
async function buildTransport(cfg) {
  const nodemailer = await import('nodemailer');
  // If OAuth configured, supply OAuth2 credentials to nodemailer
  const oauthToken = await ensureAccessToken(cfg);
  if (oauthToken) {
    const oauth = resolveOAuth(cfg);
    return nodemailer.createTransport({
      host:   cfg.smtpHost ?? 'smtp.office365.com',
      port:   cfg.smtpPort ?? 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: cfg.email,
        accessToken: oauthToken,
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        refreshToken: oauth.refreshToken,
      },
    });
  }

  return nodemailer.createTransport({
    host:   cfg.smtpHost ?? 'smtp.office365.com',
    port:   cfg.smtpPort ?? 587,
    secure: false,
    auth: {
      user: cfg.email,
      pass: cfg.password,
    },
  });
}

/** Basic IMAP search builder (Outlook supports standard IMAP only) */
function buildSearchCriteria(query) {
  const q = (query ?? '').trim();
  if (!q || q === 'all') return { all: true };

  if (q === 'is:unread') return { unseen: true };
  if (q === 'is:read')   return { seen: true };
  if (q === 'is:flagged') return { flagged: true };

  const fromMatch = q.match(/^from:(.+)$/i);
  if (fromMatch) return { from: fromMatch[1].trim() };

  const subjectMatch = q.match(/^subject:(.+)$/i);
  if (subjectMatch) return { subject: subjectMatch[1].trim() };

  // fallback to TEXT search
  return { text: q };
}

/** Parse MIME message */
async function parseMessage(source) {
  const { simpleParser } = await import('mailparser');
  const parsed = await simpleParser(source);
  return {
    from: parsed.from?.text ?? '',
    to: parsed.to?.text ?? '',
    cc: parsed.cc?.text ?? '',
    subject: parsed.subject ?? '',
    date: parsed.date?.toISOString() ?? '',
    body: parsed.text ?? parsed.html ?? '',
    messageId: parsed.messageId ?? '',
    inReplyTo: parsed.inReplyTo ?? '',
  };
}

const toolImpl = {
  name: "email",
  version: "0.1.0",
  contributor: "nyteshift",
  description: "Read, search, send and organise email messages via IMAP/SMTP.",

  config: [
    { key: "email", label: "Email Address", type: "string" },
    { key: "password", label: "Password / App Password", type: "secret" },

    // OAuth2 (optional). If provided, OAuth2 access/refresh tokens can be used
    { key: "useOAuth", label: "Use OAuth2", type: "boolean", default: false },
    { key: "oauthProvider", label: "OAuth Provider", type: "string", default: "microsoft" },
    { key: "oauthClientId", label: "OAuth Client ID", type: "string" },
    { key: "oauthClientSecret", label: "OAuth Client Secret", type: "secret" },
    { key: "oauthRefreshToken", label: "OAuth Refresh Token", type: "secret" },
    { key: "oauthAccessToken", label: "OAuth Access Token", type: "secret" },
    { key: "oauthTokenUrl", label: "OAuth Token URL", type: "string" },
    { key: "oauthTenantId", label: "OAuth Tenant ID (Microsoft)", type: "string", default: "common" },

    { key: "imapHost", label: "IMAP Host", type: "string", default: "outlook.office365.com" },
    { key: "imapPort", label: "IMAP Port", type: "number", default: 993 },

    { key: "smtpHost", label: "SMTP Host", type: "string", default: "smtp.office365.com" },
    { key: "smtpPort", label: "SMTP Port", type: "number", default: 587 },

    {
      key: "allowedOperations",
      label: "Allowed Operations",
      type: "multiselect",
      options: [
        "read", "search", "send", "reply",
        "create-draft", "move", "delete",
        "list-mailboxes", "mark-read", "mark-unread"
      ],
      default: ["read", "search"],
    },

    { key: "defaultMailbox", label: "Default Mailbox", type: "string", default: "INBOX" },
    { key: "trashMailbox", label: "Trash Mailbox", type: "string", default: "Deleted Items" },
    { key: "draftsMailbox", label: "Drafts Mailbox", type: "string", default: "Drafts" },
  ],

  run: async ({ input, context }) => {
    const ctx = context ?? {};
    const uiCfg = ctx?.config ?? {};
    const fileCfg = readNyteShiftToolConfig();
    const cfg = { ...fileCfg, ...uiCfg };

    // Prefer runtime-provided secrets (if the host exposes them on `context`).
    try {
      const toolKey = 'nyteshift/email';
      const runtimePassword = await getToolSecret(ctx, toolKey, 'password') ?? await getToolSecret(ctx, toolKey, 'emailPassword') ?? await getToolSecret(ctx, toolKey, 'email.password');
      if (runtimePassword) cfg.password = String(runtimePassword);

      const runtimeEmail = await getToolSecret(ctx, toolKey, 'email');
      if (typeof runtimeEmail === 'string' && runtimeEmail.trim() !== '') cfg.email = runtimeEmail;

      const runtimeOauthRefresh = await getToolSecret(ctx, toolKey, 'oauthRefreshToken') ?? await getToolSecret(ctx, toolKey, 'oauth.refreshToken') ?? await getToolSecret(ctx, toolKey, 'oauthRefresh');
      if (runtimeOauthRefresh) {
        if (!cfg.oauth || typeof cfg.oauth !== 'object') cfg.oauth = {};
        cfg.oauth.refreshToken = runtimeOauthRefresh;
      }

      const runtimeOauthAccess = await getToolSecret(ctx, toolKey, 'oauthAccessToken') ?? await getToolSecret(ctx, toolKey, 'oauth.accessToken');
      if (runtimeOauthAccess) {
        if (!cfg.oauth || typeof cfg.oauth !== 'object') cfg.oauth = {};
        cfg.oauth.accessToken = runtimeOauthAccess;
      }

      const runtimeOauthClientSecret = await getToolSecret(ctx, toolKey, 'oauthClientSecret') ?? await getToolSecret(ctx, toolKey, 'oauth.clientSecret');
      if (runtimeOauthClientSecret) {
        if (!cfg.oauth || typeof cfg.oauth !== 'object') cfg.oauth = {};
        cfg.oauth.clientSecret = runtimeOauthClientSecret;
      }
    } catch (_) {}

    // Accept either a password/app-password OR OAuth credentials (access/refresh token).
    const oauthResolved = resolveOAuth(cfg);
    const hasOauth = Boolean(oauthResolved?.accessToken || oauthResolved?.refreshToken || oauthResolved?.clientId);
    if (!cfg.email || (!cfg.password && !hasOauth)) {
      return { ok: false, error: "Email tool is not configured. Provide a password or OAuth credentials." };
    }

    const { action } = input;
    const defaultMailbox = cfg.defaultMailbox ?? "INBOX";

    try {
      switch (action) {

        case "listMailboxes": {
          assertAllowed(cfg, "list-mailboxes");
          return await withImap(cfg, async (client) => {
            const boxes = await client.list();
            return { ok: true, mailboxes: boxes };
          });
        }

        case "listMessages": {
          assertAllowed(cfg, "read");
          const mailbox = input.mailbox ?? defaultMailbox;
          const limit = Number(input.limit ?? 20);
          const page = Number(input.page ?? 1);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              const total = client.mailbox.exists ?? 0;
              const start = total - (page - 1) * limit;
              const from = Math.max(1, start - limit + 1);
              const to = start;

              const messages = [];
              for await (const msg of client.fetch(`${from}:${to}`, {
                uid: true, flags: true, envelope: true
              })) {
                messages.push({
                  uid: msg.uid,
                  from: msg.envelope.from?.[0]?.address ?? '',
                  subject: msg.envelope.subject ?? '',
                  date: msg.envelope.date?.toISOString() ?? '',
                  seen: msg.flags?.has('\\Seen') ?? false,
                });
              }

              return { ok: true, mailbox, messages: messages.reverse(), total };
            } finally {
              lock.release();
            }
          });
        }

        case "searchMessages": {
          assertAllowed(cfg, "search");
          const mailbox = input.mailbox ?? defaultMailbox;
          const criteria = buildSearchCriteria(input.query);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              const uids = await client.search(criteria, { uid: true });
              return { ok: true, mailbox, query: input.query, uids: [...uids] };
            } finally {
              lock.release();
            }
          });
        }

        case "getMessage": {
          assertAllowed(cfg, "read");
          const mailbox = input.mailbox ?? defaultMailbox;
          const uid = Number(input.uid);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              for await (const msg of client.fetch(
                { uid },
                { uid: true, flags: true, envelope: true, source: true }
              )) {
                const parsed = await parseMessage(msg.source);
                return { ok: true, uid, ...parsed };
              }
              throw new Error(`Message UID ${uid} not found.`);
            } finally {
              lock.release();
            }
          });
        }

        case "markRead": {
          assertAllowed(cfg, "mark-read");
          const mailbox = input.mailbox ?? defaultMailbox;
          const uid = Number(input.uid);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
              return { ok: true, uid };
            } finally {
              lock.release();
            }
          });
        }

        case "markUnread": {
          assertAllowed(cfg, "mark-unread");
          const mailbox = input.mailbox ?? defaultMailbox;
          const uid = Number(input.uid);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              await client.messageFlagsRemove({ uid }, ['\\Seen'], { uid: true });
              return { ok: true, uid };
            } finally {
              lock.release();
            }
          });
        }

        case "moveMessage": {
          assertAllowed(cfg, "move");
          const mailbox = input.srcMailbox ?? defaultMailbox;
          const dest = input.destMailbox;
          const uid = Number(input.uid);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              await client.messageMove({ uid }, dest, { uid: true });
              return { ok: true, uid, dest };
            } finally {
              lock.release();
            }
          });
        }

        case "deleteMessage": {
          assertAllowed(cfg, "delete");
          const mailbox = input.mailbox ?? defaultMailbox;
          const uid = Number(input.uid);
          const trash = cfg.trashMailbox ?? "Deleted Items";

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              await client.messageMove({ uid }, trash, { uid: true });
              return { ok: true, uid, movedTo: trash };
            } finally {
              lock.release();
            }
          });
        }

        case "sendMessage": {
          assertAllowed(cfg, "send");
          const transport = await buildTransport(cfg);
          const info = await transport.sendMail({
            from: cfg.email,
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject,
            text: input.body,
          });
          return { ok: true, messageId: info.messageId };
        }

        case "replyMessage": {
          assertAllowed(cfg, "reply");
          const mailbox = input.mailbox ?? defaultMailbox;
          const uid = Number(input.uid);

          const original = await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              for await (const msg of client.fetch(
                { uid },
                { uid: true, envelope: true, source: true }
              )) {
                return await parseMessage(msg.source);
              }
              throw new Error(`Message UID ${uid} not found.`);
            } finally {
              lock.release();
            }
          });

          const subject = original.subject.startsWith("Re:")
            ? original.subject
            : `Re: ${original.subject}`;

          const transport = await buildTransport(cfg);
          const info = await transport.sendMail({
            from: cfg.email,
            to: original.from,
            subject,
            text: input.body,
            inReplyTo: original.messageId,
            references: original.messageId,
          });

          return { ok: true, messageId: info.messageId };
        }

        case "createDraft": {
          assertAllowed(cfg, "create-draft");
          const nodemailer = await import('nodemailer');
          const draftBox = cfg.draftsMailbox ?? "Drafts";

          const transport = nodemailer.createTransport({
            streamTransport: true,
            newline: 'crlf',
          });

          const { message } = await transport.sendMail({
            from: cfg.email,
            to: input.to,
            cc: input.cc,
            subject: input.subject,
            text: input.body,
          });

          const chunks = [];
          await new Promise((resolve, reject) => {
            message.on('data', (c) => chunks.push(c));
            message.on('end', resolve);
            message.on('error', reject);
          });

          const raw = Buffer.concat(chunks);

          return await withImap(cfg, async (client) => {
            const result = await client.append(draftBox, raw, ['\\Draft']);
            return { ok: true, uid: result.uid, mailbox: draftBox };
          });
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

export default toolImpl;
