# NyteShift Calendar tool

Lightweight unified calendar client and provider adapters for NyteShift.

Prereqs
- Node 18+

Install (local to the tool)
```bash
cd tools/nyteshift/calendar
npm install
```

Quick usage
```js
const { CalendarClient } = require('./index');
const GoogleAdapter = require('./adapters/google');

const client = new CalendarClient();
const google = new GoogleAdapter({ clientId: 'YOUR_CLIENT_ID', clientSecret: 'YOUR_SECRET', redirectUri: 'http://localhost:3000/oauth2callback' });
client.registerAdapter('google', google);

const authUrl = google.generateAuthUrl({ scope: ['https://www.googleapis.com/auth/calendar'] });
console.log('Open this URL to authorize:', authUrl);
```

Next steps
- Implement full auth flows (PKCE, device code, refresh) in adapters
- Add secure token storage and refresh handling
