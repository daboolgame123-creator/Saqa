/**
 * مستودع الجلسات (Phase 11) — `auth_sessions`.
 *
 * مبادئ (§11.9 و§27):
 * - **لا Remember Me**: لا رمز دائم ولا كوكي دائم؛ تنتهي الجلسة بخمول
 *   30 دقيقة أو بإبطال صريح.
 * - **الجلسات المتزامنة مسموحة**: لا قيد تفرد على `user_id`، عدّة أجهزة
 *   في وقت واحد على الحساب نفسه.
 * - **الرفعة (token) لا تُخزَّن**: يُخزَّن `token_hash` فقط، وهو تجزئة
 *   SHA-256 للرفعة المُرسلة للعميل. من يقرأ القاعدة لا يملك رفعة صالحة.
 * - **الخروج يهدم الجلسة الحالية فقط**: `revokeById` لا يمس غيرها.
 */
import type { Queryable } from '../database';
import type { SessionRecord, SessionRevokeReason } from './authTypes';

/** أعمدة الجلسة كما تُقرأ (aliased). */
const SESSION_COLUMNS = `
  id, user_id AS "userId", token_hash AS "tokenHash",
  created_at AS "createdAt", last_activity_at AS "lastActivityAt",
  revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
`;

interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastActivityAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    revokedAt: row.revokedAt,
    revokeReason: row.revokeReason,
  };
}

/** مستودع الجلسات — عمليات فقط بلا قواعد أعمال. */
export class SessionRepository {
  constructor(private readonly db: Queryable) {}

  /** ينشئ جلسة من تجزئة الرفعة. */
  async create(userId: string, tokenHash: string): Promise<SessionRecord> {
    const result = await this.db.query<SessionRow>(
      `INSERT INTO auth_sessions (user_id, token_hash) VALUES ($1, $2)
       RETURNING ${SESSION_COLUMNS}`,
      [userId, tokenHash],
    );
    return toRecord(result.rows[0]);
  }

  /** يجد جلسة بالتجزئة — سواء كانت مُبطلة أو منتهية الخمول. */
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM auth_sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يعيد ضبط مؤقّت الخمول — يُستدعى عند كل نشاط (§11.9). */
  async touch(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE auth_sessions SET last_activity_at = now() WHERE id = $1`, [
      sessionId,
    ]);
  }

  /** يهدم جلسة واحدة فقط (تسجيل الخروج §11.9). */
  async revokeById(sessionId: string, reason: SessionRevokeReason): Promise<void> {
    await this.db.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, reason],
    );
  }

  /** يبطل جلسات حساب معيّنة؛ يُستدعى عند التجميد أو الحظر (§11.3). */
  async revokeAllForUser(userId: string, reason: SessionRevokeReason): Promise<number> {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
    return result.rowCount ?? 0;
  }

  /** جلسات حساب معيّنة غير المُبطلة — للاختبار والتشخيص. */
  async listActiveForUser(userId: string): Promise<SessionRecord[]> {
    const result = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM auth_sessions
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at ASC`,
      [userId],
    );
    return result.rows.map(toRecord);
  }
}
