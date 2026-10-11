export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const formattedErrors = result.error.flatten().fieldErrors;
    const firstErrorMsg = Object.values(formattedErrors)[0]?.[0] || 'Validation failed';

    return res.status(422).json({
      success: false,
      message: firstErrorMsg,
      errors: formattedErrors,
    });
  }
  req.body = result.data;
  next();
};

export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found - ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal Server Error' : err.message,
  });
};
