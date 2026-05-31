// Token Service - Secure token encryption, decryption, and management
const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

class TokenService {
  constructor() {
    this.encryptionKey = this.getEncryptionKey();
  }

  // Get encryption key - FAILS in production if not set
  getEncryptionKey() {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!key) {
      if (isProduction) {
        throw new Error('[TokenService] FATAL: TOKEN_ENCRYPTION_KEY must be set in production! Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      }
      console.warn('[TokenService] WARNING: TOKEN_ENCRYPTION_KEY not set. Using development key - DO NOT USE IN PRODUCTION!');
      // Development-only fallback - clearly marked
      return 'dev-only-key-not-for-production-32';
    }

    if (key.length < 32) {
      throw new Error('[TokenService] FATAL: TOKEN_ENCRYPTION_KEY must be at least 32 characters');
    }

    return key;
  }

  // Derive a key from the encryption key using PBKDF2
  deriveKey(salt) {
    return crypto.pbkdf2Sync(
      this.encryptionKey,
      salt,
      100000,
      32,
      'sha256'
    );
  }

  // Encrypt a token
  encryptToken(token) {
    if (!token) return null;

    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from password
      const key = this.deriveKey(salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Combine: salt + iv + authTag + encrypted
      const combined = Buffer.concat([
        salt,
        iv,
        authTag,
        Buffer.from(encrypted, 'hex')
      ]);

      return combined.toString('base64');
    } catch (error) {
      console.error('[TokenService] Encryption error:', error.message);
      return null;
    }
  }

  // Decrypt a token
  decryptToken(encryptedToken) {
    if (!encryptedToken) return null;

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedToken, 'base64');

      // Extract components
      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      // Derive key
      const key = this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[TokenService] Decryption error:', error.message);
      return null;
    }
  }

  // Check if a token is expired
  isTokenExpired(account) {
    if (!account || !account.token_expires_at) {
      return true;
    }

    const expiresAt = new Date(account.token_expires_at);
    const now = new Date();

    // Consider expired if less than 5 minutes remaining
    const bufferTime = 5 * 60 * 1000; // 5 minutes in ms
    return (expiresAt.getTime() - now.getTime()) < bufferTime;
  }

  // Check if token needs refresh (within 24 hours of expiry)
  needsRefresh(account) {
    if (!account || !account.token_expires_at) {
      return true;
    }

    const expiresAt = new Date(account.token_expires_at);
    const now = new Date();

    // Refresh if less than 24 hours remaining
    const refreshBuffer = 24 * 60 * 60 * 1000; // 24 hours in ms
    return (expiresAt.getTime() - now.getTime()) < refreshBuffer;
  }

  // Calculate token expiry date from expires_in seconds
  calculateExpiryDate(expiresInSeconds) {
    const now = new Date();
    return new Date(now.getTime() + (expiresInSeconds * 1000)).toISOString();
  }

  // Prepare account tokens for storage (encrypt sensitive data)
  prepareForStorage(tokenData) {
    return {
      access_token: this.encryptToken(tokenData.access_token),
      refresh_token: tokenData.refresh_token ? this.encryptToken(tokenData.refresh_token) : null,
      token_expires_at: tokenData.expires_in
        ? this.calculateExpiryDate(tokenData.expires_in)
        : tokenData.token_expires_at || null,
      token_encrypted: 1
    };
  }

  // Retrieve and decrypt account tokens
  getDecryptedTokens(account) {
    if (!account) return null;

    // Check if tokens are encrypted
    if (account.token_encrypted === 1) {
      return {
        access_token: this.decryptToken(account.access_token),
        refresh_token: account.refresh_token ? this.decryptToken(account.refresh_token) : null
      };
    }

    // Return unencrypted tokens (legacy)
    return {
      access_token: account.access_token,
      refresh_token: account.refresh_token
    };
  }

  // Validate token format (basic check)
  isValidTokenFormat(token) {
    if (!token || typeof token !== 'string') return false;
    // Most OAuth tokens are at least 20 characters
    return token.length >= 20;
  }

  // Generate a random state parameter for OAuth
  generateOAuthState() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate PKCE code verifier (for Twitter OAuth 2.0)
  generateCodeVerifier() {
    return crypto.randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Generate PKCE code challenge from verifier
  generateCodeChallenge(verifier) {
    return crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Store OAuth state temporarily (in-memory for now, should use Redis in production)
  oauthStates = new Map();

  storeOAuthState(state, data, ttlSeconds = 600) {
    this.oauthStates.set(state, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });

    // Clean up expired states
    this.cleanupExpiredStates();
  }

  getOAuthState(state) {
    const stored = this.oauthStates.get(state);
    if (!stored) return null;

    if (Date.now() > stored.expiresAt) {
      this.oauthStates.delete(state);
      return null;
    }

    return stored.data;
  }

  consumeOAuthState(state) {
    const data = this.getOAuthState(state);
    this.oauthStates.delete(state);
    return data;
  }

  cleanupExpiredStates() {
    const now = Date.now();
    for (const [state, value] of this.oauthStates.entries()) {
      if (now > value.expiresAt) {
        this.oauthStates.delete(state);
      }
    }
  }
}

// Export singleton instance
module.exports = new TokenService();
