import { Injectable } from '@nestjs/common';
import { SqliteService } from '../sqlite/sqlite.service';

export interface AuthUserRow {
  id: string;
  login: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
}

@Injectable()
export class AuthRepository {
  constructor(private db: SqliteService) {}

  async hasUsers(): Promise<boolean> {
    const r = await this.db.get<{ ok: number }>(
      'select 1 as ok from auth_users limit 1',
      [],
    );
    return !!r?.ok;
  }

  getUserByLogin(login: string): Promise<AuthUserRow | null> {
    return this.db.get<AuthUserRow>('select * from auth_users where login=?', [
      login,
    ]);
  }

  getUserById(id: string): Promise<AuthUserRow | null> {
    return this.db.get<AuthUserRow>('select * from auth_users where id=?', [
      id,
    ]);
  }

  createUser(u: AuthUserRow) {
    return this.db.run(
      `insert into auth_users(id,login,password_hash,created_at,updated_at) values(?,?,?,?,?)`,
      [u.id, u.login, u.password_hash, u.created_at, u.updated_at],
    );
  }

  createSession(s: AuthSessionRow) {
    return this.db.run(
      `insert into auth_sessions(id,user_id,token_hash,created_at,expires_at) values(?,?,?,?,?)`,
      [s.id, s.user_id, s.token_hash, s.created_at, s.expires_at],
    );
  }

  getSessionByTokenHash(token_hash: string): Promise<AuthSessionRow | null> {
    return this.db.get<AuthSessionRow>(
      'select * from auth_sessions where token_hash=?',
      [token_hash],
    );
  }

  async deleteSessionByTokenHash(token_hash: string) {
    await this.db.run('delete from auth_sessions where token_hash=?', [
      token_hash,
    ]);
  }
}
