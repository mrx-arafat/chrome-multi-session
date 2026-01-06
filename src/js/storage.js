// Storage management for sessions and cookies

export const Storage = {
  // Default sessions
  DEFAULT_SESSIONS: [
    { id: 'default', name: 'Default', color: '#808080', icon: 'fingerprint' },
    { id: 'personal', name: 'Personal', color: '#00a8e8', icon: 'user' },
    { id: 'work', name: 'Work', color: '#f9a825', icon: 'briefcase' },
    { id: 'shopping', name: 'Shopping', color: '#43a047', icon: 'cart' },
    { id: 'banking', name: 'Banking', color: '#e53935', icon: 'dollar' }
  ],

  // Initialize storage with defaults
  async init() {
    const data = await this.get(['sessions', 'tabSessions', 'sessionCookies', 'ruleIdCounter']);

    if (!data.sessions) {
      await this.set({ sessions: this.DEFAULT_SESSIONS });
    }
    if (!data.tabSessions) {
      await this.set({ tabSessions: {} });
    }
    if (!data.sessionCookies) {
      await this.set({ sessionCookies: {} });
    }
    if (!data.ruleIdCounter) {
      await this.set({ ruleIdCounter: 1 });
    }
  },

  // Get data from storage
  get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  },

  // Set data to storage
  set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  },

  // Get next rule ID (each tab needs unique rule IDs)
  async getNextRuleId() {
    const data = await this.get('ruleIdCounter');
    const nextId = (data.ruleIdCounter || 1);
    await this.set({ ruleIdCounter: nextId + 100 }); // Reserve 100 IDs per tab
    return nextId;
  },

  // Get all sessions
  async getSessions() {
    const data = await this.get('sessions');
    return data.sessions || this.DEFAULT_SESSIONS;
  },

  // Add a new session
  async addSession(session) {
    const sessions = await this.getSessions();
    session.id = 'session_' + Date.now();
    sessions.push(session);
    await this.set({ sessions });
    return session;
  },

  // Update a session
  async updateSession(sessionId, updates) {
    const sessions = await this.getSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      sessions[index] = { ...sessions[index], ...updates };
      await this.set({ sessions });
    }
    return sessions[index];
  },

  // Delete a session
  async deleteSession(sessionId) {
    if (sessionId === 'default') return false;

    let sessions = await this.getSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    await this.set({ sessions });

    // Clean up cookies for this session
    const data = await this.get('sessionCookies');
    if (data.sessionCookies && data.sessionCookies[sessionId]) {
      delete data.sessionCookies[sessionId];
      await this.set({ sessionCookies: data.sessionCookies });
    }

    // Move tabs from deleted session to default
    const tabData = await this.get('tabSessions');
    if (tabData.tabSessions) {
      for (const tabId in tabData.tabSessions) {
        if (tabData.tabSessions[tabId].sessionId === sessionId) {
          tabData.tabSessions[tabId].sessionId = 'default';
        }
      }
      await this.set({ tabSessions: tabData.tabSessions });
    }

    return true;
  },

  // Get tab info (session + rule IDs)
  async getTabInfo(tabId) {
    const data = await this.get('tabSessions');
    return (data.tabSessions && data.tabSessions[tabId]) || { sessionId: 'default', ruleIds: [] };
  },

  // Get session for a tab
  async getTabSession(tabId) {
    const info = await this.getTabInfo(tabId);
    return info.sessionId;
  },

  // Set session for a tab with rule IDs
  async setTabInfo(tabId, sessionId, ruleIds = []) {
    const data = await this.get('tabSessions');
    const tabSessions = data.tabSessions || {};
    tabSessions[tabId] = { sessionId, ruleIds };
    await this.set({ tabSessions });
  },

  // Remove tab session mapping
  async removeTabSession(tabId) {
    const data = await this.get('tabSessions');
    if (data.tabSessions && data.tabSessions[tabId]) {
      delete data.tabSessions[tabId];
      await this.set({ tabSessions: data.tabSessions });
    }
  },

  // Get all cookies for a session (organized by domain)
  async getSessionCookies(sessionId) {
    const data = await this.get('sessionCookies');
    return (data.sessionCookies && data.sessionCookies[sessionId]) || {};
  },

  // Get cookies for a session and specific domain
  async getSessionCookiesForDomain(sessionId, domain) {
    const allCookies = await this.getSessionCookies(sessionId);
    const cookies = [];

    for (const cookieDomain in allCookies) {
      if (this.domainMatches(domain, cookieDomain)) {
        cookies.push(...Object.values(allCookies[cookieDomain]));
      }
    }
    return cookies;
  },

  // Set a cookie for a session
  async setSessionCookie(sessionId, cookie) {
    const data = await this.get('sessionCookies');
    const sessionCookies = data.sessionCookies || {};

    if (!sessionCookies[sessionId]) {
      sessionCookies[sessionId] = {};
    }

    const domain = cookie.domain || '';
    if (!sessionCookies[sessionId][domain]) {
      sessionCookies[sessionId][domain] = {};
    }

    // Use name+path as unique key
    const cookieKey = `${cookie.name}|${cookie.path || '/'}`;
    sessionCookies[sessionId][domain][cookieKey] = cookie;

    await this.set({ sessionCookies });
  },

  // Remove expired cookies from a session
  async cleanExpiredCookies(sessionId) {
    const data = await this.get('sessionCookies');
    const sessionCookies = data.sessionCookies || {};

    if (!sessionCookies[sessionId]) return;

    const now = Date.now() / 1000;
    let changed = false;

    for (const domain in sessionCookies[sessionId]) {
      for (const key in sessionCookies[sessionId][domain]) {
        const cookie = sessionCookies[sessionId][domain][key];
        if (cookie.expirationDate && cookie.expirationDate < now) {
          delete sessionCookies[sessionId][domain][key];
          changed = true;
        }
      }
    }

    if (changed) {
      await this.set({ sessionCookies });
    }
  },

  // Clear all cookies for a session
  async clearSessionCookies(sessionId) {
    const data = await this.get('sessionCookies');
    const sessionCookies = data.sessionCookies || {};

    if (sessionCookies[sessionId]) {
      sessionCookies[sessionId] = {};
      await this.set({ sessionCookies });
    }
  },

  // Check if a domain matches a cookie domain
  domainMatches(requestDomain, cookieDomain) {
    if (!requestDomain || !cookieDomain) return false;
    if (cookieDomain.startsWith('.')) {
      return requestDomain === cookieDomain.slice(1) ||
             requestDomain.endsWith(cookieDomain);
    }
    return requestDomain === cookieDomain;
  },

  // Get session by ID
  async getSession(sessionId) {
    const sessions = await this.getSessions();
    return sessions.find(s => s.id === sessionId);
  }
};
