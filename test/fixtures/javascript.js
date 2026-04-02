// JavaScript fixture for SigMap extractor test

class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach((h) => h(data));
  }

  static create() {
    return new EventEmitter();
  }
}

export class ApiClient extends EventEmitter {
  constructor(baseUrl) {
    super();
    this.baseUrl = baseUrl;
  }

  async get(path) {
    return fetch(this.baseUrl + path);
  }

  async post(path, body) {
    return fetch(this.baseUrl + path, { method: 'POST', body });
  }
}

export async function fetchUser(id) {
  return null;
}

export const createSession = async (userId) => {
  return { userId };
};

module.exports = { EventEmitter, ApiClient, fetchUser };
