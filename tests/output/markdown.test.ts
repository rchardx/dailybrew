import { describe, it, expect } from 'vitest';
import { formatDigest, DigestItem, FetchError } from '../../src/output/markdown';

describe('Markdown Output Formatter', () => {
  describe('Single digest item formatting', () => {
    it('should format a single digest item with title, link, source, summary, and importance', () => {
      const items: DigestItem[] = [
        {
          title: 'Article Title',
          link: 'https://example.com/article',
          sourceName: 'TechCrunch',
          summary: 'Summary of the article content here...',
          importance: 5,
        },
      ];

      const result = formatDigest(items);
      expect(result).toContain('[Article Title](https://example.com/article)');
      expect(result).toContain('**Source**: TechCrunch');
      expect(result).toContain('Summary of the article content here...');
    });
  });

  describe('Sorting by importance', () => {
    it('should sort items by importance descending (5 → 1)', () => {
      const items: DigestItem[] = [
        { title: 'Low Priority', link: 'https://example.com/1', sourceName: 'Source A', summary: 'Low', importance: 1 },
        { title: 'Critical', link: 'https://example.com/2', sourceName: 'Source B', summary: 'Critical', importance: 5 },
        { title: 'High', link: 'https://example.com/3', sourceName: 'Source C', summary: 'High', importance: 4 },
      ];

      const result = formatDigest(items);
      const criticalIdx = result.indexOf('Critical');
      const highIdx = result.indexOf('High');
      const lowIdx = result.indexOf('Low Priority');

      expect(criticalIdx).toBeLessThan(highIdx);
      expect(highIdx).toBeLessThan(lowIdx);
    });
  });

  describe('Grouping by importance level with emoji headers', () => {
    it('should group items by importance level with emoji headers', () => {
      const items: DigestItem[] = [
        { title: 'Critical Item', link: 'https://example.com/1', sourceName: 'Source A', summary: 'Critical', importance: 5 },
        { title: 'High Item', link: 'https://example.com/2', sourceName: 'Source B', summary: 'High', importance: 4 },
        { title: 'Important Item', link: 'https://example.com/3', sourceName: 'Source C', summary: 'Important', importance: 3 },
        { title: 'Normal Item', link: 'https://example.com/4', sourceName: 'Source D', summary: 'Normal', importance: 2 },
        { title: 'Low Item', link: 'https://example.com/5', sourceName: 'Source E', summary: 'Low', importance: 1 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('## 🔴 Critical (5/5)');
      expect(result).toContain('## 🟠 High (4/5)');
      expect(result).toContain('## 🟡 Important (3/5)');
      expect(result).toContain('## 🟢 Normal (2/5)');
      expect(result).toContain('## ⚪ Low (1/5)');
    });
  });

  describe('Empty input handling', () => {
    it('should return "No new content" message for empty input', () => {
      const items: DigestItem[] = [];
      const result = formatDigest(items);
      expect(result).toContain('No new content');
    });
  });

  describe('Date header', () => {
    it('should include date header in output (Daily Digest — YYYY-MM-DD)', () => {
      const items: DigestItem[] = [
        { title: 'Test', link: 'https://example.com/1', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).toMatch(/# Daily Digest — \d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Mixed importance levels and multiple sources', () => {
    it('should handle mixed importance levels with multiple sources', () => {
      const items: DigestItem[] = [
        { title: 'Article 1', link: 'https://example.com/1', sourceName: 'TechCrunch', summary: 'Tech news', importance: 5 },
        { title: 'Article 2', link: 'https://example.com/2', sourceName: 'Hacker News', summary: 'HN post', importance: 4 },
        { title: 'Article 3', link: 'https://example.com/3', sourceName: 'TechCrunch', summary: 'More tech', importance: 5 },
        { title: 'Article 4', link: 'https://example.com/4', sourceName: 'Medium', summary: 'Medium post', importance: 2 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('TechCrunch');
      expect(result).toContain('Hacker News');
      expect(result).toContain('Medium');
      expect(result).toContain('## 🔴 Critical (5/5)');
      expect(result).toContain('## 🟠 High (4/5)');
      expect(result).toContain('## 🟢 Normal (2/5)');
    });
  });

  describe('Fetch error section', () => {
    it('should append fetch error section at bottom when errors provided', () => {
      const items: DigestItem[] = [
        { title: 'Article', link: 'https://example.com/1', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];
      const errors: FetchError[] = [
        { sourceName: 'Broken Feed', url: 'https://broken-url.com/feed', error: 'Connection timeout' },
        { sourceName: 'Another Source', url: 'https://another.com/feed', error: 'Invalid XML' },
      ];

      const result = formatDigest(items, errors);
      expect(result).toContain('## ⚠️ Fetch Errors');
      expect(result).toContain('**Broken Feed**: Connection timeout (https://broken-url.com/feed)');
      expect(result).toContain('**Another Source**: Invalid XML (https://another.com/feed)');
    });

    it('should not include error section when no errors provided', () => {
      const items: DigestItem[] = [
        { title: 'Article', link: 'https://example.com/1', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).not.toContain('## ⚠️ Fetch Errors');
    });
  });

  describe('Output format compliance', () => {
    it('should produce markdown with proper separators between groups', () => {
      const items: DigestItem[] = [
        { title: 'Critical', link: 'https://example.com/1', sourceName: 'Source A', summary: 'Critical item', importance: 5 },
        { title: 'High', link: 'https://example.com/2', sourceName: 'Source B', summary: 'High item', importance: 4 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('---');
    });

    it('should format source name in blockquote', () => {
      const items: DigestItem[] = [
        { title: 'Test', link: 'https://example.com/1', sourceName: 'MySource', summary: 'Test summary', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('> **Source**: MySource');
      expect(result).toContain('> Test summary');
    });

    it('should not include ANSI color codes', () => {
      const items: DigestItem[] = [
        { title: 'Test', link: 'https://example.com/1', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).not.toMatch(/\x1b\[/); // No ANSI escape sequences
    });
  });

  describe('Edge cases', () => {
    it('should handle items with special markdown characters in title', () => {
      const items: DigestItem[] = [
        { title: 'Title with [brackets] and **bold**', link: 'https://example.com/1', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('[Title with [brackets] and **bold**]');
    });

    it('should handle long summaries', () => {
      const longSummary = 'This is a very long summary that contains many words and goes on and on about various topics...'.repeat(5);
      const items: DigestItem[] = [
        { title: 'Long Summary', link: 'https://example.com/1', sourceName: 'Source', summary: longSummary, importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).toContain(longSummary);
    });

    it('should handle URLs with special characters', () => {
      const items: DigestItem[] = [
        { title: 'Test', link: 'https://example.com/article?id=123&utm_source=test#section', sourceName: 'Source', summary: 'Test', importance: 3 },
      ];

      const result = formatDigest(items);
      expect(result).toContain('[Test](https://example.com/article?id=123&utm_source=test#section)');
    });
  });
});
