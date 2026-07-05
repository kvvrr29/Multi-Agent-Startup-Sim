export const validateAIResponse = (responseText, expectedSections = [], domain = '', mandatoryKeywords = []) => {
  try {
    const data = JSON.parse(responseText);
    
    // Check if empty
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid response format: not a JSON object");
    }

    // Check for mandatory keywords across combined text
    if (mandatoryKeywords.length > 0) {
      const combinedText = Object.values(data).filter(v => typeof v === 'string').join(' ').toLowerCase();
      const hasKeyword = mandatoryKeywords.some(kw => combinedText.includes(kw.toLowerCase()));
      if (!hasKeyword) {
        console.warn(`Validation Error: Output missing mandatory domain concepts: ${mandatoryKeywords.join(', ')}`);
        // For MVP, we'll log warning instead of hard failing entirely, but let's push it as a missingSection if we want to be strict.
        // Actually, the user asked to explicitly reject highly generic outputs.
        throw new Error(`Output missing mandatory domain concepts: ${mandatoryKeywords.join(', ')}`);
      }
    }

    const validatedData = {};
    const missingSections = [];
    const isGenericSaaS = domain.toLowerCase().includes('saas') || domain.toLowerCase().includes('general');

    // Ensure all expected sections are present and not generic
    expectedSections.forEach(section => {
      if (!data[section] || typeof data[section] !== 'string' || data[section].trim().length < 50) {
        missingSections.push(section);
      } else {
        const lower = data[section].toLowerCase();
        
        // Strict Ban List for non-SaaS domains
        const hasSaaSBuzzwords = lower.includes("freemium") || lower.includes("white-label") || lower.includes("invite only beta");
        
        if (lower.includes("lorem ipsum") || lower.includes("as an ai")) {
          missingSections.push(section);
        } else if (!isGenericSaaS && hasSaaSBuzzwords && !lower.includes("specifically tailored")) {
          // Reject generic SaaS assumptions for non-SaaS domains
          console.warn(`Validation Warning: Section ${section} contained generic SaaS buzzwords for domain: ${domain}`);
          missingSections.push(section);
        } else {
          validatedData[section] = data[section];
        }
      }
    });

    if (missingSections.length > 0) {
      throw new Error(`Validation failed. Missing or invalid sections: ${missingSections.join(', ')}`);
    }

    return {
      content: validatedData,
      decisions: Array.isArray(data.decisions) ? data.decisions : []
    };

  } catch (err) {
    throw new Error(`Validation Error: ${err.message}`);
  }
};

export const createResponseSchema = (sectionKeys) => {
  const properties = {};
  sectionKeys.forEach(key => {
    properties[key] = { 
      type: "STRING", 
      description: `The markdown content for the ${key} section. Must be detailed and professional.` 
    };
  });
  
  properties.decisions = {
    type: "ARRAY",
    description: "A list of 1-3 short strings summarizing the key strategic decisions made in this response.",
    items: { type: "STRING" }
  };

  return {
    type: "OBJECT",
    properties,
    required: [...sectionKeys, "decisions"]
  };
};
