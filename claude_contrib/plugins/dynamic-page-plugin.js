/**
 * Dynamic Page Handler Plugin
 * CMS-like functionality for dynamic route handling
 */

import dbService from '../db/database-service.js';
import loggingPlugin from './logging-plugin.js';

class DynamicPagePlugin {
  constructor() {
    this.routes = new Map();
    this.templates = new Map();
    this.middleware = [];
    this.notFoundHandler = null;
    this.errorHandler = null;
  }

  /**
   * Initialize the plugin
   * @param {Object} router - Router instance (e.g., from pwa-builder)
   */
  async init(router = null) {
    this.router = router;
    
    // Load pages from database
    await this.loadPagesFromDb();
    
    // Setup route interception if router provided
    if (router) {
      this.setupRouteInterception();
    }
    
    loggingPlugin.info('Dynamic page plugin initialized', {
      category: 'pages',
      details: { pageCount: this.routes.size }
    });
  }

  /**
   * Load all published pages from database
   */
  async loadPagesFromDb() {
    const pages = dbService.getPublishedPages();
    
    pages.forEach(page => {
      this.registerPage(page);
    });
  }

  /**
   * Register a page route
   * @param {Object} page
   */
  registerPage(page) {
    this.routes.set(page.route, {
      ...page,
      metadata: page.metadata ? JSON.parse(page.metadata) : {}
    });
    
    loggingPlugin.debug(`Registered page: ${page.route}`, {
      category: 'pages'
    });
  }

  /**
   * Unregister a page route
   * @param {string} route
   */
  unregisterPage(route) {
    this.routes.delete(route);
  }

  /**
   * Get page by route
   * @param {string} route
   * @returns {Object|null}
   */
  getPage(route) {
    // Check memory cache first
    if (this.routes.has(route)) {
      return this.routes.get(route);
    }
    
    // Check database
    const page = dbService.getPageByRoute(route);
    if (page) {
      this.registerPage(page);
      return this.routes.get(route);
    }
    
    return null;
  }

  /**
   * Create or update a page
   * @param {Object} pageData
   * @returns {string} Page ID
   */
  savePage(pageData) {
    const id = dbService.savePage(pageData);
    
    // Update cache
    const page = dbService.getPageByRoute(pageData.route);
    if (page) {
      this.registerPage(page);
    }
    
    loggingPlugin.info(`Page saved: ${pageData.route}`, {
      category: 'pages',
      details: { id, title: pageData.title }
    });
    
    // Emit page updated event
    this.emitPageEvent('page-updated', { page });
    
    return id;
  }

  /**
   * Delete a page
   * @param {string} route
   */
  deletePage(route) {
    dbService.run(
      'UPDATE content_pages SET active = 0, published = 0 WHERE route = ?',
      [route]
    );
    
    this.unregisterPage(route);
    
    loggingPlugin.info(`Page deleted: ${route}`, {
      category: 'pages'
    });
    
    // Emit page deleted event
    this.emitPageEvent('page-deleted', { route });
  }

  /**
   * Publish a page
   * @param {string} route
   */
  publishPage(route) {
    dbService.run(
      'UPDATE content_pages SET published = 1 WHERE route = ?',
      [route]
    );
    
    // Reload page
    const page = dbService.getPageByRoute(route);
    if (page) {
      this.registerPage(page);
    }
    
    loggingPlugin.info(`Page published: ${route}`, {
      category: 'pages'
    });
  }

  /**
   * Unpublish a page
   * @param {string} route
   */
  unpublishPage(route) {
    dbService.run(
      'UPDATE content_pages SET published = 0 WHERE route = ?',
      [route]
    );
    
    this.unregisterPage(route);
    
    loggingPlugin.info(`Page unpublished: ${route}`, {
      category: 'pages'
    });
  }

  /**
   * Register a template
   * @param {string} name
   * @param {Function} renderFn - Function that takes (page, data) and returns HTML
   */
  registerTemplate(name, renderFn) {
    this.templates.set(name, renderFn);
  }

  /**
   * Render a page
   * @param {string} route
   * @param {Object} data - Additional data to pass to template
   * @returns {string} HTML
   */
  renderPage(route, data = {}) {
    const page = this.getPage(route);
    
    if (!page) {
      return this.renderNotFound(route);
    }
    
    try {
      // If page has a template, use it
      if (page.template && this.templates.has(page.template)) {
        const templateFn = this.templates.get(page.template);
        return templateFn(page, data);
      }
      
      // Otherwise, use default rendering based on content_type
      return this.renderDefault(page, data);
    } catch (error) {
      loggingPlugin.error(`Failed to render page: ${route}`, {
        category: 'pages',
        details: { error: error.message },
        stackTrace: error.stack
      });
      
      return this.renderError(error, route);
    }
  }

  /**
   * Default rendering
   * @param {Object} page
   * @param {Object} data
   * @returns {string}
   */
  renderDefault(page, data) {
    switch (page.content_type) {
      case 'html':
        return this.wrapInLayout(page.content, page.title);
      
      case 'markdown':
        // You'd need to include a markdown library
        // For now, just return as-is
        return this.wrapInLayout(
          `<pre>${page.content}</pre>`,
          page.title
        );
      
      case 'json':
        try {
          const jsonData = JSON.parse(page.content);
          return this.wrapInLayout(
            `<pre>${JSON.stringify(jsonData, null, 2)}</pre>`,
            page.title
          );
        } catch {
          return this.wrapInLayout(page.content, page.title);
        }
      
      default:
        return this.wrapInLayout(page.content, page.title);
    }
  }

  /**
   * Wrap content in layout
   * @param {string} content
   * @param {string} title
   * @returns {string}
   */
  wrapInLayout(content, title) {
    return `
      <div class="page-container">
        <div class="page-header">
          <h1>${title}</h1>
        </div>
        <div class="page-content">
          ${content}
        </div>
      </div>
    `;
  }

  /**
   * Render 404 page
   * @param {string} route
   * @returns {string}
   */
  renderNotFound(route) {
    if (this.notFoundHandler) {
      return this.notFoundHandler(route);
    }
    
    return `
      <div class="error-page">
        <h1>404 - Page Not Found</h1>
        <p>The page <code>${route}</code> could not be found.</p>
        <a href="/">Go Home</a>
      </div>
    `;
  }

  /**
   * Render error page
   * @param {Error} error
   * @param {string} route
   * @returns {string}
   */
  renderError(error, route) {
    if (this.errorHandler) {
      return this.errorHandler(error, route);
    }
    
    return `
      <div class="error-page">
        <h1>Error</h1>
        <p>An error occurred while rendering page <code>${route}</code></p>
        <pre>${error.message}</pre>
        <a href="/">Go Home</a>
      </div>
    `;
  }

  /**
   * Set custom 404 handler
   * @param {Function} handler
   */
  setNotFoundHandler(handler) {
    this.notFoundHandler = handler;
  }

  /**
   * Set custom error handler
   * @param {Function} handler
   */
  setErrorHandler(handler) {
    this.errorHandler = handler;
  }

  /**
   * Add middleware
   * @param {Function} fn - Middleware function
   */
  use(fn) {
    this.middleware.push(fn);
  }

  /**
   * Setup route interception
   */
  setupRouteInterception() {
    // This would integrate with your PWA Builder router
    // For now, this is a placeholder
    if (this.router && this.router.addRoute) {
      // Add a catch-all route for dynamic pages
      this.router.addRoute('*', (params, route) => {
        return this.handleRoute(route);
      });
    }
  }

  /**
   * Handle a route
   * @param {string} route
   * @returns {string}
   */
  async handleRoute(route) {
    // Run middleware
    for (const middleware of this.middleware) {
      const result = await middleware(route);
      if (result === false) {
        return null; // Middleware blocked the route
      }
    }
    
    // Render page
    return this.renderPage(route);
  }

  /**
   * Get all pages
   * @returns {Array}
   */
  getAllPages() {
    return Array.from(this.routes.values());
  }

  /**
   * Get pages by parent
   * @param {string} parentId
   * @returns {Array}
   */
  getChildPages(parentId) {
    return this.getAllPages().filter(page => page.parent_id === parentId);
  }

  /**
   * Build navigation tree
   * @returns {Array}
   */
  buildNavigationTree() {
    const pages = this.getAllPages();
    const tree = [];
    const pageMap = new Map();
    
    // First pass: create map
    pages.forEach(page => {
      pageMap.set(page.id, {
        ...page,
        children: []
      });
    });
    
    // Second pass: build tree
    pages.forEach(page => {
      const node = pageMap.get(page.id);
      
      if (page.parent_id && pageMap.has(page.parent_id)) {
        pageMap.get(page.parent_id).children.push(node);
      } else {
        tree.push(node);
      }
    });
    
    // Sort by sort_order
    const sortTree = (nodes) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order);
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortTree(node.children);
        }
      });
    };
    
    sortTree(tree);
    
    return tree;
  }

  /**
   * Search pages
   * @param {string} query
   * @returns {Array}
   */
  searchPages(query) {
    const queryLower = query.toLowerCase();
    
    return this.getAllPages().filter(page => {
      return (
        page.title.toLowerCase().includes(queryLower) ||
        page.content.toLowerCase().includes(queryLower) ||
        (page.metadata.tags && page.metadata.tags.some(tag => 
          tag.toLowerCase().includes(queryLower)
        ))
      );
    });
  }

  /**
   * Add tag to page
   * @param {string} route
   * @param {string} tag
   */
  addTag(route, tag) {
    const page = this.getPage(route);
    if (!page) return;
    
    dbService.run(
      'INSERT OR IGNORE INTO content_tags (content_id, tag, create_date) VALUES (?, ?, ?)',
      [page.id, tag, new Date().toISOString()]
    );
  }

  /**
   * Remove tag from page
   * @param {string} route
   * @param {string} tag
   */
  removeTag(route, tag) {
    const page = this.getPage(route);
    if (!page) return;
    
    dbService.run(
      'DELETE FROM content_tags WHERE content_id = ? AND tag = ?',
      [page.id, tag]
    );
  }

  /**
   * Get pages by tag
   * @param {string} tag
   * @returns {Array}
   */
  getPagesByTag(tag) {
    const results = dbService.getAll(
      `SELECT cp.* FROM content_pages cp
       JOIN content_tags ct ON cp.id = ct.content_id
       WHERE ct.tag = ? AND cp.published = 1 AND cp.active = 1`,
      [tag]
    );
    
    return results;
  }

  /**
   * Emit page event
   * @param {string} eventName
   * @param {Object} detail
   */
  emitPageEvent(eventName, detail = {}) {
    const event = new CustomEvent(`page-${eventName}`, { detail });
    window.dispatchEvent(event);
  }

  /**
   * Listen for page events
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    window.addEventListener(`page-${eventName}`, (event) => {
      callback(event.detail);
    });
  }

  /**
   * Refresh pages from database
   */
  async refresh() {
    this.routes.clear();
    await this.loadPagesFromDb();
    
    loggingPlugin.info('Pages refreshed from database', {
      category: 'pages',
      details: { pageCount: this.routes.size }
    });
  }
}

const dynamicPagePlugin = new DynamicPagePlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.dynamicPagePlugin = dynamicPagePlugin;
}

export default dynamicPagePlugin;
