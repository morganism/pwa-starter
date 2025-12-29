/**
 * Webhook Plugin
 * Sends HTTP webhooks for events with retry logic
 */

import dbService from '../db/database-service.js';
import loggingPlugin from './logging-plugin.js';

class WebhookPlugin {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.retryDelay = 5000; // 5 seconds
    this.maxRetries = 3;
  }

  /**
   * Initialize webhook plugin
   */
  init() {
    // Start processing queue
    this.startQueueProcessor();
    
    loggingPlugin.info('Webhook plugin initialized', {
      category: 'webhooks'
    });
  }

  /**
   * Register a webhook
   * @param {Object} webhookData
   * @returns {string} Webhook ID
   */
  register(webhookData) {
    const id = dbService.createWebhook(webhookData);
    
    loggingPlugin.info(`Webhook registered: ${webhookData.name}`, {
      category: 'webhooks',
      details: { id, url: webhookData.url }
    });
    
    return id;
  }

  /**
   * Update a webhook
   * @param {string} webhookId
   * @param {Object} updates
   */
  update(webhookId, updates) {
    const setClause = Object.keys(updates)
      .filter(key => !['id', 'create_date'].includes(key))
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [
      ...Object.keys(updates)
        .filter(key => !['id', 'create_date'].includes(key))
        .map(key => {
          if (typeof updates[key] === 'object') {
            return JSON.stringify(updates[key]);
          }
          return updates[key];
        }),
      webhookId
    ];
    
    dbService.run(
      `UPDATE webhooks SET ${setClause} WHERE id = ?`,
      values
    );
    
    loggingPlugin.info(`Webhook updated: ${webhookId}`, {
      category: 'webhooks'
    });
  }

  /**
   * Delete a webhook
   * @param {string} webhookId
   */
  delete(webhookId) {
    dbService.run(
      'UPDATE webhooks SET active = 0 WHERE id = ?',
      [webhookId]
    );
    
    loggingPlugin.info(`Webhook deleted: ${webhookId}`, {
      category: 'webhooks'
    });
  }

  /**
   * Get all webhooks
   * @returns {Array}
   */
  getAll() {
    const webhooks = dbService.getAll(
      'SELECT * FROM webhooks WHERE active = 1'
    );
    
    return webhooks.map(hook => {
      hook.headers = JSON.parse(hook.headers || '{}');
      hook.events = JSON.parse(hook.events || '[]');
      if (hook.metadata) hook.metadata = JSON.parse(hook.metadata);
      return hook;
    });
  }

  /**
   * Trigger webhooks for an event
   * @param {string} eventType
   * @param {Object} payload
   */
  async trigger(eventType, payload) {
    const webhooks = dbService.getWebhooksForEvent(eventType);
    
    if (webhooks.length === 0) {
      loggingPlugin.debug(`No webhooks found for event: ${eventType}`, {
        category: 'webhooks'
      });
      return;
    }
    
    loggingPlugin.info(`Triggering ${webhooks.length} webhook(s) for event: ${eventType}`, {
      category: 'webhooks'
    });
    
    // Add to queue
    webhooks.forEach(webhook => {
      this.queue.push({
        webhook,
        eventType,
        payload,
        retries: 0,
        timestamp: Date.now()
      });
    });
    
    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Start queue processor
   */
  startQueueProcessor() {
    setInterval(() => {
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }, 1000);
  }

  /**
   * Process webhook queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      await this.sendWebhook(item);
    }
    
    this.processing = false;
  }

  /**
   * Send a webhook
   * @param {Object} item - Queue item
   */
  async sendWebhook(item) {
    const { webhook, eventType, payload, retries } = item;
    
    const startTime = performance.now();
    
    try {
      // Build request
      const headers = {
        'Content-Type': 'application/json',
        ...webhook.headers
      };
      
      // Add signature if secret provided
      if (webhook.secret) {
        const signature = await this.generateSignature(payload, webhook.secret);
        headers['X-Webhook-Signature'] = signature;
      }
      
      // Add event type
      headers['X-Event-Type'] = eventType;
      
      // Send request
      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(webhook.timeout * 1000)
      });
      
      const duration = performance.now() - startTime;
      const responseBody = await response.text();
      
      // Log delivery
      dbService.logWebhookDelivery(
        webhook.id,
        eventType,
        payload,
        {
          status: response.status,
          body: responseBody,
          success: response.ok,
          retryCount: retries,
          duration: Math.round(duration)
        }
      );
      
      if (response.ok) {
        loggingPlugin.info(`Webhook sent successfully: ${webhook.name}`, {
          category: 'webhooks',
          details: {
            eventType,
            status: response.status,
            duration: Math.round(duration)
          }
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }
      
    } catch (error) {
      const duration = performance.now() - startTime;
      
      loggingPlugin.error(`Webhook failed: ${webhook.name}`, {
        category: 'webhooks',
        details: {
          eventType,
          error: error.message,
          retries,
          duration: Math.round(duration)
        }
      });
      
      // Log failed delivery
      dbService.logWebhookDelivery(
        webhook.id,
        eventType,
        payload,
        {
          status: null,
          body: null,
          success: false,
          retryCount: retries,
          error: error.message,
          duration: Math.round(duration)
        }
      );
      
      // Retry if under max retries
      if (retries < webhook.retry_count) {
        loggingPlugin.info(`Scheduling webhook retry: ${webhook.name}`, {
          category: 'webhooks',
          details: {
            retries: retries + 1,
            maxRetries: webhook.retry_count
          }
        });
        
        setTimeout(() => {
          this.queue.push({
            ...item,
            retries: retries + 1
          });
        }, this.retryDelay * Math.pow(2, retries)); // Exponential backoff
      }
    }
  }

  /**
   * Generate HMAC signature
   * @param {Object} payload
   * @param {string} secret
   * @returns {Promise<string>}
   */
  async generateSignature(payload, secret) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, data);
    
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Test a webhook
   * @param {string} webhookId
   * @param {Object} testPayload
   */
  async test(webhookId, testPayload = null) {
    const webhook = dbService.getOne(
      'SELECT * FROM webhooks WHERE id = ?',
      [webhookId]
    );
    
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    
    const payload = testPayload || {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook'
    };
    
    await this.sendWebhook({
      webhook: {
        ...webhook,
        headers: JSON.parse(webhook.headers || '{}')
      },
      eventType: 'test',
      payload,
      retries: 0
    });
  }

  /**
   * Get webhook delivery history
   * @param {string} webhookId
   * @param {number} limit
   * @returns {Array}
   */
  getDeliveryHistory(webhookId, limit = 50) {
    return dbService.getAll(
      `SELECT * FROM webhook_deliveries 
       WHERE webhook_id = ? 
       ORDER BY create_date DESC 
       LIMIT ?`,
      [webhookId, limit]
    );
  }

  /**
   * Get failed deliveries
   * @param {number} limit
   * @returns {Array}
   */
  getFailedDeliveries(limit = 50) {
    return dbService.getAll(
      `SELECT * FROM webhook_deliveries 
       WHERE success = 0 
       ORDER BY create_date DESC 
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * Retry failed delivery
   * @param {string} deliveryId
   */
  async retryDelivery(deliveryId) {
    const delivery = dbService.getOne(
      'SELECT * FROM webhook_deliveries WHERE id = ?',
      [deliveryId]
    );
    
    if (!delivery) {
      throw new Error('Delivery not found');
    }
    
    const webhook = dbService.getOne(
      'SELECT * FROM webhooks WHERE id = ?',
      [delivery.webhook_id]
    );
    
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    
    await this.sendWebhook({
      webhook: {
        ...webhook,
        headers: JSON.parse(webhook.headers || '{}')
      },
      eventType: delivery.event_type,
      payload: JSON.parse(delivery.payload),
      retries: delivery.retry_count
    });
  }

  /**
   * Get webhook statistics
   * @param {string} webhookId
   * @returns {Object}
   */
  getStatistics(webhookId = null) {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration
      FROM webhook_deliveries
    `;
    
    const params = [];
    
    if (webhookId) {
      sql += ' WHERE webhook_id = ?';
      params.push(webhookId);
    }
    
    const stats = dbService.getOne(sql, params);
    
    return {
      total: stats.total || 0,
      successful: stats.successful || 0,
      failed: stats.failed || 0,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
      avgDuration: Math.round(stats.avg_duration || 0),
      minDuration: stats.min_duration || 0,
      maxDuration: stats.max_duration || 0
    };
  }

  /**
   * Clear old delivery logs
   * @param {number} olderThanDays
   */
  clearOldDeliveries(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    dbService.run(
      'DELETE FROM webhook_deliveries WHERE create_date < ?',
      [cutoffDate.toISOString()]
    );
    
    loggingPlugin.info(`Cleared webhook deliveries older than ${olderThanDays} days`, {
      category: 'webhooks'
    });
  }
}

const webhookPlugin = new WebhookPlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    webhookPlugin.init();
  });
  
  window.webhookPlugin = webhookPlugin;
}

export default webhookPlugin;
