/**
 * Settings & Configuration Plugin
 * Manages application settings with type safety and validation
 */

import dbService from './database-service.js';

class SettingsPlugin {
  constructor() {
    this.cache = {};
    this.cacheTimeout = 60000; // 1 minute cache
    this.lastCacheUpdate = {};
  }

  /**
   * Get a setting with caching
   * @param {string} category
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  get(category, key, defaultValue = null) {
    const cacheKey = `${category}.${key}`;
    const now = Date.now();
    
    // Check cache
    if (
      this.cache[cacheKey] !== undefined &&
      this.lastCacheUpdate[cacheKey] &&
      (now - this.lastCacheUpdate[cacheKey]) < this.cacheTimeout
    ) {
      return this.cache[cacheKey];
    }
    
    // Fetch from database
    const value = dbService.getSetting(category, key, defaultValue);
    
    // Update cache
    this.cache[cacheKey] = value;
    this.lastCacheUpdate[cacheKey] = now;
    
    return value;
  }

  /**
   * Set a setting
   * @param {string} category
   * @param {string} key
   * @param {*} value
   * @param {string} valueType
   * @param {string} description
   */
  set(category, key, value, valueType = null, description = null) {
    // Auto-detect type if not provided
    if (!valueType) {
      valueType = this.detectType(value);
    }
    
    dbService.setSetting(category, key, value, valueType, description);
    
    // Update cache
    const cacheKey = `${category}.${key}`;
    this.cache[cacheKey] = value;
    this.lastCacheUpdate[cacheKey] = Date.now();
    
    // Emit change event
    this.emitChange(category, key, value);
  }

  /**
   * Get all settings for a category
   * @param {string} category
   * @returns {Object}
   */
  getCategory(category) {
    return dbService.getSettingsByCategory(category);
  }

  /**
   * Get all settings
   * @returns {Object}
   */
  getAll() {
    const results = dbService.getAll(
      'SELECT category, key, value, value_type FROM kv_settings WHERE active = 1'
    );
    
    const settings = {};
    results.forEach(row => {
      if (!settings[row.category]) {
        settings[row.category] = {};
      }
      settings[row.category][row.key] = dbService.coerceSettingValue(
        row.value,
        row.value_type
      );
    });
    
    return settings;
  }

  /**
   * Delete a setting (deactivate)
   * @param {string} category
   * @param {string} key
   */
  delete(category, key) {
    dbService.run(
      'UPDATE kv_settings SET active = 0 WHERE category = ? AND key = ?',
      [category, key]
    );
    
    // Clear cache
    const cacheKey = `${category}.${key}`;
    delete this.cache[cacheKey];
    delete this.lastCacheUpdate[cacheKey];
    
    // Emit change event
    this.emitChange(category, key, null);
  }

  /**
   * Detect value type
   * @param {*} value
   * @returns {string}
   */
  detectType(value) {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'int' : 'float';
    }
    if (value instanceof Date) return 'datetime';
    if (typeof value === 'object') return 'json';
    return 'string';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = {};
    this.lastCacheUpdate = {};
  }

  /**
   * Emit change event
   * @param {string} category
   * @param {string} key
   * @param {*} value
   */
  emitChange(category, key, value) {
    const event = new CustomEvent('settings-changed', {
      detail: { category, key, value }
    });
    window.dispatchEvent(event);
  }

  /**
   * Listen for setting changes
   * @param {Function} callback
   */
  onChange(callback) {
    window.addEventListener('settings-changed', (event) => {
      callback(event.detail);
    });
  }

  /**
   * Bulk update settings
   * @param {string} category
   * @param {Object} settings
   */
  bulkUpdate(category, settings) {
    Object.entries(settings).forEach(([key, value]) => {
      this.set(category, key, value);
    });
  }

  /**
   * Export settings to JSON
   * @returns {string}
   */
  export() {
    return JSON.stringify(this.getAll(), null, 2);
  }

  /**
   * Import settings from JSON
   * @param {string} jsonString
   */
  import(jsonString) {
    try {
      const settings = JSON.parse(jsonString);
      
      Object.entries(settings).forEach(([category, categorySettings]) => {
        Object.entries(categorySettings).forEach(([key, value]) => {
          this.set(category, key, value);
        });
      });
      
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  // ============================================================================
  // COMMON SETTING HELPERS
  // ============================================================================

  /**
   * Get UI theme
   * @returns {string}
   */
  getTheme() {
    return this.get('ui', 'theme', 'light');
  }

  /**
   * Set UI theme
   * @param {string} theme
   */
  setTheme(theme) {
    this.set('ui', 'theme', theme, 'string', 'UI theme: light or dark');
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * Get primary color
   * @returns {string}
   */
  getPrimaryColor() {
    return this.get('ui', 'primary_color', '#007AFF');
  }

  /**
   * Set primary color
   * @param {string} color
   */
  setPrimaryColor(color) {
    this.set('ui', 'primary_color', color, 'string', 'Primary brand color');
    document.documentElement.style.setProperty('--primary-color', color);
  }

  /**
   * Check if animations are enabled
   * @returns {boolean}
   */
  areAnimationsEnabled() {
    return this.get('ui', 'enable_animations', true);
  }

  /**
   * Toggle animations
   * @param {boolean} enabled
   */
  setAnimations(enabled) {
    this.set('ui', 'enable_animations', enabled, 'boolean', 'Enable UI animations');
    document.documentElement.classList.toggle('no-animations', !enabled);
  }

  /**
   * Get app name
   * @returns {string}
   */
  getAppName() {
    return this.get('app', 'app_name', 'PWA Application');
  }

  /**
   * Get app version
   * @returns {string}
   */
  getAppVersion() {
    return this.get('app', 'version', '1.0.0');
  }

  /**
   * Check if auto-sync is enabled
   * @returns {boolean}
   */
  isAutoSyncEnabled() {
    return this.get('sync', 'auto_sync', true);
  }

  /**
   * Get sync interval in seconds
   * @returns {number}
   */
  getSyncInterval() {
    return this.get('sync', 'sync_interval', 300);
  }
}

const settingsPlugin = new SettingsPlugin();

// Auto-apply theme and primary color on load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    settingsPlugin.setTheme(settingsPlugin.getTheme());
    settingsPlugin.setPrimaryColor(settingsPlugin.getPrimaryColor());
    if (!settingsPlugin.areAnimationsEnabled()) {
      document.documentElement.classList.add('no-animations');
    }
  });
  
  window.settingsPlugin = settingsPlugin;
}

export default settingsPlugin;
