/**
 * Authentication & Session Plugin
 * Handles user login, logout, and session management
 */

import dbService from '../db/database-service.js';

class AuthPlugin {
  constructor() {
    this.currentUser = null;
    this.currentSession = null;
    this.sessionCheckInterval = null;
  }

  /**
   * Initialize the auth plugin
   */
  async init() {
    // Try to restore session from storage
    const sessionToken = localStorage.getItem('session_token');
    if (sessionToken) {
      await this.restoreSession(sessionToken);
    }
    
    // Start session checking
    this.startSessionCheck();
  }

  /**
   * Login a user
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object>} User object and session token
   */
  async login(username, password) {
    try {
      // Get user from database
      const user = dbService.getUserByUsername(username);
      
      if (!user) {
        throw new Error('Invalid username or password');
      }
      
      // Verify password (you'll need to implement proper password hashing)
      const isValid = await this.verifyPassword(password, user.password_hash);
      
      if (!isValid) {
        throw new Error('Invalid username or password');
      }
      
      // Update last login
      dbService.updateLastLogin(user.id);
      
      // Create session
      const deviceInfo = this.getDeviceInfo();
      const sessionToken = dbService.createSession(user.id, deviceInfo);
      
      // Store session token
      localStorage.setItem('session_token', sessionToken);
      
      // Set current user and session
      this.currentUser = user;
      this.currentSession = {
        id: sessionToken,
        user_id: user.id,
        device_info: deviceInfo
      };
      
      // Log the event
      dbService.log('info', 'User logged in', {
        category: 'auth',
        userId: user.id,
        sessionId: sessionToken
      });
      
      // Emit login event
      this.emitAuthEvent('login', { user, sessionToken });
      
      return {
        user: this.sanitizeUser(user),
        sessionToken
      };
    } catch (error) {
      dbService.log('warn', 'Login failed', {
        category: 'auth',
        details: { username, error: error.message }
      });
      
      throw error;
    }
  }

  /**
   * Logout the current user
   */
  async logout() {
    if (this.currentSession) {
      // Invalidate session in database
      dbService.invalidateSession(this.currentSession.id);
      
      // Log the event
      dbService.log('info', 'User logged out', {
        category: 'auth',
        userId: this.currentUser?.id,
        sessionId: this.currentSession.id
      });
    }
    
    // Clear local storage
    localStorage.removeItem('session_token');
    
    // Clear current user and session
    const previousUser = this.currentUser;
    this.currentUser = null;
    this.currentSession = null;
    
    // Emit logout event
    this.emitAuthEvent('logout', { user: previousUser });
  }

  /**
   * Register a new user
   * @param {Object} userData
   * @returns {Promise<string>} User ID
   */
  async register(userData) {
    try {
      // Validate required fields
      if (!userData.username || !userData.password) {
        throw new Error('Username and password are required');
      }
      
      // Check if username already exists
      const existing = dbService.getUserByUsername(userData.username);
      if (existing) {
        throw new Error('Username already exists');
      }
      
      // Hash password
      const password_hash = await this.hashPassword(userData.password);
      
      // Create user
      const userId = dbService.createUser({
        ...userData,
        password_hash,
        password: undefined // Remove plain password
      });
      
      // Log the event
      dbService.log('info', 'New user registered', {
        category: 'auth',
        details: { userId, username: userData.username }
      });
      
      // Emit registration event
      this.emitAuthEvent('register', { userId, username: userData.username });
      
      return userId;
    } catch (error) {
      dbService.log('warn', 'Registration failed', {
        category: 'auth',
        details: { username: userData.username, error: error.message }
      });
      
      throw error;
    }
  }

  /**
   * Restore session from token
   * @param {string} sessionToken
   * @returns {Promise<boolean>}
   */
  async restoreSession(sessionToken) {
    try {
      // Get session from database
      const session = dbService.getSession(sessionToken);
      
      if (!session) {
        localStorage.removeItem('session_token');
        return false;
      }
      
      // Get user
      const user = dbService.getUserById(session.user_id);
      
      if (!user) {
        dbService.invalidateSession(sessionToken);
        localStorage.removeItem('session_token');
        return false;
      }
      
      // Update session activity
      dbService.updateSessionActivity(sessionToken);
      
      // Set current user and session
      this.currentUser = user;
      this.currentSession = session;
      
      // Emit session restored event
      this.emitAuthEvent('session-restored', { user, session });
      
      return true;
    } catch (error) {
      console.error('Failed to restore session:', error);
      localStorage.removeItem('session_token');
      return false;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.currentUser !== null && this.currentSession !== null;
  }

  /**
   * Get current user
   * @returns {Object|null}
   */
  getCurrentUser() {
    return this.currentUser ? this.sanitizeUser(this.currentUser) : null;
  }

  /**
   * Get current session
   * @returns {Object|null}
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Check if user has role
   * @param {string} role
   * @returns {boolean}
   */
  hasRole(role) {
    return this.currentUser && this.currentUser.role === role;
  }

  /**
   * Require authentication
   * Throws error if not authenticated
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      throw new Error('Authentication required');
    }
  }

  /**
   * Require role
   * Throws error if user doesn't have the role
   * @param {string} role
   */
  requireRole(role) {
    this.requireAuth();
    if (!this.hasRole(role)) {
      throw new Error(`Role ${role} required`);
    }
  }

  /**
   * Update user profile
   * @param {Object} updates
   */
  async updateProfile(updates) {
    this.requireAuth();
    
    // Don't allow updating certain fields
    const allowedFields = ['display_name', 'email', 'avatar_url', 'preferences'];
    const filteredUpdates = {};
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    // Update database
    const setClause = Object.keys(filteredUpdates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [...Object.values(filteredUpdates), this.currentUser.id];
    
    dbService.run(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      values
    );
    
    // Update current user
    Object.assign(this.currentUser, filteredUpdates);
    
    // Log the event
    dbService.log('info', 'User profile updated', {
      category: 'auth',
      userId: this.currentUser.id,
      details: { fields: Object.keys(filteredUpdates) }
    });
    
    // Emit profile updated event
    this.emitAuthEvent('profile-updated', {
      user: this.sanitizeUser(this.currentUser)
    });
  }

  /**
   * Change password
   * @param {string} oldPassword
   * @param {string} newPassword
   */
  async changePassword(oldPassword, newPassword) {
    this.requireAuth();
    
    // Verify old password
    const isValid = await this.verifyPassword(
      oldPassword,
      this.currentUser.password_hash
    );
    
    if (!isValid) {
      throw new Error('Invalid current password');
    }
    
    // Hash new password
    const newHash = await this.hashPassword(newPassword);
    
    // Update database
    dbService.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, this.currentUser.id]
    );
    
    // Log the event
    dbService.log('info', 'Password changed', {
      category: 'auth',
      userId: this.currentUser.id
    });
    
    // Emit password changed event
    this.emitAuthEvent('password-changed', {
      userId: this.currentUser.id
    });
  }

  // ============================================================================
  // PASSWORD HASHING (Simple implementation - use bcrypt in production!)
  // ============================================================================

  /**
   * Hash a password
   * @param {string} password
   * @returns {Promise<string>}
   */
  async hashPassword(password) {
    // This is a simplified version
    // In production, use bcrypt or scrypt
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Verify a password
   * @param {string} password
   * @param {string} hash
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, hash) {
    const hashedInput = await this.hashPassword(password);
    return hashedInput === hash;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get device information
   * @returns {Object}
   */
  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Sanitize user object (remove sensitive data)
   * @param {Object} user
   * @returns {Object}
   */
  sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Start session checking interval
   */
  startSessionCheck() {
    // Check session every minute
    this.sessionCheckInterval = setInterval(() => {
      if (this.currentSession) {
        const sessionToken = localStorage.getItem('session_token');
        if (sessionToken) {
          const session = dbService.getSession(sessionToken);
          if (!session) {
            // Session expired or invalidated
            this.logout();
            this.emitAuthEvent('session-expired');
          } else {
            // Update activity
            dbService.updateSessionActivity(sessionToken);
          }
        }
      }
    }, 60000); // 1 minute
  }

  /**
   * Stop session checking interval
   */
  stopSessionCheck() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }

  /**
   * Emit authentication event
   * @param {string} eventName
   * @param {Object} detail
   */
  emitAuthEvent(eventName, detail = {}) {
    const event = new CustomEvent(`auth-${eventName}`, { detail });
    window.dispatchEvent(event);
  }

  /**
   * Listen for auth events
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    window.addEventListener(`auth-${eventName}`, (event) => {
      callback(event.detail);
    });
  }

  /**
   * Clean up expired sessions (run periodically)
   */
  cleanup() {
    dbService.cleanupExpiredSessions();
  }
}

const authPlugin = new AuthPlugin();

// Auto-initialize
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    await authPlugin.init();
  });
  
  window.authPlugin = authPlugin;
}

export default authPlugin;
