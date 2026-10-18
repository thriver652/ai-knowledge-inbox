import { Errors } from '../errors.js';

// validate({ body: schema, query: schema, params: schema }) -> middleware.
// Parsed (coerced, trimmed, defaulted) values replace the raw ones on req.valid.
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const [part, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      return next(
        Errors.validation(
          result.error.issues.map((i) => ({ field: [part, ...i.path].join('.'), message: i.message })),
        ),
      );
    }
    req.valid[part] = result.data;
  }
  next();
};
