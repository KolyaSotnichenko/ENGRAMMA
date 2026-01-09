import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { AuthRepository } from './auth.repository';

type AuthUserPublic = { id: string; login: string };

@Injectable()
export class AuthService {
  constructor(
    private repo: AuthRepository,
    private cfg: ConfigService,
  ) {}

  async status(): Promise<{ setup_required: boolean }> {
    const hasUsers = await this.repo.hasUsers();
    return { setup_required: !hasUsers };
  }

  async bootstrap(
    login: string,
    password: string,
  ): Promise<{ token: string; user: AuthUserPublic } | null> {
    const hasUsers = await this.repo.hasUsers();
    if (hasUsers) return null;

    const now = Date.now();
    const user = {
      id: randomUUID(),
      login,
      password_hash: this.hashPassword(password),
      created_at: now,
      updated_at: now,
    };

    await this.repo.createUser(user);

    const sess = await this.createSession(user.id);
    return { token: sess.token, user: { id: user.id, login: user.login } };
  }

  async login(
    login: string,
    password: string,
  ): Promise<{ token: string; user: AuthUserPublic } | null> {
    const u = await this.repo.getUserByLogin(login);
    if (!u) return null;
    if (!this.verifyPassword(password, u.password_hash)) return null;

    const sess = await this.createSession(u.id);
    return { token: sess.token, user: { id: u.id, login: u.login } };
  }

  async me(token: string): Promise<AuthUserPublic | null> {
    const u = await this.userForToken(token);
    return u ? { id: u.id, login: u.login } : null;
  }

  async logout(token: string): Promise<boolean> {
    const token_hash = createHash('sha256').update(token).digest('hex');
    await this.repo.deleteSessionByTokenHash(token_hash);
    return true;
  }

  async userForToken(token: string) {
    if (!token) return null;
    const token_hash = createHash('sha256').update(token).digest('hex');
    const s = await this.repo.getSessionByTokenHash(token_hash);
    if (!s) return null;
    if (Date.now() > s.expires_at) {
      await this.repo.deleteSessionByTokenHash(token_hash);
      return null;
    }
    return this.repo.getUserById(s.user_id);
  }

  private async createSession(user_id: string): Promise<{ token: string }> {
    const ttlMs = parseInt(
      this.cfg.get<string>('ENGRAMMA_AUTH_SESSION_TTL_MS') ||
        String(7 * 24 * 3600 * 1000),
      10,
    );

    const token = randomBytes(32).toString('base64url');
    const token_hash = createHash('sha256').update(token).digest('hex');
    const now = Date.now();

    await this.repo.createSession({
      id: randomUUID(),
      user_id,
      token_hash,
      created_at: now,
      expires_at: now + ttlMs,
    });

    return { token };
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    if (parts[0] !== 'scrypt') return false;

    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(password, salt, expected.length);

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
