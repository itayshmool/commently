const { RateLimiter } = require('../../src/middleware/rate-limit');

describe('RateLimiter', () => {
  let limiter;

  afterEach(() => {
    if (limiter) limiter.destroy();
  });

  it('allows requests within the limit', () => {
    limiter = new RateLimiter({ windowMs: 60000, max: 3 });
    expect(limiter.check('key1').allowed).toBe(true);
    expect(limiter.check('key1').allowed).toBe(true);
    expect(limiter.check('key1').allowed).toBe(true);
  });

  it('blocks requests over the limit', () => {
    limiter = new RateLimiter({ windowMs: 60000, max: 2 });
    limiter.check('key1');
    limiter.check('key1');
    expect(limiter.check('key1').allowed).toBe(false);
  });

  it('tracks remaining count', () => {
    limiter = new RateLimiter({ windowMs: 60000, max: 3 });
    expect(limiter.check('key1').remaining).toBe(2);
    expect(limiter.check('key1').remaining).toBe(1);
    expect(limiter.check('key1').remaining).toBe(0);
  });

  it('isolates keys from each other', () => {
    limiter = new RateLimiter({ windowMs: 60000, max: 1 });
    expect(limiter.check('key1').allowed).toBe(true);
    expect(limiter.check('key2').allowed).toBe(true);
    expect(limiter.check('key1').allowed).toBe(false);
  });

  it('resets after window expires', () => {
    limiter = new RateLimiter({ windowMs: 50, max: 1 });
    limiter.check('key1');
    expect(limiter.check('key1').allowed).toBe(false);

    return new Promise(resolve => {
      setTimeout(() => {
        expect(limiter.check('key1').allowed).toBe(true);
        resolve();
      }, 60);
    });
  });
});
