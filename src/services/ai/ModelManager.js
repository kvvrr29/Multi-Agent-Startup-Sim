import { LOCAL_CONTEXT_WINDOW } from './providerProfiles';

// web-llm is several megabytes of WASM glue. Loading it on demand keeps it out
// of the main bundle for everyone who never selects the built-in provider.
const loadWebLLM = () => import('@mlc-ai/web-llm');

// ~828 MiB to download once, ~1630MB of VRAM for the weights.
//
// f16 and f32 are the same download and the same model: both carry the same
// 736 MiB of 4-bit weights at the same group size, so the quantization error
// is identical and neither writes better prose than the other. What differs is
// only the precision of the arithmetic around them, and f16 wins on every
// practical axis here — faster compute, and a KV cache at 28 KiB per token
// instead of 56, which halves the cost of the 8192 window.
//
// The one thing f32 buys is reach: f16 requires the WebGPU `shader-f16`
// extension and throws at load without it. Switch back if a target machine's
// browser does not expose it.
const DEFAULT_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// web-llm's progress text is "Fetching param cache[3/8]: 96MB fetched. 35%
// completed, 56 secs elapsed. It can take a while…". The percentage has its own
// readout and the trailing advice is written for a demo page, so keep only the
// leading shard/size clause.
const shortenProgressText = (text = '') =>
  text.replace(/\s*\d+% completed.*$/s, '').trim();

const logDiagnostic = (section, data) => {
  if (!import.meta.env.DEV) return;
  console.log(`\n==============================\n${section}\n==============================`);
  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      console.log(`• ${key}: ${value}`);
    });
  }
};

class ModelManager {
  constructor() {
    this.engine = null;
    this.modelId = DEFAULT_MODEL;
    this.progress = { text: '', progress: 0, loaded: 0, total: 0 };
    this.status = 'uninitialized'; // 'uninitialized', 'downloading', 'ready', 'error'
    this.listeners = new Set();
    // Bumped whenever the on-disk cache changes. Subscribers key their
    // hasModelInCache() lookup off this, because deleting a cached-but-unloaded
    // model leaves `status` untouched and the UI claiming it is installed.
    this.cacheEpoch = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  _notify() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  getState() {
    return {
      status: this.status,
      progress: this.progress,
      modelId: this.modelId,
      cacheEpoch: this.cacheEpoch,
      isInstalled: this.status === 'ready'
    };
  }

  async isInstalled() {
    const { hasModelInCache } = await loadWebLLM();
    return await hasModelInCache(this.modelId);
  }
  async initialize() {
    if (this.status === 'ready' && this.engine) return this.engine;
    if (this.status === 'downloading') {
      // Wait for existing initialization to finish
      return new Promise((resolve, reject) => {
        const unsubscribe = this.subscribe((state) => {
          if (state.status === 'ready') {
            unsubscribe();
            resolve(this.engine);
          } else if (state.status === 'error') {
            unsubscribe();
            reject(new Error('Model initialization failed'));
          }
        });
      });
    }

    this.status = 'downloading';
    this._notify();

    let hasCached = false;
    let t0 = performance.now();

    try {
      const { CreateMLCEngine, hasModelInCache } = await loadWebLLM();
      hasCached = await hasModelInCache(this.modelId);
      
      logDiagnostic('MODEL INITIALIZATION', {
        'Selected provider': 'WebLLM',
        'Browser': navigator.userAgent,
        'WebGPU supported': !!navigator.gpu,
        'Selected model': this.modelId
      });

      if (hasCached) {
        logDiagnostic('CACHE', {
          'Cached model found': true,
          'Loading cached model': this.modelId
        });
      } else {
        logDiagnostic('DOWNLOAD', {
          'Download started': this.modelId
        });
      }

      logDiagnostic('INITIALIZATION', {
        'Engine initialization started': new Date().toISOString()
      });
      this.engine = await CreateMLCEngine(this.modelId, {
        initProgressCallback: (info) => {
          this.progress = { ...info, text: shortenProgressText(info.text) };
          if (import.meta.env.DEV && !hasCached) {
            console.log(`[Diagnostic Download] Progress: ${Math.round(info.progress * 100)}% | ${info.text}`);
          }
          this._notify();
        }
      }, { context_window_size: LOCAL_CONTEXT_WINDOW });
      const t1 = performance.now();
      
      if (!hasCached) {
        logDiagnostic('DOWNLOAD', {
          'Download completed': true
        });
      }

      logDiagnostic('INITIALIZATION', {
        'Engine initialization completed': new Date().toISOString(),
        'Initialization time (ms)': Math.round(t1 - t0)
      });

      this.status = 'ready';
      this._notify();
      return this.engine;
    } catch (err) {
      logDiagnostic('ERRORS', {
        'Stage where it failed': 'Initialization',
        'Complete error object': err.toString(),
        'Stack trace': err.stack,
        'User-friendly UI message': 'Built-in AI is unavailable on this browser.'
      });
      console.error('[ModelManager] Failed to initialize WebLLM:', err);
      this.status = 'error';
      this.progress = { text: err.message, progress: 0 };
      this._notify();
      throw err;
    }
  }

  async removeModel() {
    try {
      const { deleteModelAllInfoInCache } = await loadWebLLM();
      // Free the GPU buffers first. Dropping the reference alone leaves the
      // weights in VRAM until GC gets around to it, so a user who removes the
      // model after generating keeps paying for it until the page reloads.
      if (this.engine) {
        try {
          await this.engine.unload();
        } catch (err) {
          console.warn('[ModelManager] Engine unload failed; continuing with cache delete:', err);
        }
      }
      this.engine = null;
      await deleteModelAllInfoInCache(this.modelId);
      this.status = 'uninitialized';
      this.cacheEpoch++;
      this._notify();
    } catch (err) {
      console.error('[ModelManager] Failed to remove model:', err);
      this.status = 'error';
      this.progress = { text: `Could not remove the model: ${err.message}`, progress: 0 };
      this._notify();
      throw err;
    }
  }
}

export const modelManager = new ModelManager();
