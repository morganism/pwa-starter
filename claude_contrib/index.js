/**
 * PWA Components - Main Entry Point
 * 
 * Modular, plugin-based PWA system with:
 * - SQLite database with offline-first sync
 * - Settings and configuration management
 * - Authentication and session handling
 * - Logging and debugging
 * - Dynamic page handling (CMS)
 * - Webhook sender
 * - API handler
 * - Metrics and reporting
 */

// Database
import dbService from './db/database-service.js';

// Plugins
import settingsPlugin from './plugins/settings-plugin.js';
import authPlugin from './plugins/auth-plugin.js';
import loggingPlugin from './plugins/logging-plugin.js';
import dynamicPagePlugin from './plugins/dynamic-page-plugin.js';
import webhookPlugin from './plugins/webhook-plugin.js';
import apiPlugin from './plugins/api-plugin.js';
import metricsPlugin from './plugins/metrics-plugin.js';

/**
 * PWA Components System
 */
class PWAComponents {
  constructor() {
    this.initialized = false;
    this.db = dbService;
    this.settings = settingsPlugin;
    this.auth = authPlugin;
    this.logging = loggingPlugin;
    this.pages = dynamicPagePlugin;
    this.webhooks = webhookPlugin;
    this.api = apiPlugin;
    this.metrics = metricsPlugin;
  }

  /**
   * Initialize all components
   * @param {Object} options - Configuration options
   */
  async init(options = {}) {
    if (this.initialized) {
      console.warn('PWA Components already initialized');
      return;
    }

    const {
      schemaSQL = null,
      dbName = 'pwa-core.db',
      logLevel = 'info',
      enableMetrics = true,
      router = null
    } = options;

    try {
      console.log('Initializing PWA Components...');

      // 1. Initialize database
      console.log('  → Initializing database...');
      this.db.dbName = dbName;
      await this.db.init(schemaSQL);

      // 2. Initialize logging
      console.log('  → Initializing logging...');
      this.logging.init({
        level: logLevel,
        console: true,
        database: true
      });

      // 3. Initialize auth
      console.log('  → Initializing authentication...');
      await this.auth.init();

      // 4. Initialize settings
      console.log('  → Initializing settings...');
      // Settings don't need async init

      // 5. Initialize dynamic pages
      console.log('  → Initializing dynamic pages...');
      await this.pages.init(router);

      // 6. Initialize webhooks
      console.log('  → Initializing webhooks...');
      this.webhooks.init();

      // 7. Initialize API
      console.log('  → Initializing API...');
      await this.api.init();

      // 8. Initialize metrics
      if (enableMetrics) {
        console.log('  → Initializing metrics...');
        this.metrics.init();
      }

      this.initialized = true;
      console.log('✓ PWA Components initialized successfully');

      // Log initialization
      this.logging.info('PWA Components initialized', {
        category: 'system',
        details: {
          dbName,
          logLevel,
          enableMetrics
        }
      });

      // Emit initialization event
      window.dispatchEvent(new CustomEvent('pwa-components-ready'));

    } catch (error) {
      console.error('Failed to initialize PWA Components:', error);
      throw error;
    }
  }

  /**
   * Load schema from file
   * @param {string} url - URL to schema SQL file
   * @returns {Promise<string>}
   */
  async loadSchema(url) {
    const response = await fetch(url);
    return await response.text();
  }

  /**
   * Quick setup with schema file
   * @param {Object} options
   */
  async quickSetup(options = {}) {
    const {
      schemaUrl = '/db/schema.sql',
      ...initOptions
    } = options;

    const schema = await this.loadSchema(schemaUrl);
    await this.init({
      ...initOptions,
      schemaSQL: schema
    });
  }

  /**
   * Get initialization status
   * @returns {boolean}
   */
  isReady() {
    return this.initialized;
  }

  /**
   * Wait for initialization
   * @returns {Promise<void>}
   */
  async whenReady() {
    if (this.initialized) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.addEventListener('pwa-components-ready', () => {
        resolve();
      }, { once: true });
    });
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    this.logging.info('Shutting down PWA Components', {
      category: 'system'
    });

    // Save database
    await this.db.saveToIndexedDB();

    // Stop auth session checking
    this.auth.stopSessionCheck();

    // Clear any intervals
    this.metrics.intervals.forEach(id => clearInterval(id));

    this.initialized = false;
  }
}

// Create singleton instance
const pwaComponents = new PWAComponents();

// Auto-expose to window
if (typeof window !== 'undefined') {
  window.pwa = pwaComponents;
}

// Export for module usage
export default pwaComponents;

// Also export individual components
export {
  dbService,
  settingsPlugin,
  authPlugin,
  loggingPlugin,
  dynamicPagePlugin,
  webhookPlugin,
  apiPlugin,
  metricsPlugin
};
