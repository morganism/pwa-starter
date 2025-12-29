# PWA Components - Integration Guide

## Overview

This is a modular, plugin-based system for Progressive Web Applications that provides:

1. **Database Layer** - SQLite with offline-first sync capabilities
2. **Settings & Configuration** - Type-safe settings management
3. **Authentication** - Login/logout with session management
4. **Logging & Debug** - Centralized logging system
5. **Dynamic Pages** - CMS-like page management
6. **Webhook Sender** - HTTP webhooks with retry logic
7. **API Handler** - Dynamic API routing
8. **Metrics & Reporting** - Analytics with visualization

## Quick Start

### 1. Include the Components

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My PWA</title>
    
    <!-- SQL.js for client-side SQLite -->
    <script src="https://sql.js.org/dist/sql-wasm.js"></script>
</head>
<body>
    <!-- Your app content -->
    
    <!-- Include PWA Components -->
    <script type="module">
        import pwa from './pwa-components/index.js';
        
        // Initialize with schema
        pwa.quickSetup({
            schemaUrl: './pwa-components/db/schema.sql',
            logLevel: 'info',
            enableMetrics: true
        }).then(() => {
            console.log('PWA ready!');
            initApp();
        });
        
        function initApp() {
            // Your app initialization code
        }
    </script>
</body>
</html>
```

### 2. Alternative - Manual Initialization

```javascript
import pwa from './pwa-components/index.js';

// Load schema manually
const response = await fetch('./pwa-components/db/schema.sql');
const schemaSQL = await response.text();

// Initialize
await pwa.init({
    schemaSQL,
    dbName: 'my-app.db',
    logLevel: 'debug',
    enableMetrics: true,
    router: myRouter // Optional: your PWA Builder router
});
```

## Component Usage

### Database Service

```javascript
// Access via pwa.db or import directly
import { dbService } from './pwa-components/index.js';

// Execute SQL
const users = dbService.getAll('SELECT * FROM users WHERE active = 1');

// Get one row
const user = dbService.getOne('SELECT * FROM users WHERE username = ?', ['admin']);

// Run statements
dbService.run('INSERT INTO users (id, username, ...) VALUES (?, ?, ...)', [id, username, ...]);

// Transactions
dbService.run('BEGIN TRANSACTION');
try {
    // Your operations
    dbService.run('COMMIT');
} catch (error) {
    dbService.run('ROLLBACK');
}

// Export database
const blob = dbService.exportDatabase();
```

### Settings Plugin

```javascript
// Access via pwa.settings
const settings = pwa.settings;

// Get a setting
const theme = settings.get('ui', 'theme', 'light');

// Set a setting
settings.set('ui', 'theme', 'dark', 'string', 'UI theme');

// Get all settings for a category
const uiSettings = settings.getCategory('ui');

// Get all settings
const allSettings = settings.getAll();

// Listen for changes
settings.onChange(({ category, key, value }) => {
    console.log(`Setting changed: ${category}.${key} = ${value}`);
});

// Helper methods
settings.setTheme('dark');
settings.setPrimaryColor('#007AFF');
settings.setAnimations(true);
```

### Authentication Plugin

```javascript
// Access via pwa.auth
const auth = pwa.auth;

// Register a new user
const userId = await auth.register({
    username: 'john',
    email: 'john@example.com',
    password: 'secret123',
    display_name: 'John Doe'
});

// Login
const { user, sessionToken } = await auth.login('john', 'secret123');

// Check authentication status
if (auth.isAuthenticated()) {
    const currentUser = auth.getCurrentUser();
    console.log('Logged in as:', currentUser.username);
}

// Logout
await auth.logout();

// Update profile
await auth.updateProfile({
    display_name: 'Johnny Doe',
    avatar_url: 'https://...'
});

// Change password
await auth.changePassword('oldPassword', 'newPassword');

// Listen for auth events
auth.on('login', ({ user }) => {
    console.log('User logged in:', user.username);
});

auth.on('logout', () => {
    console.log('User logged out');
});

auth.on('session-expired', () => {
    alert('Your session has expired. Please log in again.');
});
```

### Logging Plugin

```javascript
// Access via pwa.logging
const log = pwa.logging;

// Log at different levels
log.debug('Debug message', { category: 'app' });
log.info('Info message', { category: 'app' });
log.warn('Warning message', { category: 'app' });
log.error('Error message', { category: 'app', stackTrace: error.stack });

// Create a performance timer
const stopTimer = log.timer('database-query');
// ... do work ...
stopTimer(); // Logs the duration

// Get recent logs
const logs = log.getRecentLogs(100);

// Filter logs
const errorLogs = log.filter({
    level: 'error',
    startDate: new Date('2024-01-01'),
    search: 'database'
});

// Export logs
log.downloadLogs({ level: 'error' });

// Listen for log events
log.onLog((logEntry) => {
    // Send to external logging service
    if (logEntry.level === 'error') {
        sendToSentry(logEntry);
    }
});
```

### Dynamic Page Plugin

```javascript
// Access via pwa.pages
const pages = pwa.pages;

// Create a new page
pages.savePage({
    route: '/help/getting-started',
    title: 'Getting Started',
    content: '<h1>Welcome!</h1><p>This is the getting started guide.</p>',
    content_type: 'html',
    published: 1
});

// Get a page
const page = pages.getPage('/help/getting-started');

// Render a page
const html = pages.renderPage('/help/getting-started');
document.getElementById('content').innerHTML = html;

// Register a custom template
pages.registerTemplate('custom', (page, data) => {
    return `
        <div class="custom-template">
            <h1>${page.title}</h1>
            <div>${page.content}</div>
            <footer>Custom footer</footer>
        </div>
    `;
});

// Get navigation tree
const nav = pages.buildNavigationTree();

// Search pages
const results = pages.searchPages('getting started');

// Listen for page events
pages.on('page-updated', ({ page }) => {
    console.log('Page updated:', page.route);
});
```

### Webhook Plugin

```javascript
// Access via pwa.webhooks
const webhooks = pwa.webhooks;

// Register a webhook
const webhookId = webhooks.register({
    name: 'Slack Notification',
    url: 'https://hooks.slack.com/services/...',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    events: ['user.registered', 'user.login'],
    retry_count: 3,
    timeout: 30
});

// Trigger webhooks
webhooks.trigger('user.registered', {
    userId: '123',
    username: 'john',
    timestamp: new Date().toISOString()
});

// Test a webhook
await webhooks.test(webhookId);

// Get delivery history
const history = webhooks.getDeliveryHistory(webhookId);

// Get statistics
const stats = webhooks.getStatistics(webhookId);
console.log('Success rate:', stats.successRate + '%');
```

### API Plugin

```javascript
// Access via pwa.api
const api = pwa.api;

// Register an API endpoint
api.register('GET', '/api/users', async (request) => {
    const users = pwa.db.getAll('SELECT * FROM users WHERE active = 1');
    return api.successResponse(users);
}, {
    authRequired: true,
    rateLimit: 100,
    description: 'Get all active users'
});

// Register with request validation
api.register('POST', '/api/users', async (request) => {
    const { username, email } = request.body;
    
    const userId = await pwa.auth.register({
        username,
        email,
        password: request.body.password
    });
    
    return api.successResponse({ userId }, 201);
}, {
    authRequired: false,
    requestSchema: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
            username: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string' }
        }
    }
});

// Handle API request
const response = await api.handle('GET', '/api/users', {
    query: {},
    body: {},
    headers: {}
});

// Add middleware
api.use(async (request, endpoint) => {
    // Log all API requests
    pwa.logging.info(`API request: ${endpoint.method} ${endpoint.route}`, {
        category: 'api'
    });
    return true; // Continue
});

// Generate API documentation
const docs = api.generateDocs();

// Export OpenAPI spec
const openapi = api.exportOpenAPI();
```

### Metrics Plugin

```javascript
// Access via pwa.metrics
const metrics = pwa.metrics;

// Record metrics
metrics.counter('button.click', 1, {
    tags: { button: 'login' }
});

metrics.gauge('active.users', 42);

metrics.histogram('api.response_time', 235, {
    tags: { endpoint: '/api/users' }
});

// Create a timer
const stopTimer = metrics.createTimer('database.query', {
    tags: { table: 'users' }
});
// ... perform query ...
const duration = stopTimer();

// Get metric summary
const summary = metrics.getSummary('api.response_time');
console.log('Average response time:', summary.avg);

// Get percentiles
const percentiles = metrics.getPercentiles('api.response_time', [50, 95, 99]);
console.log('P95:', percentiles.p95);

// Get time series
const timeSeries = metrics.getTimeSeries('api.requests', 'hour');

// Generate charts (for use with Chart.js or similar)
const lineChart = metrics.generateLineChart('api.response_time', {
    interval: 'hour',
    aggregation: 'avg'
});

const barChart = metrics.generateBarChart('api.requests', 'endpoint', {
    aggregation: 'count'
});

// Custom collector
metrics.registerCollector('memory-usage', () => {
    if (performance.memory) {
        metrics.gauge('memory.used', performance.memory.usedJSHeapSize, {
            unit: 'bytes'
        });
    }
}, 60000); // Every minute

// Get dashboard data
const dashboard = metrics.getDashboard({
    metrics: [
        { name: 'page.view', type: 'timeSeries' },
        { name: 'api.requests', type: 'bar', options: { groupBy: 'endpoint' } },
        { name: 'error.js', type: 'summary' }
    ],
    timeRange: '24h'
});
```

## Service Worker Integration

```javascript
// In your service worker (sw.js)
importScripts('https://sql.js.org/dist/sql-wasm.js');
importScripts('./pwa-components/db/database-service.js');
importScripts('./pwa-components/plugins/logging-plugin.js');

// Initialize for service worker
const db = new DatabaseService();
const logging = new LoggingPlugin();

// Handle background sync
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    await db.init();
    const pending = db.getPendingSyncItems(20);
    
    for (const item of pending) {
        try {
            // Sync with server
            await fetch('/api/sync', {
                method: 'POST',
                body: JSON.stringify(item.data)
            });
            
            db.markSyncCompleted(item.id);
        } catch (error) {
            db.markSyncFailed(item.id, error.message);
        }
    }
}
```

## Best Practices

### 1. Error Handling

```javascript
try {
    await pwa.auth.login(username, password);
} catch (error) {
    pwa.logging.error('Login failed', {
        category: 'auth',
        details: { username },
        stackTrace: error.stack
    });
    
    // Show user-friendly message
    alert('Invalid username or password');
}
```

### 2. Performance Monitoring

```javascript
// Wrap expensive operations
const stopTimer = pwa.metrics.createTimer('expensive-operation');
try {
    await doExpensiveWork();
} finally {
    stopTimer();
}
```

### 3. Offline Support

```javascript
// Queue operations for sync
if (!navigator.onLine) {
    pwa.db.queueSync('create', 'users', userId, userData);
} else {
    await sendToServer(userData);
}
```

### 4. Settings Management

```javascript
// Use settings for configuration
const apiUrl = pwa.settings.get('api', 'base_url', 'https://api.example.com');
const timeout = pwa.settings.get('api', 'timeout', 30000);

// Make settings UI-configurable
function updateSettings(formData) {
    pwa.settings.bulkUpdate('ui', {
        theme: formData.theme,
        primary_color: formData.color,
        enable_animations: formData.animations
    });
}
```

## Migration from Existing App

1. **Install Dependencies**
   - Add SQL.js script tag
   - Copy pwa-components directory to your project

2. **Initialize Database**
   - Run schema.sql to create tables
   - Migrate existing data if needed

3. **Replace Existing Systems**
   - Replace localStorage with settings plugin
   - Replace auth system with auth plugin
   - Replace logging with logging plugin

4. **Update Components**
   - Use pwa.db instead of direct database access
   - Use pwa.logging instead of console.log
   - Use pwa.settings instead of localStorage

## Troubleshooting

### Database Not Persisting

```javascript
// Make sure to save after critical operations
await pwa.db.saveToIndexedDB();

// Or enable auto-save in database service
// (already enabled by default after writes)
```

### Settings Not Loading

```javascript
// Clear cache and reload
pwa.settings.clearCache();
const theme = pwa.settings.get('ui', 'theme');
```

### Session Expired Too Quickly

```javascript
// Increase session duration when creating
const sessionToken = pwa.db.createSession(userId, deviceInfo, 168); // 7 days
```

## Examples

See the `/examples` directory for complete working examples:

- **Basic App** - Simple PWA with auth and settings
- **Dashboard** - Metrics dashboard with charts
- **CMS** - Dynamic page management
- **API Integration** - RESTful API with webhooks

## License

MIT
