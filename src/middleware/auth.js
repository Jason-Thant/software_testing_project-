const { findUserBySession } = require('../database/connection');

async function optionalAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    req.user = token ? await findUserBySession(token) : null;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { optionalAuth };
