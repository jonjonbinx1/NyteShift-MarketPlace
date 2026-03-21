/**
 * NyteShift Calendar Tool — NyteShift Marketplace
 * Contributor: nyteshift
 *
 * Unified calendar provider tool. Exposes adapter actions (Google, Microsoft, CalDAV)
 * and defines input/output schemas used by the NyteShift UI.
 */

import { readFileSync, promises as fsPromises } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { exec } from 'node:child_process';

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

async function writeNyteShiftToolConfig(changes = {}) {
  const cfgDir = join(homedir(), '.nyteshift');
  const cfgPath = join(cfgDir, 'config.json');
  try {
    await fsPromises.mkdir(cfgDir, { recursive: true });
  } catch (_) {}
  let data = {};
  try {
    const raw = await fsPromises.readFile(cfgPath, 'utf8');
    data = JSON.parse(raw || '{}');
  } catch (_) { data = {}; }
  if (!data.toolConfig || typeof data.toolConfig !== 'object') data.toolConfig = {};
  const existing = data.toolConfig['nyteshift/calendar'] ?? {};
  data.toolConfig['nyteshift/calendar'] = Object.assign({}, existing, changes);
  await fsPromises.writeFile(cfgPath, JSON.stringify(data, null, 2), 'utf8');
  return data.toolConfig['nyteshift/calendar'];
}

/**
 * Runtime secret helpers: prefer runtime secret API (context.getSecret/context.setSecret)
 * but fall back to storage APIs or on-disk config when unavailable.
 */
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

function openUrl(url) {
  try {
    const plat = process.platform;
    if (plat === 'win32') {
      exec(`start "" "${url.replace(/"/g, '\\"')}"`);
    } else if (plat === 'darwin') {
      exec(`open "${url.replace(/"/g, '\\"')}"`);
    } else {
      exec(`xdg-open "${url.replace(/"/g, '\\"')}"`);
    }
  } catch (e) {
    console.warn('[calendar] could not open browser automatically:', e?.message ?? e);
  }
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  return base64url(randomBytes(32));
}

function sha256ToBase64url(str) {
  return base64url(createHash('sha256').update(str).digest());
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
    {
      key: 'authorize_google',
      label: 'Authorize Google Calendar',
      type: 'action',
      actionLabel: 'Authorize',
      actionConfirmText: 'Open browser and sign in to Google Calendar?',
      actionCode: "// Opens a browser and completes OAuth (PKCE + localhost redirect). Tokens are saved to ~/.nyteshift/config.json"
    },

    // Microsoft OAuth
    { key: 'microsoftClientId', label: 'Microsoft Client ID', type: 'string' },
    { key: 'microsoftClientSecret', label: 'Microsoft Client Secret', type: 'secret' },
    { key: 'microsoftTenantId', label: 'Microsoft Tenant ID', type: 'string', default: 'common' },
    {
      key: 'authorize_microsoft',
      label: 'Authorize Microsoft/Outlook',
      type: 'action',
      actionLabel: 'Authorize',
      actionConfirmText: 'Start device-code flow for Microsoft sign-in?',
      actionCode: "// Starts device-code flow and opens the verification URL in the browser. Tokens are saved to ~/.nyteshift/config.json"
    },

    // CalDAV / server
    { key: 'caldavBaseUrl', label: 'CalDAV Base URL', type: 'string' },

    { key: 'allowedOperations', label: 'Allowed Operations', type: 'multiselect', options: ['read', 'write', 'auth'], default: ['read', 'write'], description: 'Allowed Calendar operations.' },
    { key: 'defaultCalendar', label: 'Default Calendar ID', type: 'string', default: '', description: 'Default calendar id when provider supports it.' },
  ],

  configAction: async function (key) {
    // Provide config-driven action buttons (e.g. Authorize Google / Microsoft)
    try {
      if (key === 'authorize_google') {
        return await this.run({ input: { action: 'authorizeInteractive', provider: 'google' }, context: {} });
      }
      if (key === 'authorize_microsoft') {
        return await this.run({ input: { action: 'authorizeInteractive', provider: 'microsoft' }, context: {} });
      }
      throw new Error('Unknown action');
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },

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
          const providers = ['google', 'microsoft', 'caldav'];
          const uiActions = [];
          if (cfg.googleClientId || cfg.googleClientSecret) uiActions.push({ id: 'authorize_google', label: 'Authorize Google Calendar', action: { action: 'authorizeInteractive', provider: 'google' }, description: 'Click to sign in with Google and persist tokens.' });
          if (cfg.microsoftClientId || cfg.microsoftClientSecret) uiActions.push({ id: 'authorize_microsoft', label: 'Authorize Microsoft/Outlook', action: { action: 'authorizeInteractive', provider: 'microsoft' }, description: 'Click to sign in with Microsoft (device-code if required).' });
          return { ok: true, fileCfg, uiCfg, cfg, providers, uiActions };
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
          const cb = (resp) => {
            deviceMessage = resp?.message ?? String(resp);
            if (resp?.verification_uri_complete) openUrl(resp.verification_uri_complete);
            else if (resp?.verification_uri) openUrl(resp.verification_uri);
            if (typeof context?.sendLog === 'function') context.sendLog(deviceMessage); else console.log('[calendar deviceCode]', deviceMessage);
          };
          const result = await adapter.acquireTokenByDeviceCode(scopes, cb);
          try {
            const toolKey = 'nyteshift/calendar';
            const saved = await setToolSecret(context, toolKey, 'microsoftRefreshToken', result?.refreshToken ?? result?.refresh_token).catch(() => false);
            try { await setToolSecret(context, toolKey, 'microsoftAccessToken', result?.accessToken ?? result?.access_token).catch(() => false); } catch (_) {}
            if (!saved) {
              await writeNyteShiftToolConfig({ microsoftAccessToken: result?.accessToken ?? result?.access_token, microsoftRefreshToken: result?.refreshToken ?? result?.refresh_token });
            }
          } catch (_) {}
          return { ok: true, result, deviceMessage };
        }

        case 'authorizeInteractive': {
          assertAllowed(cfg, 'auth');
          const provider = input.provider ?? cfg.defaultProvider;
          if (!provider) throw new Error('provider is required');

      // Prefer runtime secrets via NyteShift secret API (context.getSecret / context.storage etc.)
      try {
        const toolKey = 'nyteshift/calendar';
        const runtimeGoogleRefresh = await getToolSecret(ctx, toolKey, 'googleRefreshToken')
          ?? await getToolSecret(ctx, toolKey, 'google.refreshToken')
          ?? await getToolSecret(ctx, toolKey, 'refreshToken');
        if (runtimeGoogleRefresh) uiCfg.googleRefreshToken = runtimeGoogleRefresh;

        const runtimeGoogleAccess = await getToolSecret(ctx, toolKey, 'googleAccessToken')
          ?? await getToolSecret(ctx, toolKey, 'google.accessToken')
          ?? await getToolSecret(ctx, toolKey, 'accessToken');
        if (runtimeGoogleAccess) uiCfg.googleAccessToken = runtimeGoogleAccess;

        const runtimeMsRefresh = await getToolSecret(ctx, toolKey, 'microsoftRefreshToken')
          ?? await getToolSecret(ctx, toolKey, 'microsoft.refreshToken');
        if (runtimeMsRefresh) uiCfg.microsoftRefreshToken = runtimeMsRefresh;

        const runtimeMsAccess = await getToolSecret(ctx, toolKey, 'microsoftAccessToken')
          ?? await getToolSecret(ctx, toolKey, 'microsoft.accessToken');
        if (runtimeMsAccess) uiCfg.microsoftAccessToken = runtimeMsAccess;
      } catch (_) {}
      const client = await ensureClient(context, uiCfg, fileCfg);
      const adapter = client.getAdapter(provider);
          if (provider === 'google') {
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = sha256ToBase64url(codeVerifier);

            // start local server
            const server = http.createServer();
            await new Promise((resolve, reject) => {
              server.listen(0, '127.0.0.1', () => resolve());
              server.on('error', reject);
            });
            const addr = server.address();
            const port = addr && addr.port ? addr.port : 0;
            const redirectPath = '/nyteshift-calendar/callback';
            const redirectUri = `http://127.0.0.1:${port}${redirectPath}`;

            const clientId = adapter?.config?.clientId ?? cfg.googleClientId;
            if (!clientId) throw new Error('Google client id is not configured');
            const scopeArr = Array.isArray(input.scope) ? input.scope : (typeof input.scope === 'string' ? input.scope.split(' ') : ['https://www.googleapis.com/auth/calendar']);
            const scope = scopeArr.join(' ');
            const state = base64url(randomBytes(8));

            const params = new URLSearchParams({
              client_id: clientId,
              redirect_uri: redirectUri,
              response_type: 'code',
              scope,
              access_type: input.accessType ?? 'offline',
              prompt: input.prompt ?? 'consent',
              state,
              code_challenge: codeChallenge,
              code_challenge_method: 'S256',
            });

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
            openUrl(authUrl);

            const tokens = await new Promise((resolve, reject) => {
              const timeoutMs = Number(input.timeout ?? 120000);
              const timer = setTimeout(() => { server.close(); reject(new Error('Timed out waiting for OAuth callback')); }, timeoutMs);

              server.on('request', async (req, res) => {
                try {
                  const full = new URL(req.url, `http://127.0.0.1:${port}`);
                  if (full.pathname !== redirectPath) { res.writeHead(404); res.end('Not found'); return; }
                  const code = full.searchParams.get('code');
                  const returnedState = full.searchParams.get('state');
                  if (!code || returnedState !== state) {
                    res.writeHead(400); res.end('Invalid response');
                    clearTimeout(timer); server.close(); return reject(new Error('Invalid OAuth callback'));
                  }

                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end('<html><body><h1>Authorization complete</h1><p>You may close this window.</p></body></html>');

                  const tokenUrl = 'https://oauth2.googleapis.com/token';
                  const bodyParams = new URLSearchParams();
                  bodyParams.append('client_id', clientId);
                  const clientSecret = adapter?.config?.clientSecret ?? cfg.googleClientSecret;
                  if (clientSecret) bodyParams.append('client_secret', clientSecret);
                  bodyParams.append('code', code);
                  bodyParams.append('code_verifier', codeVerifier);
                  bodyParams.append('grant_type', 'authorization_code');
                  bodyParams.append('redirect_uri', redirectUri);

                  let fetchFn = (typeof fetch === 'function') ? fetch : null;
                  if (!fetchFn) {
                    try { const mod = await import('node-fetch'); fetchFn = mod.default ?? mod; } catch (e) { }
                  }
                  if (!fetchFn) throw new Error('No fetch available to exchange token');

                  const tokenRes = await fetchFn(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: bodyParams.toString() });
                  const tokenBody = await tokenRes.json().catch(() => ({}));
                  if (!tokenRes.ok) { clearTimeout(timer); server.close(); return reject(new Error(tokenBody.error_description || tokenBody.error || JSON.stringify(tokenBody))); }

                  try {
                    if (typeof adapter.setCredentials === 'function') {
                      await adapter.setCredentials({ access_token: tokenBody.access_token, refresh_token: tokenBody.refresh_token, id_token: tokenBody.id_token, expiry_date: Date.now() + (Number(tokenBody.expires_in || 3600) * 1000) });
                    }
                  } catch (_) {}
                  try {
                    const toolKey = 'nyteshift/calendar';
                    const savedRefresh = await setToolSecret(context, toolKey, 'googleRefreshToken', tokenBody.refresh_token).catch(() => false);
                    try { await setToolSecret(context, toolKey, 'googleAccessToken', tokenBody.access_token).catch(() => false); } catch (_) {}
                    const expiry = Date.now() + (Number(tokenBody.expires_in || 3600) * 1000);
                    try { await setToolSecret(context, toolKey, 'googleAccessTokenExpiry', String(expiry)).catch(() => false); } catch (_) {}
                    if (!savedRefresh) {
                      await writeNyteShiftToolConfig({ googleAccessToken: tokenBody.access_token, googleRefreshToken: tokenBody.refresh_token, googleAccessTokenExpiry: expiry });
                    }
                  } catch (_) {}

                  clearTimeout(timer); server.close(); return resolve(tokenBody);
                } catch (err) {
                  clearTimeout(timer); server.close(); return reject(err);
                }
              });
            });

            return { ok: true, tokens };
          }

          if (provider === 'microsoft') {
            if (!adapter || typeof adapter.acquireTokenByDeviceCode !== 'function') throw new Error('Adapter does not support device code interactive');
            let deviceMsg = null;
            const cb = (resp) => {
              deviceMsg = resp?.message ?? String(resp);
              if (resp?.verification_uri_complete) openUrl(resp.verification_uri_complete);
              else if (resp?.verification_uri) openUrl(resp.verification_uri);
              if (typeof context?.sendLog === 'function') context.sendLog(deviceMsg); else console.log('[calendar deviceCode]', deviceMsg);
            };
            const scopes = input.scope ?? ['https://graph.microsoft.com/.default'];
            const result = await adapter.acquireTokenByDeviceCode(scopes, cb);
            try {
              const toolKey = 'nyteshift/calendar';
              const saved = await setToolSecret(context, toolKey, 'microsoftRefreshToken', result?.refreshToken ?? result?.refresh_token).catch(() => false);
              try { await setToolSecret(context, toolKey, 'microsoftAccessToken', result?.accessToken ?? result?.access_token).catch(() => false); } catch (_) {}
              if (!saved) {
                await writeNyteShiftToolConfig({ microsoftAccessToken: result?.accessToken ?? result?.access_token, microsoftRefreshToken: result?.refreshToken ?? result?.refresh_token });
              }
            } catch (_) {}
            return { ok: true, result, deviceMessage: deviceMsg };
          }

          return { ok: false, error: 'Interactive authorize not implemented for provider' };
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
          return { ok: false, error: `Unknown action "${action}". Supported actions: getConfig, listProviders, generateAuthUrl, deviceCode, authorize, authorizeInteractive, setCredentials, refreshToken, listCalendars, listEvents, createEvent, updateEvent, deleteEvent` };
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
      action: { type: 'string', enum: ['getConfig','listProviders','generateAuthUrl','deviceCode','authorize','authorizeInteractive','setCredentials','refreshToken','listCalendars','listEvents','createEvent','updateEvent','deleteEvent'] },
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
