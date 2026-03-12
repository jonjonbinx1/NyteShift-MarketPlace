/**
 * NyteShift Calendar Tool — NyteShift Marketplace
 * Contributor: nyteshift
 *
 * Unified calendar provider tool. Exposes adapter actions (Google, Microsoft, CalDAV)
 * and defines input/output schemas used by the NyteShift UI.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function readNyteShiftToolConfig() {
  try {
    const cfgPath = join(homedir(), '.nyteshift', 'config.json');
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.toolConfig?.['nyteshift/calendar'] ?? {};
  } catch (e) {
    return {};
  }
}

function assertAllowed(config, operation) {
  const allowed = config?.allowedOperations ?? [];
  if (!allowed.includes(operation)) {
    throw new Error(`Operation "${operation}" is not enabled in the Calendar tool config.`);
  }
}

async function ensureClient(context = {}, uiCfg = {}, fileCfg = {}) {
  const ctx = context ?? {};
  try {
    const candidate = ctx.calendarClient ?? ctx.calendar ?? ctx.toolClient ?? ctx.client ?? ctx.toolCalendar;
    if (candidate) {
      if (typeof candidate === 'function') {
        const c = candidate();
        if (c && typeof c.then === 'function') return await c;
        return c;
      }
      return candidate;
    }
  } catch (_) {}

  // Dynamic import of local Calendar client and adapters
  const calMod = await import('./index.js');
  const calExports = calMod?.default ?? calMod;
  const CalendarClientClass = calExports?.CalendarClient ?? null;
  const createClient = calExports?.createClient ?? null;

  let client;
  if (typeof createClient === 'function') client = createClient({ storage: ctx.storage ?? null });
  else if (CalendarClientClass) client = new CalendarClientClass({ storage: ctx.storage ?? null });
  else throw new Error('Calendar client module not available.');

  // Load adapters
  const gMod = await import('./adapters/google.js');
  const GoogleAdapter = gMod?.default ?? gMod;
  const mMod = await import('./adapters/microsoft.js');
  const MicrosoftAdapter = mMod?.default ?? mMod;
  const cMod = await import('./adapters/caldav.js');
  const CalDAVAdapter = cMod?.default ?? cMod;

  // Build provider configs (UI cfg overrides file cfg)
  const googleCfg = Object.assign({}, fileCfg?.google ?? {}, uiCfg?.google ?? {}, {
    clientId: uiCfg.googleClientId ?? fileCfg.googleClientId ?? uiCfg.clientId ?? fileCfg.clientId,
    clientSecret: uiCfg.googleClientSecret ?? fileCfg.googleClientSecret ?? uiCfg.clientSecret ?? fileCfg.clientSecret,
    redirectUri: uiCfg.googleRedirectUri ?? fileCfg.googleRedirectUri ?? uiCfg.redirectUri ?? fileCfg.redirectUri,
    refreshToken: uiCfg.googleRefreshToken ?? fileCfg.googleRefreshToken ?? fileCfg.refreshToken,
    accessToken: uiCfg.googleAccessToken ?? fileCfg.googleAccessToken,
  });

  const msCfg = Object.assign({}, fileCfg?.microsoft ?? {}, uiCfg?.microsoft ?? {}, {
    clientId: uiCfg.microsoftClientId ?? fileCfg.microsoftClientId ?? uiCfg.clientId ?? fileCfg.clientId,
    clientSecret: uiCfg.microsoftClientSecret ?? fileCfg.microsoftClientSecret ?? uiCfg.clientSecret ?? fileCfg.clientSecret,
    authority: uiCfg.microsoftAuthority ?? fileCfg.microsoftAuthority ?? fileCfg.authority,
    tenantId: uiCfg.microsoftTenantId ?? fileCfg.microsoftTenantId ?? fileCfg.tenantId,
    refreshToken: uiCfg.microsoftRefreshToken ?? fileCfg.microsoftRefreshToken,
    accessToken: uiCfg.microsoftAccessToken ?? fileCfg.microsoftAccessToken,
  });

  const caldavCfg = Object.assign({}, fileCfg?.caldav ?? {}, uiCfg?.caldav ?? {});

  // Instantiate and init adapters
  try {
    const g = new GoogleAdapter(googleCfg);
    if (typeof g.init === 'function') await g.init(googleCfg);
    if (googleCfg?.accessToken || googleCfg?.refreshToken) {
      try { await g.setCredentials({ access_token: googleCfg.accessToken, refresh_token: googleCfg.refreshToken }); } catch (_) {}
    }
    client.registerAdapter('google', g);
  } catch (e) {
    // ignore; adapter may be missing until installed
  }

  try {
    const m = new MicrosoftAdapter(msCfg);
    if (typeof m.init === 'function') await m.init(msCfg);
    client.registerAdapter('microsoft', m);
  } catch (e) {}

  try {
    const cd = new CalDAVAdapter(caldavCfg);
    if (typeof cd.init === 'function') await cd.init(caldavCfg);
    client.registerAdapter('caldav', cd);
  } catch (e) {}

  return client;
}

const toolImpl = {
  name: 'calendar',
  version: '0.1.0',
  contributor: 'nyteshift',
  description: 'Unified calendar provider tool (Google Calendar, Microsoft/Outlook, CalDAV).',

  config: [
    { key: 'defaultProvider', label: 'Default Provider', type: 'string', default: 'google', description: 'Default provider to use when none supplied (google, microsoft, caldav).' },

    // Google OAuth
    { key: 'googleClientId', label: 'Google Client ID', type: 'string' },
    { key: 'googleClientSecret', label: 'Google Client Secret', type: 'secret' },
    { key: 'googleRedirectUri', label: 'Google Redirect URI', type: 'string' },
    { key: 'googleRefreshToken', label: 'Google Refresh Token', type: 'secret' },

    // Microsoft OAuth
    { key: 'microsoftClientId', label: 'Microsoft Client ID', type: 'string' },
    { key: 'microsoftClientSecret', label: 'Microsoft Client Secret', type: 'secret' },
    { key: 'microsoftTenantId', label: 'Microsoft Tenant ID', type: 'string', default: 'common' },

    // CalDAV / server
    { key: 'caldavBaseUrl', label: 'CalDAV Base URL', type: 'string' },

    { key: 'allowedOperations', label: 'Allowed Operations', type: 'multiselect', options: ['read', 'write', 'auth'], default: ['read', 'write'], description: 'Allowed Calendar operations.' },
    { key: 'defaultCalendar', label: 'Default Calendar ID', type: 'string', default: '', description: 'Default calendar id when provider supports it.' },
  ],

  run: async ({ input, context }) => {
    const fileCfg = readNyteShiftToolConfig();
    const toolKey = 'nyteshift/calendar';
    const ctx = context ?? {};

    const candidates = [];
    if (ctx.toolConfig && ctx.toolConfig[toolKey]) candidates.push(ctx.toolConfig[toolKey]);
    if (ctx.config && ctx.config.toolConfig && ctx.config.toolConfig[toolKey]) candidates.push(ctx.config.toolConfig[toolKey]);
    if (ctx.config && typeof ctx.config === 'object') candidates.push(ctx.config);
    if (ctx.toolConfig && typeof ctx.toolConfig === 'object') candidates.push(ctx.toolConfig);

    const uiCfg = Object.assign({}, ...candidates);
    const cfg = { ...fileCfg, ...uiCfg };
    cfg.defaultProvider = cfg.defaultProvider ?? 'google';
    cfg.defaultCalendar = cfg.defaultCalendar ?? '';

    try {
      if (typeof process !== 'undefined' && process.env && process.env.NYTESHIFT_DEBUG_PROVIDER_RAW === '1') {
        try { console.debug('[calendar] RAW TOOL INPUT:', JSON.stringify(input, null, 2)); } catch (e) { console.debug('[calendar] RAW TOOL INPUT (non-serializable):', input); }
      }
    } catch (e) {}

    if (!input || typeof input.action !== 'string') return { ok: false, error: 'action is required' };
    const action = input.action;

    try {
      switch (action) {
        case 'getConfig': {
          return { ok: true, fileCfg, uiCfg, cfg };
        }

        case 'listProviders': {
          return { ok: true, providers: ['google', 'microsoft', 'caldav'] };
        }

        case 'generateAuthUrl': {
          assertAllowed(cfg, 'auth');
          const provider = input.provider ?? cfg.defaultProvider;
          if (!provider) throw new Error('provider is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const adapter = client.getAdapter(provider);
          if (!adapter || typeof adapter.generateAuthUrl !== 'function') throw new Error(`${provider} does not support generateAuthUrl`);
          const scope = input.scope ?? ['https://www.googleapis.com/auth/calendar'];
          const url = adapter.generateAuthUrl({ scope, accessType: input.accessType ?? 'offline', prompt: input.prompt ?? 'consent', state: input.state });
          return { ok: true, authUrl: url };
        }

        case 'deviceCode': {
          assertAllowed(cfg, 'auth');
          const provider = input.provider ?? cfg.defaultProvider;
          if (provider !== 'microsoft') throw new Error('deviceCode flow only supported for microsoft provider');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const adapter = client.getAdapter(provider);
          if (!adapter || typeof adapter.acquireTokenByDeviceCode !== 'function') throw new Error('Adapter does not support device code flow');
          const scopes = input.scope ?? ['https://graph.microsoft.com/.default'];
          let deviceMessage = null;
          const cb = (resp) => { deviceMessage = resp?.message ?? String(resp); if (typeof context?.sendLog === 'function') context.sendLog(deviceMessage); else console.log('[calendar deviceCode]', deviceMessage); };
          const result = await adapter.acquireTokenByDeviceCode(scopes, cb);
          return { ok: true, result, deviceMessage };
        }

        case 'authorize': {
          assertAllowed(cfg, 'auth');
          const provider = input.provider ?? cfg.defaultProvider;
          if (!provider) throw new Error('provider is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const adapter = client.getAdapter(provider);
          if (!adapter) throw new Error('Adapter not available');

          if (provider === 'google') {
            if (!input.code) throw new Error('code is required for google authorize');
            const tokens = await adapter.authorize({ code: input.code });
            return { ok: true, tokens };
          }

          if (provider === 'microsoft') {
            if (!input.code) throw new Error('code is required for microsoft authorize');
            const scopes = input.scope ?? ['https://graph.microsoft.com/.default'];
            const redirectUri = input.redirectUri ?? cfg.microsoftRedirectUri ?? cfg.googleRedirectUri;
            const resp = await adapter.acquireTokenByCode(input.code, scopes, redirectUri);
            return { ok: true, result: resp };
          }

          return { ok: false, error: 'authorize not implemented for provider' };
        }

        case 'setCredentials': {
          const provider = input.provider ?? cfg.defaultProvider;
          if (!provider) throw new Error('provider is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const adapter = client.getAdapter(provider);
          if (!adapter || typeof adapter.setCredentials !== 'function') throw new Error('Adapter does not support setCredentials');
          await adapter.setCredentials(input.tokens ?? input.credentials ?? {});
          return { ok: true };
        }

        case 'refreshToken': {
          const provider = input.provider ?? cfg.defaultProvider;
          if (!provider) throw new Error('provider is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const adapter = client.getAdapter(provider);
          if (!adapter || typeof adapter.refreshToken !== 'function') throw new Error('Adapter does not implement refreshToken');
          const refreshed = await adapter.refreshToken(input.refreshToken ?? input.token ?? null);
          return { ok: true, refreshed };
        }

        case 'listCalendars': {
          assertAllowed(cfg, 'read');
          const provider = input.provider ?? cfg.defaultProvider;
          const client = await ensureClient(context, uiCfg, fileCfg);
          const calendars = await client.listCalendars(provider, input.opts ?? {});
          return { ok: true, total: Array.isArray(calendars?.items ?? calendars) ? (calendars.items ?? calendars).length : (Array.isArray(calendars) ? calendars.length : 0), calendars };
        }

        case 'listEvents': {
          assertAllowed(cfg, 'read');
          const provider = input.provider ?? cfg.defaultProvider;
          const calendarId = input.calendarId ?? cfg.defaultCalendar ?? 'primary';
          const opts = input.opts ?? {};
          const client = await ensureClient(context, uiCfg, fileCfg);
          const ev = await client.listEvents(provider, calendarId, opts);
          return { ok: true, total: Array.isArray(ev?.items ?? ev) ? (ev.items ?? ev).length : (Array.isArray(ev) ? ev.length : 0), events: ev };
        }

        case 'createEvent': {
          assertAllowed(cfg, 'write');
          const provider = input.provider ?? cfg.defaultProvider;
          const calendarId = input.calendarId ?? cfg.defaultCalendar ?? 'primary';
          if (!input.event || typeof input.event !== 'object') throw new Error('event object is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const created = await client.createEvent(provider, calendarId, input.event);
          return { ok: true, event: created };
        }

        case 'updateEvent': {
          assertAllowed(cfg, 'write');
          const provider = input.provider ?? cfg.defaultProvider;
          const calendarId = input.calendarId ?? cfg.defaultCalendar ?? 'primary';
          if (!input.eventId) throw new Error('eventId is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          const updated = await client.updateEvent(provider, calendarId, input.eventId, input.patch ?? input.event ?? {});
          return { ok: true, event: updated };
        }

        case 'deleteEvent': {
          assertAllowed(cfg, 'write');
          const provider = input.provider ?? cfg.defaultProvider;
          const calendarId = input.calendarId ?? cfg.defaultCalendar ?? 'primary';
          if (!input.eventId) throw new Error('eventId is required');
          const client = await ensureClient(context, uiCfg, fileCfg);
          await client.deleteEvent(provider, calendarId, input.eventId);
          return { ok: true };
        }

        default:
          return { ok: false, error: `Unknown action "${action}". Supported actions: getConfig, listProviders, generateAuthUrl, deviceCode, authorize, setCredentials, refreshToken, listCalendars, listEvents, createEvent, updateEvent, deleteEvent` };
      }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
};

export const spec = {
  name: 'calendar',
  version: '0.1.0',
  requiresBridge: false,
  inputSchema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string', enum: ['getConfig','listProviders','generateAuthUrl','deviceCode','authorize','setCredentials','refreshToken','listCalendars','listEvents','createEvent','updateEvent','deleteEvent'] },
      provider: { type: 'string', enum: ['google','microsoft','caldav'] },

      // OAuth / auth
      scope: { type: ['array','string'] },
      code: { type: 'string' },
      redirectUri: { type: 'string' },
      tokens: { type: 'object' },
      refreshToken: { type: 'string' },

      // calendar operations
      calendarId: { type: 'string' },
      eventId: { type: 'string' },
      event: { type: 'object' },
      patch: { type: 'object' },
      opts: { type: 'object' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['ok'],
    properties: {
      ok: { type: 'boolean' },
      error: { type: 'string' },
      providers: { type: 'array', items: { type: 'string' } },
      authUrl: { type: 'string' },
      deviceMessage: { type: 'string' },
      tokens: { type: 'object' },
      calendars: { type: ['array','object'], items: { type: 'object' } },
      events: { type: ['array','object'], items: { type: 'object' } },
      event: { type: 'object' },
      result: { type: 'object' },
      total: { type: 'number' },
    },
  },
  verify: ['calendar.read','calendar.write'],
};

export default toolImpl;

export function getTool() { return toolImpl; }
