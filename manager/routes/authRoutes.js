const express = require('express');
const router = express.Router();
const db = require('../../shared/db/database');
const { hashPassword, verifyPassword } = require('../../shared/auth/password');
const { signJwt, requireUser } = require('../../shared/middleware/auth');

const DEMO_USER_ID = 'user_demo_001';
const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const CLAIM_DEMO_DATA = process.env.CLAIM_DEMO_DATA !== 'false';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, avatar: u.avatar || null };
}

function issueToken(user) {
  return signJwt(
    { sub: user.id, id: user.id, email: user.email, name: user.name },
    { expiresInSec: TOKEN_TTL_SEC }
  );
}

// POST /api/auth/signup  { email, name, password }
router.post('/signup', (req, res) => {
  try {
    const { email, name, password } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    if (db.getUserByEmail(email)) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    // Is this the first real (non-demo) account? If so, hand it the demo data.
    const isFirstRealUser = db.countUsers() <= 1;

    const user = db.createUser({
      email: email.trim(),
      name: name.trim(),
      password_hash: hashPassword(password)
    });

    let claimed = 0;
    if (isFirstRealUser && CLAIM_DEMO_DATA) {
      claimed = db.reassignBusinesses(DEMO_USER_ID, user.id);
    }

    const token = issueToken(user);
    res.status(201).json({ success: true, token, user: publicUser(user), claimedBusinesses: claimed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = db.getUserByEmail(email);
    // Constant-ish response: never reveal whether the email exists.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = issueToken(user);
    res.json({ success: true, token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me  (requires valid token)
router.get('/me', requireUser, (req, res) => {
  const user = db.getUser(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, error: 'User no longer exists' });
  }
  res.json({ success: true, user: publicUser(user) });
});

// POST /api/auth/logout  (stateless — client discards the token)
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
