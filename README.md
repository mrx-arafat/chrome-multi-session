# Multi-Session Containers for Chrome

A Chrome extension that provides Firefox-like container functionality, allowing you to isolate browsing sessions with separate cookies per tab.

![Chrome](https://img.shields.io/badge/Chrome-MV3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Session Isolation**: Each session maintains its own separate cookie jar
- **Multiple Sessions**: Create unlimited custom sessions with names and colors
- **Visual Indicator**: Colored bar at the top of pages shows active session
- **Tab Inheritance**: New tabs inherit the session from their parent tab
- **Context Menu**: Right-click links to open in any session
- **Session Management**: Create, edit, delete, and clear session cookies

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Tab A     │    │   Tab B     │    │   Tab C     │                 │
│  │ ─────────── │    │ ─────────── │    │ ─────────── │                 │
│  │ Session:    │    │ Session:    │    │ Session:    │                 │
│  │   Work      │    │  Personal   │    │  Default    │                 │
│  │ [Yellow]    │    │  [Blue]     │    │  [Gray]     │                 │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                 │
│         │                  │                  │                         │
│         ▼                  ▼                  ▼                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              declarativeNetRequest Rules                          │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │  │
│  │  │ Rule #1        │  │ Rule #101      │  │ (No rules)     │      │  │
│  │  │ tabIds: [A]    │  │ tabIds: [B]    │  │ Uses browser   │      │  │
│  │  │ Cookie: work=x │  │ Cookie: pers=y │  │ default cookies│      │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Extension Storage                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ Work Session│  │Personal Sess│  │Default Sess │               │  │
│  │  │ Cookies:    │  │ Cookies:    │  │ (Browser's  │               │  │
│  │  │ - gmail=abc │  │ - gmail=xyz │  │  native)    │               │  │
│  │  │ - token=123 │  │ - token=789 │  │             │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technical Flow

#### 1. Tab Session Assignment

```
User clicks popup → Selects "Work" session
                          │
                          ▼
              ┌─────────────────────┐
              │ setTabSession()     │
              │ - Store tab→session │
              │ - Create DNR rules  │
              │ - Update badge      │
              │ - Reload tab        │
              └─────────────────────┘
```

#### 2. Outgoing Request Flow

```
Tab A (Work session) makes request to gmail.com
                          │
                          ▼
              ┌─────────────────────┐
              │ declarativeNetRequest│
              │ Rule matches tabId  │
              │                     │
              │ Action:             │
              │ 1. Remove Cookie    │
              │ 2. Set Cookie:      │
              │    "work_session=x" │
              └─────────────────────┘
                          │
                          ▼
              Request sent with Work session cookies
```

#### 3. Incoming Response Flow

```
Response from gmail.com with Set-Cookie header
                          │
                          ▼
              ┌─────────────────────┐
              │ webRequest listener │
              │ (onHeadersReceived) │
              │                     │
              │ 1. Parse Set-Cookie │
              │ 2. Store in session │
              │ 3. Refresh rules    │
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │ declarativeNetRequest│
              │ Rule removes        │
              │ Set-Cookie header   │
              │ (prevents browser   │
              │  from storing it)   │
              └─────────────────────┘
```

#### 4. Visual Indicator Flow

```
Page loads in Tab A (Work session)
                          │
                          ▼
              ┌─────────────────────┐
              │ Content Script      │
              │ Requests session    │
              │ info from background│
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │ Background responds │
              │ with session color  │
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │ Content Script      │
              │ Adds 4px colored    │
              │ bar at top of page  │
              └─────────────────────┘
```

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `src` folder from this repository

### File Structure

```
src/
├── manifest.json          # Extension manifest (MV3)
├── js/
│   ├── background.js      # Service worker - cookie isolation logic
│   ├── storage.js         # Session & cookie storage management
│   └── content.js         # Visual session indicator
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
└── icons/
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## Usage

### Switching Tab Sessions

1. Click the extension icon in the toolbar
2. You'll see the current session highlighted
3. Click any other session to switch
4. The tab will reload with the new session's cookies

### Creating a New Session

1. Click the extension icon
2. Click the **+** button in the header
3. Enter a name and select a color
4. Click **Save**

### Opening Links in Specific Sessions

1. Right-click any link on a page
2. Hover over **Open Link in Session**
3. Select the desired session
4. Link opens in a new tab with that session

### Clearing Session Cookies

1. Click the extension icon
2. Click **Clear Session Cookies**
3. Confirm the action
4. All cookies for the current session are deleted

## Sessions Explained

| Session   | Color  | Description                                      |
|-----------|--------|--------------------------------------------------|
| Default   | Gray   | Uses browser's native cookies (no isolation)     |
| Personal  | Blue   | Isolated session for personal accounts           |
| Work      | Yellow | Isolated session for work accounts               |
| Shopping  | Green  | Isolated session for shopping sites              |
| Banking   | Red    | Isolated session for financial sites             |

### Default Session Behavior

The **Default** session is special:
- It uses Chrome's native cookie storage
- No declarativeNetRequest rules are applied
- Cookies are shared with extensions and other browser features
- Best for sites where you want normal browser behavior

### Isolated Session Behavior

All other sessions:
- Have their own cookie storage in extension storage
- Use per-tab declarativeNetRequest rules
- Cookies are NOT visible to Chrome's cookie jar
- Set-Cookie headers are intercepted and stored separately

## Limitations

### What IS Isolated

| Feature | Isolated? | Notes |
|---------|-----------|-------|
| HTTP Cookies | ✅ Yes | Full isolation via header modification |
| JavaScript Cookies | ✅ Yes* | *Captured when set via HTTP response |
| Session Cookies | ✅ Yes | Stored in extension storage |
| Persistent Cookies | ✅ Yes | Stored with expiration dates |

### What is NOT Isolated

| Feature | Isolated? | Reason |
|---------|-----------|--------|
| localStorage | ❌ No | Chrome API limitation |
| sessionStorage | ❌ No | Chrome API limitation |
| IndexedDB | ❌ No | Chrome API limitation |
| Cache Storage | ❌ No | Chrome API limitation |
| Service Workers | ❌ No | Chrome API limitation |

### Other Limitations

- **Rule Limit**: Maximum 5,000 session rules (plenty for normal use)
- **Extension Pages**: Cannot isolate chrome:// or extension pages
- **Some Sites**: Sites using advanced fingerprinting may detect the manipulation

## Comparison with Firefox Containers

| Feature | Firefox Containers | This Extension |
|---------|-------------------|----------------|
| Cookie Isolation | ✅ Native | ✅ Via DNR |
| localStorage Isolation | ✅ Native | ❌ Not possible |
| Tab Coloring | ✅ Native | ✅ Via indicator bar |
| Performance | ✅ Native | ✅ Minimal overhead |
| API Support | ✅ contextualIdentities | ❌ Not available |

## Troubleshooting

### Session Not Working on a Site

1. Check if the site uses localStorage heavily
2. Try clearing session cookies and re-logging in
3. Check the console for any error messages

### Indicator Not Showing

1. Refresh the page
2. Check if the content script is allowed on this site
3. Some pages (like chrome:// pages) don't allow content scripts

### Cookies Not Persisting

1. Check if the cookie has an expiration date
2. Session cookies are cleared when Chrome closes
3. Check extension storage in DevTools

## Development

### Building from Source

```bash
# Clone the repository
git clone <repo-url>
cd chrome-multi-session

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the src/ folder
```

### Debugging

1. Go to `chrome://extensions`
2. Find "Multi-Session Containers"
3. Click "Service Worker" to open DevTools
4. Check console for logs

### Key Files

- `background.js`: Main logic, cookie rules, message handling
- `storage.js`: All storage operations
- `content.js`: Visual indicator injection
- `popup.js`: UI logic

## Privacy

This extension:
- Does NOT send any data to external servers
- Stores all data locally in Chrome's extension storage
- Does NOT track browsing history
- Does NOT inject ads or analytics

## License

MIT License - feel free to use, modify, and distribute.

## Credits

Inspired by [Firefox Multi-Account Containers](https://github.com/mozilla/multi-account-containers)

---

**Developed by mrx-arafat**
