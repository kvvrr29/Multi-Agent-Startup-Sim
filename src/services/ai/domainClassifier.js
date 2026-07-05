import { generateAIContent } from './aiProvider';
import { DOMAIN_CLASSIFIER_PROMPT } from './agentPrompts';
import { useAIDebugStore } from '../../store/useAIDebugStore';

export const classifyDomain = async (projectName, projectDescription) => {
  const systemPrompt = DOMAIN_CLASSIFIER_PROMPT;

  const userPrompt = `Project Name: ${projectName || 'Unknown'}\nProject Description: ${projectDescription || 'Unknown'}`;
  
  const schema = {
    type: "OBJECT",
    properties: {
      domain: { type: "STRING", description: "The overarching domain (e.g., FinTech, HealthTech, EdTech, E-Commerce, Retail)" },
      industry: { type: "STRING", description: "The specific industry (e.g., Banking, Healthcare, Luxury Retail)" },
      project_type: { type: "STRING", description: "The structural type (e.g., Enterprise Software, Marketplace, Retail Brand)" },
      business_model: { type: "STRING", description: "The core business model (e.g., B2B SaaS, Commission, Product Sales)" },
      complexity: { type: "STRING", description: "Estimated technical complexity (Low, Medium, High, Extreme)" },
      mandatory_entities: { 
        type: "ARRAY", 
        description: "3 to 5 core entities or nouns that MUST be present in any architecture or roadmap for this project.",
        items: { type: "STRING" }
      },
      reasoning: { type: "STRING", description: "Brief justification for why this specific domain and business model were chosen over generic SaaS." },
      confidence: { type: "INTEGER", description: "Confidence score from 0 to 100 based on how clear the description is." }
    },
    required: ["domain", "industry", "project_type", "business_model", "complexity", "mandatory_entities", "reasoning", "confidence"]
  };

  let attempts = 0;
  const maxAttempts = 2;
  const { setSource, pushLog } = useAIDebugStore.getState();

  while (attempts < maxAttempts) {
    let rawResponse = null;
    let parsed = null;
    try {
      attempts++;
      rawResponse = await generateAIContent(systemPrompt, userPrompt, schema);
      parsed = JSON.parse(rawResponse);
      
      const isSoftwareDomain = parsed.domain.toLowerCase().includes('software') || parsed.industry.toLowerCase().includes('software');
      const descLower = (projectDescription || '').toLowerCase();
      const hasPhysicalKeywords = descLower.includes('physical') || descLower.includes('retail') || descLower.includes('watch') || descLower.includes('clothing') || descLower.includes('food') || descLower.includes('restaurant');
      
      if (isSoftwareDomain && hasPhysicalKeywords) {
        const reason = 'Validation Failed: Classified physical business as Software.';
        pushLog({ agent: 'domain', prompt: userPrompt, rawResponse, parsedJson: parsed, validationResult: 'FAILED', fallbackReason: reason });
        throw new Error(reason);
      }

      if (parsed.confidence < 80 && attempts < maxAttempts) {
        const reason = `Confidence too low (${parsed.confidence}%), retrying...`;
        pushLog({ agent: 'domain', prompt: userPrompt, rawResponse, parsedJson: parsed, validationResult: 'LOW_CONFIDENCE', fallbackReason: reason });
        throw new Error(reason);
      }

      pushLog({ agent: 'domain', prompt: userPrompt, rawResponse, parsedJson: parsed, validationResult: 'PASSED', fallbackReason: null });
      setSource('domain', 'Gemini');
      return parsed;
    } catch (err) {
      console.warn(`[Domain Classifier] Attempt ${attempts} failed:`, err.message);
      if (attempts >= maxAttempts) {
        const fallbackReason = err.message || 'Unknown error';
        pushLog({ agent: 'domain', prompt: userPrompt, rawResponse, parsedJson: parsed, validationResult: 'FALLBACK', fallbackReason });
        setSource('domain', 'Fallback');
        // Surface a visible error — do NOT silently return generic data
        throw new Error(`[Domain Classifier] All attempts failed. Last reason: ${fallbackReason}`);
      }
    }
  }
};
