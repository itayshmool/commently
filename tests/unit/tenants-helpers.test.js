const { generateApiKey, hashApiKey } = require('../../src/db/tenants');

describe('tenant helpers', () => {
  describe('generateApiKey', () => {
    it('produces keys with the correct prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk_commently_/);
    });

    it('produces unique keys', () => {
      const keys = new Set(Array.from({ length: 10 }, generateApiKey));
      expect(keys.size).toBe(10);
    });

    it('produces keys of consistent length', () => {
      const key = generateApiKey();
      expect(key.length).toBeGreaterThan(30);
    });
  });

  describe('hashApiKey', () => {
    it('produces a hex string', () => {
      const hash = hashApiKey('test-key');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      const h1 = hashApiKey('same-key');
      const h2 = hashApiKey('same-key');
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different keys', () => {
      const h1 = hashApiKey('key-a');
      const h2 = hashApiKey('key-b');
      expect(h1).not.toBe(h2);
    });
  });
});
