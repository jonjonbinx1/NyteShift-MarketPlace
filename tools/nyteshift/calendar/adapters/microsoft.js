'use strict';

let msal;
try { msal = require('@azure/msal-node'); } catch (e) { msal = null; }

class MicrosoftAdapter {
  constructor(config = {}) {
    this.config = config;
    this.app = null;
    this.account = null;
  }

  init(config = {}) {
    this.config = Object.assign({}, this.config, config);
    if (!msal) throw new Error('@azure/msal-node not installed; run npm install @azure/msal-node');
    const msalConfig = { auth: { clientId: this.config.clientId, authority: this.config.authority || 'https://login.microsoftonline.com/common', clientSecret: this.config.clientSecret } };
    if (this.config.clientSecret) {
      this.app = new msal.ConfidentialClientApplication(msalConfig);
    } else {
      this.app = new msal.PublicClientApplication(msalConfig);
    }
  }

  async acquireTokenByDeviceCode(scopes=['https://graph.microsoft.com/.default'], callback) {
    if (!this.app) this.init();
    if (!this.app.acquireTokenByDeviceCode) throw new Error('Device code flow not supported by MSAL client type');
    const result = await this.app.acquireTokenByDeviceCode({ deviceCodeCallback: callback, scopes });
    this.account = result.account;
    return result;
  }

  async acquireTokenByCode(code, scopes=['https://graph.microsoft.com/.default'], redirectUri) {
    if (!this.app) this.init();
    const resp = await this.app.acquireTokenByCode({ code, scopes, redirectUri });
    this.account = resp.account;
    return resp;
  }

  async refreshToken(refreshToken, scopes=['https://graph.microsoft.com/.default']) {
    if (!this.app) this.init();
    if (!this.config.clientSecret) throw new Error('refreshToken requires confidential client');
    const result = await this.app.acquireTokenByRefreshToken({ refreshToken, scopes });
    return result;
  }

  async callGraph(path, accessToken, method='GET', body) {
    const url = `https://graph.microsoft.com/v1.0${path}`;
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`Graph error ${res.status}`);
    return res.json();
  }

  async listCalendars(accessToken) {
    return this.callGraph('/me/calendars', accessToken);
  }

  async listEvents(accessToken, calendarId='calendar', opts='') {
    const path = `/me/calendars/${encodeURIComponent(calendarId)}/events${opts ? '?'+opts : ''}`;
    return this.callGraph(path, accessToken);
  }

  async createEvent(accessToken, calendarId='calendar', event) {
    const path = `/me/calendars/${encodeURIComponent(calendarId)}/events`;
    return this.callGraph(path, accessToken, 'POST', event);
  }

  async updateEvent(accessToken, calendarId='calendar', eventId, patch) {
    const path = `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    return this.callGraph(path, accessToken, 'PATCH', patch);
  }

  async deleteEvent(accessToken, calendarId='calendar', eventId) {
    const path = `/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    return this.callGraph(path, accessToken, 'DELETE');
  }
}

module.exports = MicrosoftAdapter;
