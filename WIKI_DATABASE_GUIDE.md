# Database Guide

The PWA Components database system provides a powerful SQLite database that runs entirely in the browser with automatic persistence to IndexedDB.

## Table of Contents

- [Overview](#overview)
- [Accessing the Database](#accessing-the-database)
- [Basic Operations](#basic-operations)
- [Advanced Features](#advanced-features)
- [Database Schema](#database-schema)

## Overview

The database uses [SQL.js](https://sql.js.org/) to run SQLite in the browser. All data is automatically persisted to IndexedDB, making it available offline.

**Key Features:**
- Full SQLite support
- Automatic IndexedDB persistence
- UUID generation
- Timestamp helpers
- Transaction support
- Type coercion

## Accessing the Database

The database is available at `pwa.db`:

```javascript
// Execute query
pwa.db.run('INSERT INTO users (id, username) VALUES (?, ?)', [id, username]);

// Get single row
const user = pwa.db.getOne('SELECT * FROM users WHERE id = ?', [userId]);

// Get all rows
const users = pwa.db.getAll('SELECT * FROM users');
```

## Basic Operations

### Insert Data

```javascript
// Generate UUID for new record
const id = pwa.db.generateUUID();
const now = pwa.db.getTimestamp();

pwa.db.run(
  'INSERT INTO users (id, create_date, username, email) VALUES (?, ?, ?, ?)',
  [id, now, 'john', 'john@example.com']
);
```

### Query Data

```javascript
// Get single record
const user = pwa.db.getOne(
  'SELECT * FROM users WHERE username = ?',
  ['john']
);

// Get all records
const allUsers = pwa.db.getAll('SELECT * FROM users');

// Get with limit
const recentUsers = pwa.db.getAll(
  'SELECT * FROM users ORDER BY create_date DESC LIMIT 10'
);
```

### Update Data

```javascript
pwa.db.run(
  'UPDATE users SET email = ? WHERE id = ?',
  ['newemail@example.com', userId]
);
```

### Delete Data

```javascript
pwa.db.run('DELETE FROM users WHERE id = ?', [userId]);
```

## Advanced Features

### Transactions

```javascript
pwa.db.transaction(() => {
  pwa.db.run('INSERT INTO users ...');
  pwa.db.run('INSERT INTO logs ...');
  // If any operation fails, all are rolled back
});
```

### Manual Persistence

The database automatically saves to IndexedDB, but you can force a save:

```javascript
await pwa.db.saveToIndexedDB();
```

### Load from IndexedDB

```javascript
await pwa.db.loadFromIndexedDB();
```

### Helper Functions

```javascript
// Generate UUID
const id = pwa.db.generateUUID();
// Returns: "550e8400-e29b-41d4-a716-446655440000"

// Get current timestamp
const now = pwa.db.getTimestamp();
// Returns: "2024-12-29T13:45:30Z"
```

## Database Schema

### Core Tables

#### `users`
User accounts and profiles
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  active INTEGER DEFAULT 1
);
```

#### `sessions`
User session tracking
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### `settings`
Application settings (key-value store)
```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string',
  UNIQUE(category, key)
);
```

#### `logs`
Application logs
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  create_date TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT,
  details TEXT,
  stack_trace TEXT
);
```

#### `content_pages`
Dynamic page content
```sql
CREATE TABLE content_pages (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  update_date TEXT,
  route TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  published INTEGER DEFAULT 0
);
```

#### `data_records`
Flexible JSON storage
```sql
CREATE TABLE data_records (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  update_date TEXT,
  type TEXT NOT NULL,
  data TEXT,
  metadata TEXT
);
```

#### `webhooks`
Webhook configurations
```sql
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT,
  active INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 3
);
```

#### `webhook_deliveries`
Webhook delivery history
```sql
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT,
  status TEXT,
  response TEXT,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
);
```

#### `api_endpoints`
Dynamic API routes
```sql
CREATE TABLE api_endpoints (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  handler TEXT,
  auth_required INTEGER DEFAULT 1,
  rate_limit INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1
);
```

#### `metrics`
Analytics and metrics data
```sql
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  create_date TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL NOT NULL,
  tags TEXT
);
```

#### `sync_queue`
Offline sync queue
```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  create_date TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id TEXT,
  data TEXT,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);
```

### View Full Schema

The complete schema is available at `/claude_contrib/db/schema.sql`

## Examples

### Creating a Custom Table

```javascript
// Define your table
pwa.db.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    create_date TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  )
`);

// Insert data
const taskId = pwa.db.generateUUID();
pwa.db.run(
  'INSERT INTO tasks (id, create_date, title) VALUES (?, ?, ?)',
  [taskId, pwa.db.getTimestamp(), 'My first task']
);

// Query data
const tasks = pwa.db.getAll('SELECT * FROM tasks WHERE completed = 0');
```

### Working with JSON Data

```javascript
// Store JSON data
const data = { name: 'John', age: 30 };
pwa.db.run(
  'INSERT INTO data_records (id, create_date, type, data) VALUES (?, ?, ?, ?)',
  [pwa.db.generateUUID(), pwa.db.getTimestamp(), 'user_profile', JSON.stringify(data)]
);

// Retrieve and parse JSON
const record = pwa.db.getOne(
  'SELECT * FROM data_records WHERE type = ?',
  ['user_profile']
);
const parsedData = JSON.parse(record.data);
```

## Best Practices

1. **Always use parameterized queries** to prevent SQL injection:
   ```javascript
   // Good
   pwa.db.run('SELECT * FROM users WHERE id = ?', [userId]);

   // Bad - Don't do this!
   pwa.db.run(`SELECT * FROM users WHERE id = '${userId}'`);
   ```

2. **Use transactions for multiple related operations**:
   ```javascript
   pwa.db.transaction(() => {
     pwa.db.run('INSERT INTO orders ...');
     pwa.db.run('UPDATE inventory ...');
   });
   ```

3. **Generate UUIDs and timestamps consistently**:
   ```javascript
   const id = pwa.db.generateUUID();
   const now = pwa.db.getTimestamp();
   ```

4. **Check for null/undefined before querying**:
   ```javascript
   const user = pwa.db.getOne('SELECT * FROM users WHERE id = ?', [userId]);
   if (user) {
     // Use user data
   }
   ```

## Next Steps

- [Settings Management](Settings-Management) - Use the settings system
- [API System](API-System) - Create dynamic APIs
- [Examples](Examples) - See complete examples
