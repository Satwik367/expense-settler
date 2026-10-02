const jwt = require('jsonwebtoken');

/**
 * Requires a valid session. Reads the JWT from the httpOnly cookie
 * (never from a header or query param - keeps the token out of JS
 * reach entirely, which is the point of using an httpOnly cookie).
 */
function requireAuth(req, res, next) {
  const cookieName = process.env.COOKIE_NAME || 'es_token';
  const token = req.cookies?.[cookieName];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };