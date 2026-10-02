/**
 * Validates req.body against a Zod schema. Rejects with 400 and a
 * readable error list on failure; replaces req.body with the parsed
 * (and therefore type-coerced/stripped-of-unknown-keys) result on
 * success, so downstream code never touches unvalidated input.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };