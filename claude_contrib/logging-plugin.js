/**
 * Logging & Debug Plugin
 * Centralized logging system with multiple log levels and filtering
 */

import dbService from '../db/database-service.js';
import authPlugin from './auth-plugin.js';

class LoggingPlugin {
  constructor() {
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };
    
    this.currentLevel = 'info'; // Minimum level to log
    this.consoleEnabled = true;
    this.dbEnabled = true;
    this.maxLogsInMemory = 1000;
    this.memoryLogs = [];
  }

  /**
   * Initialize the logging plugin
   * @param {Object} options
   */
  init(options = {}) {
    this.currentLevel = options.level || 'info';
    this.consoleEnabled = options.console !== false;
    this.dbEnabled = options.database !== false;
    
    // Capture console methods
    if (options.captureConsole) {
      this.captureConsoleMethods();
    }
    
    // Capture unhandled errors
    this.captureErrors();
  }

  /**
   * Log a debug message
   * @param {string} message
   * @param {Object} options
   */
  debug(message, options = {}) {
    this.log('debug', message, options);
  }

  /**
   * Log an info message
   * @param {string} message
   * @param {Object} options
   */
  info(message, options = {}) {
    this.log('info', message, options);
  }

  /**
   * Log a warning message
   * @param {string} message
   * @param {Object} options
   */
  warn(message, options = {}) {
    this.log('warn', message, options);
  }

  /**
   * Log an error message
   * @param {string} message
   * @param {Object} options
   */
  error(message, options = {}) {
    this.log('error', message, options);
  }

  /**
   * Log a fatal error message
   * @param {string} message
   * @param {Object} options
   */
  fatal(message, options = {}) {
    this.log('fatal', message, options);
  }

  /**
   * Main logging method
   * @param {string} level
   * @param {string} message
   * @param {Object} options
   */
  log(level, message, options = {}) {
    // Check if we should log this level
    if (this.logLevels[level] < this.logLevels[this.currentLevel]) {
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      category: options.category || null,
      details: options.details || null,
      userId: options.userId || authPlugin.getCurrentUser()?.id || null,
      sessionId: options.sessionId || authPlugin.getCurrentSession()?.id || null,
      stackTrace: options.stackTrace || (level === 'error' || level === 'fatal' ? this.getStackTrace() : null),
      metadata: options.metadata || null
    };
    
    // Add to memory logs
    this.memoryLogs.push(logEntry);
    if (this.memoryLogs.length > this.maxLogsInMemory) {
      this.memoryLogs.shift();
    }
    
    // Log to console
    if (this.consoleEnabled) {
      this.logToConsole(logEntry);
    }
    
    // Log to database
    if (this.dbEnabled) {
      try {
        dbService.log(
          level,
          message,
          {
            category: logEntry.category,
            details: logEntry.details,
            userId: logEntry.userId,
            sessionId: logEntry.sessionId,
            stackTrace: logEntry.stackTrace,
            metadata: logEntry.metadata
          }
        );
      } catch (error) {
        console.error('Failed to log to database:', error);
      }
    }
    
    // Emit log event
    this.emitLogEvent(logEntry);
  }

  /**
   * Log to browser console with appropriate method
   * @param {Object} logEntry
   */
  logToConsole(logEntry) {
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${logEntry.level.toUpperCase()}]`;
    
    let consoleMethod = 'log';
    switch (logEntry.level) {
      case 'debug':
        consoleMethod = 'debug';
        break;
      case 'info':
        consoleMethod = 'info';
        break;
      case 'warn':
        consoleMethod = 'warn';
        break;
      case 'error':
      case 'fatal':
        consoleMethod = 'error';
        break;
    }
    
    if (logEntry.details || logEntry.metadata) {
      console[consoleMethod](
        `${prefix} ${logEntry.message}`,
        logEntry.details || logEntry.metadata
      );
    } else {
      console[consoleMethod](`${prefix} ${logEntry.message}`);
    }
    
    if (logEntry.stackTrace) {
      console[consoleMethod]('Stack trace:', logEntry.stackTrace);
    }
  }

  /**
   * Get stack trace
   * @returns {string}
   */
  getStackTrace() {
    const err = new Error();
    return err.stack;
  }

  /**
   * Get recent logs from memory
   * @param {number} limit
   * @param {string} level - Filter by level
   * @returns {Array}
   */
  getRecentLogs(limit = 100, level = null) {
    let logs = this.memoryLogs;
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs.slice(-limit);
  }

  /**
   * Get logs from database
   * @param {number} limit
   * @param {string} level
   * @returns {Array}
   */
  getLogsFromDb(limit = 100, level = null) {
    return dbService.getLogs(limit, level);
  }

  /**
   * Clear memory logs
   */
  clearMemoryLogs() {
    this.memoryLogs = [];
  }

  /**
   * Clear database logs
   * @param {number} olderThanDays - Delete logs older than this many days
   */
  clearDbLogs(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    dbService.run(
      'DELETE FROM logs WHERE create_date < ?',
      [cutoffDate.toISOString()]
    );
  }

  /**
   * Set log level
   * @param {string} level
   */
  setLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.currentLevel = level;
    }
  }

  /**
   * Get current log level
   * @returns {string}
   */
  getLevel() {
    return this.currentLevel;
  }

  /**
   * Enable/disable console logging
   * @param {boolean} enabled
   */
  setConsole(enabled) {
    this.consoleEnabled = enabled;
  }

  /**
   * Enable/disable database logging
   * @param {boolean} enabled
   */
  setDatabase(enabled) {
    this.dbEnabled = enabled;
  }

  /**
   * Capture console methods
   */
  captureConsoleMethods() {
    const originalConsole = {
      log: console.log,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    
    console.log = (...args) => {
      this.debug(args.join(' '), { category: 'console' });
      originalConsole.log(...args);
    };
    
    console.debug = (...args) => {
      this.debug(args.join(' '), { category: 'console' });
      originalConsole.debug(...args);
    };
    
    console.info = (...args) => {
      this.info(args.join(' '), { category: 'console' });
      originalConsole.info(...args);
    };
    
    console.warn = (...args) => {
      this.warn(args.join(' '), { category: 'console' });
      originalConsole.warn(...args);
    };
    
    console.error = (...args) => {
      this.error(args.join(' '), { category: 'console', stackTrace: this.getStackTrace() });
      originalConsole.error(...args);
    };
  }

  /**
   * Capture unhandled errors and promise rejections
   */
  captureErrors() {
    window.addEventListener('error', (event) => {
      this.error('Unhandled error', {
        category: 'uncaught',
        details: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        },
        stackTrace: event.error?.stack
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        category: 'uncaught',
        details: {
          reason: event.reason
        },
        stackTrace: event.reason?.stack
      });
    });
  }

  /**
   * Emit log event
   * @param {Object} logEntry
   */
  emitLogEvent(logEntry) {
    const event = new CustomEvent('log-entry', {
      detail: logEntry
    });
    window.dispatchEvent(event);
  }

  /**
   * Listen for log events
   * @param {Function} callback
   */
  onLog(callback) {
    window.addEventListener('log-entry', (event) => {
      callback(event.detail);
    });
  }

  /**
   * Filter logs by criteria
   * @param {Object} criteria
   * @returns {Array}
   */
  filter(criteria) {
    let logs = this.memoryLogs;
    
    if (criteria.level) {
      logs = logs.filter(log => log.level === criteria.level);
    }
    
    if (criteria.category) {
      logs = logs.filter(log => log.category === criteria.category);
    }
    
    if (criteria.userId) {
      logs = logs.filter(log => log.userId === criteria.userId);
    }
    
    if (criteria.search) {
      const searchLower = criteria.search.toLowerCase();
      logs = logs.filter(log =>
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.details || {}).toLowerCase().includes(searchLower)
      );
    }
    
    if (criteria.startDate) {
      logs = logs.filter(log =>
        new Date(log.timestamp) >= new Date(criteria.startDate)
      );
    }
    
    if (criteria.endDate) {
      logs = logs.filter(log =>
        new Date(log.timestamp) <= new Date(criteria.endDate)
      );
    }
    
    return logs;
  }

  /**
   * Export logs as JSON
   * @param {Object} criteria - Filter criteria
   * @returns {string}
   */
  exportLogs(criteria = {}) {
    const logs = criteria ? this.filter(criteria) : this.memoryLogs;
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Download logs as file
   * @param {Object} criteria - Filter criteria
   */
  downloadLogs(criteria = {}) {
    const logsJson = this.exportLogs(criteria);
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Create a performance timer
   * @param {string} label
   * @returns {Function} Stop function
   */
  timer(label) {
    const start = performance.now();
    
    return (options = {}) => {
      const duration = performance.now() - start;
      this.info(`${label}: ${duration.toFixed(2)}ms`, {
        category: 'performance',
        details: { duration, ...options.details },
        metadata: options.metadata
      });
      return duration;
    };
  }

  /**
   * Log performance metrics
   * @param {string} label
   * @param {number} duration
   * @param {Object} options
   */
  performance(label, duration, options = {}) {
    this.info(`Performance: ${label}`, {
      category: 'performance',
      details: {
        duration,
        ...options.details
      },
      metadata: options.metadata
    });
  }
}

const loggingPlugin = new LoggingPlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loggingPlugin.init({
      level: 'info',
      console: true,
      database: true,
      captureConsole: false // Set to true to capture all console calls
    });
  });
  
  window.loggingPlugin = loggingPlugin;
}

export default loggingPlugin;
