import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken, verifyToken } from "../utils/token";
import type { AdminRepository } from "../stores/types";

export interface AuthServiceOptions {
  secret: string;
  ttlSeconds: number;
  logger?: Logger;
}

/**
 * Single-admin authentication for the console: seeds an admin from env on first
 * boot, verifies credentials, and issues/validates signed session tokens.
 */
export class AuthService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly logger?: Logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    options: AuthServiceOptions,
  ) {
    this.secret = options.secret;
    this.ttlSeconds = options.ttlSeconds;
    this.logger = options.logger;
  }

  get tokenTtlSeconds(): number {
    return this.ttlSeconds;
  }

  /** Create the initial admin from env if none exists yet. */
  async seedAdmin(username: string, password: string | undefined): Promise<void> {
    if ((await this.adminRepo.count()) > 0) return;
    if (!password) {
      this.logger?.warn(
        "no ADMIN_PASSWORD set and no admin exists — console login is disabled until one is configured",
      );
      return;
    }
    await this.adminRepo.create({
      id: randomUUID(),
      username,
      password_hash: await hashPassword(password),
    });
    this.logger?.info({ username }, "seeded initial admin account");
  }

  /** Verify credentials; returns a session token or null. */
  async login(username: string, password: string): Promise<string | null> {
    const admin = await this.adminRepo.getByUsername(username);
    if (!admin) return null;
    if (!(await verifyPassword(password, admin.password_hash))) return null;
    return signToken(admin.username, this.secret, this.ttlSeconds);
  }

  /** Validate a session token; returns the username or null. */
  verify(token: string | undefined | null): { username: string } | null {
    const claims = verifyToken(token, this.secret);
    return claims ? { username: claims.sub } : null;
  }

  /** Change an admin's password after re-checking the current one. */
  async changePassword(
    username: string,
    current: string,
    next: string,
  ): Promise<boolean> {
    const admin = await this.adminRepo.getByUsername(username);
    if (!admin) return false;
    if (!(await verifyPassword(current, admin.password_hash))) return false;
    await this.adminRepo.updatePassword(username, await hashPassword(next));
    return true;
  }
}
