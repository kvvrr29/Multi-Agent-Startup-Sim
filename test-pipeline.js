import { runInitialSimulation } from './src/services/simulationEngine.js';
import { useProjectStore } from './src/store/useProjectStore.js';
import { useProjectMemoryStore } from './src/store/projectMemoryStore.js';
import * as aiProvider from './src/services/ai/aiProvider.js';

// Mock WebLLM to return valid JSON instantly
aiProvider.generateAIContent = async (systemPrompt, userPrompt, jsonSchema) => {
  const schemaKeys = Object.keys(jsonSchema?.properties || {});
  const dummyContent = {};
  schemaKeys.forEach(key => {
    dummyContent[key] = `Mocked AI content for ${key}`;
  });
  
  return {
    responseText: JSON.stringify(dummyContent),
    providerName: 'WebLLM'
  };
};

async function testPipeline() {
  console.log('--- STARTING MOCK GENERATION ---');
  
  const projectData = {
    name: 'Test Startup',
    idea: 'A revolutionary test project.',
    budget: '$10k',
    timeline: '3 months'
  };

  useProjectStore.setState({ 
    project: { ...projectData, aiProvider: 'webllm' },
    workflow: { active: false, currentRunId: null }
  });

  const result = await runInitialSimulation(projectData);
  
  console.log('\n--- PIPELINE COMPLETED ---');
  console.log('Status:', result?.status || 'success');
  
  const blueprint = useProjectStore.getState().blueprint;
  let totalRequested = 17; // CEO(5) + PM(6) + Dev(4) + Mkt(1) + Med(1)
  let totalSaved = 0;
  let missing = [];

  Object.entries(blueprint).forEach(([key, section]) => {
    if (section && section.content && section.content.trim().length > 0) {
      totalSaved++;
      console.log(`[VERIFIED IN STORE] ${key} -> ${section.content.substring(0, 30)}... (Source: ${section.generationSource})`);
    } else {
      if (key !== 'agentContributions') {
        missing.push(key);
      }
    }
  });

  console.log('\n--- REPORT ---');
  console.log(`Total sections requested: ${totalRequested}`);
  console.log(`Total sections generated & saved: ${totalSaved - 1}`); // excluding agentContributions
  console.log(`Missing sections: ${missing.length > 0 ? missing.join(', ') : 'None'}`);
}

testPipeline().catch(console.error);
