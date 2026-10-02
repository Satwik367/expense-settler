/**
 * Centralized error handler. Deliberately never leaks stack traces or
 * internal error messages to the client in production - only a generic
 * message plus whatever safe `statusCode`/`publicMessage` the throwing
 * code chose to attach.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    error: err.publicMessage || (statusCode >= 500 ? 'Internal server error' : err.message),
    ...(isProd ? {} : { stack: err.stack }),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

class AppError extends Error {
  constructor(statusCode, publicMessage) {
    super(publicMessage);
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

module.exports = { errorHandler, notFoundHandler, AppError };