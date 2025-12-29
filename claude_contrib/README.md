# PWA Components System

A comprehensive, modular plugin-based system for Progressive Web Applications with offline-first architecture, complete database management, authentication, logging, dynamic content, webhooks, APIs, and metrics.

## 🎯 Features

### ✅ Complete Plugin System
- **Database Layer** - Client-side SQLite with IndexedDB persistence
- **Settings & Configuration** - Type-safe, cached settings management
- **Authentication** - Login/logout with session handling
- **Logging & Debug** - Centralized logging with multiple levels
- **Dynamic Pages** - CMS-like content management
- **Webhook Sender** - HTTP webhooks with retry logic
- **API Handler** - Dynamic API routing and validation
- **Metrics & Reporting** - Analytics with chart generation

### 🚀 Key Benefits
- **Offline-First** - Works completely offline with sync when online
- **Modular** - Use only the plugins you need
- **Type-Safe** - Proper type coercion for settings
- **Production-Ready** - Comprehensive error handling and logging
- **Extensible** - Easy to add custom plugins
- **Zero Dependencies** - Only requires SQL.js for database

## 📦 Quick Start

### 1. Installation

```bash
# Copy the pwa-components directory to your project
cp -r pwa-components /path/to/your/project/
```

### 2. Include in HTML

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My PWA</title>
    
    <!-- Required: SQL.js for client-side database -->
    <script src="https://sql.js.org/dist/sql-wasm.js"></script>
</head>
<body>
    <div id="app"></div>
    
    <script type="module">
        import pwa from './pwa-components/index.js';
        
        // Quick setup
        await pwa.quickSetup({
            schemaUrl: './pwa-components/db/schema.sql',
            logLevel: 'info',
            enableMetrics: true
        });
        
        console.log('PWA ready!');
    </script>
</body>
</html>
```

### 3. Start Using

```javascript
// Settings
pwa.settings.set('ui', 'theme', 'dark');
const theme = pwa.settings.get('ui', 'theme');

// Authentication
await pwa.auth.login('username', 'password');
const user = pwa.auth.getCurrentUser();

// Logging
pwa.logging.info('Application started');
pwa.logging.error('Something failed', { error: err });

// Pages
pwa.pages.savePage({
    route: '/about',
    title: 'About Us',
    content: '<h1>About</h1><p>Welcome!</p>',
    published: 1
});

// Metrics
pwa.metrics.counter('button.click');
pwa.metrics.timer('api.request', 245);

// Webhooks
pwa.webhooks.trigger('user.registered', {
    userId: '123',
    username: 'john'
});

// API
pwa.api.register('GET', '/api/users', async (req) => {
    const users = pwa.db.getAll('SELECT * FROM users');
    return pwa.api.successResponse(users);
});
```

## 📖 Documentation

- **[Integration Guide](./INTEGRATION.md)** - Complete integration documentation
- **[Example App](./example.html)** - Working example implementation
- **[API Reference](./docs/API.md)** - Detailed API documentation (coming soon)

## 🗂️ Project Structure

```
pwa-components/
├── db/
│   ├── schema.sql              # Database schema
│   └── database-service.js     # Database wrapper
├── plugins/
│   ├── settings-plugin.js      # Settings management
│   ├── auth-plugin.js          # Authentication
│   ├── logging-plugin.js       # Logging system
│   ├── dynamic-page-plugin.js  # CMS functionality
│   ├── webhook-plugin.js       # Webhook sender
│   ├── api-plugin.js           # API handler
│   └── metrics-plugin.js       # Metrics & analytics
├── index.js                    # Main entry point
├── INTEGRATION.md              # Integration guide
├── example.html                # Example implementation
└── README.md                   # This file
```

## 🔧 Configuration

### Database

```javascript
await pwa.init({
    schemaSQL: schemaContent,
    dbName: 'my-app.db'
});
```

### Logging

```javascript
pwa.logging.init({
    level: 'debug',      // 'debug', 'info', 'warn', 'error', 'fatal'
    console: true,       // Enable console output
    database: true,      // Enable database storage
    captureConsole: true // Capture console.* calls
});
```

### Metrics

```javascript
pwa.metrics.init();

// Track page views
pwa.metrics.counter('page.view', 1, {
    tags: { page: '/home' }
});

// Track performance
const stopTimer = pwa.metrics.createTimer('api.request');
await fetchData();
stopTimer();
```

## 🎨 Styling Integration

The system includes helper methods for theme management:

```javascript
// Set theme
pwa.settings.setTheme('dark');

// Set primary color
pwa.settings.setPrimaryColor('#007AFF');

// Toggle animations
pwa.settings.setAnimations(true);
```

These automatically update CSS custom properties:

```css
:root {
    --primary-color: #007AFF;
}

[data-theme="dark"] {
    --background: #1a1a1a;
    --text: #ffffff;
}
```

## 📊 Database Schema

The system includes comprehensive tables for:

- **Settings** - Key-value configuration storage
- **Users** - User management with roles
- **Sessions** - Session tracking
- **Logs** - Application logging
- **Content Pages** - Dynamic page content
- **Data Records** - Flexible JSON storage
- **Webhooks** - Webhook configuration
- **Webhook Deliveries** - Delivery history
- **API Endpoints** - Dynamic API routes
- **Metrics** - Analytics data
- **Sync Queue** - Offline sync management
- **Relationships** - Graph-like connections

## 🔐 Authentication

```javascript
// Register
await pwa.auth.register({
    username: 'john',
    email: 'john@example.com',
    password: 'secret',
    display_name: 'John Doe'
});

// Login
const { user, sessionToken } = await pwa.auth.login('john', 'secret');

// Check authentication
if (pwa.auth.isAuthenticated()) {
    const currentUser = pwa.auth.getCurrentUser();
}

// Logout
await pwa.auth.logout();

// Events
pwa.auth.on('login', ({ user }) => {
    console.log('User logged in:', user.username);
});

pwa.auth.on('session-expired', () => {
    alert('Please log in again');
});
```

## 🌐 Service Worker Integration

```javascript
// sw.js
importScripts('https://sql.js.org/dist/sql-wasm.js');
importScripts('./pwa-components/db/database-service.js');

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncPendingData());
    }
});

async function syncPendingData() {
    const db = new DatabaseService();
    await db.init();
    
    const pending = db.getPendingSyncItems(20);
    for (const item of pending) {
        try {
            await syncToServer(item);
            db.markSyncCompleted(item.id);
        } catch (error) {
            db.markSyncFailed(item.id, error.message);
        }
    }
}
```

## 📈 Metrics & Analytics

```javascript
// Record metrics
pwa.metrics.counter('button.click', 1);
pwa.metrics.gauge('active.users', 42);
pwa.metrics.histogram('response.time', 235);

// Get summary statistics
const summary = pwa.metrics.getSummary('response.time');
// { count, sum, avg, min, max, stdDev }

// Get percentiles
const percentiles = pwa.metrics.getPercentiles('response.time', [50, 95, 99]);
// { p50, p95, p99 }

// Get time series
const timeSeries = pwa.metrics.getTimeSeries('api.requests', 'hour');

// Generate charts
const lineChart = pwa.metrics.generateLineChart('response.time', {
    interval: 'hour',
    aggregation: 'avg'
});
```

## 🪝 Webhooks

```javascript
// Register webhook
const webhookId = pwa.webhooks.register({
    name: 'Slack Notification',
    url: 'https://hooks.slack.com/...',
    events: ['user.registered', 'error.occurred'],
    retry_count: 3
});

// Trigger webhooks
pwa.webhooks.trigger('user.registered', {
    userId: '123',
    username: 'john',
    timestamp: new Date().toISOString()
});

// Get statistics
const stats = pwa.webhooks.getStatistics(webhookId);
// { total, successful, failed, successRate, avgDuration }
```

## 🔌 API System

```javascript
// Register endpoint
pwa.api.register('POST', '/api/users', async (request) => {
    const { username, email } = request.body;
    const userId = await createUser(username, email);
    return pwa.api.successResponse({ userId }, 201);
}, {
    authRequired: false,
    rateLimit: 100,
    requestSchema: {
        type: 'object',
        required: ['username', 'email'],
        properties: {
            username: { type: 'string' },
            email: { type: 'string' }
        }
    }
});

// Handle request
const response = await pwa.api.handle('POST', '/api/users', {
    body: { username: 'john', email: 'john@example.com' }
});

// Generate documentation
const docs = pwa.api.generateDocs();
const openapi = pwa.api.exportOpenAPI();
```

## 🧩 Extending the System

### Create Custom Plugin

```javascript
class MyCustomPlugin {
    constructor() {
        this.data = new Map();
    }
    
    init() {
        console.log('Custom plugin initialized');
    }
    
    doSomething() {
        // Your logic here
    }
}

const myPlugin = new MyCustomPlugin();
export default myPlugin;
```

### Add to PWA Components

```javascript
import myPlugin from './plugins/my-plugin.js';

pwa.myPlugin = myPlugin;
await pwa.myPlugin.init();
```

## 📱 PWA Builder Integration

Compatible with PWA Builder! Drop this into your WonkyDonkey or any PWA Builder project:

```javascript
// In your app-home.ts or similar
import pwa from '../pwa-components/index.js';

export class AppHome extends LitElement {
    async firstUpdated() {
        await pwa.quickSetup({
            schemaUrl: '/db/schema.sql'
        });
        
        this.loadData();
    }
}
```

## 🐛 Troubleshooting

### Database not persisting

```javascript
// Manually save after important operations
await pwa.db.saveToIndexedDB();
```

### Settings not updating UI

```javascript
// Listen for settings changes
pwa.settings.onChange(({ category, key, value }) => {
    // Update UI
    this.requestUpdate();
});
```

### Logs not appearing

```javascript
// Check log level
pwa.logging.setLevel('debug');

// Enable console
pwa.logging.setConsole(true);
```

## 🧪 Testing

```javascript
// Example test
describe('PWA Components', () => {
    beforeEach(async () => {
        await pwa.init({ schemaSQL });
    });
    
    it('should authenticate user', async () => {
        const result = await pwa.auth.login('admin', 'admin123');
        expect(result.user.username).toBe('admin');
    });
    
    it('should save settings', () => {
        pwa.settings.set('test', 'value', 'hello');
        const value = pwa.settings.get('test', 'value');
        expect(value).toBe('hello');
    });
});
```

## 📄 License

MIT License - Feel free to use in your projects!

## 🤝 Contributing

This is a complete, working system designed for the WonkyDonkey PWA and similar applications. Feel free to:

1. Add new plugins
2. Enhance existing functionality
3. Improve documentation
4. Report issues

## 🎯 Roadmap

- [ ] Real-time sync with WebSocket support
- [ ] Encryption for sensitive data
- [ ] Export/import functionality
- [ ] Advanced search capabilities
- [ ] GraphQL API support
- [ ] Multi-language support
- [ ] Advanced caching strategies

## 📞 Support

For questions or issues:
1. Check the [Integration Guide](./INTEGRATION.md)
2. Review [example.html](./example.html)
3. Check database schema in [schema.sql](./db/schema.sql)

---

Built with ❤️ for modern Progressive Web Applications
