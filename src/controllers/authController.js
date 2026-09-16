const { createUser, authenticateUser, createSession } = require('../database/connection');

function validateCredentials(body) {
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const errors = [];
  if (fullName.length < 2) errors.push('Full name must be at least 2 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.');
  if (password.length < 6) errors.push('Password must be at least 6 characters.');
  return { fullName, email, password, errors };
}

function publicUser(user) {
  return { id: user.id, fullName: user.full_name, email: user.email, role: user.role };
}

async function signup(req, res) {
  const credentials = validateCredentials(req.body || {});
  if (credentials.errors.length) return res.status(400).json({ success: false, error: 'Validation Error', details: credentials.errors });
  try {
    const user = await createUser(credentials);
    const token = await createSession(user.id);
    return res.status(201).json({ success: true, user: publicUser(user), token });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Conflict', message: 'An account with that email already exists.' });
    console.error('[Auth Controller] signup:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error', message: 'Unable to create account.' });
  }
}

async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ success: false, error: 'Validation Error', message: 'Email and password are required.' });
  try {
    const user = await authenticateUser(email, password);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Invalid email or password.' });
    const token = await createSession(user.id);
    return res.status(200).json({ success: true, user: publicUser(user), token });
  } catch (error) {
    console.error('[Auth Controller] login:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error', message: 'Unable to sign in.' });
  }
}

function me(req, res) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  return res.json({ success: true, user: publicUser(req.user) });
}

module.exports = { signup, login, me };
