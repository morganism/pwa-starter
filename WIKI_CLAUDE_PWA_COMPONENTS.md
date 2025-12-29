# Claude PWA Components

A comprehensive, modular plugin-based system for Progressive Web Applications.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Setup](#quick-setup)
- [Core Concepts](#core-concepts)
- [Available Plugins](#available-plugins)
- [API Reference](#api-reference)

## Overview

The Claude PWA Components system provides a complete suite of tools for building modern PWAs with offline-first architecture, including:

- Client-side SQLite database with IndexedDB persistence
- Settings and configuration management
- Authentication and session handling
- Centralized logging system
- Dynamic content management
- API routing and handling
- Webhook system
- Metrics and analytics

## Installation

The components are already included in this repository under `claude_contrib/`. To use them in your application:

1. **Add SQL.js to your HTML** (required for database):
   ```html
   <script src="https://sql.js.org/dist/sql-wasm.js"></script>
   ```

2. **Import the PWA system** in your component:
   ```typescript
   import pwa from '../claude_contrib/index.js';
   ```

3. **Initialize in your component**:
   ```typescript
   async firstUpdated() {
     await pwa.quickSetup({
       schemaUrl: '/db/schema.sql',
       logLevel: 'info',
       enableMetrics: true
     });
   }
   ```

## Quick Setup

### Basic Initialization

```javascript
import pwa from '../claude_contrib/index.js';

// Quick setup with all defaults
await pwa.quickSetup({
  schemaUrl: '/db/schema.sql',
  logLevel: 'info',
  enableMetrics: true
});

// Check if ready
if (pwa.isReady()) {
  console.log('PWA Components initialized!');
}
```

### Custom Initialization

```javascript
// Load schema
const schema = await fetch('/db/schema.sql').then(r => r.text());

// Initialize with custom options
await pwa.init({
  schemaSQL: schema,
  dbName: 'my-app.db',
  logLevel: 'debug',
  enableMetrics: true
});
```

## Core Concepts

### Global Access

The PWA system is available globally via `window.pwa`:

```javascript
// From browser console or anywhere in your app
window.pwa.logging.info('Hello!');
window.pwa.settings.get('ui', 'theme');
```

### Offline-First Architecture

All data is stored locally in SQLite and automatically persisted to IndexedDB. The system works completely offline and can sync with a server when online.

### Event-Driven

Components emit events that you can listen to:

```javascript
pwa.auth.on('login', ({ user }) => {
  console.log('User logged in:', user.username);
});

pwa.auth.on('session-expired', () => {
  alert('Please log in again');
});
```

## Available Plugins

### Database (`pwa.db`)
Client-side SQLite with IndexedDB persistence
- [Full Documentation](Database-Guide)

### Settings (`pwa.settings`)
Type-safe configuration management
- [Full Documentation](Settings-Management)

### Authentication (`pwa.auth`)
Login/logout with session handling
- [Full Documentation](Authentication)

### Logging (`pwa.logging`)
Centralized logging with multiple levels
- [Full Documentation](Logging-and-Metrics)

### API Handler (`pwa.api`)
Dynamic API routing and validation
- [Full Documentation](API-System)

### Webhooks (`pwa.webhooks`)
HTTP webhooks with retry logic
- [Full Documentation](Webhooks)

### Metrics (`pwa.metrics`)
Analytics and reporting
- [Full Documentation](Logging-and-Metrics)

### Dynamic Pages (`pwa.pages`)
CMS-like content management
- [Full Documentation](Dynamic-Pages)

## API Reference

### Initialization Methods

#### `pwa.init(options)`
Initialize all components with custom options.

**Parameters:**
- `options.schemaSQL` (string): SQL schema content
- `options.dbName` (string): Database name (default: 'pwa-core.db')
- `options.logLevel` (string): Log level ('debug', 'info', 'warn', 'error', 'fatal')
- `options.enableMetrics` (boolean): Enable metrics tracking

**Returns:** Promise<void>

#### `pwa.quickSetup(options)`
Quick initialization with schema file URL.

**Parameters:**
- `options.schemaUrl` (string): URL to schema.sql file
- `options.dbName` (string): Database name
- `options.logLevel` (string): Log level
- `options.enableMetrics` (boolean): Enable metrics

**Returns:** Promise<void>

#### `pwa.isReady()`
Check if PWA components are initialized.

**Returns:** boolean

#### `pwa.whenReady()`
Wait for initialization to complete.

**Returns:** Promise<void>

### Example Usage

```javascript
// Wait for PWA to be ready
await pwa.whenReady();

// Use components
pwa.logging.info('App started');
pwa.metrics.counter('app.start');

// Listen for events
window.addEventListener('pwa-components-ready', () => {
  console.log('PWA is ready!');
});
```

## Next Steps

- [Database Guide](Database-Guide) - Learn about the database system
- [Authentication](Authentication) - Set up user authentication
- [API System](API-System) - Create dynamic APIs
- [Examples](Examples) - See complete examples
