/**
 * Database Service for PWA
 * Provides a clean API for SQLite operations with support for:
 * - UUID generation
 * - Automatic timestamps
 * - Transaction management
 * - Error handling
 * - Type coercion for settings
 */

// Using sql.js for client-side SQLite
// Import: <script src="https://sql.js.org/dist/sql-wasm.js"></script>

class DatabaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.dbName = 'pwa-core.db';
  }

  /**
   * Initialize the database
   * @param {string} schemaSQL - SQL schema to create tables
   * @returns {Promise<void>}
   */
  async init(schemaSQL = null) {
    if (this.initialized) return;

    try {
      // Initialize SQL.js
      const SQL = await initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
      });

      // Try to load existing database from IndexedDB
      const savedDb = await this.loadFromIndexedDB();
      
      if (savedDb) {
        this.db = new SQL.Database(savedDb);
        console.log('Loaded existing database from IndexedDB');
      } else {
        this.db = new SQL.Database();
        console.log('Created new database');
        
        // Apply schema if provided
        if (schemaSQL) {
          this.db.run(schemaSQL);
          await this.saveToIndexedDB();
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Generate a UUID v4
   * @returns {string}
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get current ISO timestamp
   * @returns {string}
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Execute a SQL query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array} Results
   */
  exec(sql, params = []) {
    try {
      const result = this.db.exec(sql, params);
      return result;
    } catch (error) {
      console.error('SQL execution error:', error);
      throw error;
    }
  }

  /**
   * Run a SQL statement (no results returned)
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   */
  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      this.saveToIndexedDB(); // Auto-save after writes
    } catch (error) {
      console.error('SQL run error:', error);
      throw error;
    }
  }

  /**
   * Get one row from a query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object|null}
   */
  getOne(sql, params = []) {
    const results = this.exec(sql, params);
    if (results.length === 0 || results[0].values.length === 0) {
      return null;
    }
    
    const row = results[0].values[0];
    const columns = results[0].columns;
    
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    
    return obj;
  }

  /**
   * Get all rows from a query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array<Object>}
   */
  getAll(sql, params = []) {
    const results = this.exec(sql, params);
    if (results.length === 0) {
      return [];
    }
    
    const columns = results[0].columns;
    const rows = results[0].values;
    
    return rows.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }

  // ============================================================================
  // SETTINGS / CONFIGURATION API
  // ============================================================================

  /**
   * Get a setting value
   * @param {string} category - Setting category
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if not found
   * @returns {*}
   */
  getSetting(category, key, defaultValue = null) {
    const result = this.getOne(
      'SELECT value, value_type FROM kv_settings WHERE category = ? AND key = ? AND active = 1',
      [category, key]
    );
    
    if (!result) return defaultValue;
    
    return this.coerceSettingValue(result.value, result.value_type);
  }

  /**
   * Set a setting value
   * @param {string} category - Setting category
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @param {string} valueType - Value type
   * @param {string} description - Optional description
   */
  setSetting(category, key, value, valueType = 'string', description = null) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    // Convert value to string for storage
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    this.run(
      `INSERT INTO kv_settings (id, create_date, category, key, value, value_type, description, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(category, key) DO UPDATE SET 
         value = excluded.value,
         value_type = excluded.value_type,
         modified_date = ?`,
      [id, now, category, key, valueStr, valueType, description, now]
    );
  }

  /**
   * Get all settings for a category
   * @param {string} category - Setting category
   * @returns {Object}
   */
  getSettingsByCategory(category) {
    const rows = this.getAll(
      'SELECT key, value, value_type FROM kv_settings WHERE category = ? AND active = 1',
      [category]
    );
    
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = this.coerceSettingValue(row.value, row.value_type);
    });
    
    return settings;
  }

  /**
   * Coerce setting value to proper type
   * @param {string} value - String value from DB
   * @param {string} type - Value type
   * @returns {*}
   */
  coerceSettingValue(value, type) {
    if (value === null) return null;
    
    switch (type) {
      case 'boolean':
        return value === 'true' || value === '1';
      case 'int':
        return parseInt(value, 10);
      case 'float':
        return parseFloat(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'date':
      case 'datetime':
      case 'time':
        return new Date(value);
      default:
        return value;
    }
  }

  // ============================================================================
  // USER MANAGEMENT API
  // ============================================================================

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {string} User ID
   */
  createUser(userData) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      username,
      email,
      password_hash,
      display_name,
      avatar_url,
      role = 'user',
      preferences = null,
      metadata = null
    } = userData;
    
    this.run(
      `INSERT INTO users (id, create_date, username, email, password_hash, display_name, 
         avatar_url, role, active, preferences, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id, now, username, email, password_hash, display_name,
        avatar_url, role,
        preferences ? JSON.stringify(preferences) : null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    
    return id;
  }

  /**
   * Get user by username
   * @param {string} username
   * @returns {Object|null}
   */
  getUserByUsername(username) {
    const user = this.getOne(
      'SELECT * FROM users WHERE username = ? AND active = 1',
      [username]
    );
    
    if (user && user.preferences) {
      user.preferences = JSON.parse(user.preferences);
    }
    if (user && user.metadata) {
      user.metadata = JSON.parse(user.metadata);
    }
    
    return user;
  }

  /**
   * Get user by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getUserById(id) {
    const user = this.getOne(
      'SELECT * FROM users WHERE id = ? AND active = 1',
      [id]
    );
    
    if (user && user.preferences) {
      user.preferences = JSON.parse(user.preferences);
    }
    if (user && user.metadata) {
      user.metadata = JSON.parse(user.metadata);
    }
    
    return user;
  }

  /**
   * Update user's last login
   * @param {string} userId
   */
  updateLastLogin(userId) {
    const now = this.getTimestamp();
    this.run(
      'UPDATE users SET last_login = ? WHERE id = ?',
      [now, userId]
    );
  }

  // ============================================================================
  // SESSION MANAGEMENT API
  // ============================================================================

  /**
   * Create a new session
   * @param {string} userId
   * @param {Object} deviceInfo
   * @param {number} expiryHours - Hours until expiry
   * @returns {string} Session ID (token)
   */
  createSession(userId, deviceInfo = {}, expiryHours = 24) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    const expiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    
    this.run(
      `INSERT INTO sessions (id, create_date, expiry_date, user_id, device_info, 
         ip_address, last_activity, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id, now, expiry, userId,
        JSON.stringify(deviceInfo),
        deviceInfo.ip || null,
        now
      ]
    );
    
    return id;
  }

  /**
   * Get session by token
   * @param {string} sessionToken
   * @returns {Object|null}
   */
  getSession(sessionToken) {
    const session = this.getOne(
      `SELECT * FROM sessions 
       WHERE id = ? AND active = 1 AND expiry_date > datetime('now')`,
      [sessionToken]
    );
    
    if (session && session.device_info) {
      session.device_info = JSON.parse(session.device_info);
    }
    
    return session;
  }

  /**
   * Update session activity
   * @param {string} sessionToken
   */
  updateSessionActivity(sessionToken) {
    const now = this.getTimestamp();
    this.run(
      'UPDATE sessions SET last_activity = ? WHERE id = ?',
      [now, sessionToken]
    );
  }

  /**
   * Invalidate a session
   * @param {string} sessionToken
   */
  invalidateSession(sessionToken) {
    this.run(
      'UPDATE sessions SET active = 0 WHERE id = ?',
      [sessionToken]
    );
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    this.run(
      "DELETE FROM sessions WHERE expiry_date < datetime('now')"
    );
  }

  // ============================================================================
  // LOGGING API
  // ============================================================================

  /**
   * Log a message
   * @param {string} level - Log level (debug, info, warn, error, fatal)
   * @param {string} message - Log message
   * @param {Object} options - Additional options
   */
  log(level, message, options = {}) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      category = null,
      details = null,
      userId = null,
      sessionId = null,
      stackTrace = null,
      metadata = null
    } = options;
    
    this.run(
      `INSERT INTO logs (id, create_date, level, category, message, details, 
         user_id, session_id, stack_trace, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, now, level, category, message,
        details ? JSON.stringify(details) : null,
        userId, sessionId, stackTrace,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  }

  /**
   * Get recent logs
   * @param {number} limit
   * @param {string} level - Filter by level
   * @returns {Array}
   */
  getLogs(limit = 100, level = null) {
    let sql = 'SELECT * FROM v_recent_logs';
    const params = [];
    
    if (level) {
      sql += ' WHERE level = ?';
      params.push(level);
    }
    
    sql += ' LIMIT ?';
    params.push(limit);
    
    return this.getAll(sql, params);
  }

  // ============================================================================
  // CONTENT MANAGEMENT API
  // ============================================================================

  /**
   * Create or update content page
   * @param {Object} pageData
   * @returns {string} Page ID
   */
  savePage(pageData) {
    const id = pageData.id || this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      route,
      title,
      content,
      content_type = 'html',
      template = null,
      metadata = null,
      published = 0,
      parent_id = null,
      sort_order = 0
    } = pageData;
    
    this.run(
      `INSERT INTO content_pages (id, create_date, route, title, content, content_type,
         template, metadata, published, active, parent_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(route) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         content_type = excluded.content_type,
         template = excluded.template,
         metadata = excluded.metadata,
         published = excluded.published,
         parent_id = excluded.parent_id,
         sort_order = excluded.sort_order,
         modified_date = ?`,
      [
        id, now, route, title, content, content_type, template,
        metadata ? JSON.stringify(metadata) : null,
        published, parent_id, sort_order, now
      ]
    );
    
    return id;
  }

  /**
   * Get page by route
   * @param {string} route
   * @returns {Object|null}
   */
  getPageByRoute(route) {
    const page = this.getOne(
      'SELECT * FROM content_pages WHERE route = ? AND active = 1',
      [route]
    );
    
    if (page && page.metadata) {
      page.metadata = JSON.parse(page.metadata);
    }
    
    return page;
  }

  /**
   * Get all published pages
   * @returns {Array}
   */
  getPublishedPages() {
    return this.getAll('SELECT * FROM v_published_content');
  }

  // ============================================================================
  // DATA RECORDS API (Graph-like)
  // ============================================================================

  /**
   * Create a data record
   * @param {string} topic
   * @param {string} subTopic
   * @param {Object} jsonData
   * @param {Object} options
   * @returns {string} Record ID
   */
  createDataRecord(topic, subTopic, jsonData, options = {}) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      expiry = null,
      tags = [],
      metadata = null
    } = options;
    
    this.run(
      `INSERT INTO data_records (id, create_date, expiry_date, topic, sub_topic,
         json_data, tags, active, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        id, now, expiry, topic, subTopic,
        JSON.stringify(jsonData),
        JSON.stringify(tags),
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    
    return id;
  }

  /**
   * Get data records by topic
   * @param {string} topic
   * @param {string} subTopic - Optional
   * @returns {Array}
   */
  getDataRecordsByTopic(topic, subTopic = null) {
    let sql = 'SELECT * FROM data_records WHERE topic = ? AND active = 1';
    const params = [topic];
    
    if (subTopic) {
      sql += ' AND sub_topic = ?';
      params.push(subTopic);
    }
    
    const records = this.getAll(sql, params);
    
    return records.map(record => {
      if (record.json_data) record.json_data = JSON.parse(record.json_data);
      if (record.tags) record.tags = JSON.parse(record.tags);
      if (record.metadata) record.metadata = JSON.parse(record.metadata);
      return record;
    });
  }

  // ============================================================================
  // WEBHOOK API
  // ============================================================================

  /**
   * Create a webhook
   * @param {Object} webhookData
   * @returns {string} Webhook ID
   */
  createWebhook(webhookData) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      name,
      url,
      method = 'POST',
      headers = {},
      secret = null,
      events = [],
      retry_count = 3,
      timeout = 30,
      metadata = null
    } = webhookData;
    
    this.run(
      `INSERT INTO webhooks (id, create_date, name, url, method, headers, secret,
         active, retry_count, timeout, events, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id, now, name, url, method,
        JSON.stringify(headers),
        secret, retry_count, timeout,
        JSON.stringify(events),
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    
    return id;
  }

  /**
   * Get active webhooks for an event
   * @param {string} eventType
   * @returns {Array}
   */
  getWebhooksForEvent(eventType) {
    const webhooks = this.getAll(
      'SELECT * FROM webhooks WHERE active = 1'
    );
    
    return webhooks.filter(hook => {
      const events = JSON.parse(hook.events || '[]');
      return events.includes(eventType) || events.includes('*');
    }).map(hook => {
      hook.headers = JSON.parse(hook.headers || '{}');
      hook.events = JSON.parse(hook.events || '[]');
      if (hook.metadata) hook.metadata = JSON.parse(hook.metadata);
      return hook;
    });
  }

  /**
   * Log webhook delivery
   * @param {string} webhookId
   * @param {string} eventType
   * @param {Object} payload
   * @param {Object} response
   * @returns {string} Delivery ID
   */
  logWebhookDelivery(webhookId, eventType, payload, response) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      status = null,
      body = null,
      success = false,
      retryCount = 0,
      error = null,
      duration = null
    } = response;
    
    this.run(
      `INSERT INTO webhook_deliveries (id, create_date, webhook_id, event_type,
         payload, response_status, response_body, success, retry_count, 
         error_message, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, now, webhookId, eventType,
        JSON.stringify(payload),
        status, body, success ? 1 : 0, retryCount, error, duration
      ]
    );
    
    return id;
  }

  // ============================================================================
  // METRICS API
  // ============================================================================

  /**
   * Record a metric
   * @param {string} metricName
   * @param {string} metricType
   * @param {number} value
   * @param {Object} options
   */
  recordMetric(metricName, metricType, value, options = {}) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    const {
      unit = null,
      tags = {},
      userId = null,
      sessionId = null,
      metadata = null
    } = options;
    
    this.run(
      `INSERT INTO metrics (id, create_date, metric_name, metric_type, value,
         unit, tags, user_id, session_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, now, metricName, metricType, value, unit,
        JSON.stringify(tags),
        userId, sessionId,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  }

  /**
   * Get metrics
   * @param {string} metricName
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Array}
   */
  getMetrics(metricName, startDate, endDate) {
    const metrics = this.getAll(
      `SELECT * FROM metrics 
       WHERE metric_name = ? 
       AND create_date >= ? 
       AND create_date <= ?
       ORDER BY create_date ASC`,
      [metricName, startDate.toISOString(), endDate.toISOString()]
    );
    
    return metrics.map(metric => {
      if (metric.tags) metric.tags = JSON.parse(metric.tags);
      if (metric.metadata) metric.metadata = JSON.parse(metric.metadata);
      return metric;
    });
  }

  // ============================================================================
  // SYNC QUEUE API
  // ============================================================================

  /**
   * Add item to sync queue
   * @param {string} operation - create, update, delete
   * @param {string} tableName
   * @param {string} recordId
   * @param {Object} data
   * @param {number} priority
   */
  queueSync(operation, tableName, recordId, data, priority = 5) {
    const id = this.generateUUID();
    const now = this.getTimestamp();
    
    this.run(
      `INSERT INTO sync_queue (id, create_date, operation, table_name, record_id,
         data, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, now, operation, tableName, recordId, JSON.stringify(data), priority]
    );
  }

  /**
   * Get pending sync items
   * @param {number} limit
   * @returns {Array}
   */
  getPendingSyncItems(limit = 10) {
    return this.getAll(
      'SELECT * FROM v_pending_sync LIMIT ?',
      [limit]
    );
  }

  /**
   * Mark sync item as completed
   * @param {string} syncId
   */
  markSyncCompleted(syncId) {
    this.run(
      'UPDATE sync_queue SET status = ? WHERE id = ?',
      ['synced', syncId]
    );
  }

  /**
   * Mark sync item as failed
   * @param {string} syncId
   * @param {string} errorMessage
   */
  markSyncFailed(syncId, errorMessage) {
    this.run(
      `UPDATE sync_queue 
       SET status = 'failed', 
           retry_count = retry_count + 1,
           error_message = ?,
           last_attempt = datetime('now')
       WHERE id = ?`,
      [errorMessage, syncId]
    );
  }

  // ============================================================================
  // PERSISTENCE (IndexedDB)
  // ============================================================================

  /**
   * Save database to IndexedDB
   * @returns {Promise<void>}
   */
  async saveToIndexedDB() {
    try {
      const data = this.db.export();
      const buffer = data.buffer;
      
      const request = indexedDB.open('PWA-Database', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('database')) {
          db.createObjectStore('database');
        }
      };
      
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          const transaction = db.transaction(['database'], 'readwrite');
          const store = transaction.objectStore('database');
          store.put(buffer, this.dbName);
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to save database to IndexedDB:', error);
    }
  }

  /**
   * Load database from IndexedDB
   * @returns {Promise<Uint8Array|null>}
   */
  async loadFromIndexedDB() {
    try {
      const request = indexedDB.open('PWA-Database', 1);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const db = event.target.result;
          
          if (!db.objectStoreNames.contains('database')) {
            resolve(null);
            return;
          }
          
          const transaction = db.transaction(['database'], 'readonly');
          const store = transaction.objectStore('database');
          const getRequest = store.get(this.dbName);
          
          getRequest.onsuccess = () => {
            resolve(getRequest.result ? new Uint8Array(getRequest.result) : null);
          };
          
          getRequest.onerror = () => reject(getRequest.error);
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load database from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Export database as file
   * @returns {Blob}
   */
  exportDatabase() {
    const data = this.db.export();
    return new Blob([data], { type: 'application/x-sqlite3' });
  }

  /**
   * Import database from file
   * @param {Uint8Array} data
   */
  async importDatabase(data) {
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });
    
    this.db = new SQL.Database(data);
    await this.saveToIndexedDB();
  }
}

// Export as singleton
const dbService = new DatabaseService();

// Auto-initialize when included
if (typeof window !== 'undefined') {
  // In browser context
  window.dbService = dbService;
}

export default dbService;
