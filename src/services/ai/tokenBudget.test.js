import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { WebLLMProvider } from './WebLLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { SECTION_MAX_TOKENS, getProviderProfile, getSectionMaxTokens } from './providerProfiles';
import { modelManager } from './ModelManager';
import { useSettingsStore } from '../../store/useSettingsStore';

/** Minimal stand-in for the streamed chat completion API. */
const fakeEngine = (chunks) => ({
  chat: { completions: { create: vi.fn().mockResolvedValue({
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; }
  }) } }
});

const contentChunk = (text, finish = null) => ({
  choices: [{ delta: { content: text }, finish_reason: finish }]
});

describe('WebLLM honours the caller token budget', () => {
  let provider;

  beforeEach(() => {
    provider = new WebLLMProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the requested budget through to the engine', async () => {
    const engine = fakeEngine([contentChunk('{"a":1}', 'stop')]);
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    await provider.generate({ systemPrompt: 's', userPrompt: 'u', maxTokens: 800 });

    expect(engine.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 800 })
    );
  });

  it('falls back to the default only when no budget is supplied', async () => {
    const engine = fakeEngine([contentChunk('{"a":1}', 'stop')]);
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    await provider.generate({ systemPrompt: 's', userPrompt: 'u' });

    // Read from the profile rather than repeated here, so the provider default
    // and the profile cannot drift apart without a test noticing.
    expect(engine.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: getProviderProfile('webllm').maxTokens })
    );
  });

  it('reports truncation distinctly instead of returning unparseable JSON', async () => {
    // finish_reason 'length' == the budget cut generation off mid-object.
    const engine = fakeEngine([contentChunk('{"executiveSummary":"an unterminated str', 'length')]);
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', maxTokens: 20 })
    ).rejects.toMatchObject({ isTruncated: true });
  });

  it('does not flag a normally-completed response as truncated', async () => {
    const engine = fakeEngine([contentChunk('{"a":1}', 'stop')]);
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', maxTokens: 800 })
    ).resolves.toBe('{"a":1}');
  });
});

describe('cloud providers are uncapped', () => {
  afterEach(() => {
    useSettingsStore.setState({ openaiApiKey: '' });
  });

  it('omits max_tokens entirely when no budget is given', async () => {
    useSettingsStore.setState({ openaiApiKey: 'sk-test' });
    const provider = new OpenAIProvider();
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"a":1}' } }] });
    vi.spyOn(provider, 'initialize').mockImplementation(async () => {
      provider.client = { chat: { completions: { create } } };
    });

    await provider.generate({ systemPrompt: 's', userPrompt: 'u' });

    expect(create.mock.calls[0][0]).not.toHaveProperty('max_tokens');
  });

  it('gives cloud profiles no per-section budget at all', () => {
    const cloud = getProviderProfile('gemini');
    expect(getSectionMaxTokens('executiveSummary', cloud)).toBeNull();
    expect(getSectionMaxTokens('architecture', getProviderProfile('openai'))).toBeNull();
  });
});

describe('section budgets leave headroom', () => {
  it('never budgets a section so tightly that truncation is likely', () => {
    // Truncated JSON is unrecoverable, so every section needs real headroom.
    for (const [section, budget] of Object.entries(SECTION_MAX_TOKENS)) {
      expect(budget, `${section} budget is too tight`).toBeGreaterThanOrEqual(700);
    }
  });

  it('gives the local model a budget for every section it can be asked for', () => {
    const local = getProviderProfile('webllm');
    for (const section of Object.keys(SECTION_MAX_TOKENS)) {
      expect(getSectionMaxTokens(section, local)).toBe(SECTION_MAX_TOKENS[section]);
    }
  });
});

describe('generation is actually stopped, not just abandoned', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('interrupts the engine when the timeout fires', async () => {
    vi.useFakeTimers();
    const interruptGenerate = vi.fn().mockResolvedValue(undefined);
    // A stream that never yields — the decode loop would otherwise run forever.
    const engine = {
      interruptGenerate,
      chat: { completions: { create: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) })
      }) } }
    };
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    const provider = new WebLLMProvider();
    const pending = provider.generate({ systemPrompt: 's', userPrompt: 'u', maxTokens: 700 });
    const assertion = expect(pending).rejects.toThrow(/timed out/);

    // 30s of load and prefill allowance plus 100ms per requested token.
    await vi.advanceTimersByTimeAsync(100_000);
    await assertion;

    expect(interruptGenerate).toHaveBeenCalled();
  });

  it('scales the timeout with the token budget so a long answer is not cut off', async () => {
    vi.useFakeTimers();
    const interruptGenerate = vi.fn().mockResolvedValue(undefined);
    const engine = {
      interruptGenerate,
      chat: { completions: { create: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) })
      }) } }
    };
    vi.spyOn(modelManager, 'initialize').mockResolvedValue(engine);

    const provider = new WebLLMProvider();
    const pending = provider.generate({ systemPrompt: 's', userPrompt: 'u', maxTokens: 1400 });
    const assertion = expect(pending).rejects.toThrow(/timed out/);

    // The old flat 60s ceiling sat below the time a 1400-token answer needs on
    // modest hardware, so raising the section budgets would have turned normal
    // long output into a timeout.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(interruptGenerate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(80_000);
    await assertion;
    expect(interruptGenerate).toHaveBeenCalled();
  });

  it('cancel() interrupts the running engine', () => {
    const interruptGenerate = vi.fn();
    const provider = new WebLLMProvider();
    provider._activeEngine = { interruptGenerate };

    provider.cancel();

    expect(interruptGenerate).toHaveBeenCalled();
  });

  it('cancel() is safe when nothing is running', () => {
    vi.spyOn(modelManager, 'engine', 'get').mockReturnValue(undefined);
    expect(() => new WebLLMProvider().cancel()).not.toThrow();
  });
});
