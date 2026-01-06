// Background script - Cookie isolation using declarativeNetRequest
// This approach uses per-tab rules to set Cookie headers

import { Storage } from './storage.js';

// Initialize
Storage.init();

// In-memory cache for quick access
const tabCache = new Map(); // tabId -> { sessionId, ruleIds, domains }

// ============================================================================
// COOKIE RULE MANAGEMENT
// ============================================================================

// Build cookie header string from stored cookies for a domain
async function buildCookieHeader(sessionId, domain) {
  const cookies = await Storage.getSessionCookiesForDomain(sessionId, domain);
  const now = Date.now() / 1000;

  return cookies
    .filter(c => !c.expirationDate || c.expirationDate > now)
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// Create declarativeNetRequest rules for a tab
async function createRulesForTab(tabId, sessionId, url) {
  if (sessionId === 'default') return [];

  let domain;
  try {
    domain = new URL(url).hostname;
  } catch {
    return [];
  }

  const cookieHeader = await buildCookieHeader(sessionId, domain);
  const baseRuleId = await Storage.getNextRuleId();

  const rules = [];

  // Rule 1: Remove existing Cookie header and set our own
  rules.push({
    id: baseRuleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Cookie', operation: 'remove' },
        ...(cookieHeader ? [{ header: 'Cookie', operation: 'set', value: cookieHeader }] : [])
      ]
    },
    condition: {
      tabIds: [tabId],
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'font', 'stylesheet', 'media', 'websocket', 'other']
    }
  });

  // Rule 2: Block Set-Cookie from reaching browser (we'll capture it via webRequest)
  rules.push({
    id: baseRuleId + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'Set-Cookie', operation: 'remove' }
      ]
    },
    condition: {
      tabIds: [tabId],
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'font', 'stylesheet', 'media', 'websocket', 'other']
    }
  });

  return rules;
}

// Apply rules for a tab
async function applyRulesForTab(tabId, sessionId, url) {
  // Get existing rules for this tab
  const tabInfo = tabCache.get(tabId) || { sessionId: 'default', ruleIds: [], domains: new Set() };

  // Remove old rules
  if (tabInfo.ruleIds.length > 0) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: tabInfo.ruleIds
      });
    } catch (e) {
      console.error('Error removing old rules:', e);
    }
  }

  // If default session, no rules needed
  if (sessionId === 'default') {
    tabCache.set(tabId, { sessionId: 'default', ruleIds: [], domains: new Set() });
    await Storage.setTabInfo(tabId, sessionId, []);
    return;
  }

  // Create new rules
  const rules = await createRulesForTab(tabId, sessionId, url);
  const ruleIds = rules.map(r => r.id);

  if (rules.length > 0) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: rules
      });
    } catch (e) {
      console.error('Error adding rules:', e);
    }
  }

  // Update cache and storage
  let domain;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = '';
  }

  const domains = new Set([domain]);
  tabCache.set(tabId, { sessionId, ruleIds, domains });
  await Storage.setTabInfo(tabId, sessionId, ruleIds);
}

// Update cookie rules when cookies change
async function refreshTabCookies(tabId) {
  const tabInfo = tabCache.get(tabId);
  if (!tabInfo || tabInfo.sessionId === 'default') return;

  // Get current tab URL
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      await applyRulesForTab(tabId, tabInfo.sessionId, tab.url);
    }
  } catch (e) {
    // Tab might not exist
  }
}

// ============================================================================
// COOKIE CAPTURE (Response Set-Cookie headers)
// ============================================================================

// Parse Set-Cookie header
function parseSetCookie(header, url) {
  const parts = header.split(';').map(p => p.trim());
  const [nameValue, ...attributes] = parts;
  const eqIndex = nameValue.indexOf('=');
  const name = nameValue.substring(0, eqIndex);
  const value = nameValue.substring(eqIndex + 1);

  let domain;
  try {
    domain = new URL(url).hostname;
  } catch {
    return null;
  }

  const cookie = {
    name,
    value,
    domain,
    path: '/',
    secure: false,
    httpOnly: false,
    sameSite: 'Lax',
    expirationDate: null
  };

  for (const attr of attributes) {
    const eqIdx = attr.indexOf('=');
    const attrName = eqIdx > 0 ? attr.substring(0, eqIdx).toLowerCase() : attr.toLowerCase();
    const attrValue = eqIdx > 0 ? attr.substring(eqIdx + 1) : '';

    switch (attrName) {
      case 'domain':
        cookie.domain = attrValue.startsWith('.') ? attrValue : '.' + attrValue;
        break;
      case 'path':
        cookie.path = attrValue || '/';
        break;
      case 'expires':
        try {
          cookie.expirationDate = new Date(attrValue).getTime() / 1000;
        } catch {}
        break;
      case 'max-age':
        cookie.expirationDate = Date.now() / 1000 + parseInt(attrValue);
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'samesite':
        cookie.sameSite = attrValue || 'Lax';
        break;
    }
  }

  return cookie;
}

// Listen for response headers to capture Set-Cookie
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const tabInfo = tabCache.get(details.tabId);
    if (!tabInfo || tabInfo.sessionId === 'default') return;

    // Find Set-Cookie headers
    const setCookieHeaders = details.responseHeaders?.filter(
      h => h.name.toLowerCase() === 'set-cookie'
    ) || [];

    // Store each cookie
    for (const header of setCookieHeaders) {
      const cookie = parseSetCookie(header.value, details.url);
      if (cookie) {
        Storage.setSessionCookie(tabInfo.sessionId, cookie).then(() => {
          // Refresh rules to include new cookie
          refreshTabCookies(details.tabId);
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

// Handle tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
  let sessionId = 'default';

  // Inherit session from opener tab
  if (tab.openerTabId) {
    const openerInfo = tabCache.get(tab.openerTabId);
    if (openerInfo) {
      sessionId = openerInfo.sessionId;
    } else {
      sessionId = await Storage.getTabSession(tab.openerTabId);
    }
  }

  tabCache.set(tab.id, { sessionId, ruleIds: [], domains: new Set() });
  await Storage.setTabInfo(tab.id, sessionId, []);
  updateBadge(tab.id, sessionId);
});

// Handle navigation - apply rules before page loads
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame

  const tabInfo = tabCache.get(details.tabId);
  const sessionId = tabInfo?.sessionId || await Storage.getTabSession(details.tabId);

  await applyRulesForTab(details.tabId, sessionId, details.url);
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabInfo = tabCache.get(tabId);

  // Remove rules
  if (tabInfo && tabInfo.ruleIds.length > 0) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: tabInfo.ruleIds
      });
    } catch (e) {
      // Ignore errors
    }
  }

  tabCache.delete(tabId);
  await Storage.removeTabSession(tabId);
});

// ============================================================================
// BADGE & UI
// ============================================================================

async function updateBadge(tabId, sessionId) {
  try {
    const session = await Storage.getSession(sessionId || 'default');
    if (session) {
      await chrome.action.setBadgeText({ text: ' ', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: session.color, tabId });
      await chrome.action.setTitle({ title: `Session: ${session.name}`, tabId });

      // Notify content script to update indicator
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateSessionIndicator',
          session: session
        });
      } catch (e) {
        // Content script might not be loaded yet
      }
    }
  } catch (e) {
    // Tab might not exist
  }
}

// ============================================================================
// CONTEXT MENUS
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  updateContextMenus();
});

async function updateContextMenus() {
  const sessions = await Storage.getSessions();
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: 'open-in-session',
    title: 'Open Link in Session',
    contexts: ['link']
  });

  for (const session of sessions) {
    chrome.contextMenus.create({
      id: `session-${session.id}`,
      parentId: 'open-in-session',
      title: session.name,
      contexts: ['link']
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId.toString();
  if (menuId.startsWith('session-')) {
    const sessionId = menuId.replace('session-', '');

    const newTab = await chrome.tabs.create({ url: info.linkUrl });
    tabCache.set(newTab.id, { sessionId, ruleIds: [], domains: new Set() });
    await Storage.setTabInfo(newTab.id, sessionId, []);
    updateBadge(newTab.id, sessionId);
  }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'getSessions':
      return await Storage.getSessions();

    case 'getTabSession':
      const tabInfo = tabCache.get(message.tabId);
      return tabInfo?.sessionId || await Storage.getTabSession(message.tabId);

    case 'setTabSession': {
      const tabId = message.tabId;
      const sessionId = message.sessionId;

      // Get current tab URL
      let url = '';
      try {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url || '';
      } catch (e) {
        return { error: 'Tab not found' };
      }

      // Apply new rules
      await applyRulesForTab(tabId, sessionId, url);
      updateBadge(tabId, sessionId);

      // Reload tab to apply new session
      if (message.reload !== false) {
        chrome.tabs.reload(tabId);
      }

      return { success: true };
    }

    case 'addSession': {
      const newSession = await Storage.addSession(message.session);
      await updateContextMenus();
      return newSession;
    }

    case 'updateSession': {
      const updated = await Storage.updateSession(message.sessionId, message.updates);
      await updateContextMenus();
      // Update badges for all tabs with this session
      for (const [tabId, info] of tabCache) {
        if (info.sessionId === message.sessionId) {
          updateBadge(tabId, message.sessionId);
        }
      }
      return updated;
    }

    case 'deleteSession': {
      const deleted = await Storage.deleteSession(message.sessionId);
      await updateContextMenus();
      // Update affected tabs
      for (const [tabId, info] of tabCache) {
        if (info.sessionId === message.sessionId) {
          info.sessionId = 'default';
          updateBadge(tabId, 'default');
        }
      }
      return deleted;
    }

    case 'clearSessionCookies':
      await Storage.clearSessionCookies(message.sessionId);
      // Refresh all tabs with this session
      for (const [tabId, info] of tabCache) {
        if (info.sessionId === message.sessionId) {
          refreshTabCookies(tabId);
        }
      }
      return { success: true };

    case 'getCurrentTab': {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    }

    case 'getTabSessionInfo': {
      // Get session info for content script indicator
      const senderTabId = sender.tab?.id;
      if (!senderTabId) return { session: null };

      const tabSessionInfo = tabCache.get(senderTabId);
      const sessionId = tabSessionInfo?.sessionId || await Storage.getTabSession(senderTabId);
      const session = await Storage.getSession(sessionId);
      return { session };
    }

    case 'openInSession': {
      const tab = await chrome.tabs.create({ url: message.url });
      tabCache.set(tab.id, { sessionId: message.sessionId, ruleIds: [], domains: new Set() });
      await Storage.setTabInfo(tab.id, message.sessionId, []);
      updateBadge(tab.id, message.sessionId);
      return { success: true, tabId: tab.id };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize existing tabs on startup
chrome.tabs.query({}).then(async (tabs) => {
  for (const tab of tabs) {
    const sessionId = await Storage.getTabSession(tab.id);
    tabCache.set(tab.id, { sessionId, ruleIds: [], domains: new Set() });
    updateBadge(tab.id, sessionId);
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.sessions) {
    updateContextMenus();
  }
});

console.log('Multi-Session Containers v2.0 loaded - using declarativeNetRequest');
