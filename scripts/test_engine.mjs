// Polyfill for Node environment
globalThis.location = { origin: "http://localhost" };
globalThis.navigator = { gpu: null }; // Will gracefully fallback or just fail differently

import { CreateMLCEngine } from '@mlc-ai/web-llm';

(async () => {
  try {
    console.log("Starting engine creation...");
    const engine = await CreateMLCEngine("Qwen2.5-0.5B-Instruct-q4f16_1-MLC", {
      initProgressCallback: (info) => console.log(info.text)
    });
    
    console.log("Engine created. Type of engine:", typeof engine);
    
    console.log("Calling chat completion...");
    const payload = {
      model: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", // try with and without
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }]
    };
    console.log("Payload:", payload);
    const reply = await engine.chat.completions.create(payload);
    
    console.log("Reply:", reply);
  } catch (err) {
    console.error("Fatal:", err.message);
  }
})();
