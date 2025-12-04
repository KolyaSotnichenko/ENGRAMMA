import { Injectable } from '@nestjs/common';
import { SqliteService } from '../sqlite/sqlite.service';

export interface UserRow {
  user_id: string;
  summary: string | null;
  reflection_count: number;
  created_at: number;
  updated_at: number;
}

@Injectable()
export class UsersRepository {
  constructor(private db: SqliteService) {}

  getUser(user_id: string): Promise<UserRow | null> {
    return this.db.get<UserRow>('select * from users where user_id=?', [
      user_id,
    ]);
  }

  upsertUser(
    user_id: string,
    summary: string,
    reflection_count: number,
    created_at: number,
    updated_at: number,
  ) {
    return this.db.run(
      `insert into users(user_id,summary,reflection_count,created_at,updated_at) values(?,?,?,?,?)
       on conflict(user_id) do update set summary=excluded.summary,reflection_count=excluded.reflection_count,updated_at=excluded.updated_at`,
      [user_id, summary, reflection_count, created_at, updated_at],
    );
  }

  updateUserSummary(user_id: string, summary: string, updated_at: number) {
    return this.db.run(
      `update users set summary=?,reflection_count=reflection_count+1,updated_at=? where user_id=?`,
      [summary, updated_at, user_id],
    );
  }

  listUserIds(): Promise<{ user_id: string }[]> {
    return this.db.all<{ user_id: string }>(
      `select distinct user_id from memories where user_id is not null`,
      [],
    );
  }
}
