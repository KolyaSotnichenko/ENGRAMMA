'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function Navbar() {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<
    'online' | 'offline' | 'checking'
  >('checking');

  // Format pathname for display
  const getPageTitle = (path: string) => {
    if (path === '/') return 'Dashboard';
    // Remove leading slash and capitalize first letter
    return path.substring(1).charAt(0).toUpperCase() + path.slice(2);
  };

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
    <nav className="fixed top-0 left-0 right-0 h-16 z-50 bg-stone-950/80 border-b border-stone-800 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-6 max-w-[1920px] mx-auto">
        {/* Left: Brand & Breadcrumbs */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-gradient-to-tr from-stone-200 to-stone-400 rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-stone-950">E</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-stone-200">
              Engramma
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-stone-500">
            <span className="text-stone-700">/</span>
            <span className="text-stone-200 font-medium px-2 py-1 rounded-md bg-stone-900/50 border border-stone-800">
              {getPageTitle(pathname)}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          {/* Status Badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
              backendStatus === 'online'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : backendStatus === 'offline'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            <div className="relative flex items-center justify-center w-2 h-2">
              <div
                className={`absolute w-full h-full rounded-full animate-ping opacity-75 ${
                  backendStatus === 'online'
                    ? 'bg-emerald-500'
                    : backendStatus === 'offline'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
              />
              <div
                className={`relative w-1.5 h-1.5 rounded-full ${
                  backendStatus === 'online'
                    ? 'bg-emerald-500'
                    : backendStatus === 'offline'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
              />
            </div>
            <span className="text-xs font-semibold tracking-wide uppercase">
              {backendStatus === 'online'
                ? 'System Online'
                : backendStatus === 'offline'
                ? 'System Offline'
                : 'Connecting'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
