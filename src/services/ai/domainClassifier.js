import { generateAIContent } from './aiProvider';
import { DOMAIN_CLASSIFIER_PROMPT } from './agentPrompts';
import { useAIDebugStore } from '../../store/useAIDebugStore';

export const classifyDomain = async (projectName, projectDescription) => {
  console.log('[DomainClassifier] Started');
  const systemPrompt = DOMAIN_CLASSIFIER_PROMPT;

  // We use plain text for the classifier to avoid heavy JSON grammar constraints.
  const userPrompt = `Project Name: ${projectName || 'Unknown'}\nProject Description: ${projectDescription || 'Unknown'}\n\nTask: Provide ONLY a 1 to 3 word domain classification for this project (e.g. FinTech, B2B SaaS, HealthTech). Do NOT use JSON, markdown, or any surrounding text.`;

  let attempts = 0;
  const maxAttempts = 2;
  const { setSource, pushLog } = useAIDebugStore.getState();

  while (attempts < maxAttempts) {
    let rawResponse = null;
    let parsed = null;
    try {
      attempts++;
      console.log(`[DomainClassifier] Calling AI Provider (Attempt ${attempts})`);
      // Pass null for schema to skip JSON generation
      const aiResult = await generateAIContent(systemPrompt, userPrompt, null);
      rawResponse = aiResult.responseText;
      const actualProvider = aiResult.providerName;
      console.log('[DomainClassifier] Raw response received:', typeof rawResponse, rawResponse);
      
      const text = rawResponse.replace(/["'{}]/g, '').trim();
      parsed = {
        domain: text,
        industry: text,
        project_type: text,
        business_model: 'Standard',
        complexity: 'Medium',
        mandatory_entities: [],
        reasoning: 'Derived from plain text classification.',
        confidence: 90
      };
      
      console.log('[DomainClassifier] Parsing successful, domain:', parsed.domain);
      
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
      setSource('domain', actualProvider);
      console.log('[DomainClassifier] Completed');
      return parsed;
    } catch (err) {
      console.warn(`[DomainClassifier] Attempt ${attempts} failed:`, err.message);
      if (attempts >= maxAttempts) {
        const fallbackReason = err.message || 'Unknown error';
        pushLog({ agent: 'domain', prompt: userPrompt, rawResponse, parsedJson: parsed, validationResult: 'FALLBACK', fallbackReason });
        setSource('domain', 'Fallback');
        console.error(`[Domain Classifier] All attempts failed. Last reason: ${fallbackReason}. Defaulting to General domain.`);
        return {
          domain: 'General',
          industry: 'General',
          project_type: 'General',
          business_model: 'Standard',
          complexity: 'Medium',
          mandatory_entities: [],
          reasoning: 'Fallback classification due to AI failure.',
          confidence: 0
        };
      }
    }
  }
};
