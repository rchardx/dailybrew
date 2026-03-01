import { describe, it, expect } from 'vitest'
import { buildUserPrompt, buildFallbackUserPrompt, getSystemPrompt } from '../../src/llm/prompt'

describe('LLM Prompt Templates', () => {
  describe('getSystemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      const prompt = getSystemPrompt()

      expect(prompt).toBeTruthy()
      expect(prompt.length).toBeGreaterThan(0)
    })

    it('should contain instructions about importance rating', () => {
      const prompt = getSystemPrompt()

      expect(prompt).toContain('importance')
      expect(prompt).toContain('1')
      expect(prompt).toContain('5')
    })

    it('should contain instructions about summary', () => {
      const prompt = getSystemPrompt()

      expect(prompt).toContain('summary')
    })

    it('should contain instructions about title', () => {
      const prompt = getSystemPrompt()

      expect(prompt).toContain('title')
    })

    it('should instruct to respond in same language as content', () => {
      const prompt = getSystemPrompt()

      expect(prompt).toContain('SAME LANGUAGE')
    })
  })

  describe('buildUserPrompt', () => {
    it('should include source name and content', () => {
      const prompt = buildUserPrompt('TechCrunch', 'Article about AI breakthroughs')

      expect(prompt).toContain('TechCrunch')
      expect(prompt).toContain('Article about AI breakthroughs')
    })

    it('should format with Source: prefix', () => {
      const prompt = buildUserPrompt('HN', 'Some content')

      expect(prompt).toContain('Source: HN')
    })

    it('should include Content: section', () => {
      const prompt = buildUserPrompt('Blog', 'My blog post content')

      expect(prompt).toContain('Content:')
      expect(prompt).toContain('My blog post content')
    })

    it('should handle empty content', () => {
      const prompt = buildUserPrompt('Source', '')

      expect(prompt).toContain('Source: Source')
      expect(prompt).toContain('Content:')
    })

    it('should handle special characters in content', () => {
      const prompt = buildUserPrompt('Feed', 'Content with "quotes" & <tags>')

      expect(prompt).toContain('"quotes"')
      expect(prompt).toContain('& <tags>')
    })
  })

  describe('buildFallbackUserPrompt', () => {
    it('should include source name and content', () => {
      const prompt = buildFallbackUserPrompt('TechCrunch', 'AI article')

      expect(prompt).toContain('TechCrunch')
      expect(prompt).toContain('AI article')
    })

    it('should include JSON format instructions', () => {
      const prompt = buildFallbackUserPrompt('Source', 'Content')

      expect(prompt).toContain('JSON')
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('"summary"')
      expect(prompt).toContain('"importance"')
    })

    it('should instruct to respond with valid JSON only', () => {
      const prompt = buildFallbackUserPrompt('Source', 'Content')

      expect(prompt).toContain('valid JSON')
    })

    it('should instruct no markdown or code fences', () => {
      const prompt = buildFallbackUserPrompt('Source', 'Content')

      expect(prompt).toContain('no markdown')
      expect(prompt).toContain('no code fences')
    })

    it('should contain importance range 1-5', () => {
      const prompt = buildFallbackUserPrompt('Source', 'Content')

      expect(prompt).toContain('1-5')
    })
  })

  describe('prompt consistency', () => {
    it('should return same system prompt on repeated calls', () => {
      const prompt1 = getSystemPrompt()
      const prompt2 = getSystemPrompt()

      expect(prompt1).toBe(prompt2)
    })

    it('should produce different user prompts for different sources', () => {
      const prompt1 = buildUserPrompt('Source A', 'Content')
      const prompt2 = buildUserPrompt('Source B', 'Content')

      expect(prompt1).not.toBe(prompt2)
    })

    it('should produce different fallback prompts for different content', () => {
      const prompt1 = buildFallbackUserPrompt('Source', 'Content A')
      const prompt2 = buildFallbackUserPrompt('Source', 'Content B')

      expect(prompt1).not.toBe(prompt2)
    })
  })
})
