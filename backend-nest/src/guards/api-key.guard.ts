import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { SqliteService } from '../sqlite/sqlite.service';

type RateState = { count: number; reset: number };
type RequestAuth = { mode: 'session'; user_id: string };
type RequestWithAuth = Request & { auth?: RequestAuth };
const pub = [
  '/health',
  '/api/system/health',
  '/api/system/stats',
  '/dashboard/health',
  '/auth/status',
  '/auth/bootstrap',
  '/auth/login',
];

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private store = new Map<string, RateState>();
  constructor(
    private cfg: ConfigService,
    private db: SqliteService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.method === 'OPTIONS') return true;

    const path: string = req.path || req.url || '';
    if (pub.some((e) => path === e || path.startsWith(e))) return true;

    const key = this.cfg.get<string>('ENGRAMMA_API_KEY') || '';

    const { apiKey, bearer } = this.extract(req);

    if (bearer) {
      if (key && this.equal(bearer, key)) {
        return this.maybeRateLimit(req, res, bearer);
      }
      const user_id = await this.validateSession(bearer);
      if (user_id) {
        req.auth = { mode: 'session', user_id };
        return true;
      }
    }

    if (apiKey) {
      if (key && this.equal(apiKey, key)) {
        return this.maybeRateLimit(req, res, apiKey);
      }
      if (key) {
        res.status(403).json({ error: 'invalid_api_key' });
        return false;
      }
    }

    if (key) {
      res.status(401).json({
        error: 'authentication_required',
        message: 'API key required',
      });
      return false;
    }

    const hasUsers = await this.hasAuthUsers();
    if (!hasUsers) return true;

    res.status(401).json({
      error: 'authentication_required',
      message: 'Login required',
    });
    return false;
  }

  private extract(req: Request): {
    apiKey: string | null;
    bearer: string | null;
  } {
    const h = req.headers || {};
    const apiKey = h['x-api-key'] ? String(h['x-api-key']) : null;
    const auth = h['authorization'] ? String(h['authorization']) : '';

    if (apiKey) return { apiKey, bearer: null };
    if (auth.startsWith('ApiKey '))
      return { apiKey: auth.slice(7), bearer: null };
    if (auth.startsWith('Bearer '))
      return { apiKey: null, bearer: auth.slice(7) };

    return { apiKey: null, bearer: null };
  }

  private equal(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private async hasAuthUsers(): Promise<boolean> {
    const r = await this.db.get<{ ok: number }>(
      'select 1 as ok from auth_users limit 1',
      [],
    );
    return !!r?.ok;
  }

  private async validateSession(token: string): Promise<string | null> {
    if (!token) return null;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const r = await this.db.get<{ user_id: string }>(
      'select user_id from auth_sessions where token_hash=? and expires_at>? limit 1',
      [tokenHash, now],
    );
    return r?.user_id || null;
  }

  private maybeRateLimit(req: Request, res: Response, apiKey: string): boolean {
    const enabled =
      (this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_ENABLED') || 'false') ===
      'true';
    if (!enabled) return true;

    const winMs = parseInt(
      this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_WINDOW_MS') || '60000',
      10,
    );
    const maxReq = parseInt(
      this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_MAX_REQUESTS') || '100',
      10,
    );

    const id = this.idFor(req, apiKey);
    const now = Date.now();
    const st = this.store.get(id);

    if (!st || now >= st.reset) {
      this.store.set(id, { count: 1, reset: now + winMs });
      res.setHeader('X-RateLimit-Limit', String(maxReq));
      res.setHeader('X-RateLimit-Remaining', String(maxReq - 1));
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.floor((now + winMs) / 1000)),
      );
      return true;
    }

    st.count++;
    this.store.set(id, st);
    const remaining = Math.max(0, maxReq - st.count);
    res.setHeader('X-RateLimit-Limit', String(maxReq));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(st.reset / 1000)));

    if (st.count > maxReq) {
      res.status(429).json({
        error: 'rate_limit_exceeded',
        retry_after: Math.ceil((st.reset - now) / 1000),
      });
      return false;
    }

    return true;
  }

  private idFor(req: Request, apiKey: string): string {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const h = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    return `${h}:${ip}`;
  }
}
