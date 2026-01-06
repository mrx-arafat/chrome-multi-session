// Content script - Adds visual session indicator to pages
// Includes both top bar indicator AND favicon color modification

(function() {
  'use strict';

  const INDICATOR_ID = 'msc-session-indicator';
  let originalFavicon = null;
  let currentSession = null;

  // ============================================================================
  // TOP BAR INDICATOR
  // ============================================================================

  function updateIndicator(session) {
    let indicator = document.getElementById(INDICATOR_ID);

    // If default session, remove indicator
    if (!session || session.id === 'default') {
      if (indicator) {
        indicator.remove();
      }
      restoreOriginalFavicon();
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

    // Also update favicon
    updateFavicon(session);
  }

  // ============================================================================
  // FAVICON MODIFICATION
  // ============================================================================

  function getOriginalFavicon() {
    // Try to find existing favicon
    const existingLink = document.querySelector('link[rel*="icon"]');
    if (existingLink && existingLink.href) {
      return existingLink.href;
    }
    // Default to /favicon.ico
    return window.location.origin + '/favicon.ico';
  }

  function saveOriginalFavicon() {
    if (!originalFavicon) {
      originalFavicon = getOriginalFavicon();
    }
  }

  function restoreOriginalFavicon() {
    if (originalFavicon) {
      setFavicon(originalFavicon);
    }
    currentSession = null;
  }

  function setFavicon(url) {
    // Remove existing favicons
    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    existingLinks.forEach(link => link.remove());

    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.head.appendChild(link);
  }

  function updateFavicon(session) {
    if (!session || session.id === 'default') {
      restoreOriginalFavicon();
      return;
    }

    // Don't re-process if same session
    if (currentSession && currentSession.id === session.id) {
      return;
    }
    currentSession = session;

    saveOriginalFavicon();

    // Create canvas to modify favicon
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function() {
      // Draw original favicon
      ctx.drawImage(img, 0, 0, 32, 32);

      // Draw colored corner indicator (bottom-right)
      ctx.fillStyle = session.color;
      ctx.beginPath();
      ctx.arc(24, 24, 10, 0, 2 * Math.PI);
      ctx.fill();

      // Add border to make it stand out
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Set the modified favicon
      setFavicon(canvas.toDataURL('image/png'));
    };

    img.onerror = function() {
      // If original favicon fails to load, create a simple colored favicon
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 32, 32);

      // Draw colored circle
      ctx.fillStyle = session.color;
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, 2 * Math.PI);
      ctx.fill();

      // Add first letter of session name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(session.name.charAt(0).toUpperCase(), 16, 17);

      setFavicon(canvas.toDataURL('image/png'));
    };

    // Load the original favicon
    img.src = originalFavicon || getOriginalFavicon();
  }

  // ============================================================================
  // MESSAGING
  // ============================================================================

  function requestSessionInfo() {
    chrome.runtime.sendMessage({ action: 'getTabSessionInfo' }, (response) => {
      if (chrome.runtime.lastError) {
        // Extension context invalidated, ignore
        return;
      }
      if (response && response.session) {
        updateIndicator(response.session);
      }
    });
  }

  // Listen for session changes from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateSessionIndicator') {
      updateIndicator(message.session);
    }
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Wait for head to be available for favicon manipulation
  function init() {
    if (document.head) {
      saveOriginalFavicon();
      requestSessionInfo();
    } else {
      // Wait for head
      const observer = new MutationObserver((mutations, obs) => {
        if (document.head) {
          obs.disconnect();
          saveOriginalFavicon();
          requestSessionInfo();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also reinitialize on full load (catches dynamic favicon changes)
  window.addEventListener('load', () => {
    setTimeout(requestSessionInfo, 500);
  });
})();
