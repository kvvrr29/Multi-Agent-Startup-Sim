import { describe, expect, it } from 'vitest';
import { GoogleGenAI } from '@google/genai';

const enabled = process.env.RUN_LIVE_AI === '1' && Boolean(process.env.GEMINI_API_KEY);
const projects = [
  ['Retail', 'A luxury wristwatch brand selling handmade mechanical watches'],
  ['FinTech', 'A financial analytics platform producing SME cash-flow forecasts'],
  ['Marketplace', 'A two-sided marketplace for industrial designers and hardware startups'],
  ['Enterprise', 'A workforce management system for factory scheduling and compliance'],
  ['HealthTech', 'A hospital management system for patients, doctors, and appointments'],
  ['Consumer', 'A meal planning app that creates grocery lists from dietary preferences'],
  ['AI platform', 'An AI platform that drafts commercial contracts for small law firms']
];

describe.skipIf(!enabled)('opt-in Gemini seven-category regression', () => {
  it('returns category-specific classification and entities sequentially', async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const outputs = [];
    for (const [expected, description] of projects) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Produce a compact multi-agent regression record for this startup: ${description}. Include domain-specific CEO, product, developer, and marketing analysis; architecture/ER/UML concepts; routes for a pricing-and-backend revision; and structured durable decisions.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              category: { type: 'STRING', enum: projects.map(([category]) => category) },
              ceoAnalysis: { type: 'STRING' },
              productAnalysis: { type: 'STRING' },
              developerAnalysis: { type: 'STRING' },
              marketingAnalysis: { type: 'STRING' },
              architectureEntities: { type: 'ARRAY', items: { type: 'STRING' } },
              umlActors: { type: 'ARRAY', items: { type: 'STRING' } },
              erEntities: { type: 'ARRAY', items: { type: 'STRING' } },
              revisionRoutes: { type: 'ARRAY', items: { type: 'STRING' } },
              decisions: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    category: { type: 'STRING' }, key: { type: 'STRING' },
                    value: { type: 'STRING' }, rationale: { type: 'STRING' }
                  },
                  required: ['category', 'key', 'value', 'rationale']
                }
              }
            },
            required: ['category', 'ceoAnalysis', 'productAnalysis', 'developerAnalysis', 'marketingAnalysis', 'architectureEntities', 'umlActors', 'erEntities', 'revisionRoutes', 'decisions']
          }
        }
      });
      const parsed = JSON.parse(response.text);
      expect(parsed.category).toBe(expected);
      ['ceoAnalysis', 'productAnalysis', 'developerAnalysis', 'marketingAnalysis'].forEach(key => expect(parsed[key].length).toBeGreaterThan(80));
      expect(parsed.architectureEntities.length).toBeGreaterThanOrEqual(3);
      expect(parsed.umlActors.length).toBeGreaterThanOrEqual(2);
      expect(parsed.erEntities.length).toBeGreaterThanOrEqual(3);
      expect(parsed.revisionRoutes.some(route => /ceo|business/i.test(route))).toBe(true);
      expect(parsed.revisionRoutes.some(route => /developer|technical/i.test(route))).toBe(true);
      expect(parsed.decisions.every(decision => ['category', 'key', 'value', 'rationale'].every(key => decision[key]))).toBe(true);
      outputs.push(JSON.stringify(parsed));
    }
    expect(new Set(outputs).size).toBe(projects.length);
  });
});
