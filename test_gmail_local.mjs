// test_gmail_local.mjs
// Test script for SolixAI Gmail tool (local IMAP search)
// Usage: node --experimental-modules test_gmail_local.mjs

import toolImpl from './tools/solix/gmail/tool.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

async function main() {
  // Read config to print which account is being used
  let email = '(unknown)';
  try {
    const cfgPath = join(homedir(), '.solix', 'config.json');
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    email = parsed?.toolConfig?.['solix/gmail']?.email || email;
  } catch (e) {
    // ignore
  }
  console.log('Using Gmail account:', email);

  const context = { config: {} }; // Leave empty to use ~/.solix/config.json

  try {
    // Test 1: listMessages (sequence-based fetch — works like Thunderbird)
    const listResult = await toolImpl.run({
      input: { action: 'listMessages', mailbox: 'INBOX' },
      context,
    });
    console.log('listMessages result:', JSON.stringify(listResult, null, 2));

    // Test 2: searchMessages with 'is:unread' (standard IMAP UNSEEN)
    const searchResult = await toolImpl.run({
      input: { action: 'searchMessages', mailbox: 'INBOX', query: 'is:unread' },
      context,
    });
    console.log('searchMessages(is:unread) result:', JSON.stringify(searchResult, null, 2));

    // Test 3: List mailboxes
    const mbResult = await toolImpl.run({
      input: { action: 'listMailboxes' },
      context,
    });
    console.log('Mailboxes:', JSON.stringify(mbResult, null, 2));
  } catch (err) {
    console.error('Error running Gmail tool:', err);
  }
}

main();
