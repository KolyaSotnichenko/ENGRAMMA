'use client';

import { useState, useEffect } from 'react';

type SettingInfo = {
  category: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'password' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
};

const SETTING_METADATA: Record<string, SettingInfo> = {
  ENGRAMMA_PORT: {
    category: 'Server',
    label: 'API Port',
    description: 'Port number for the backend server',
    type: 'number',
    placeholder: '8080',
  },
  ENGRAMMA_API_KEY: {
    category: 'Server',
    label: 'API Key',
    description:
      'Secret key for API authentication. Generate with: openssl rand -base64 32. Leave empty to disable auth (dev only)',
    type: 'password',
    placeholder: 'your-secret-api-key-here',
  },
  ENGRAMMA_RATE_LIMIT_ENABLED: {
    category: 'Server',
    label: 'Rate Limiting',
    description: 'Enable rate limiting to prevent abuse',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_RATE_LIMIT_WINDOW_MS: {
    category: 'Server',
    label: 'Rate Limit Window (ms)',
    description: 'Time window in milliseconds (default: 60000 = 1 minute)',
    type: 'number',
    placeholder: '60000',
  },
  ENGRAMMA_RATE_LIMIT_MAX_REQUESTS: {
    category: 'Server',
    label: 'Max Requests per Window',
    description:
      'Maximum requests allowed per time window (default: 100 requests/min)',
    type: 'number',
    placeholder: '100',
  },
  OM_LOG_AUTH: {
    category: 'Server',
    label: 'Log Authentication',
    description: 'Log all authenticated requests (useful for debugging)',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_MODE: {
    category: 'Server',
    label: 'Server Mode',
    description: 'Operating mode: standard (default) or langgraph',
    type: 'select',
    options: ['standard', 'langgraph'],
  },

  ENGRAMMA_DB_PATH: {
    category: 'Database',
    label: 'SQLite Database Path',
    description: 'File path for SQLite database',
    type: 'text',
    placeholder: './data/authfymemory.sqlite',
  },

  ENGRAMMA_EMBEDDINGS: {
    category: 'Embeddings',
    label: 'Embedding Provider',
    description:
      'AI provider for generating embeddings (used in SMART/DEEP tiers)',
    type: 'select',
    options: ['openai', 'gemini', 'ollama', 'local', 'synthetic'],
  },

  ENGRAMMA_EMBED_MODE: {
    category: 'Embeddings',
    label: 'Embedding Mode',
    description:
      'simple: 1 unified batch (faster, recommended) | advanced: 5 separate sector calls (higher precision)',
    type: 'select',
    options: ['simple', 'advanced'],
  },
  ENGRAMMA_ADV_EMBED_PARALLEL: {
    category: 'Embeddings',
    label: 'Parallel Embeddings',
    description:
      'Enable parallel embedding (not recommended for Gemini due to rate limits)',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_EMBED_DELAY_MS: {
    category: 'Embeddings',
    label: 'Embed Delay (ms)',
    description: 'Delay between embeddings in advanced mode',
    type: 'number',
    placeholder: '200',
  },
  ENGRAMMA_OPENAI_BASE_URL: {
    category: 'Embeddings',
    label: 'OpenAI Base URL',
    description: 'Custom OpenAI-compatible API endpoint',
    type: 'text',
    placeholder: 'https://api.openai.com/v1',
  },
  ENGRAMMA_OPENAI_MODEL: {
    category: 'Embeddings',
    label: 'OpenAI Model Override',
    description: 'Override default embedding model for all sectors',
    type: 'text',
    placeholder: 'text-embedding-3-small',
  },
  ENGRAMMA_MAX_PAYLOAD_SIZE: {
    category: 'Embeddings',
    label: 'Max Payload Size (bytes)',
    description: 'Maximum request body size',
    type: 'number',
    placeholder: '1000000',
  },
  OPENAI_API_KEY: {
    category: 'API Keys',
    label: 'OpenAI API Key',
    description: 'API key for OpenAI embeddings',
    type: 'password',
    placeholder: 'sk-...',
  },

  ENGRAMMA_TIER: {
    category: 'Performance',
    label: 'Performance Tier',
    description:
      'HYBRID: 100% accuracy keyword matching | FAST: 256-dim synthetic (70-75% recall) | SMART: 384-dim hybrid (85% recall) | DEEP: 1536-dim full AI (95-100% recall). Must be set manually',
    type: 'select',
    options: ['hybrid', 'fast', 'smart', 'deep'],
  },
  ENGRAMMA_KEYWORD_BOOST: {
    category: 'Performance',
    label: 'Keyword Boost (HYBRID)',
    description:
      'Multiplier for keyword match scores in HYBRID tier (default: 2.5)',
    type: 'number',
    placeholder: '2.5',
  },
  ENGRAMMA_KEYWORD_MIN_LENGTH: {
    category: 'Performance',
    label: 'Min Keyword Length (HYBRID)',
    description:
      'Minimum length for keyword matching in HYBRID tier (default: 3)',
    type: 'number',
    placeholder: '3',
  },

  ENGRAMMA_DECAY_INTERVAL_MINUTES: {
    category: 'Memory',
    label: 'Decay Interval (min)',
    description:
      'Minutes between decay cycles (recommended: 120-180 for production)',
    type: 'number',
    placeholder: '120',
  },
  ENGRAMMA_DECAY_THREADS: {
    category: 'Memory',
    label: 'Decay Threads',
    description: 'Number of parallel decay worker threads',
    type: 'number',
    placeholder: '3',
  },
  ENGRAMMA_DECAY_COLD_THRESHOLD: {
    category: 'Memory',
    label: 'Cold Threshold',
    description: 'Memories below this salience get fingerprinted (0-1)',
    type: 'number',
    placeholder: '0.25',
  },
  ENGRAMMA_DECAY_REINFORCE_ON_QUERY: {
    category: 'Memory',
    label: 'Reinforce on Query',
    description: 'Boost memory salience when accessed',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_REGENERATION_ENABLED: {
    category: 'Memory',
    label: 'Regeneration Enabled',
    description: 'Restore cold memories when queried',
    type: 'select',
    options: ['true', 'false'],
  },

  ENGRAMMA_USE_SUMMARY_ONLY: {
    category: 'Memory',
    label: 'Summary-Only Storage',
    description: 'Store only summaries (≤300 chars) to save space',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_SUMMARY_MAX_LENGTH: {
    category: 'Memory',
    label: 'Max Summary Length',
    description: 'Maximum characters in memory summaries',
    type: 'number',
    placeholder: '300',
  },
  ENGRAMMA_SEG_SIZE: {
    category: 'Memory',
    label: 'Segment Size',
    description: 'Memories per segment (10k recommended for optimal cache)',
    type: 'number',
    placeholder: '10000',
  },

  ENGRAMMA_MAX_ACTIVE: {
    category: 'Memory',
    label: 'Max Active Queries',
    description:
      'Auto-tuned by tier (FAST: 32, SMART: 64, DEEP: 128). Override if needed',
    type: 'number',
  },
  ENGRAMMA_AUTO_REFLECT: {
    category: 'Features',
    label: 'Auto-Reflection',
    description:
      'Automatically create reflective memories by clustering similar memories',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_REFLECT_INTERVAL: {
    category: 'Features',
    label: 'Reflection Interval (min)',
    description: 'Minutes between auto-reflection runs',
    type: 'number',
    placeholder: '10',
  },
  ENGRAMMA_REFLECT_MIN_MEMORIES: {
    category: 'Features',
    label: 'Min Memories for Reflection',
    description: 'Minimum memories required before reflection runs',
    type: 'number',
    placeholder: '20',
  },
  ENGRAMMA_COMPRESSION_ENABLED: {
    category: 'Features',
    label: 'Compression',
    description: 'Enable automatic content compression for large memories',
    type: 'select',
    options: ['true', 'false'],
  },
  ENGRAMMA_COMPRESSION_MIN_LENGTH: {
    category: 'Features',
    label: 'Min Compression Length',
    description: 'Minimum characters to trigger compression',
    type: 'number',
    placeholder: '100',
  },
};

export default function settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(`/api/settings`);

      if (!response.ok) {
        throw new Error('Failed to load settings');
      }

      const data = await response.json();
      setSettings(data.settings || {});
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage(
        'Failed to load settings. Check if .env file exists in root directory.',
      );
      setLoading(false);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handlesave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const data = await response.json();
      setMessage(
        data.message || 'Settings saved! Restart backend to apply changes.',
      );

      setTimeout(() => loadSettings(), 1000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings. Check backend connection.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-stone-400">Loading settings...</div>
      </div>
    );
  }

  const categorizedSettings: Record<string, Array<[string, string]>> = {};
  Object.entries(settings).forEach(([key, value]) => {
    const category = SETTING_METADATA[key]?.category || 'Other';
    if (!categorizedSettings[category]) {
      categorizedSettings[category] = [];
    }
    categorizedSettings[category].push([key, value]);
  });

  const categoryIcons: Record<string, string> = {
    Server:
      'M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z',
    Database:
      'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125',
    Vectors:
      'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
    Embeddings:
      'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z',
    'API Keys':
      'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z',
    Performance: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z',
    Memory:
      'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
    Features:
      'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    LangGraph:
      'M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  };

  const categoryColors: Record<string, string> = {
    Server: 'text-purple-500',
    Database: 'text-emerald-500',
    Vectors: 'text-blue-500',
    Embeddings: 'text-cyan-500',
    'API Keys': 'text-amber-500',
    Performance: 'text-yellow-500',
    Memory: 'text-pink-500',
    Features: 'text-orange-500',
    LangGraph: 'text-indigo-500',
  };

  return (
    <div className="min-h-screen pb-20">
      <h1 className="text-white text-2xl mb-6">Settings</h1>

      {message && (
        <div className="mb-4 p-4 rounded-xl bg-blue-950/50 border border-blue-900 text-blue-200">
          {message}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(categorizedSettings).map(([category, entries]) => (
          <fieldset
            key={category}
            className="rounded-3xl border border-stone-900 bg-stone-950 p-6"
          >
            <legend className="text-white font-semibold px-2 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className={`size-5 ${
                  categoryColors[category] || 'text-stone-500'
                }`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={categoryIcons[category] || categoryIcons['Features']}
                />
              </svg>
              {category}
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {entries.map(([key, value]) => {
                const meta = SETTING_METADATA[key];
                return (
                  <div key={key} className="group">
                    <label className="block text-sm font-medium text-stone-300 mb-2 flex items-center gap-2">
                      {meta?.label || key}
                      {meta?.description && (
                        <div className="relative inline-block">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            className="size-4 text-stone-500 cursor-help"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                            />
                          </svg>
                          <div className="absolute left-0 top-6 w-64 p-3 bg-stone-800 border border-stone-700 rounded-lg text-xs text-stone-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
                            {meta.description}
                          </div>
                        </div>
                      )}
                    </label>
                    {meta?.type === 'select' ? (
                      <select
                        value={value}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-200 focus:outline-none focus:border-stone-700"
                      >
                        {meta.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt || '(auto)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          meta?.type === 'password'
                            ? 'password'
                            : meta?.type === 'number'
                            ? 'number'
                            : 'text'
                        }
                        value={value}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                        placeholder={meta?.placeholder}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-sm text-stone-200 focus:outline-none focus:border-stone-700"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="flex gap-3">
          <button
            onClick={handlesave}
            disabled={saving}
            className="flex-1 rounded-full p-3 pl-4 bg-blue-600 hover:bg-blue-700 border border-blue-700 transition-colors flex items-center justify-center gap-2 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"
              />
            </svg>
            {saving ? 'Saving...' : 'Save to .env'}
          </button>
          <button
            onClick={loadSettings}
            disabled={loading}
            className="rounded-full p-3 pl-4 border border-stone-900 hover:bg-stone-900/50 hover:text-stone-300 transition-colors text-stone-400 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
