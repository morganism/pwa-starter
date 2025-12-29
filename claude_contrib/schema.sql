-- ============================================================================
-- PWA Core Database Schema
-- ============================================================================
-- This schema supports offline-first PWA with sync capabilities
-- All tables follow consistent patterns for UUIDs, timestamps, and lifecycle

-- ============================================================================
-- SETTINGS AND CONFIGURATION
-- ============================================================================

-- Simple grouped key-value pairs for reference data
-- Records are deactivated rather than deleted to maintain history
CREATE TABLE IF NOT EXISTS kv_settings (
    id TEXT PRIMARY KEY,              -- UUID
    active INTEGER DEFAULT 1,         -- Boolean: 1=active, 0=inactive
    create_date TEXT NOT NULL,        -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    category TEXT NOT NULL,            -- Grouping category (e.g., 'ui', 'api', 'user')
    key TEXT NOT NULL,                 -- Setting key
    value TEXT,                        -- Setting value (can be JSON string)
    value_type TEXT DEFAULT 'string',  -- 'string', 'int', 'float', 'boolean', 'json', 'date', 'datetime', 'time', 'image'
    description TEXT,                  -- Human-readable description
    UNIQUE(category, key)
);

CREATE INDEX IF NOT EXISTS idx_kv_settings_category ON kv_settings(category);
CREATE INDEX IF NOT EXISTS idx_kv_settings_active ON kv_settings(active);
CREATE INDEX IF NOT EXISTS idx_kv_settings_lookup ON kv_settings(category, key, active);

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT,                  -- ISO 8601 timestamp (NULL = never expires)
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,                -- Hashed password (bcrypt/scrypt)
    display_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',          -- 'admin', 'user', 'guest'
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    last_login TEXT,                   -- ISO 8601 timestamp
    preferences TEXT,                  -- JSON blob for user preferences
    metadata TEXT                      -- JSON blob for additional user data
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- ============================================================================
-- SESSION MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,               -- UUID (session token)
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT NOT NULL,         -- ISO 8601 timestamp
    user_id TEXT NOT NULL,             -- Foreign key to users.id
    device_info TEXT,                  -- JSON: browser, OS, device type
    ip_address TEXT,
    last_activity TEXT,                -- ISO 8601 timestamp
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);

-- ============================================================================
-- LOGGING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    level TEXT NOT NULL,               -- 'debug', 'info', 'warn', 'error', 'fatal'
    category TEXT,                     -- Log category (e.g., 'auth', 'api', 'db')
    message TEXT NOT NULL,
    details TEXT,                      -- JSON blob for structured data
    user_id TEXT,                      -- Optional: which user triggered this
    session_id TEXT,                   -- Optional: which session
    stack_trace TEXT,                  -- For errors
    metadata TEXT,                     -- JSON blob for additional context
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_create_date ON logs(create_date);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);

-- ============================================================================
-- DYNAMIC CONTENT (CMS-like functionality)
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_pages (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT,                  -- ISO 8601 timestamp (NULL = never expires)
    route TEXT UNIQUE NOT NULL,        -- URL route (e.g., '/help/getting-started')
    title TEXT NOT NULL,
    content TEXT,                      -- HTML/Markdown content
    content_type TEXT DEFAULT 'html',  -- 'html', 'markdown', 'json'
    template TEXT,                     -- Template to use for rendering
    metadata TEXT,                     -- JSON: author, tags, categories, etc.
    published INTEGER DEFAULT 0,       -- Boolean: 1=published, 0=draft
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    parent_id TEXT,                    -- For hierarchical content
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES content_pages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_content_pages_route ON content_pages(route);
CREATE INDEX IF NOT EXISTS idx_content_pages_published ON content_pages(published);
CREATE INDEX IF NOT EXISTS idx_content_pages_active ON content_pages(active);
CREATE INDEX IF NOT EXISTS idx_content_pages_parent ON content_pages(parent_id);

-- ============================================================================
-- VOLATILE DATA RECORDS (Graph-like functionality)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_records (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT,                  -- ISO 8601 timestamp (NULL = never expires)
    topic TEXT NOT NULL,               -- Primary topic/entity type
    sub_topic TEXT,                    -- Secondary classification
    json_data TEXT,                    -- JSON blob for flexible data storage
    tags TEXT,                         -- JSON array of tags
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    metadata TEXT                      -- JSON blob for additional context
);

CREATE INDEX IF NOT EXISTS idx_data_records_topic ON data_records(topic);
CREATE INDEX IF NOT EXISTS idx_data_records_sub_topic ON data_records(sub_topic);
CREATE INDEX IF NOT EXISTS idx_data_records_expiry ON data_records(expiry_date);
CREATE INDEX IF NOT EXISTS idx_data_records_active ON data_records(active);

-- ============================================================================
-- WEBHOOK MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT,                  -- ISO 8601 timestamp (NULL = never expires)
    name TEXT NOT NULL,                -- Human-readable name
    url TEXT NOT NULL,                 -- Target URL
    method TEXT DEFAULT 'POST',        -- HTTP method
    headers TEXT,                      -- JSON: custom headers
    secret TEXT,                       -- Signing secret
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    retry_count INTEGER DEFAULT 3,     -- How many times to retry on failure
    timeout INTEGER DEFAULT 30,        -- Timeout in seconds
    events TEXT,                       -- JSON array: which events trigger this
    metadata TEXT                      -- JSON blob for additional config
);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);

-- ============================================================================
-- WEBHOOK DELIVERY LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    webhook_id TEXT NOT NULL,          -- Foreign key to webhooks.id
    event_type TEXT NOT NULL,          -- Which event triggered this
    payload TEXT,                      -- JSON: what was sent
    response_status INTEGER,           -- HTTP status code
    response_body TEXT,                -- Response from the webhook URL
    success INTEGER DEFAULT 0,         -- Boolean: 1=success, 0=failure
    retry_count INTEGER DEFAULT 0,     -- How many retries so far
    error_message TEXT,
    duration_ms INTEGER,               -- How long the request took
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_create_date ON webhook_deliveries(create_date);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);

-- ============================================================================
-- API ENDPOINTS (Dynamic API routing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_endpoints (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    modified_date TEXT,                -- ISO 8601 timestamp
    expiry_date TEXT,                  -- ISO 8601 timestamp (NULL = never expires)
    route TEXT UNIQUE NOT NULL,        -- API route (e.g., '/api/v1/users')
    method TEXT NOT NULL,              -- HTTP method: GET, POST, PUT, DELETE, PATCH
    handler TEXT NOT NULL,             -- Function/module to handle this endpoint
    auth_required INTEGER DEFAULT 1,   -- Boolean: 1=requires auth, 0=public
    rate_limit INTEGER DEFAULT 100,    -- Requests per minute
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    description TEXT,
    request_schema TEXT,               -- JSON schema for request validation
    response_schema TEXT,              -- JSON schema for response
    metadata TEXT                      -- JSON blob for additional config
);

CREATE INDEX IF NOT EXISTS idx_api_endpoints_route ON api_endpoints(route);
CREATE INDEX IF NOT EXISTS idx_api_endpoints_active ON api_endpoints(active);

-- ============================================================================
-- METRICS AND ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    metric_name TEXT NOT NULL,         -- Name of the metric
    metric_type TEXT NOT NULL,         -- 'counter', 'gauge', 'histogram', 'timer'
    value REAL NOT NULL,               -- Numeric value
    unit TEXT,                         -- Unit of measurement (ms, bytes, count, etc.)
    tags TEXT,                         -- JSON: key-value pairs for dimensions
    user_id TEXT,                      -- Optional: which user
    session_id TEXT,                   -- Optional: which session
    metadata TEXT,                     -- JSON blob for additional context
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_create_date ON metrics(create_date);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);

-- ============================================================================
-- SYNC QUEUE (For offline-first sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,               -- UUID
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    operation TEXT NOT NULL,           -- 'create', 'update', 'delete'
    table_name TEXT NOT NULL,          -- Which table
    record_id TEXT NOT NULL,           -- Which record
    data TEXT,                         -- JSON: the data to sync
    status TEXT DEFAULT 'pending',     -- 'pending', 'syncing', 'synced', 'failed'
    retry_count INTEGER DEFAULT 0,
    last_attempt TEXT,                 -- ISO 8601 timestamp
    error_message TEXT,
    priority INTEGER DEFAULT 5,        -- 1=highest, 10=lowest
    metadata TEXT                      -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority);
CREATE INDEX IF NOT EXISTS idx_sync_queue_create_date ON sync_queue(create_date);

-- ============================================================================
-- JOIN TABLES (Many-to-many relationships)
-- ============================================================================

-- Generic relationship table for graph-like connections
CREATE TABLE IF NOT EXISTS relationships (
    a_id TEXT NOT NULL,                -- UUID of entity A
    b_id TEXT NOT NULL,                -- UUID of entity B
    r_id TEXT,                         -- Optional: UUID for relationship metadata
    relationship_type TEXT,            -- Type of relationship
    create_date TEXT NOT NULL,         -- ISO 8601 timestamp
    metadata TEXT,                     -- JSON blob for relationship data
    active INTEGER DEFAULT 1,          -- Boolean: 1=active, 0=inactive
    PRIMARY KEY (a_id, b_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_a_id ON relationships(a_id);
CREATE INDEX IF NOT EXISTS idx_relationships_b_id ON relationships(b_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);

-- User roles (many-to-many)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    create_date TEXT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Content tags (many-to-many)
CREATE TABLE IF NOT EXISTS content_tags (
    content_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    create_date TEXT NOT NULL,
    PRIMARY KEY (content_id, tag),
    FOREIGN KEY (content_id) REFERENCES content_pages(id) ON DELETE CASCADE
);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active sessions with user info
CREATE VIEW IF NOT EXISTS v_active_sessions AS
SELECT 
    s.id,
    s.create_date,
    s.expiry_date,
    s.last_activity,
    s.user_id,
    u.username,
    u.email,
    u.display_name,
    s.device_info,
    s.ip_address
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.active = 1 
  AND s.expiry_date > datetime('now');

-- Published content with hierarchical info
CREATE VIEW IF NOT EXISTS v_published_content AS
SELECT 
    cp.id,
    cp.route,
    cp.title,
    cp.content_type,
    cp.create_date,
    cp.modified_date,
    cp.parent_id,
    cp.sort_order,
    cp.metadata,
    parent.title as parent_title,
    parent.route as parent_route
FROM content_pages cp
LEFT JOIN content_pages parent ON cp.parent_id = parent.id
WHERE cp.published = 1 
  AND cp.active = 1;

-- Recent logs with context
CREATE VIEW IF NOT EXISTS v_recent_logs AS
SELECT 
    l.id,
    l.create_date,
    l.level,
    l.category,
    l.message,
    l.details,
    u.username,
    l.stack_trace
FROM logs l
LEFT JOIN users u ON l.user_id = u.id
ORDER BY l.create_date DESC
LIMIT 1000;

-- Pending sync operations
CREATE VIEW IF NOT EXISTS v_pending_sync AS
SELECT *
FROM sync_queue
WHERE status IN ('pending', 'failed')
  AND retry_count < 5
ORDER BY priority ASC, create_date ASC;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP MANAGEMENT
-- ============================================================================

-- Update modified_date on kv_settings
CREATE TRIGGER IF NOT EXISTS trg_kv_settings_modified
AFTER UPDATE ON kv_settings
FOR EACH ROW
BEGIN
    UPDATE kv_settings 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on users
CREATE TRIGGER IF NOT EXISTS trg_users_modified
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on sessions
CREATE TRIGGER IF NOT EXISTS trg_sessions_modified
AFTER UPDATE ON sessions
FOR EACH ROW
BEGIN
    UPDATE sessions 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on content_pages
CREATE TRIGGER IF NOT EXISTS trg_content_pages_modified
AFTER UPDATE ON content_pages
FOR EACH ROW
BEGIN
    UPDATE content_pages 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on data_records
CREATE TRIGGER IF NOT EXISTS trg_data_records_modified
AFTER UPDATE ON data_records
FOR EACH ROW
BEGIN
    UPDATE data_records 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on webhooks
CREATE TRIGGER IF NOT EXISTS trg_webhooks_modified
AFTER UPDATE ON webhooks
FOR EACH ROW
BEGIN
    UPDATE webhooks 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- Update modified_date on api_endpoints
CREATE TRIGGER IF NOT EXISTS trg_api_endpoints_modified
AFTER UPDATE ON api_endpoints
FOR EACH ROW
BEGIN
    UPDATE api_endpoints 
    SET modified_date = datetime('now')
    WHERE id = NEW.id;
END;

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Default admin user (password: 'admin123' - CHANGE IN PRODUCTION!)
-- Password hash is bcrypt of 'admin123'
INSERT OR IGNORE INTO users (id, create_date, username, email, password_hash, display_name, role, active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    datetime('now'),
    'admin',
    'admin@localhost',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5aeJxK8I7LXyS',
    'System Administrator',
    'admin',
    1
);

-- Default settings
INSERT OR IGNORE INTO kv_settings (id, create_date, category, key, value, value_type, description)
VALUES 
    ('setting-001', datetime('now'), 'ui', 'theme', 'light', 'string', 'UI theme: light or dark'),
    ('setting-002', datetime('now'), 'ui', 'primary_color', '#007AFF', 'string', 'Primary brand color'),
    ('setting-003', datetime('now'), 'ui', 'enable_animations', 'true', 'boolean', 'Enable UI animations'),
    ('setting-004', datetime('now'), 'app', 'app_name', 'WonkyDonkey PWA', 'string', 'Application name'),
    ('setting-005', datetime('now'), 'app', 'version', '1.0.0', 'string', 'Application version'),
    ('setting-006', datetime('now'), 'sync', 'auto_sync', 'true', 'boolean', 'Enable automatic sync'),
    ('setting-007', datetime('now'), 'sync', 'sync_interval', '300', 'int', 'Sync interval in seconds');

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Clean up expired sessions
-- Run this periodically from your service worker or cron job
-- DELETE FROM sessions WHERE expiry_date < datetime('now');

-- Clean up expired data records
-- DELETE FROM data_records WHERE expiry_date < datetime('now');

-- Archive old logs (move to archive table or delete)
-- DELETE FROM logs WHERE create_date < datetime('now', '-90 days');

-- Vacuum database to reclaim space (run manually when needed)
-- VACUUM;

-- Analyze database for query optimization (run periodically)
-- ANALYZE;
