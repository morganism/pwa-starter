/**
 * API Handler Plugin
 * Dynamic API routing and handler system
 */

import dbService from '../db/database-service.js';
import loggingPlugin from './logging-plugin.js';
import authPlugin from './auth-plugin.js';

class APIPlugin {
  constructor() {
    this.handlers = new Map();
    this.middleware = [];
    this.rateLimits = new Map();
  }

  /**
   * Initialize API plugin
   */
  async init() {
    // Load API endpoints from database
    await this.loadEndpointsFromDb();
    
    loggingPlugin.info('API plugin initialized', {
      category: 'api',
      details: { endpointCount: this.handlers.size }
    });
  }

  /**
   * Load endpoints from database
   */
  async loadEndpointsFromDb() {
    const endpoints = dbService.getAll(
      'SELECT * FROM api_endpoints WHERE active = 1'
    );
    
    endpoints.forEach(endpoint => {
      // Store endpoint metadata
      this.handlers.set(`${endpoint.method}:${endpoint.route}`, {
        ...endpoint,
        request_schema: endpoint.request_schema ? JSON.parse(endpoint.request_schema) : null,
        response_schema: endpoint.response_schema ? JSON.parse(endpoint.response_schema) : null,
        metadata: endpoint.metadata ? JSON.parse(endpoint.metadata) : null
      });
    });
  }

  /**
   * Register an API endpoint
   * @param {string} method - HTTP method
   * @param {string} route - API route
   * @param {Function} handler - Handler function
   * @param {Object} options - Options
   */
  register(method, route, handler, options = {}) {
    const {
      authRequired = true,
      rateLimit = 100,
      description = '',
      requestSchema = null,
      responseSchema = null,
      metadata = null
    } = options;
    
    // Save to database
    const id = dbService.generateUUID();
    const now = dbService.getTimestamp();
    
    dbService.run(
      `INSERT INTO api_endpoints (id, create_date, route, method, handler, 
         auth_required, rate_limit, active, description, request_schema, 
         response_schema, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id, now, route, method.toUpperCase(), 'custom',
        authRequired ? 1 : 0, rateLimit, description,
        requestSchema ? JSON.stringify(requestSchema) : null,
        responseSchema ? JSON.stringify(responseSchema) : null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    
    // Store handler in memory
    const key = `${method.toUpperCase()}:${route}`;
    this.handlers.set(key, {
      id,
      route,
      method: method.toUpperCase(),
      handler,
      auth_required: authRequired,
      rate_limit: rateLimit,
      description,
      request_schema: requestSchema,
      response_schema: responseSchema,
      metadata
    });
    
    loggingPlugin.info(`API endpoint registered: ${method.toUpperCase()} ${route}`, {
      category: 'api'
    });
    
    return id;
  }

  /**
   * Unregister an API endpoint
   * @param {string} method
   * @param {string} route
   */
  unregister(method, route) {
    const key = `${method.toUpperCase()}:${route}`;
    this.handlers.delete(key);
    
    dbService.run(
      'UPDATE api_endpoints SET active = 0 WHERE method = ? AND route = ?',
      [method.toUpperCase(), route]
    );
    
    loggingPlugin.info(`API endpoint unregistered: ${method.toUpperCase()} ${route}`, {
      category: 'api'
    });
  }

  /**
   * Handle an API request
   * @param {string} method
   * @param {string} route
   * @param {Object} request - Request object
   * @returns {Promise<Object>} Response
   */
  async handle(method, route, request = {}) {
    const startTime = performance.now();
    const key = `${method.toUpperCase()}:${route}`;
    
    try {
      // Find endpoint
      const endpoint = this.handlers.get(key);
      
      if (!endpoint) {
        return this.errorResponse(404, 'Endpoint not found');
      }
      
      // Check authentication
      if (endpoint.auth_required) {
        if (!authPlugin.isAuthenticated()) {
          return this.errorResponse(401, 'Authentication required');
        }
      }
      
      // Check rate limit
      const rateLimitOk = this.checkRateLimit(key, endpoint.rate_limit);
      if (!rateLimitOk) {
        return this.errorResponse(429, 'Rate limit exceeded');
      }
      
      // Run middleware
      for (const middleware of this.middleware) {
        const result = await middleware(request, endpoint);
        if (result === false) {
          return this.errorResponse(403, 'Request blocked by middleware');
        }
        if (result && result.error) {
          return result;
        }
      }
      
      // Validate request schema
      if (endpoint.request_schema && request.body) {
        const validation = this.validateSchema(request.body, endpoint.request_schema);
        if (!validation.valid) {
          return this.errorResponse(400, 'Invalid request', validation.errors);
        }
      }
      
      // Execute handler
      let response;
      if (typeof endpoint.handler === 'function') {
        response = await endpoint.handler(request);
      } else {
        return this.errorResponse(500, 'Handler not configured');
      }
      
      // Validate response schema
      if (endpoint.response_schema && response.data) {
        const validation = this.validateSchema(response.data, endpoint.response_schema);
        if (!validation.valid) {
          loggingPlugin.warn(`Response schema validation failed for ${key}`, {
            category: 'api',
            details: validation.errors
          });
        }
      }
      
      // Log successful request
      const duration = performance.now() - startTime;
      loggingPlugin.info(`API request: ${method.toUpperCase()} ${route}`, {
        category: 'api',
        details: {
          status: response.status || 200,
          duration: Math.round(duration)
        }
      });
      
      return response;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      
      loggingPlugin.error(`API error: ${method.toUpperCase()} ${route}`, {
        category: 'api',
        details: {
          error: error.message,
          duration: Math.round(duration)
        },
        stackTrace: error.stack
      });
      
      return this.errorResponse(500, 'Internal server error', error.message);
    }
  }

  /**
   * Add middleware
   * @param {Function} fn - Middleware function
   */
  use(fn) {
    this.middleware.push(fn);
  }

  /**
   * Check rate limit
   * @param {string} key - Endpoint key
   * @param {number} limit - Requests per minute
   * @returns {boolean}
   */
  checkRateLimit(key, limit) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, []);
    }
    
    const requests = this.rateLimits.get(key);
    
    // Remove old requests outside the window
    const filtered = requests.filter(timestamp => now - timestamp < windowMs);
    
    // Check if limit exceeded
    if (filtered.length >= limit) {
      return false;
    }
    
    // Add current request
    filtered.push(now);
    this.rateLimits.set(key, filtered);
    
    return true;
  }

  /**
   * Validate against JSON schema (simple validation)
   * @param {Object} data
   * @param {Object} schema
   * @returns {Object}
   */
  validateSchema(data, schema) {
    const errors = [];
    
    // Simple validation - check required fields and types
    if (schema.required) {
      schema.required.forEach(field => {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(field => {
        if (field in data) {
          const expected = schema.properties[field].type;
          const actual = typeof data[field];
          
          if (expected === 'array' && !Array.isArray(data[field])) {
            errors.push(`Field ${field} should be an array`);
          } else if (expected !== 'array' && actual !== expected) {
            errors.push(`Field ${field} should be ${expected}, got ${actual}`);
          }
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create error response
   * @param {number} status
   * @param {string} message
   * @param {*} details
   * @returns {Object}
   */
  errorResponse(status, message, details = null) {
    return {
      status,
      error: true,
      message,
      details
    };
  }

  /**
   * Create success response
   * @param {*} data
   * @param {number} status
   * @returns {Object}
   */
  successResponse(data, status = 200) {
    return {
      status,
      error: false,
      data
    };
  }

  /**
   * Get all registered endpoints
   * @returns {Array}
   */
  getEndpoints() {
    return Array.from(this.handlers.values()).map(endpoint => ({
      method: endpoint.method,
      route: endpoint.route,
      auth_required: endpoint.auth_required,
      rate_limit: endpoint.rate_limit,
      description: endpoint.description
    }));
  }

  /**
   * Generate API documentation
   * @returns {Object}
   */
  generateDocs() {
    const endpoints = this.getEndpoints();
    
    return {
      title: 'API Documentation',
      version: '1.0.0',
      baseUrl: window.location.origin,
      endpoints: endpoints.map(endpoint => ({
        ...endpoint,
        url: `${window.location.origin}${endpoint.route}`,
        authentication: endpoint.auth_required ? 'Required' : 'Not required',
        rateLimit: `${endpoint.rate_limit} requests/minute`
      }))
    };
  }

  /**
   * Export OpenAPI/Swagger spec
   * @returns {Object}
   */
  exportOpenAPI() {
    const endpoints = Array.from(this.handlers.values());
    
    const paths = {};
    
    endpoints.forEach(endpoint => {
      if (!paths[endpoint.route]) {
        paths[endpoint.route] = {};
      }
      
      paths[endpoint.route][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        security: endpoint.auth_required ? [{ bearerAuth: [] }] : [],
        requestBody: endpoint.request_schema ? {
          content: {
            'application/json': {
              schema: endpoint.request_schema
            }
          }
        } : undefined,
        responses: {
          200: {
            description: 'Successful response',
            content: endpoint.response_schema ? {
              'application/json': {
                schema: endpoint.response_schema
              }
            } : undefined
          }
        }
      };
    });
    
    return {
      openapi: '3.0.0',
      info: {
        title: 'PWA API',
        version: '1.0.0'
      },
      paths,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer'
          }
        }
      }
    };
  }

  /**
   * Clear rate limit data
   */
  clearRateLimits() {
    this.rateLimits.clear();
  }

  /**
   * Refresh endpoints from database
   */
  async refresh() {
    this.handlers.clear();
    await this.loadEndpointsFromDb();
    
    loggingPlugin.info('API endpoints refreshed', {
      category: 'api',
      details: { endpointCount: this.handlers.size }
    });
  }
}

const apiPlugin = new APIPlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    await apiPlugin.init();
  });
  
  window.apiPlugin = apiPlugin;
}

export default apiPlugin;
