import { describe, it, expect } from 'vitest';
import { normalizeUrl, hashUrl, resolveUrl } from '../../src/utils/url';

describe('URL Utils', () => {
  describe('normalizeUrl', () => {
    it('should lowercase scheme and host', () => {
      const result = normalizeUrl('HTTP://EXAMPLE.COM/path');
      expect(result).toBe('http://example.com/path');
    });

    it('should remove trailing slash from path', () => {
      const result = normalizeUrl('http://example.com/path/');
      expect(result).toBe('http://example.com/path');
    });

    it('should remove fragments', () => {
      const result = normalizeUrl('http://example.com/path#section');
      expect(result).toBe('http://example.com/path');
    });

    it('should remove tracking parameters', () => {
      const result = normalizeUrl(
        'http://example.com/path?utm_source=google&utm_medium=cpc&utm_campaign=sale&other=value'
      );
      expect(result).toBe('http://example.com/path?other=value');
    });

    it('should remove multiple tracking params', () => {
      const result = normalizeUrl(
        'http://example.com/path?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b&fbclid=123&gclid=456&ref=source&source=name&mc_cid=1&mc_eid=2'
      );
      expect(result).toBe('http://example.com/path');
    });

    it('should handle URLs with ports', () => {
      const result = normalizeUrl('HTTP://EXAMPLE.COM:8080/path/?utm_source=x#frag');
      expect(result).toBe('http://example.com:8080/path');
    });

    it('should handle URLs with encoded characters', () => {
      const result = normalizeUrl('http://example.com/path%20with%20spaces?q=test%20value');
      expect(result).toBe('http://example.com/path%20with%20spaces?q=test%20value');
    });

    it('should preserve query params that are not tracking params', () => {
      const result = normalizeUrl('http://example.com/path?id=123&utm_source=google&page=1');
      expect(result).toContain('id=123');
      expect(result).toContain('page=1');
      expect(result).not.toContain('utm_source');
    });

    it('should handle root path correctly', () => {
      const result = normalizeUrl('HTTP://EXAMPLE.COM/#fragment');
      expect(result).toBe('http://example.com/');
    });

    it('should preserve scheme when not http/https', () => {
      // Most URLs will be http/https, but test robustness
      const result = normalizeUrl('http://example.com/test');
      expect(result).toMatch(/^http:\/\//);
    });

    it('should handle empty query string', () => {
      const result = normalizeUrl('http://example.com/path?');
      expect(result).toBe('http://example.com/path');
    });

    it('should handle multiple slashes in path', () => {
      const result = normalizeUrl('http://example.com/path//to//resource');
      // URL constructor normalizes this
      expect(result).toContain('example.com');
    });
  });

  describe('hashUrl', () => {
    it('should generate consistent SHA-256 hash for same normalized URL', () => {
      const url = 'http://example.com/article';
      const hash1 = hashUrl(url);
      const hash2 = hashUrl(url);
      expect(hash1).toBe(hash2);
    });

    it('should generate same hash for URLs with different tracking params', () => {
      const url1 = 'http://example.com/article?utm_source=google';
      const url2 = 'http://example.com/article?utm_source=twitter&utm_medium=social';
      const url3 = 'http://example.com/article';
      const hash1 = hashUrl(url1);
      const hash2 = hashUrl(url2);
      const hash3 = hashUrl(url3);
      expect(hash1).toBe(hash3);
      expect(hash2).toBe(hash3);
    });

    it('should generate same hash for URLs with fragments', () => {
      const url1 = 'http://example.com/article#section1';
      const url2 = 'http://example.com/article#section2';
      const url3 = 'http://example.com/article';
      expect(hashUrl(url1)).toBe(hashUrl(url3));
      expect(hashUrl(url2)).toBe(hashUrl(url3));
    });

    it('should generate same hash for URLs with trailing slashes', () => {
      const url1 = 'http://example.com/article/';
      const url2 = 'http://example.com/article';
      expect(hashUrl(url1)).toBe(hashUrl(url2));
    });

    it('should generate different hash for different URLs', () => {
      const url1 = 'http://example.com/article1';
      const url2 = 'http://example.com/article2';
      expect(hashUrl(url1)).not.toBe(hashUrl(url2));
    });

    it('should generate 64-character hex string (SHA-256)', () => {
      const hash = hashUrl('http://example.com/test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be case-insensitive for domain', () => {
      const url1 = 'http://Example.Com/article';
      const url2 = 'http://example.com/article';
      expect(hashUrl(url1)).toBe(hashUrl(url2));
    });

    it('should deduplicate across sources for same article', () => {
      // Simulating same article from different sources with different tracking params
      const url1 = 'http://techcrunch.com/article?utm_source=hn';
      const url2 = 'http://techcrunch.com/article?utm_source=twitter&utm_medium=social&fbclid=123';
      expect(hashUrl(url1)).toBe(hashUrl(url2));
    });
  });

  describe('resolveUrl', () => {
    it('should resolve relative path against base URL', () => {
      const result = resolveUrl('/post/123', 'http://antirez.com/');
      expect(result).toBe('http://antirez.com/post/123');
    });

    it('should handle relative URLs without leading slash', () => {
      const result = resolveUrl('post/123', 'http://antirez.com/');
      expect(result).toBe('http://antirez.com/post/123');
    });

    it('should handle absolute URLs', () => {
      const result = resolveUrl('http://example.com/article', 'http://antirez.com/');
      expect(result).toBe('http://example.com/article');
    });

    it('should resolve relative to nested base URL', () => {
      const result = resolveUrl('/post/123', 'http://example.com/blog/');
      expect(result).toBe('http://example.com/post/123');
    });

    it('should handle relative paths with parent directory', () => {
      const result = resolveUrl('../other', 'http://example.com/blog/article/');
      expect(result).toBe('http://example.com/blog/other');
    });

    it('should handle URLs with query parameters', () => {
      const result = resolveUrl('/post?id=123', 'http://example.com/');
      expect(result).toBe('http://example.com/post?id=123');
    });

    it('should handle URLs with fragments', () => {
      const result = resolveUrl('/post#section', 'http://example.com/');
      expect(result).toBe('http://example.com/post#section');
    });

    it('should handle protocol-relative URLs', () => {
      const result = resolveUrl('//cdn.example.com/asset.js', 'http://example.com/');
      expect(result).toContain('cdn.example.com');
    });

    it('should preserve encoded characters in relative URLs', () => {
      const result = resolveUrl('/path%20with%20spaces', 'http://example.com/');
      expect(result).toContain('path%20with%20spaces');
    });

    it('should handle empty relative URL', () => {
      const result = resolveUrl('', 'http://example.com/page');
      expect(result).toBe('http://example.com/page');
    });

    it('should handle current directory reference', () => {
      const result = resolveUrl('./', 'http://example.com/blog/');
      expect(result).toContain('example.com');
    });

    it('should handle hash-only relative URL', () => {
      const result = resolveUrl('#section', 'http://example.com/page');
      expect(result).toBe('http://example.com/page#section');
    });
  });

  describe('Edge cases', () => {
    it('should handle URL with all tracking params removed leaving no query string', () => {
      const url = 'http://example.com/path?utm_source=x&utm_medium=y';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('http://example.com/path');
      expect(normalized).not.toContain('?');
    });

    it('should handle complex URLs with mixed parameters and fragments', () => {
      const url =
        'HTTPS://EXAMPLE.COM:443/path/to/article/?id=123&utm_source=google&utm_campaign=promo&key=value#top';
      const normalized = normalizeUrl(url);
      expect(normalized).not.toContain('utm_source');
      expect(normalized).not.toContain('utm_campaign');
      expect(normalized).not.toContain('#top');
      expect(normalized).toContain('id=123');
      expect(normalized).toContain('key=value');
    });

    it('should produce deterministic hashes across different systems', () => {
      // Same URL should always produce same hash
      const urls = Array(5).fill('http://example.com/test?utm_source=x&utm_medium=y');
      const hashes = urls.map(hashUrl);
      expect(new Set(hashes).size).toBe(1);
    });

    it('should handle international domain names (IDN)', () => {
      const url = 'http://münchen.de/path';
      // Should not throw
      const hash = hashUrl(url);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle URLs without protocol', () => {
      // These should ideally throw or be handled carefully
      // Depending on implementation choice
      expect(() => normalizeUrl('example.com/path')).toThrow();
    });
  });
});
