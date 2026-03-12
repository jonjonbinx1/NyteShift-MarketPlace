'use strict';

class CalDAVAdapter {
  constructor(config = {}) { this.config = config; }
  init(config = {}) { this.config = Object.assign({}, this.config, config); }
  async listCalendars() { throw new Error('CalDAV adapter not implemented yet'); }
  async listEvents() { throw new Error('CalDAV adapter not implemented yet'); }
}

module.exports = CalDAVAdapter;
