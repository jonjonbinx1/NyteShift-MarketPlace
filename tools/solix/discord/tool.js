/**
 * Discord Tool — SolixAI Marketplace
 * Contributor: solix
 *
 * Minimal send/read tool that delegates to the Solix core Discord bridge.
 * Does NOT modify any package.json; relies on the bridge for tokens/config.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function readSolixToolConfig() {
  try {
    const cfgPath = join(homedir(), '.solix', 'config.json');
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.toolConfig?.['solix/discord'] ?? {};
  } catch (e) {
    console.warn('[discord] could not read ~/.solix/config.json:', e.message);
    return {};
  }
}

function assertAllowed(config, operation) {
  const allowed = config?.allowedOperations ?? [];
  if (!allowed.includes(operation)) {
    throw new Error(`Operation "${operation}" is not enabled in the Discord tool config.`);
  }
}

async function ensureBridge() {
  try {
    const core = await import('@solix/core');
    const getBridge = core.getGlobalBridge ?? core.getBridge ?? core.getBridgeInstance;
    const startBridge = core.startGlobalBridge ?? core.startBridge;

    let bridge = null;
    if (typeof getBridge === 'function') {
      bridge = getBridge();
      if (bridge && typeof bridge.then === 'function') bridge = await bridge;
    }
    if (!bridge && typeof startBridge === 'function') {
      bridge = await startBridge();
    }

    // If the core exports helpers directly, treat core as a thin bridge
    if (!bridge && (typeof core.sendDiscordMessage === 'function' || typeof core.fetchDiscordMessages === 'function')) {
      return core;
    }

    if (!bridge) throw new Error('Solix core bridge not available.');
    return bridge;
  } catch (e) {
    throw new Error(`Could not import @solix/core: ${e.message}`);
  }
}

async function sendViaBridge(bridge, channelId, content, options = {}) {
  if (typeof bridge.sendDiscordMessage === 'function') return await bridge.sendDiscordMessage(channelId, content, options);
  if (typeof bridge.sendMessage === 'function') return await bridge.sendMessage(channelId, { content, ...options });
  if (typeof bridge.send === 'function') return await bridge.send(channelId, content, options);
  throw new Error('Bridge does not expose a send function.');
}

async function fetchViaBridge(bridge, channelId, opts = {}) {
  if (typeof bridge.fetchDiscordMessages === 'function') return await bridge.fetchDiscordMessages(channelId, opts);
  if (typeof bridge.fetchMessages === 'function') return await bridge.fetchMessages(channelId, opts);
  if (typeof bridge.getMessages === 'function') return await bridge.getMessages(channelId, opts);
  throw new Error('Bridge does not expose a fetch function.');
}

const toolImpl = {
  name: 'discord',
  version: '1.0.0',
  contributor: 'solix',
  description: 'Send and read Discord messages via the Solix Discord bridge.',

  config: [
    {
      key: 'allowedOperations',
      label: 'Allowed Operations',
      type: 'multiselect',
      options: ['send', 'read'],
      default: ['send', 'read'],
      description: 'Which Discord operations are permitted.',
    },
    {
      key: 'defaultChannel',
      label: 'Default Channel ID',
      type: 'string',
      default: '',
      description: 'Optional default channelId when none provided.',
    },
  ],

  run: async ({ input, context }) => {
    const uiCfg = context?.config ?? {};
    const fileCfg = readSolixToolConfig();
    const cfg = { ...fileCfg, ...uiCfg };
    cfg.defaultChannel = cfg.defaultChannel ?? '';

    if (!input || typeof input.action !== 'string') return { ok: false, error: 'action is required' };
    const action = input.action;

    try {
      switch (action) {
        case 'sendMessage': {
          assertAllowed(cfg, 'send');
          const channelId = input.channelId ?? cfg.defaultChannel;
          if (!channelId) throw new Error('channelId is required');
          if (!input.content) throw new Error('content is required');
          const bridge = await ensureBridge();
          const options = { ...(input.options ?? {}) };
          if (input.replyToId) options.replyToId = input.replyToId;
          const res = await sendViaBridge(bridge, channelId, input.content, options);
          const messageId = res?.id ?? res?.messageId ?? null;
          return { ok: true, messageId, response: res };
        }

        case 'readMessages': {
          assertAllowed(cfg, 'read');
          const channelId = input.channelId ?? cfg.defaultChannel;
          if (!channelId) throw new Error('channelId is required');
          const bridge = await ensureBridge();
          const opts = { limit: input.limit ?? 50, before: input.before, after: input.after };
          const raw = await fetchViaBridge(bridge, channelId, opts);
          const items = Array.isArray(raw) ? raw : (raw?.messages ?? []);
          const messages = items.map((m) => ({
            id: m.id ?? m.messageId ?? null,
            author: (m.author && (m.author.username ?? m.author.name)) ?? m.author ?? null,
            content: m.content ?? m.text ?? '',
            timestamp: m.timestamp ?? m.ts ?? m.createdAt ?? null,
            raw: m,
          }));
          return { ok: true, channelId, total: messages.length, messages };
        }

        default:
          return { ok: false, error: `Unknown action "${action}". Supported: sendMessage, readMessages` };
      }
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
};

export const spec = {
  name: 'discord',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: { type: 'string', enum: ['sendMessage', 'readMessages'] },
      channelId: { type: 'string' },
      content: { type: 'string' },
      replyToId: { type: 'string' },
      options: { type: 'object' },
      limit: { type: 'number' },
      before: { type: 'string' },
      after: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['ok'],
    properties: {
      ok: { type: 'boolean' },
      error: { type: 'string' },
      messageId: { type: 'string' },
      response: { type: 'object' },
      messages: { type: 'array', items: { type: 'object' } },
      total: { type: 'number' },
      channelId: { type: 'string' },
    },
  },
  verify: ['discord.sendMessage'],
};

export default toolImpl;

export function getTool() {
  return toolImpl;
}
