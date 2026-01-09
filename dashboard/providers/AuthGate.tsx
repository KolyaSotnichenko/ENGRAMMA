'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  API_BASE_URL,
  getHeaders,
  getAuthToken,
  setAuthToken,
} from '@/lib/api';

const loginSchema = z.object({
  login: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
});

const setupSchema = z
  .object({
    login: z.string().min(3).max(64),
    password: z.string().min(8).max(256),
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type LoginValues = z.infer<typeof loginSchema>;
type SetupValues = z.infer<typeof setupSchema>;

type Mode = 'checking' | 'setup' | 'login' | 'ready';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [err, setErr] = useState<string | null>(null);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '' },
    mode: 'onChange',
  });

  const setupForm = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { login: '', password: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const title = useMemo(() => {
    if (mode === 'setup') return 'Create Admin Account';
    return 'Sign in';
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr(null);

      const token = getAuthToken();
      if (token) {
        try {
          const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: getHeaders(),
          });
          if (meRes.ok) {
            if (!cancelled) setMode('ready');
            return;
          }
        } catch {}
        setAuthToken(null);
      }

      try {
        const stRes = await fetch(`${API_BASE_URL}/auth/status`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!stRes.ok) throw new Error('status_failed');
        const st = (await stRes.json()) as { setup_required?: boolean };
        if (cancelled) return;
        setMode(st.setup_required ? 'setup' : 'login');
      } catch {
        if (cancelled) return;
        setErr('Cannot reach backend. Start backend on NEXT_PUBLIC_API_URL.');
        setMode('login');
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitLogin(v: LoginValues) {
    setErr(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        setErr('Invalid login or password');
        return;
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token) {
        setErr('Login failed');
        return;
      }
      setAuthToken(data.token);
      setMode('ready');
    } catch {
      setErr('Login failed');
    }
  }

  async function submitSetup(v: SetupValues) {
    setErr(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: v.login, password: v.password }),
      });
      if (res.status === 409) {
        const stRes = await fetch(`${API_BASE_URL}/auth/status`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const st = (await stRes.json()) as { setup_required?: boolean };
        setMode(st.setup_required ? 'setup' : 'login');
        setErr('Admin already exists. Please sign in.');
        return;
      }
      if (!res.ok) {
        setErr('Setup failed');
        return;
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token) {
        setErr('Setup failed');
        return;
      }
      setAuthToken(data.token);
      setMode('ready');
    } catch {
      setErr('Setup failed');
    }
  }

  if (mode === 'ready') return <>{children}</>;

  const activeForm = mode === 'setup' ? setupForm : loginForm;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-stone-950/80 p-6 shadow-2xl backdrop-blur">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-stone-100">{title}</div>
          <div className="text-sm text-stone-400">
            {mode === 'setup'
              ? 'First run: create a dashboard admin.'
              : 'Enter your dashboard credentials.'}
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {err}
          </div>
        )}

        {mode === 'setup' ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={setupForm.handleSubmit(submitSetup)}
          >
            <div className="space-y-1">
              <div className="text-xs text-stone-400">Login</div>
              <input
                className="w-full rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-stone-200 outline-none focus:border-stone-600"
                autoComplete="username"
                {...setupForm.register('login')}
              />
              {setupForm.formState.errors.login && (
                <div className="text-xs text-rose-300">
                  {setupForm.formState.errors.login.message}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-stone-400">Password</div>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-stone-200 outline-none focus:border-stone-600"
                autoComplete="new-password"
                {...setupForm.register('password')}
              />
              {setupForm.formState.errors.password && (
                <div className="text-xs text-rose-300">
                  {setupForm.formState.errors.password.message}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-stone-400">Confirm password</div>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-stone-200 outline-none focus:border-stone-600"
                autoComplete="new-password"
                {...setupForm.register('confirmPassword')}
              />
              {setupForm.formState.errors.confirmPassword && (
                <div className="text-xs text-rose-300">
                  {setupForm.formState.errors.confirmPassword.message}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                !setupForm.formState.isValid || setupForm.formState.isSubmitting
              }
              className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
            >
              Create admin
            </button>
          </form>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={loginForm.handleSubmit(submitLogin)}
          >
            <div className="space-y-1">
              <div className="text-xs text-stone-400">Login</div>
              <input
                className="w-full rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-stone-200 outline-none focus:border-stone-600"
                autoComplete="username"
                {...loginForm.register('login')}
              />
              {loginForm.formState.errors.login && (
                <div className="text-xs text-rose-300">
                  {loginForm.formState.errors.login.message}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-stone-400">Password</div>
              <input
                type="password"
                className="w-full rounded-xl border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-stone-200 outline-none focus:border-stone-600"
                autoComplete="current-password"
                {...loginForm.register('password')}
              />
              {loginForm.formState.errors.password && (
                <div className="text-xs text-rose-300">
                  {loginForm.formState.errors.password.message}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                !loginForm.formState.isValid || loginForm.formState.isSubmitting
              }
              className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50"
            >
              Sign in
            </button>
          </form>
        )}

        <div className="mt-5 text-xs text-stone-500">
          Backend: <span className="font-mono">{API_BASE_URL}</span>
        </div>
      </div>
    </div>
  );
}
