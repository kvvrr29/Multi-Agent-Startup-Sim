import { postInitAndCheckFieldsChatCompletion, ModelType } from '@mlc-ai/web-llm';

(async () => {
  try {
    const payload = {
      messages: [{ role: 'user', content: 'hello' }],
      response_format: {
        type: 'json_object'
        // Missing schema!
      }
    };
    
    // Test without schema (Should fail with BindingError if that was the cause, or throw an error about grammar)
    console.log("Testing WITHOUT schema:");
    try {
      postInitAndCheckFieldsChatCompletion(payload, "dummy-model", ModelType.Llama);
      console.log("Without schema: No error");
    } catch (err) {
      console.error("Without schema ERROR:", err.message);
    }

    const payload2 = {
      messages: [{ role: 'user', content: 'hello' }],
      response_format: {
        type: 'json_object',
        schema: JSON.stringify({ type: "object", properties: { test: { type: "string" } } })
      }
    };

    // Test WITH schema (Should succeed)
    console.log("\nTesting WITH schema:");
    try {
      postInitAndCheckFieldsChatCompletion(payload2, "dummy-model", ModelType.Llama);
      console.log("With schema: Success - no BindingError thrown!");
    } catch (err) {
      console.error("With schema ERROR:", err.message);
    }

  } catch (err) {
    console.error("Fatal:", err);
  }
})();
