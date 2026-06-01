// Password hashing using Node's built-in scrypt (no external dependency).
// Stored format: "scrypt$<saltHex>$<hashHex>".
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  let derived;
  try {
    derived = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  } catch {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
