const { AppError, errorHandler } = require('../../src/middleware/errors');

describe('AppError', () => {
  it('creates error with code, message, and statusCode', () => {
    const err = new AppError('NOT_FOUND', 'Thing not found', 404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Thing not found');
    expect(err.statusCode).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults statusCode to 400', () => {
    const err = new AppError('VALIDATION_ERROR', 'Bad input');
    expect(err.statusCode).toBe(400);
  });
});

describe('errorHandler', () => {
  let res;
  const next = jest.fn();

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('handles AppError with correct status and shape', () => {
    const err = new AppError('NOT_FOUND', 'Comment not found', 404);
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Comment not found' },
    });
  });

  it('handles JSON parse errors', () => {
    const err = { type: 'entity.parse.failed' };
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body' },
    });
  });

  it('handles unknown errors as 500', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Something broke');
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    consoleError.mockRestore();
  });
});
