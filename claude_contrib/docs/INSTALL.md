# Quick Installation Guide

## Prerequisites

- Node.js and npm (for development server)
- Modern browser with ES6+ support
- Text editor

## Installation Steps

### 1. Copy Files to Your Project

```bash
# If you're in your PWA-Starter project root:
cp -r /path/to/pwa-components ./

# Or drag and drop the pwa-components folder into your project
```

### 2. Directory Structure

Your project should now look like:

```
your-project/
├── pwa-components/
│   ├── db/
│   │   ├── schema.sql
│   │   └── database-service.js
│   ├── plugins/
│   │   ├── settings-plugin.js
│   │   ├── auth-plugin.js
│   │   ├── logging-plugin.js
│   │   ├── dynamic-page-plugin.js
│   │   ├── webhook-plugin.js
│   │   ├── api-plugin.js
│   │   └── metrics-plugin.js
│   ├── index.js
│   ├── INTEGRATION.md
│   ├── README.md
│   ├── PROJECT_DOCUMENTATION.md
│   └── example.html
├── src/
├── public/
└── ...
```

### 3. Test the Example

```bash
# Serve the example.html file
npx http-server . -p 8080

# Open browser to:
# http://localhost:8080/pwa-components/example.html

# Default login:
# Username: admin
# Password: admin123
```

### 4. Integrate into WonkyDonkey

#### Update your main app file:

```javascript
// src/pages/app-home.ts
import { LitElement, html } from 'lit';
import pwa from '../../pwa-components/index.js';

export class AppHome extends LitElement {
    async firstUpdated() {
        // Initialize PWA Components
        await pwa.quickSetup({
            schemaUrl: '/pwa-components/db/schema.sql',
            logLevel: 'info',
            enableMetrics: true
        });
        
        console.log('PWA Components ready!');
        this.loadData();
    }
    
    loadData() {
        // Use pwa.db, pwa.settings, etc.
        const appName = pwa.settings.get('app', 'app_name');
        console.log('App name:', appName);
    }
}
```

#### Create a Settings Page:

```javascript
// src/pages/app-settings.ts
import { LitElement, html, css } from 'lit';
import pwa from '../../pwa-components/index.js';

export class AppSettings extends LitElement {
    static properties = {
        settings: { type: Object }
    };
    
    async connectedCallback() {
        super.connectedCallback();
        await pwa.whenReady();
        this.loadSettings();
    }
    
    loadSettings() {
        this.settings = {
            ui: pwa.settings.getCategory('ui'),
            app: pwa.settings.getCategory('app')
        };
    }
    
    handleSave(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        pwa.settings.set('ui', 'theme', formData.get('theme'));
        pwa.settings.set('ui', 'primary_color', formData.get('color'));
        
        this.dispatchEvent(new CustomEvent('settings-saved'));
    }
    
    render() {
        return html`
            <div class="settings-page">
                <h1>Settings</h1>
                <form @submit="${this.handleSave}">
                    <label>
                        Theme
                        <select name="theme">
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                    
                    <label>
                        Primary Color
                        <input type="color" name="color" 
                               value="${this.settings?.ui?.primary_color || '#007AFF'}">
                    </label>
                    
                    <button type="submit">Save Settings</button>
                </form>
            </div>
        `;
    }
}

customElements.define('app-settings', AppSettings);
```

#### Create a Login Page:

```javascript
// src/pages/app-login.ts
import { LitElement, html } from 'lit';
import pwa from '../../pwa-components/index.js';
import { Router } from '@vaadin/router';

export class AppLogin extends LitElement {
    static properties = {
        error: { type: String }
    };
    
    async handleLogin(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        try {
            await pwa.auth.login(
                formData.get('username'),
                formData.get('password')
            );
            
            Router.go('/home');
        } catch (error) {
            this.error = error.message;
        }
    }
    
    render() {
        return html`
            <div class="login-page">
                <h1>Login</h1>
                ${this.error ? html`<div class="error">${this.error}</div>` : ''}
                
                <form @submit="${this.handleLogin}">
                    <input type="text" name="username" placeholder="Username" required>
                    <input type="password" name="password" placeholder="Password" required>
                    <button type="submit">Login</button>
                </form>
            </div>
        `;
    }
}

customElements.define('app-login', AppLogin);
```

#### Create a Logs Page:

```javascript
// src/pages/app-logs.ts
import { LitElement, html } from 'lit';
import pwa from '../../pwa-components/index.js';

export class AppLogs extends LitElement {
    static properties = {
        logs: { type: Array },
        filter: { type: String }
    };
    
    constructor() {
        super();
        this.logs = [];
        this.filter = '';
    }
    
    async connectedCallback() {
        super.connectedCallback();
        await pwa.whenReady();
        this.loadLogs();
        
        // Auto-refresh
        this.interval = setInterval(() => this.loadLogs(), 5000);
    }
    
    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this.interval);
    }
    
    loadLogs() {
        this.logs = pwa.logging.getLogsFromDb(100, this.filter || null);
    }
    
    handleFilterChange(e) {
        this.filter = e.target.value;
        this.loadLogs();
    }
    
    render() {
        return html`
            <div class="logs-page">
                <h1>Application Logs</h1>
                
                <select @change="${this.handleFilterChange}">
                    <option value="">All Levels</option>
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                </select>
                
                <div class="logs-container">
                    ${this.logs.map(log => html`
                        <div class="log-entry ${log.level}">
                            <span class="timestamp">${new Date(log.create_date).toLocaleString()}</span>
                            <span class="level">${log.level}</span>
                            <span class="message">${log.message}</span>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('app-logs', AppLogs);
```

### 5. Update Routes

```javascript
// In your router configuration
import { Router } from '@vaadin/router';

const routes = [
    {
        path: '/',
        component: 'app-home'
    },
    {
        path: '/settings',
        component: 'app-settings',
        action: async () => {
            await import('./pages/app-settings.js');
        }
    },
    {
        path: '/login',
        component: 'app-login',
        action: async () => {
            await import('./pages/app-login.js');
        }
    },
    {
        path: '/logout',
        action: async () => {
            await pwa.auth.logout();
            return { redirect: '/login' };
        }
    },
    {
        path: '/logs',
        component: 'app-logs',
        action: async () => {
            await import('./pages/app-logs.js');
        }
    }
];

export const router = new Router(document.querySelector('#outlet'));
router.setRoutes(routes);
```

### 6. Add to Service Worker (Optional)

```javascript
// sw.js
importScripts('https://sql.js.org/dist/sql-wasm.js');
importScripts('/pwa-components/db/database-service.js');

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncPendingData());
    }
});

async function syncPendingData() {
    // Your sync logic here
    console.log('Syncing pending data...');
}
```

## Testing

### 1. Open Developer Console

```javascript
// Should be available globally
console.log(pwa);
console.log(pwa.db);
console.log(pwa.settings);
console.log(pwa.auth);
```

### 2. Test Authentication

```javascript
// In console:
await pwa.auth.login('admin', 'admin123');
console.log(pwa.auth.getCurrentUser());
```

### 3. Test Settings

```javascript
// In console:
pwa.settings.set('test', 'value', 'Hello World');
console.log(pwa.settings.get('test', 'value'));
```

### 4. Test Logging

```javascript
// In console:
pwa.logging.info('Test log message');
pwa.logging.error('Test error', { details: { test: true } });
console.log(pwa.logging.getRecentLogs(10));
```

## Troubleshooting

### "pwa is not defined"

Make sure you've initialized the system:

```javascript
await pwa.quickSetup({ schemaUrl: '/pwa-components/db/schema.sql' });
```

### Database not persisting

Check IndexedDB in DevTools → Application → IndexedDB → PWA-Database

### Settings not loading

Clear cache:

```javascript
pwa.settings.clearCache();
```

### Import errors

Make sure your server supports ES modules and serves .js files with correct MIME type.

## Next Steps

1. Read the full [INTEGRATION.md](./INTEGRATION.md) guide
2. Explore [example.html](./example.html) for complete working code
3. Check [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md) for architecture details
4. Customize the styling to match your app's design

## Getting Help

- Check the README.md for feature overview
- Review INTEGRATION.md for detailed API docs
- Look at example.html for working examples
- Examine individual plugin files for implementation details

## Performance Tips

1. **Initialize once** - Call `pwa.quickSetup()` only once in your main app component
2. **Use events** - Listen for changes instead of polling
3. **Batch operations** - Group multiple database operations
4. **Clear old data** - Regularly clean up logs and metrics

## Production Checklist

- [ ] Change default admin password
- [ ] Upgrade to bcrypt for password hashing
- [ ] Set appropriate log levels (info or warn in production)
- [ ] Configure rate limits for APIs
- [ ] Set up regular data cleanup
- [ ] Test offline functionality
- [ ] Verify IndexedDB quotas
- [ ] Implement proper error boundaries
- [ ] Add loading states
- [ ] Test on target browsers

Enjoy building with PWA Components! 🚀
