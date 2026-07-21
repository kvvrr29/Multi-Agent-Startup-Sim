import { CreateMLCEngine, hasModelInCache, deleteModelAllInfoInCache } from '@mlc-ai/web-llm';
import { useSettingsStore } from '../../store/useSettingsStore';

// Recommended sub-500MB model for Startup Simulator
const DEFAULT_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

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
      isInstalled: this.status === 'ready'
    };
  }

  async isInstalled() {
    return await hasModelInCache(this.modelId);
  }
  async initialize() {
    console.log(`[ModelManager] initialize() called. Current status: ${this.status}`);
    if (this.status === 'ready' && this.engine) {
      console.log(`[ModelManager] initialize() returning existing engine (status: ready).`);
      return this.engine;
    }
    if (this.status === 'downloading') {
      console.log(`[ModelManager] initialize() - already downloading, waiting for promise...`);
      // Wait for existing initialization to finish
      return new Promise((resolve, reject) => {
        const unsubscribe = this.subscribe((state) => {
          if (state.status === 'ready') {
            console.log(`[ModelManager] initialize() - previous download finished, returning engine.`);
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
          this.progress = info;
          if (import.meta.env.DEV && !hasCached) {
            console.log(`[Diagnostic Download] Progress: ${Math.round(info.progress * 100)}% | ${info.text}`);
          }
          this._notify();
        }
      });
      this.engine._debug_id = Date.now();
      console.log(`[ModelManager] CreateMLCEngine returned. Engine identity: ${this.engine._debug_id}`);
      
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
      await deleteModelAllInfoInCache(this.modelId);
      this.status = 'uninitialized';
      this.engine = null;
      this._notify();
    } catch (err) {
      console.error('[ModelManager] Failed to remove model:', err);
    }
  }
}

export const modelManager = new ModelManager();
