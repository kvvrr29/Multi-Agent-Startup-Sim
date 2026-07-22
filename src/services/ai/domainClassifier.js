import { useAIDebugStore } from '../../store/useAIDebugStore';

/**
 * Domain classification via keyword heuristics — ZERO API calls.
 *
 * We intentionally do NOT call the AI for this step because:
 *  1. It consumes one of the 5 free-tier requests per minute before CEO even starts.
 *  2. It is called on every run and every retry, compounding quota exhaustion.
 *  3. A simple keyword scan is accurate enough for routing and validation context.
 *
 * If you need AI-powered domain detection in the future, gate it behind a
 * "high-confidence mode" flag and only call when the heuristic confidence < 60%.
 */

const DOMAIN_RULES = [
  { keywords: ['fintech', 'finance', 'banking', 'payment', 'investment', 'trading', 'crypto', 'wallet', 'loan', 'insurance', 'accounting', 'budget', 'expense', 'tax', 'financial'], domain: 'FinTech', industry: 'Financial Services' },
  { keywords: ['health', 'medical', 'clinic', 'hospital', 'doctor', 'patient', 'pharmacy', 'wellness', 'mental health', 'therapy', 'telemedicine', 'diagnostic', 'drug', 'prescription'], domain: 'HealthTech', industry: 'Healthcare' },
  { keywords: ['education', 'learning', 'course', 'tutor', 'school', 'student', 'teacher', 'e-learning', 'edtech', 'training', 'certification', 'quiz', 'lesson', 'curriculum'], domain: 'EdTech', industry: 'Education' },
  { keywords: ['ecommerce', 'e-commerce', 'shop', 'store', 'marketplace', 'retail', 'cart', 'checkout', 'product', 'inventory', 'order', 'fulfillment', 'delivery', 'purchase'], domain: 'eCommerce', industry: 'Retail' },
  { keywords: ['food', 'restaurant', 'recipe', 'meal', 'delivery', 'catering', 'grocery', 'dining', 'kitchen', 'chef', 'nutrition', 'diet'], domain: 'FoodTech', industry: 'Food & Beverage' },
  { keywords: ['real estate', 'property', 'rent', 'mortgage', 'lease', 'apartment', 'house', 'listing', 'landlord', 'tenant', 'realty'], domain: 'PropTech', industry: 'Real Estate' },
  { keywords: ['travel', 'hotel', 'flight', 'booking', 'trip', 'tourism', 'airbnb', 'vacation', 'itinerary', 'transport', 'ride', 'taxi', 'uber'], domain: 'TravelTech', industry: 'Travel & Hospitality' },
  { keywords: ['hr', 'human resource', 'recruitment', 'hiring', 'payroll', 'employee', 'talent', 'onboarding', 'workforce', 'staffing', 'job board'], domain: 'HRTech', industry: 'Human Resources' },
  { keywords: ['marketing', 'advertising', 'campaign', 'seo', 'social media', 'crm', 'lead', 'analytics', 'brand', 'content', 'influencer', 'email marketing'], domain: 'MarTech', industry: 'Marketing' },
  { keywords: ['supply chain', 'logistics', 'warehouse', 'shipping', 'freight', 'procurement', 'inventory management', 'manufacturing'], domain: 'Supply Chain Tech', industry: 'Logistics' },
  { keywords: ['legal', 'law', 'contract', 'compliance', 'lawyer', 'court', 'regulation', 'policy', 'attorney', 'litigation'], domain: 'LegalTech', industry: 'Legal' },
  { keywords: ['agriculture', 'farm', 'crop', 'livestock', 'agri', 'irrigation', 'harvest', 'soil', 'fertilizer'], domain: 'AgriTech', industry: 'Agriculture' },
  { keywords: ['gaming', 'game', 'esport', 'metaverse', 'virtual reality', 'augmented reality', 'vr', 'ar', 'nft', 'play-to-earn'], domain: 'Gaming & Metaverse', industry: 'Entertainment' },
  { keywords: ['social', 'community', 'network', 'messaging', 'chat', 'forum', 'dating', 'connect', 'friend', 'share', 'post', 'follow'], domain: 'Social Platform', industry: 'Social Media' },
  { keywords: ['security', 'cybersecurity', 'firewall', 'encryption', 'authentication', 'identity', 'privacy', 'threat', 'vulnerability', 'compliance'], domain: 'CyberSecurity', industry: 'Information Security' },
  { keywords: ['ai', 'machine learning', 'deep learning', 'nlp', 'computer vision', 'automation', 'robot', 'model', 'llm', 'chatbot', 'generative'], domain: 'AI & ML Platform', industry: 'Artificial Intelligence' },
  { keywords: ['cloud', 'devops', 'infrastructure', 'saas', 'api', 'microservice', 'kubernetes', 'docker', 'serverless', 'platform', 'b2b'], domain: 'B2B SaaS', industry: 'Enterprise Software' },
  { keywords: ['iot', 'smart home', 'sensor', 'device', 'wearable', 'embedded', 'firmware', 'raspberry', 'arduino', 'hardware'], domain: 'IoT & Hardware', industry: 'Internet of Things' },
  { keywords: ['media', 'streaming', 'video', 'music', 'podcast', 'content', 'entertainment', 'subscription', 'ott', 'news'], domain: 'Media & Entertainment', industry: 'Media' },
];

const scoreText = (text, keywords) => {
  const lower = text.toLowerCase();
  return keywords.reduce((score, kw) => score + (lower.includes(kw) ? 1 : 0), 0);
};

export const classifyDomain = async (projectName, projectDescription) => {
  console.log('[DomainClassifier] Started (heuristic mode — no API call)');
  const { setSource, pushLog } = useAIDebugStore.getState();

  const combined = `${projectName || ''} ${projectDescription || ''}`;

  let bestMatch = null;
  let bestScore = 0;

  for (const rule of DOMAIN_RULES) {
    const score = scoreText(combined, rule.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  const confidence = bestMatch && bestScore > 0
    ? Math.min(95, 60 + bestScore * 10)
    : 0;

  const result = bestMatch && bestScore > 0
    ? {
        domain: bestMatch.domain,
        industry: bestMatch.industry,
        project_type: bestMatch.domain,
        business_model: 'Standard',
        complexity: 'Medium',
        mandatory_entities: bestMatch.keywords.slice(0, 5),
        reasoning: `Keyword heuristic matched ${bestScore} term(s): ${bestMatch.keywords.slice(0, 3).join(', ')}.`,
        confidence,
      }
    : {
        domain: 'General',
        industry: 'General',
        project_type: 'General',
        business_model: 'Standard',
        complexity: 'Medium',
        mandatory_entities: [],
        reasoning: 'No strong domain keywords found. Defaulting to General.',
        confidence: 0,
      };

  console.log(`[DomainClassifier] Classified as: ${result.domain} (confidence: ${result.confidence}%)`);
  pushLog({
    agent: 'domain',
    prompt: combined.slice(0, 400),
    rawResponse: result.domain,
    parsedJson: result,
    validationResult: 'PASSED',
    fallbackReason: null,
  });
  setSource('domain', 'Heuristic (no API)');

  return result;
};
