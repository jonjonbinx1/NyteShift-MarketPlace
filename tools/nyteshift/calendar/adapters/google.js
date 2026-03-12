'use strict';

let google;
try { google = require('googleapis').google; } catch (e) { google = null; }

class GoogleAdapter {
  constructor(config = {}) {
    this.config = config;
    this.oauth2Client = null;
  }

  init(config = {}) {
    this.config = Object.assign({}, this.config, config);
    if (!google) throw new Error('googleapis not installed; run npm install googleapis');
    const { clientId, clientSecret, redirectUri } = this.config;
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  generateAuthUrl({ scope = ['https://www.googleapis.com/auth/calendar'], accessType='offline', prompt='consent', state } = {}) {
    if (!this.oauth2Client) this.init();
    return this.oauth2Client.generateAuthUrl({ access_type: accessType, scope, prompt, state });
  }

  async authorize({ code } = {}) {
    if (!this.oauth2Client) this.init();
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  async setCredentials(tokens) {
    if (!this.oauth2Client) this.init();
    this.oauth2Client.setCredentials(tokens);
  }

  async listCalendars() {
    if (!google) throw new Error('googleapis not installed');
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await calendar.calendarList.list();
    return res.data;
  }

  async listEvents(calendarId='primary', opts={}) {
    if (!google) throw new Error('googleapis not installed');
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await calendar.events.list(Object.assign({ calendarId }, opts));
    return res.data;
  }

  async createEvent(calendarId='primary', event) {
    if (!google) throw new Error('googleapis not installed');
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await calendar.events.insert({ calendarId, resource: event });
    return res.data;
  }

  async updateEvent(calendarId='primary', eventId, event) {
    if (!google) throw new Error('googleapis not installed');
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const res = await calendar.events.patch({ calendarId, eventId, resource: event });
    return res.data;
  }

  async deleteEvent(calendarId='primary', eventId) {
    if (!google) throw new Error('googleapis not installed');
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    await calendar.events.delete({ calendarId, eventId });
    return { success: true };
  }

  async refreshToken(refreshToken) {
    if (!this.oauth2Client) this.init();
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    if (typeof this.oauth2Client.getAccessToken === 'function') {
      const token = await this.oauth2Client.getAccessToken();
      return token;
    }
    return this.oauth2Client.credentials;
  }
}

module.exports = GoogleAdapter;
