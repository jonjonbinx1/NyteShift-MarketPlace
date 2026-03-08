# Solix Discord Tool

This tool provides minimal Discord send/read operations by delegating to the Solix core Discord bridge.

Important: this tool intentionally does not add or modify any package.json files. It relies on the bridge's configuration (global or agent-scoped) for bot tokens and permissions.

Usage examples
- Send: { action: 'sendMessage', channelId: '123', content: 'Hello' }
- Read: { action: 'readMessages', channelId: '123', limit: 25 }
