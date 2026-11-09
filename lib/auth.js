'use strict';
const crypto = require('node:crypto');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Sessioni solo in memoria (l'app non scrive altro su disco che segnalazioni.md); i tentativi
// falliti sono contati insieme (dietro il proxy l'IP è sempre lo stesso).
function createAuth({ user, password, now = Date.now }) {
  const sessions = new Map(); // hash del token -> scadenza
  let fails = [];
  return {
    login(u, p) {
      fails = fails.filter((t) => now() - t < FAIL_WINDOW_MS);
      if (fails.length >= MAX_FAILS) return { error: 'troppi' };
      const ok = safeEqual(u, user) & safeEqual(p, password); // eslint-disable-line no-bitwise
      if (!ok) { fails.push(now()); return { error: 'credenziali' }; }
      const token = crypto.randomBytes(32).toString('hex');
      for (const [h, exp] of sessions) if (exp < now()) sessions.delete(h);
      sessions.set(sha(token).toString('hex'), now() + SESSION_TTL_MS);
      return { token };
    },
    valid(token) {
      if (!token) return false;
      const h = sha(token).toString('hex');
      const exp = sessions.get(h);
      if (!exp) return false;
      if (exp < now()) { sessions.delete(h); return false; }
      return true;
    },
    logout(token) { if (token) sessions.delete(sha(token).toString('hex')); },
    maxAge: SESSION_TTL_MS / 1000,
  };
}

module.exports = { createAuth };
