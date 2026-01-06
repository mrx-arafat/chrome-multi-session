// Content script - Adds visual session indicator to pages

(function() {
  'use strict';

  const INDICATOR_ID = 'msc-session-indicator';

  // Create or update the session indicator bar
  function updateIndicator(session) {
    let indicator = document.getElementById(INDICATOR_ID);

    // If default session, remove indicator
    if (!session || session.id === 'default') {
      if (indicator) {
        indicator.remove();
        document.body.style.marginTop = '';
      }
      return;
    }

    // Create indicator if it doesn't exist
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = INDICATOR_ID;
      indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        z-index: 2147483647;
        pointer-events: none;
        transition: background-color 0.3s ease;
      `;
      document.documentElement.appendChild(indicator);
    }

    // Update indicator color
    indicator.style.backgroundColor = session.color;
    indicator.title = `Session: ${session.name}`;
  }

  // Request session info from background
  function requestSessionInfo() {
    chrome.runtime.sendMessage({ action: 'getTabSessionInfo' }, (response) => {
      if (response && response.session) {
        updateIndicator(response.session);
      }
    });
  }

  // Listen for session changes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateSessionIndicator') {
      updateIndicator(message.session);
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestSessionInfo);
  } else {
    requestSessionInfo();
  }

  // Also request on full load (for dynamic pages)
  window.addEventListener('load', requestSessionInfo);
})();
