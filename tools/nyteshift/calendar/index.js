'use strict';

class CalendarClient {
  constructor(opts = {}) {
    this.adapters = {};
    this.storage = opts.storage;
  }

  registerAdapter(name, adapter) {
    this.adapters[name] = adapter;
  }

  getAdapter(name) {
    const a = this.adapters[name];
    if (!a) throw new Error(`Adapter not registered: ${name}`);
    return a;
  }

  async initAdapter(name, config) {
    const adapter = this.getAdapter(name);
    if (typeof adapter.init === 'function') await adapter.init(config);
    return adapter;
  }

  async connect(name, config) {
    const adapter = await this.initAdapter(name, config);
    if (typeof adapter.connect === 'function') return adapter.connect(config);
    if (typeof adapter.authorize === 'function') return adapter.authorize(config);
    return null;
  }

  async listCalendars(name, opts) {
    return this.getAdapter(name).listCalendars(opts);
  }

  async listEvents(name, calendarId = 'primary', opts = {}) {
    return this.getAdapter(name).listEvents(calendarId, opts);
  }

  async createEvent(name, calendarId = 'primary', event = {}) {
    return this.getAdapter(name).createEvent(calendarId, event);
  }

  async updateEvent(name, calendarId = 'primary', eventId, patch = {}) {
    return this.getAdapter(name).updateEvent(calendarId, eventId, patch);
  }

  async deleteEvent(name, calendarId = 'primary', eventId) {
    return this.getAdapter(name).deleteEvent(calendarId, eventId);
  }

  async refreshToken(name, token) {
    const adapter = this.getAdapter(name);
    if (typeof adapter.refreshToken === 'function') return adapter.refreshToken(token);
    throw new Error('Adapter does not implement refreshToken');
  }
}

module.exports = { CalendarClient, createClient: (opts) => new CalendarClient(opts) };
