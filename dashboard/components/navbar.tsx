'use client';

import { useState, useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function Navbar() {
  const [backendStatus, setBackendStatus] = useState<
    'online' | 'offline' | 'checking'
  >('checking');

  useEffect(() => {
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkBackendStatus = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${API_BASE_URL}/dashboard/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  return (
    <nav className="fixed top-0 w-full p-2 z-40">
      <div className="bg-stone-950/80 backdrop-blur-md border border-stone-800 rounded-xl p-2 flex items-center justify-between shadow-lg">
        <div className="flex items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-stone-200">
              AuthMemory
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 mr-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-900/50 border border-stone-800">
            <div className="relative flex items-center">
              <div
                className={`w-2 h-2 rounded-full ${
                  backendStatus === 'online'
                    ? 'bg-green-500 animate-pulse'
                    : backendStatus === 'offline'
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-yellow-500 animate-pulse'
                }`}
              ></div>
            </div>
            <span className="text-xs text-stone-400">
              {backendStatus === 'online'
                ? 'Backend Online'
                : backendStatus === 'offline'
                ? 'Backend Offline'
                : 'Checking...'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
