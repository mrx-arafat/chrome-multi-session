// Popup script - UI logic

let currentTab = null;
let currentSessionId = null;
let editingSessionId = null;

// Initialize popup
async function init() {
  // Get current tab
  currentTab = await sendMessage({ action: 'getCurrentTab' });

  if (currentTab) {
    currentSessionId = await sendMessage({ action: 'getTabSession', tabId: currentTab.id });
  }

  await renderSessions();
  setupEventListeners();
}

// Send message to background script
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

// Render sessions list
async function renderSessions() {
  const sessions = await sendMessage({ action: 'getSessions' });
  const sessionsList = document.getElementById('sessions-list');
  const currentSessionName = document.getElementById('current-session-name');

  // Find current session
  const currentSession = sessions.find(s => s.id === currentSessionId);
  if (currentSession) {
    currentSessionName.textContent = currentSession.name;
    currentSessionName.style.background = currentSession.color;
  }

  // Render session items
  sessionsList.innerHTML = sessions.map(session => `
    <div class="session-item ${session.id === currentSessionId ? 'active' : ''}" data-session-id="${session.id}">
      <div class="session-color" style="background: ${session.color}"></div>
      <span class="session-name">${escapeHtml(session.name)}</span>
      <div class="session-actions">
        <button class="edit-session" title="Edit" data-session-id="${session.id}">✏️</button>
        ${session.id !== 'default' ? `<button class="delete-session" title="Delete" data-session-id="${session.id}">🗑️</button>` : ''}
      </div>
    </div>
  `).join('');

  // Add click handlers
  sessionsList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.session-actions')) return;

      const sessionId = item.dataset.sessionId;
      if (sessionId !== currentSessionId && currentTab) {
        await sendMessage({
          action: 'setTabSession',
          tabId: currentTab.id,
          sessionId: sessionId
        });
        window.close();
      }
    });
  });

  // Edit handlers
  sessionsList.querySelectorAll('.edit-session').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      openEditModal(sessionId, sessions.find(s => s.id === sessionId));
    });
  });

  // Delete handlers
  sessionsList.querySelectorAll('.delete-session').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.sessionId;
      const session = sessions.find(s => s.id === sessionId);

      if (confirm(`Delete "${session.name}" session? Tabs will be moved to Default.`)) {
        await sendMessage({ action: 'deleteSession', sessionId });
        await renderSessions();
      }
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  // Add session button
  document.getElementById('add-session').addEventListener('click', () => {
    openAddModal();
  });

  // Clear cookies button
  document.getElementById('clear-cookies').addEventListener('click', async () => {
    if (currentSessionId && confirm('Clear all cookies for this session?')) {
      await sendMessage({ action: 'clearSessionCookies', sessionId: currentSessionId });
      if (currentTab) {
        chrome.tabs.reload(currentTab.id);
      }
      window.close();
    }
  });

  // Modal cancel
  document.getElementById('cancel-modal').addEventListener('click', closeModal);

  // Color picker
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('session-color').value = btn.dataset.color;
    });
  });

  // Form submit
  document.getElementById('session-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('session-name').value.trim();
    const color = document.getElementById('session-color').value;

    if (!name) return;

    if (editingSessionId) {
      await sendMessage({
        action: 'updateSession',
        sessionId: editingSessionId,
        updates: { name, color }
      });
    } else {
      await sendMessage({
        action: 'addSession',
        session: { name, color, icon: 'default' }
      });
    }

    closeModal();
    await renderSessions();
  });

  // Close modal on outside click
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
      closeModal();
    }
  });
}

// Open add session modal
function openAddModal() {
  editingSessionId = null;
  document.getElementById('modal-title').textContent = 'Add Session';
  document.getElementById('session-name').value = '';
  document.getElementById('session-color').value = '#00a8e8';

  // Reset color selection
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === '#00a8e8');
  });

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('session-name').focus();
}

// Open edit session modal
function openEditModal(sessionId, session) {
  editingSessionId = sessionId;
  document.getElementById('modal-title').textContent = 'Edit Session';
  document.getElementById('session-name').value = session.name;
  document.getElementById('session-color').value = session.color;

  // Set color selection
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === session.color);
  });

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('session-name').focus();
}

// Close modal
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingSessionId = null;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
