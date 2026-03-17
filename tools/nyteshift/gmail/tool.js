/**
 * Gmail Tool â€” NyteShift Marketplace
 * Contributor : nyteshift
        // â”€â”€ FLAG MANAGEMENT â”€â”€
        // Provide explicit markRead / markUnread actions to add/remove the \Seen flag.

        case "markRead": {
          assertAllowed(cfg, "mark-read");
          if (!input.uid && !input.uids) throw new Error("uid or uids is required.");
          const srcMailbox = input.mailbox ?? defaultMailbox;
          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(srcMailbox);
            try {
              const spec = input.uids ? { uid: input.uids } : { uid: input.uid };
              await client.messageFlagsAdd(spec, ['\\Seen'], { uid: true });
              return { ok: true, action: 'marked-read', uids: Array.isArray(input.uids) ? input.uids : [input.uid] };
            } finally {
              lock.release();
            }
          });
        }

        case "markUnread": {
          assertAllowed(cfg, "mark-unread");
          if (!input.uid && !input.uids) throw new Error("uid or uids is required.");
          const srcMailbox = input.mailbox ?? defaultMailbox;
          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(srcMailbox);
            try {
              const spec = input.uids ? { uid: input.uids } : { uid: input.uid };
              await client.messageFlagsRemove(spec, ['\\Seen'], { uid: true });
              return { ok: true, action: 'marked-unread', uids: Array.isArray(input.uids) ? input.uids : [input.uid] };
            } finally {
              lock.release();
            }
          });
        }

        // Templates are stored as plain messages in a dedicated IMAP mailbox.
        // A [TPL:name] prefix in the subject is used for identification.

        case "createTemplate": {
 *
 * Prerequisites
 *   1. Enable 2-Step Verification on the Google account.
 *   2. Go to Google Account â†’ Security â†’ "App passwords".
 *   3. Generate a 16-character App Password for "Mail".
 *   4. Enter your Gmail address and that password (without spaces) in the tool config.
 *
 * IMAP : imap.gmail.com : 993 (TLS)
 * SMTP : smtp.gmail.com : 587 (STARTTLS)
 *
 * Required npm packages (see package.json in this directory):
 *   imapflow    â€” IMAP client
 *   nodemailer  â€” SMTP sending + raw message building
 *   mailparser  â€” MIME message parsing
 */

// â”€â”€â”€ static imports (Node built-ins only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { readFileSync, promises as fsPromises } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Read the nyteshift/gmail tool config directly from ~/.nyteshift/config.json. */
function readNyteShiftToolConfig() {
  try {
    const cfgPath = join(homedir(), '.nyteshift', 'config.json');
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.toolConfig?.['nyteshift/gmail'] ?? {};
  } catch (e) {
    console.warn('[gmail] could not read ~/.nyteshift/config.json:', e.message);
    return {};
  }
}

async function writeNyteShiftToolConfig(changes = {}) {
  const cfgDir = join(homedir(), '.nyteshift');
  const cfgPath = join(cfgDir, 'config.json');
  try { await fsPromises.mkdir(cfgDir, { recursive: true }); } catch (_) {}
  let data = {};
  try { const raw = await fsPromises.readFile(cfgPath, 'utf8'); data = JSON.parse(raw || '{}'); } catch (_) { data = {}; }
  if (!data.toolConfig || typeof data.toolConfig !== 'object') data.toolConfig = {};
  const existing = data.toolConfig['nyteshift/gmail'] ?? {};
  data.toolConfig['nyteshift/gmail'] = Object.assign({}, existing, changes);
  await fsPromises.writeFile(cfgPath, JSON.stringify(data, null, 2), 'utf8');
  return data.toolConfig['nyteshift/gmail'];
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

/** Guard: throw if the requested operation is not in allowedOperations. */
function assertAllowed(config, operation) {
  const allowed = config?.allowedOperations ?? [];
  if (!allowed.includes(operation)) {
    throw new Error(
      `Operation "${operation}" is not enabled. ` +
      `Enable it in the Gmail tool's "Allowed Operations" setting.`
    );
  }
}

/**
 * Open an ImapFlow client, run the provided callback, then cleanly close it.
 * The client is passed to the callback already logged-in.
 */
async function withImap(cfg, fn) {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host:   cfg.imapHost ?? 'imap.gmail.com',
    port:   cfg.imapPort ?? 993,
    secure: true,
    auth: {
      user: cfg.email,
      pass: cfg.appPassword,
    },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Build a nodemailer SMTP transporter using Gmail App Password. */
async function buildTransport(cfg) {
  const nodemailer = await import('nodemailer');
  return nodemailer.createTransport({
    host:   cfg.smtpHost ?? 'smtp.gmail.com',
    port:   cfg.smtpPort ?? 587,
    secure: false,            // STARTTLS
    auth: {
      user: cfg.email,
      pass: cfg.appPassword,
    },
  });
}

/**
 * Convert a Gmail-style query string to an imapflow-compatible IMAP SEARCH criteria object.
 * Standard IMAP criteria are used where possible (as Thunderbird does).
 * Falls back to Gmail's X-GM-RAW extension for complex/unrecognised queries.
 */
function buildSearchCriteria(query) {
  const q = (query ?? '').trim();

  // Blank / catch-all  →  all messages in the selected mailbox
  if (!q || q === 'all' || q === 'in:anywhere') return { all: true };

  // Common Gmail flags → standard IMAP flags
  if (q === 'in:inbox')      return { all: true };   // already selected INBOX upstream
  if (q === 'is:unread')     return { unseen: true };
  if (q === 'is:read')       return { seen: true };
  if (q === 'is:starred')    return { flagged: true };
  if (q === 'is:important')  return { keyword: '\\Important' };

  // Field-prefixed queries → proper IMAP criteria
  const fromMatch    = q.match(/^from:(.+)$/i);
  if (fromMatch)    return { from:    fromMatch[1].trim() };

  const toMatch      = q.match(/^to:(.+)$/i);
  if (toMatch)      return { to:      toMatch[1].trim() };

  const subjectMatch = q.match(/^subject:(.+)$/i);
  if (subjectMatch) return { subject: subjectMatch[1].trim() };

  // Plain text with no operator → standard IMAP TEXT search
  if (!/[:(]/.test(q)) return { text: q };

  // Complex/Gmail-specific query → attempt X-GM-RAW (Gmail IMAP extension)
  // imapflow passes unknown keys as raw IMAP search keywords; Gmail honours X-GM-RAW.
  return { xgmRaw: q };
}

/** Parse the plain-text body out of a raw MIME buffer via mailparser. */
async function parseMessage(source) {
  const { simpleParser } = await import('mailparser');
  const parsed = await simpleParser(source);
  return {
    from:    parsed.from?.text    ?? '',
    to:      parsed.to?.text      ?? '',
    cc:      parsed.cc?.text      ?? '',
    subject: parsed.subject       ?? '',
    date:    parsed.date?.toISOString() ?? '',
    body:    parsed.text          ?? parsed.html ?? '',
    messageId: parsed.messageId   ?? '',
    inReplyTo: parsed.inReplyTo   ?? '',
  };
}

// â”€â”€â”€ default export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const toolImpl = {
  name: "gmail",
  version: "2.0.0",
  contributor: "nyteshift",
  description: "Read, search, send and organise Gmail messages via IMAP/SMTP using an App Password.",

  config: [
    // â”€â”€ Authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      key: "email",
      label: "Gmail Address",
      type: "string",
      placeholder: "you@gmail.com",
      description:
        "Your full Gmail address. Used as the IMAP/SMTP login username and as the From address when sending.",
    },
    {
      key: "appPassword",
      label: "App Password",
      type: "secret",
      placeholder: "xxxx xxxx xxxx xxxx",
      description:
        "16-character Gmail App Password (spaces optional). " +
        "Generate one at myaccount.google.com â†’ Security â†’ App passwords. " +
        "Requires 2-Step Verification to be enabled on the account.",
    },

    // â”€â”€ Server overrides (rarely needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      key: "imapHost",
      label: "IMAP Host",
      type: "string",
      default: "imap.gmail.com",
      description: "IMAP server hostname. Default: imap.gmail.com",
    },
    {
      key: "imapPort",
      label: "IMAP Port",
      type: "number",
      default: 993,
      description: "IMAP server port (TLS). Default: 993",
    },
    {
      key: "smtpHost",
      label: "SMTP Host",
      type: "string",
      default: "smtp.gmail.com",
      description: "SMTP server hostname. Default: smtp.gmail.com",
    },
    {
      key: "smtpPort",
      label: "SMTP Port",
      type: "number",
      default: 587,
      description: "SMTP server port (STARTTLS). Default: 587",
    },

    // â”€â”€ Permission gates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        "delete",
        "create-template",
        "list-templates",
        "list-mailboxes",
        "mark-read",
        "mark-unread",
      ],
      default: ["read", "search"],
      description:
        "Controls which Gmail operations the agent is permitted to perform. " +
        "Operations not listed here will be refused at runtime.",
    },

    // â”€â”€ Behaviour â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      key: "limit",
      label: "Messages per Request",
      type: "number",
      default: 20,
      min: 1,
      max: 200,
      step: 5,
      description: "Default number of messages returned by list and search actions (per-page).",
    },
    {
      key: "defaultMailbox",
      label: "Default Mailbox",
      type: "string",
      default: "INBOX",
      description: "IMAP mailbox to use when none is specified (e.g. 'INBOX', '[Gmail]/All Mail').",
    },
    {
      key: "trashOnDelete",
      label: "Trash Instead of Permanent Delete",
      type: "boolean",
      default: true,
      description:
        "When true, 'delete' moves messages to [Gmail]/Trash rather than permanently expunging them.",
    },
    {
      key: "templateMailbox",
      label: "Template Mailbox Name",
      type: "string",
      default: "NyteShiftTemplates",
      description:
        "IMAP mailbox (folder) used to store reusable email templates. " +
        "Will be created automatically on first template save if it does not exist.",
    },
  ],

  // â”€â”€ run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  run: async ({ input, context }) => {
    // Prefer runtime-provided config (secrets are typically injected at
    // runtime). Accept secrets from several possible injection points:
    // - context.toolConfig['nyteshift/gmail']
    // - context.config.toolConfig['nyteshift/gmail']
    // - top-level context.config or context.toolConfig
    // Fall back to on-disk config for non-secret defaults.
    const ctx = context ?? {};
    const toolKey = 'nyteshift/gmail';
    const candidates = [];
    if (ctx.toolConfig && ctx.toolConfig[toolKey]) candidates.push(ctx.toolConfig[toolKey]);
    if (ctx.config && ctx.config.toolConfig && ctx.config.toolConfig[toolKey]) candidates.push(ctx.config.toolConfig[toolKey]);
    if (ctx.config && typeof ctx.config === 'object') candidates.push(ctx.config);
    if (ctx.toolConfig && typeof ctx.toolConfig === 'object') candidates.push(ctx.toolConfig);
    const uiCfg = Object.assign({}, ...candidates);
    const fileCfg = readNyteShiftToolConfig();

    // Merge file config with runtime config; runtime secret fields override file values.
    const cfg = { ...fileCfg, ...uiCfg };
    if (typeof uiCfg.email === 'string' && uiCfg.email.trim() !== '') cfg.email = uiCfg.email;
    if (typeof uiCfg.appPassword === 'string' && uiCfg.appPassword.trim() !== '') cfg.appPassword = uiCfg.appPassword;

    // Normalize appPassword (strip spaces, ensure string)
    if (cfg.appPassword) cfg.appPassword = String(cfg.appPassword).replace(/\s+/g, '');

    // Allow credential-setting action even when no creds yet.
    const action = input?.action;

    // Try runtime secret store for appPassword / refresh token / email overrides
    try {
      const runtimeAppPassword = await getToolSecret(ctx, toolKey, 'appPassword') ?? await getToolSecret(ctx, toolKey, 'gmailAppPassword') ?? await getToolSecret(ctx, toolKey, 'gmail.appPassword');
      if (typeof runtimeAppPassword === 'string' && runtimeAppPassword.trim() !== '') cfg.appPassword = String(runtimeAppPassword).replace(/\s+/g, '');

      const runtimeRefresh = await getToolSecret(ctx, toolKey, 'refreshToken') ?? await getToolSecret(ctx, toolKey, 'gmailRefreshToken') ?? await getToolSecret(ctx, toolKey, 'googleRefreshToken');
      if (runtimeRefresh) cfg.refreshToken = runtimeRefresh;

      const runtimeEmail = await getToolSecret(ctx, toolKey, 'email') ?? await getToolSecret(ctx, toolKey, 'gmailEmail');
      if (typeof runtimeEmail === 'string' && runtimeEmail.trim() !== '') cfg.email = runtimeEmail;
    } catch (_) {}

    if ((!cfg.email || !cfg.appPassword) && action !== 'setCredentials') {
      return {
        ok: false,
        error:
          "Gmail tool is not configured. " +
          "Set 'email' and 'appPassword' in the tool settings.",
      };
    }

    // Default per-request page size (config key `limit`). Cap at 200.
    const maxLimit = 200;
    const defaultLimit = Math.min(Number(cfg.limit ?? 20) || 20, maxLimit);
    const defaultMailbox = cfg.defaultMailbox ?? 'INBOX';

    try {
      switch (action) {

        // â”€â”€ LIST MESSAGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "listMessages": {
          assertAllowed(cfg, "read");
          const mailbox = input.mailbox ?? defaultMailbox;
          const page = Math.max(1, Number(input.page ?? 1) || 1);
          let limit = Number(input.limit ?? defaultLimit) || defaultLimit;
          if (limit > maxLimit) limit = maxLimit;

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              const messages = [];
              // Total messages in mailbox (sequence numbers are 1..total)
              const total = client.mailbox.exists ?? 0;
              const pages = Math.ceil(total / limit) || 0;

              if (total === 0) {
                return { ok: true, mailbox, total: 0, page, pages: 0, limit, hasNext: false, hasPrev: false, messages: [] };
              }

              if (page > pages && pages > 0) {
                return { ok: true, mailbox, total, page, pages, limit, hasNext: false, hasPrev: page > 1, messages: [] };
              }

              // Calculate sequence range for the requested page (newest-first)
              const endSeq = total - (page - 1) * limit;
              const from = Math.max(1, endSeq - limit + 1);
              const to = endSeq;

              for await (const msg of client.fetch(`${from}:${to}`, {
                uid: true, flags: true, envelope: true, bodyStructure: false,
              })) {
                messages.push({
                  uid:     msg.uid,
                  seq:     msg.seq,
                  from:    msg.envelope.from?.[0]?.address ?? '',
                  subject: msg.envelope.subject ?? '',
                  date:    msg.envelope.date?.toISOString() ?? '',
                  flags:   [...(msg.flags ?? [])],
                  seen:    msg.flags?.has('\\Seen') ?? false,
                });
              }

              // Preserve newest-first ordering
              const ordered = messages.reverse();
              const hasPrev = page > 1;
              const hasNext = (page * limit) < total;
              return { ok: true, mailbox, total, page, pages, limit, hasNext, hasPrev, messages: ordered };
            } finally {
              lock.release();
            }
          });
        }

        // â”€â”€ GET MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "getMessage": {
          assertAllowed(cfg, "read");
          const mailbox = input.mailbox ?? defaultMailbox;
          // Accept either a single `uid` or an array `uids` for batch reads
          const uids = input.uids
            ? (Array.isArray(input.uids) ? input.uids.map(Number) : [Number(input.uids)])
            : (input.uid ? [Number(input.uid)] : []);
          if (!uids || uids.length === 0) throw new Error("uid or uids is required.");

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              const messages = [];
              const chunkSize = Number(input.chunkSize ?? 50) || 50;
              for (let i = 0; i < uids.length; i += chunkSize) {
                const chunk = uids.slice(i, i + chunkSize);
                for await (const msg of client.fetch(
                  { uid: chunk },
                  { uid: true, flags: true, envelope: true, source: true },
                  { uid: true }
                )) {
                  const parsed = await parseMessage(msg.source);
                  messages.push({
                    uid:   msg.uid,
                    flags: [...(msg.flags ?? [])],
                    seen:  msg.flags?.has('\\Seen') ?? false,
                    ...parsed,
                  });
                }
              }

              if (messages.length === 0) {
                throw new Error(`Message UID(s) ${uids.join(', ')} not found in ${mailbox}.`);
              }

              // Preserve single-message return shape for backwards compatibility
              if (messages.length === 1) return { ok: true, ...messages[0] };
              return { ok: true, mailbox, total: uids.length, messages };
            } finally {
              lock.release();
            }
          });
        }

        // â”€â”€ SEARCH MESSAGES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "searchMessages": {
          assertAllowed(cfg, "search");
          if (!input.query) throw new Error("query is required.");
          const mailbox = input.mailbox ?? defaultMailbox;

          // Paging params: page (1-based), limit (per-page). Default limit falls
          // back to the tool config `limit`. Cap limit to avoid very large pages.
          const page = Math.max(1, Number(input.page ?? 1) || 1);
          let limit = Number(input.limit ?? defaultLimit) || defaultLimit;
          if (limit > maxLimit) limit = maxLimit;
          const order = input.order === 'oldest' ? 'oldest' : 'newest';

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              // Build standard IMAP SEARCH criteria (same approach as Thunderbird).
              // Falls back to Gmail X-GM-RAW for complex queries, then to { all: true }.
              const criteria = buildSearchCriteria(input.query);
              let raw;
              try {
                raw = await client.search(criteria, { uid: true });
              } catch {
                // If the criteria was rejected (e.g. X-GM-RAW not supported), fetch all.
                raw = await client.search({ all: true }, { uid: true });
              }

              // Normalize — imapflow can return an array, Set, single number, or null
              let uids = [];
              if (Array.isArray(raw)) uids = raw;
              else if (raw instanceof Set) uids = [...raw];
              else if (raw) uids = [raw];

              uids = uids.map(Number).filter((n) => !Number.isNaN(n));

              const total = uids.length;
              if (total === 0) {
                return { ok: true, query: input.query, mailbox, total: 0, page, pages: 0, limit, hasNext: false, hasPrev: false, order, messages: [] };
              }

              // Sort UIDs according to requested order (newest-first or oldest-first)
              uids.sort((a, b) => a - b);
              if (order === 'newest') uids.reverse();

              const pages = Math.ceil(total / limit) || 0;
              if (page > pages && pages > 0) {
                return { ok: true, query: input.query, mailbox, total, page, pages, limit, hasNext: false, hasPrev: page > 1, order, messages: [] };
              }

              const start = (page - 1) * limit;
              const slice = uids.slice(start, start + limit);
              const messages = [];
              if (slice.length > 0) {
                const fetched = [];
                for await (const msg of client.fetch(
                  { uid: slice },
                  { uid: true, flags: true, envelope: true },
                  { uid: true }
                )) {
                  fetched.push({
                    uid:     msg.uid,
                    from:    msg.envelope.from?.[0]?.address ?? '',
                    subject: msg.envelope.subject ?? '',
                    date:    msg.envelope.date?.toISOString() ?? '',
                    seen:    msg.flags?.has('\\Seen') ?? false,
                  });
                }
                // Preserve requested order
                const byUid = new Map(fetched.map((m) => [m.uid, m]));
                for (const uid of slice) {
                  const m = byUid.get(uid);
                  if (m) messages.push(m);
                }
              }

              const hasPrev = page > 1;
              const hasNext = page < pages;

              return { ok: true, query: input.query, mailbox, total, page, pages, limit, hasNext, hasPrev, order, messages };
            } finally {
              lock.release();
            }
          });
        }

        // â”€â”€ SEND MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "sendMessage": {
          assertAllowed(cfg, "send");
          if (!input.to || !input.subject || !input.body) {
            throw new Error("to, subject, and body are required.");
          }
          const transport = await buildTransport(cfg);
          const info = await transport.sendMail({
            from:    cfg.email,
            to:      input.to,
            cc:      input.cc,
            bcc:     input.bcc,
            subject: input.subject,
            text:    input.body,
          });
          return { ok: true, messageId: info.messageId, response: info.response };
        }

        // â”€â”€ REPLY MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "replyMessage": {
          assertAllowed(cfg, "reply");
          if (!input.uid || !input.body) {
            throw new Error("uid and body are required.");
          }
          const mailbox = input.mailbox ?? defaultMailbox;
          // Fetch original to get headers needed for threading
          const original = await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(mailbox);
            try {
              for await (const msg of client.fetch(
                { uid: input.uid },
                { uid: true, envelope: true, source: true },
                { uid: true }
              )) {
                return await parseMessage(msg.source);
              }
              throw new Error(`Message UID ${input.uid} not found.`);
            } finally {
              lock.release();
            }
          });
          const replySubject = input.subject ??
            (original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`);
          const transport = await buildTransport(cfg);
          const info = await transport.sendMail({
            from:         cfg.email,
            to:           input.to ?? original.from,
            cc:           input.cc,
            subject:      replySubject,
            text:         input.body,
            inReplyTo:    original.messageId,
            references:   original.messageId,
          });
          return { ok: true, messageId: info.messageId, response: info.response };
        }

        // â”€â”€ CREATE DRAFT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "createDraft": {
          assertAllowed(cfg, "create-draft");
          if (!input.to || !input.subject || !input.body) {
            throw new Error("to, subject, and body are required.");
          }
          const nodemailer = await import('nodemailer');
          // Build the raw RFC-2822 message without sending it
          const transport = nodemailer.createTransport({ streamTransport: true, newline: 'crlf' });
          const { message } = await transport.sendMail({
            from:    cfg.email,
            to:      input.to,
            cc:      input.cc,
            subject: input.subject,
            text:    input.body,
          });
          const chunks = [];
          await new Promise((resolve, reject) => {
            message.on('data', (c) => chunks.push(c));
            message.on('end', resolve);
            message.on('error', reject);
          });
          const raw = Buffer.concat(chunks);
          // IMAP APPEND to [Gmail]/Drafts
          const draftMailbox = '[Gmail]/Drafts';
          return await withImap(cfg, async (client) => {
            const result = await client.append(draftMailbox, raw, ['\\Draft']);
            return { ok: true, uid: result.uid, mailbox: draftMailbox };
          });
        }

        // â”€â”€ LIST MAILBOXES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "listMailboxes": {
          assertAllowed(cfg, "list-mailboxes");
          return await withImap(cfg, async (client) => {
            const list = await client.list();
            return {
              ok: true,
              mailboxes: list.map((m) => ({
                path:        m.path,
                name:        m.name,
                delimiter:   m.delimiter,
                flags:       [...(m.flags ?? [])],
                specialUse:  m.specialUse ?? null,
              })),
            };
          });
        }

        // â”€â”€ MOVE MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "moveMessage": {
          assertAllowed(cfg, "move");
          // Accept single `uid` or array `uids` for batch moves
          const uids = input.uids
            ? (Array.isArray(input.uids) ? input.uids.map(Number) : [Number(input.uids)])
            : (input.uid ? [Number(input.uid)] : []);
          if (!uids || uids.length === 0 || !input.destMailbox) {
            throw new Error("uid(s) and destMailbox are required.");
          }
          const srcMailbox = input.mailbox ?? defaultMailbox;
          const chunkSize = Number(input.chunkSize ?? 100) || 100;
          const dryRun = Boolean(input.dryRun);

          return await withImap(cfg, async (client) => {
            const lock = await client.getMailboxLock(srcMailbox);
            try {
              if (dryRun) {
                return { ok: true, preview: true, from: srcMailbox, to: input.destMailbox, requested: uids.length, uids };
              }

              const moved = [];
              const failed = [];
              for (let i = 0; i < uids.length; i += chunkSize) {
                const chunk = uids.slice(i, i + chunkSize);
                try {
                  await client.messageMove({ uid: chunk }, input.destMailbox, { uid: true });
                  moved.push(...chunk);
                } catch (err) {
                  failed.push({ uids: chunk, error: err?.message ?? String(err) });
                }
              }

              return {
                ok: true,
                from: srcMailbox,
                to: input.destMailbox,
                requested: uids.length,
                moved: moved.length,
                movedUids: moved,
                failed,
              };
            } finally {
              lock.release();
            }
          });
        }

        // â”€â”€ DELETE MESSAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        case "deleteMessage": {
          assertAllowed(cfg, "delete");
          if (!input.uid) throw new Error("uid is required.");
          const srcMailbox = input.mailbox ?? defaultMailbox;
          if (cfg.trashOnDelete !== false) {
            return await withImap(cfg, async (client) => {
              const lock = await client.getMailboxLock(srcMailbox);
              try {
                await client.messageMove({ uid: input.uid }, '[Gmail]/Trash', { uid: true });
                return { ok: true, uid: input.uid, action: 'trashed' };
              } finally {
                lock.release();
              }
            });
          } else {
            return await withImap(cfg, async (client) => {
              const lock = await client.getMailboxLock(srcMailbox);
              try {
                await client.messageFlagsAdd({ uid: input.uid }, ['\\Deleted'], { uid: true });
                await client.mailboxClose();
                return { ok: true, uid: input.uid, action: 'permanently-deleted' };
              } finally {
                lock.release();
              }
            });
          }
        }

        // â”€â”€ TEMPLATES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Templates are stored as plain messages in a dedicated IMAP mailbox.
        // A [TPL:name] prefix in the subject is used for identification.

        case "createTemplate": {
          assertAllowed(cfg, "create-template");
          if (!input.name || !input.subject || !input.body) {
            throw new Error("name, subject, and body are required.");
          }
          const tmplMailbox = cfg.templateMailbox ?? 'NyteShiftTemplates';
          const nodemailer = await import('nodemailer');
          const transport = nodemailer.createTransport({ streamTransport: true, newline: 'crlf' });
          const { message } = await transport.sendMail({
            from:    cfg.email,
            to:      'template@nyteshift.internal',
            subject: `[TPL:${input.name}] ${input.subject}`,
            text:    input.body,
          });
          const chunks = [];
          await new Promise((resolve, reject) => {
            message.on('data', (c) => chunks.push(c));
            message.on('end', resolve);
            message.on('error', reject);
          });
          const raw = Buffer.concat(chunks);
          return await withImap(cfg, async (client) => {
            // Create the mailbox if it does not exist
            const exists = await client.mailboxExists(tmplMailbox).catch(() => false);
            if (!exists) await client.mailboxCreate(tmplMailbox);
            const result = await client.append(tmplMailbox, raw);
            return { ok: true, uid: result.uid, mailbox: tmplMailbox, name: input.name, subject: input.subject };
          });
        }

        case "listTemplates": {
          assertAllowed(cfg, "list-templates");
          const tmplMailbox = cfg.templateMailbox ?? 'NyteShiftTemplates';
          return await withImap(cfg, async (client) => {
            const exists = await client.mailboxExists(tmplMailbox).catch(() => false);
            if (!exists) return { ok: true, templates: [] };
            const lock = await client.getMailboxLock(tmplMailbox);
            try {
              const templates = [];
              for await (const msg of client.fetch('1:*', {
                uid: true, envelope: true,
              })) {
                const subj = msg.envelope.subject ?? '';
                const nameMatch = subj.match(/^\[TPL:(.+?)\]\s*(.*)/);
                templates.push({
                  uid:     msg.uid,
                  name:    nameMatch?.[1] ?? subj,
                  subject: nameMatch?.[2] ?? subj,
                  date:    msg.envelope.date?.toISOString() ?? '',
                });
              }
              return { ok: true, templates };
            } finally {
              lock.release();
            }
          });
        }

        case "setCredentials": {
          // Save credentials to the runtime secret store (preferred) or fall back to disk config.
          const toolKey = 'nyteshift/gmail';
          const savedApp = input.appPassword ? await setToolSecret(ctx, toolKey, 'appPassword', input.appPassword).catch(() => false) : false;
          const savedRefresh = input.refreshToken ? await setToolSecret(ctx, toolKey, 'refreshToken', input.refreshToken).catch(() => false) : false;
          try {
            if (!savedApp && input.appPassword) await writeNyteShiftToolConfig({ appPassword: input.appPassword });
          } catch (_) {}
          try {
            if (!savedRefresh && input.refreshToken) await writeNyteShiftToolConfig({ refreshToken: input.refreshToken });
          } catch (_) {}
          try {
            if (input.email) await writeNyteShiftToolConfig({ email: input.email });
          } catch (_) {}
          return { ok: true, savedApp: !!savedApp, savedRefresh: !!savedRefresh };
        }

        default:
          return {
            ok:    false,
            error: `Unknown action "${action}". Supported: listMessages, getMessage, searchMessages, ` +
                   `sendMessage, replyMessage, createDraft, listMailboxes, moveMessage, ` +
                   `deleteMessage, createTemplate, listTemplates.`,
          };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

// â”€â”€â”€ spec â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const spec = {
  name: "gmail",
  version: "2.0.0",
  inputSchema: {
    type: "object",
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
          "listMailboxes",
          "moveMessage",
          "deleteMessage",
          "createTemplate",
          "listTemplates",
          "setCredentials",
          "markRead",
          "markUnread",
        ],
        description: "The Gmail operation to perform.",
      },

      // â”€â”€ mailbox / uid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      mailbox: {
        type: "string",
        description: "IMAP mailbox path to operate on (e.g. 'INBOX', '[Gmail]/Sent Mail'). Defaults to the tool's defaultMailbox setting.",
      },
      uid: {
        type: "number",
        description: "IMAP UID of the target message. For single-message calls provide `uid`; for batch operations supply `uids`.",
      },
      uids: {
        type: "array",
        items: { type: "number" },
        description: "Array of IMAP UIDs for batch operations (e.g. move or get).",
      },
      chunkSize: {
        type: "number",
        description: "Optional chunk size for batch operations (defaults: getMessage=50, moveMessage=100).",
      },
      dryRun: {
        type: "boolean",
        description: "When true, perform a preview without making changes (supported by moveMessage).",
      },
      destMailbox: {
        type: "string",
        description: "Destination IMAP mailbox path for moveMessage.",
      },

      // â”€â”€ search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      query: {
        type: "string",
        description: "Gmail-style search query (e.g. 'from:alice is:unread') used by searchMessages. Gmail IMAP supports X-GM-RAW extension. Use the optional `limit` input to override the tool's per-request limit.",
      },

      page: {
        type: "number",
        description: "1-based page number for paged search (default: 1).",
      },
      limit: {
        type: "number",
        description: "Number of messages per page for paged search. Overrides the tool's configured `limit` when provided. Capped at 200.",
      },
      order: {
        type: "string",
        enum: ["newest", "oldest"],
        description: "Sort order for search results: 'newest' (default) or 'oldest'.",
      },

      // Per-call override for page size (1-200). If omitted, tool config `limit` is used.
      // Use `limit` as the per-request/page size.

      // â”€â”€ compose fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      to: {
        type: "string",
        description: "Recipient email address(es). Required for sendMessage and createDraft; optional for replyMessage (defaults to original sender).",
      },
      appPassword: { type: "string", description: "App password or secret (16-character Gmail App Password)." },
      refreshToken: { type: "string", description: "Optional OAuth refresh token (if using OAuth2-based auth)." },
      email: { type: "string", description: "Optional email address to set when using setCredentials action." },
      cc:      { type: "string", description: "CC recipients." },
      bcc:     { type: "string", description: "BCC recipients." },
      subject: {
        type: "string",
        description: "Email subject. Required for sendMessage, createDraft, createTemplate.",
      },
      body: {
        type: "string",
        description: "Plain-text message body. Required for sendMessage, replyMessage, createDraft, createTemplate.",
      },

      // â”€â”€ template fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      name: {
        type: "string",
        description: "Template name used as identifier in createTemplate.",
      },
    },
  },

  outputSchema: {
    type: "object",
    required: ["ok"],
    properties: {
      ok:       { type: "boolean" },
      error:    { type: "string", description: "Present when ok=false." },
      savedApp: { type: "boolean" },
      savedRefresh: { type: "boolean" },

      // listMessages / searchMessages
      total:    { type: "number" },
      messages: { type: "array", items: { type: "object" } },
      mailbox:  { type: "string" },
      page:     { type: "number" },
      pages:    { type: "number" },
      limit:    { type: "number" },
      hasNext:  { type: "boolean" },
      hasPrev:  { type: "boolean" },
      order:    { type: "string" },

      // getMessage
      uid:      { type: "number" },
      from:     { type: "string" },
      to:       { type: "string" },
      subject:  { type: "string" },
      date:     { type: "string" },
      body:     { type: "string" },
      flags:    { type: "array", items: { type: "string" } },
      seen:     { type: "boolean" },
      messageId: { type: "string" },

      // sendMessage / replyMessage
      response: { type: "string" },

      // listMailboxes
      mailboxes: { type: "array", items: { type: "object" } },

      // moveMessage / deleteMessage
      action: { type: "string" },
      // Batch/move metadata
      requested: { type: "number" },
      moved: { type: "number" },
      movedUids: { type: "array", items: { type: "number" } },
      failed: { type: "array", items: { type: "object" } },
      preview: { type: "boolean" },

      // createTemplate / listTemplates
      name:      { type: "string" },
      templates: { type: "array", items: { type: "object" } },
    },
  },

  verify: ["gmail.listMailboxes"],
};

export default toolImpl;

export function getTool() {
  return toolImpl;
}
