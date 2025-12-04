import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';

type RateState = { count: number; reset: number };
const pub = [
  '/health',
  '/api/system/health',
  '/api/system/stats',
  '/dashboard/health',
];

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private store = new Map<string, RateState>();
  constructor(private cfg: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path: string = req.path || req.url || '';
    if (pub.some((e) => path === e || path.startsWith(e))) return true;
    const key = this.cfg.get<string>('ENGRAMMA_API_KEY') || '';
    if (!key) return true;
    const provided = this.extract(req);
    if (!provided) {
      res.status(401).json({
        error: 'authentication_required',
        message: 'API key required',
      });
      return false;
    }
    if (!this.equal(provided, key)) {
      res.status(403).json({ error: 'invalid_api_key' });
      return false;
    }
    const enabled =
      (this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_ENABLED') || 'false') ===
      'true';
    const winMs = parseInt(
      this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_WINDOW_MS') || '60000',
      10,
    );
    const maxReq = parseInt(
      this.cfg.get<string>('ENGRAMMA_RATE_LIMIT_MAX_REQUESTS') || '100',
      10,
    );
    if (enabled) {
      const id = this.idFor(req, provided);
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
    }
    return true;
  }
  private extract(req: Request): string | null {
    const h = req.headers || {};
    if (h['x-api-key']) return String(h['x-api-key']);
    const auth = h['authorization'] ? String(h['authorization']) : '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    if (auth.startsWith('ApiKey ')) return auth.slice(7);
    return null;
  }
  private equal(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
  private idFor(req: Request, apiKey: string): string {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const h = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    return `${h}:${ip}`;
  }
}
