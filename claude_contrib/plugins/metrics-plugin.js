/**
 * Metrics & Reporting Plugin
 * Track and visualize application metrics and analytics
 */

import dbService from '../db/database-service.js';
import loggingPlugin from './logging-plugin.js';
import authPlugin from './auth-plugin.js';

class MetricsPlugin {
  constructor() {
    this.collectors = new Map();
    this.intervals = new Map();
  }

  /**
   * Initialize metrics plugin
   */
  init() {
    // Setup default collectors
    this.setupDefaultCollectors();
    
    loggingPlugin.info('Metrics plugin initialized', {
      category: 'metrics'
    });
  }

  /**
   * Setup default metric collectors
   */
  setupDefaultCollectors() {
    // Page navigation metrics
    this.trackPageViews();
    
    // Performance metrics
    this.trackPerformance();
    
    // Error metrics
    this.trackErrors();
  }

  // ============================================================================
  // RECORDING METRICS
  // ============================================================================

  /**
   * Record a counter metric
   * @param {string} name
   * @param {number} value
   * @param {Object} options
   */
  counter(name, value = 1, options = {}) {
    this.record(name, 'counter', value, options);
  }

  /**
   * Record a gauge metric (point-in-time value)
   * @param {string} name
   * @param {number} value
   * @param {Object} options
   */
  gauge(name, value, options = {}) {
    this.record(name, 'gauge', value, options);
  }

  /**
   * Record a histogram metric (distribution)
   * @param {string} name
   * @param {number} value
   * @param {Object} options
   */
  histogram(name, value, options = {}) {
    this.record(name, 'histogram', value, options);
  }

  /**
   * Record a timer metric (duration)
   * @param {string} name
   * @param {number} durationMs
   * @param {Object} options
   */
  timer(name, durationMs, options = {}) {
    this.record(name, 'timer', durationMs, { ...options, unit: 'ms' });
  }

  /**
   * Create a timer
   * @param {string} name
   * @param {Object} options
   * @returns {Function} Stop function
   */
  createTimer(name, options = {}) {
    const start = performance.now();
    
    return (additionalOptions = {}) => {
      const duration = performance.now() - start;
      this.timer(name, duration, { ...options, ...additionalOptions });
      return duration;
    };
  }

  /**
   * Record a metric
   * @param {string} name
   * @param {string} type
   * @param {number} value
   * @param {Object} options
   */
  record(name, type, value, options = {}) {
    const {
      unit = null,
      tags = {},
      metadata = null
    } = options;
    
    const user = authPlugin.getCurrentUser();
    const session = authPlugin.getCurrentSession();
    
    dbService.recordMetric(
      name,
      type,
      value,
      {
        unit,
        tags,
        userId: user?.id,
        sessionId: session?.id,
        metadata
      }
    );
  }

  // ============================================================================
  // QUERYING METRICS
  // ============================================================================

  /**
   * Get metrics by name and time range
   * @param {string} metricName
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Array}
   */
  getMetrics(metricName, startDate = null, endDate = null) {
    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const end = endDate || new Date();
    
    return dbService.getMetrics(metricName, start, end);
  }

  /**
   * Get metric summary
   * @param {string} metricName
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Object}
   */
  getSummary(metricName, startDate = null, endDate = null) {
    const metrics = this.getMetrics(metricName, startDate, endDate);
    
    if (metrics.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        stdDev: 0
      };
    }
    
    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => {
      return acc + Math.pow(val - avg, 2);
    }, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: values.length,
      sum,
      avg,
      min,
      max,
      stdDev
    };
  }

  /**
   * Get percentiles
   * @param {string} metricName
   * @param {Array<number>} percentiles - e.g., [50, 95, 99]
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Object}
   */
  getPercentiles(metricName, percentiles = [50, 95, 99], startDate = null, endDate = null) {
    const metrics = this.getMetrics(metricName, startDate, endDate);
    
    if (metrics.length === 0) {
      return {};
    }
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const result = {};
    
    percentiles.forEach(p => {
      const index = Math.ceil((p / 100) * values.length) - 1;
      result[`p${p}`] = values[Math.max(0, index)];
    });
    
    return result;
  }

  /**
   * Get time series data
   * @param {string} metricName
   * @param {string} interval - 'hour', 'day', 'week', 'month'
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Array}
   */
  getTimeSeries(metricName, interval = 'hour', startDate = null, endDate = null) {
    const metrics = this.getMetrics(metricName, startDate, endDate);
    
    if (metrics.length === 0) {
      return [];
    }
    
    const buckets = new Map();
    
    metrics.forEach(metric => {
      const timestamp = new Date(metric.create_date);
      const bucketKey = this.getBucketKey(timestamp, interval);
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          timestamp: bucketKey,
          values: [],
          count: 0,
          sum: 0
        });
      }
      
      const bucket = buckets.get(bucketKey);
      bucket.values.push(metric.value);
      bucket.count++;
      bucket.sum += metric.value;
    });
    
    // Calculate aggregates for each bucket
    return Array.from(buckets.values()).map(bucket => ({
      timestamp: bucket.timestamp,
      count: bucket.count,
      sum: bucket.sum,
      avg: bucket.sum / bucket.count,
      min: Math.min(...bucket.values),
      max: Math.max(...bucket.values)
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Get bucket key for time series
   * @param {Date} timestamp
   * @param {string} interval
   * @returns {string}
   */
  getBucketKey(timestamp, interval) {
    const date = new Date(timestamp);
    
    switch (interval) {
      case 'minute':
        date.setSeconds(0, 0);
        break;
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = date.getDay();
        date.setDate(date.getDate() - day);
        date.setHours(0, 0, 0, 0);
        break;
      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
    }
    
    return date.toISOString();
  }

  // ============================================================================
  // CHARTS AND VISUALIZATION
  // ============================================================================

  /**
   * Generate line chart data
   * @param {string} metricName
   * @param {Object} options
   * @returns {Object}
   */
  generateLineChart(metricName, options = {}) {
    const {
      interval = 'hour',
      startDate = null,
      endDate = null,
      aggregation = 'avg' // 'sum', 'avg', 'min', 'max', 'count'
    } = options;
    
    const timeSeries = this.getTimeSeries(metricName, interval, startDate, endDate);
    
    return {
      labels: timeSeries.map(point => new Date(point.timestamp).toLocaleString()),
      datasets: [{
        label: metricName,
        data: timeSeries.map(point => point[aggregation]),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    };
  }

  /**
   * Generate bar chart data
   * @param {string} metricName
   * @param {string} groupBy - Tag key to group by
   * @param {Object} options
   * @returns {Object}
   */
  generateBarChart(metricName, groupBy, options = {}) {
    const {
      startDate = null,
      endDate = null,
      aggregation = 'sum'
    } = options;
    
    const metrics = this.getMetrics(metricName, startDate, endDate);
    const groups = new Map();
    
    metrics.forEach(metric => {
      const tags = metric.tags ? JSON.parse(metric.tags) : {};
      const groupValue = tags[groupBy] || 'unknown';
      
      if (!groups.has(groupValue)) {
        groups.set(groupValue, []);
      }
      
      groups.get(groupValue).push(metric.value);
    });
    
    const labels = Array.from(groups.keys());
    const data = labels.map(label => {
      const values = groups.get(label);
      
      switch (aggregation) {
        case 'sum':
          return values.reduce((a, b) => a + b, 0);
        case 'avg':
          return values.reduce((a, b) => a + b, 0) / values.length;
        case 'min':
          return Math.min(...values);
        case 'max':
          return Math.max(...values);
        case 'count':
          return values.length;
        default:
          return values.length;
      }
    });
    
    return {
      labels,
      datasets: [{
        label: metricName,
        data,
        backgroundColor: 'rgba(75, 192, 192, 0.6)'
      }]
    };
  }

  /**
   * Generate pie chart data
   * @param {string} metricName
   * @param {string} groupBy
   * @param {Object} options
   * @returns {Object}
   */
  generatePieChart(metricName, groupBy, options = {}) {
    const barData = this.generateBarChart(metricName, groupBy, {
      ...options,
      aggregation: 'sum'
    });
    
    return {
      labels: barData.labels,
      datasets: [{
        data: barData.datasets[0].data,
        backgroundColor: [
          'rgba(255, 99, 132, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 206, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)'
        ]
      }]
    };
  }

  // ============================================================================
  // DEFAULT COLLECTORS
  // ============================================================================

  /**
   * Track page views
   */
  trackPageViews() {
    // Track initial page load
    this.counter('page.view', 1, {
      tags: {
        page: window.location.pathname,
        referrer: document.referrer
      }
    });
    
    // Track navigation
    window.addEventListener('popstate', () => {
      this.counter('page.view', 1, {
        tags: {
          page: window.location.pathname
        }
      });
    });
  }

  /**
   * Track performance metrics
   */
  trackPerformance() {
    // Track page load time
    window.addEventListener('load', () => {
      const perfData = performance.timing;
      const loadTime = perfData.loadEventEnd - perfData.navigationStart;
      
      this.timer('page.load', loadTime, {
        tags: {
          page: window.location.pathname
        }
      });
      
      // DOM content loaded
      const domContentLoaded = perfData.domContentLoadedEventEnd - perfData.navigationStart;
      this.timer('page.dom_content_loaded', domContentLoaded, {
        tags: {
          page: window.location.pathname
        }
      });
      
      // First paint
      if (performance.getEntriesByType) {
        const paintEntries = performance.getEntriesByType('paint');
        paintEntries.forEach(entry => {
          this.timer(`page.${entry.name}`, entry.startTime, {
            tags: {
              page: window.location.pathname
            }
          });
        });
      }
    });
  }

  /**
   * Track errors
   */
  trackErrors() {
    window.addEventListener('error', (event) => {
      this.counter('error.js', 1, {
        tags: {
          message: event.message,
          filename: event.filename,
          page: window.location.pathname
        }
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      this.counter('error.promise', 1, {
        tags: {
          reason: String(event.reason),
          page: window.location.pathname
        }
      });
    });
  }

  // ============================================================================
  // CUSTOM COLLECTORS
  // ============================================================================

  /**
   * Register a metric collector
   * @param {string} name
   * @param {Function} collector - Function that records metrics
   * @param {number} intervalMs - Collection interval in ms
   */
  registerCollector(name, collector, intervalMs = 60000) {
    this.collectors.set(name, collector);
    
    const intervalId = setInterval(() => {
      try {
        collector();
      } catch (error) {
        loggingPlugin.error(`Collector ${name} failed`, {
          category: 'metrics',
          details: { error: error.message }
        });
      }
    }, intervalMs);
    
    this.intervals.set(name, intervalId);
  }

  /**
   * Unregister a collector
   * @param {string} name
   */
  unregisterCollector(name) {
    const intervalId = this.intervals.get(name);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(name);
    }
    this.collectors.delete(name);
  }

  // ============================================================================
  // DASHBOARDS
  // ============================================================================

  /**
   * Get dashboard data
   * @param {Object} config - Dashboard configuration
   * @returns {Object}
   */
  getDashboard(config) {
    const {
      metrics = [],
      timeRange = '24h'
    } = config;
    
    const { startDate, endDate } = this.parseTimeRange(timeRange);
    
    const data = {};
    
    metrics.forEach(metricConfig => {
      const {
        name,
        type = 'summary', // 'summary', 'timeSeries', 'bar', 'pie'
        options = {}
      } = metricConfig;
      
      switch (type) {
        case 'summary':
          data[name] = this.getSummary(name, startDate, endDate);
          break;
        case 'timeSeries':
          data[name] = this.getTimeSeries(name, options.interval || 'hour', startDate, endDate);
          break;
        case 'bar':
          data[name] = this.generateBarChart(name, options.groupBy, { startDate, endDate });
          break;
        case 'pie':
          data[name] = this.generatePieChart(name, options.groupBy, { startDate, endDate });
          break;
      }
    });
    
    return data;
  }

  /**
   * Parse time range string
   * @param {string} range - e.g., '1h', '24h', '7d', '30d'
   * @returns {Object}
   */
  parseTimeRange(range) {
    const now = new Date();
    const endDate = now;
    let startDate;
    
    const value = parseInt(range);
    const unit = range.replace(value, '');
    
    switch (unit) {
      case 'h':
        startDate = new Date(now.getTime() - value * 60 * 60 * 1000);
        break;
      case 'd':
        startDate = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        break;
      case 'w':
        startDate = new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
        break;
      case 'm':
        startDate = new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return { startDate, endDate };
  }

  /**
   * Export metrics data
   * @param {string} metricName
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {string} format - 'json' or 'csv'
   * @returns {string}
   */
  export(metricName, startDate, endDate, format = 'json') {
    const metrics = this.getMetrics(metricName, startDate, endDate);
    
    if (format === 'csv') {
      const headers = ['timestamp', 'value', 'type', 'unit', 'tags'];
      const rows = metrics.map(m => [
        m.create_date,
        m.value,
        m.metric_type,
        m.unit || '',
        JSON.stringify(m.tags || {})
      ]);
      
      return [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
    }
    
    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Clear old metrics
   * @param {number} olderThanDays
   */
  clearOldMetrics(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    dbService.run(
      'DELETE FROM metrics WHERE create_date < ?',
      [cutoffDate.toISOString()]
    );
    
    loggingPlugin.info(`Cleared metrics older than ${olderThanDays} days`, {
      category: 'metrics'
    });
  }
}

const metricsPlugin = new MetricsPlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    metricsPlugin.init();
  });
  
  window.metricsPlugin = metricsPlugin;
}

export default metricsPlugin;
