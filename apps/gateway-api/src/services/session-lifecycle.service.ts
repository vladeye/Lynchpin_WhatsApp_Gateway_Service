import type { Logger } from "pino";
import type { AccountRepository } from "../stores/types";
import type { BaileysManager } from "./baileys-manager.service";

/**
 * Restores WhatsApp sessions after a gateway restart. Accounts that were
 * connected or merely disconnected are re-opened from their stored credentials,
 * staggered so a large fleet does not connect all at once.
 */
export class SessionLifecycle {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly manager: BaileysManager,
    private readonly logger?: Logger,
  ) {}

  async restoreAll(staggerMs = 1500): Promise<number> {
    const accounts = await this.accountRepo.list();
    const restorable = accounts.filter(
      (a) => a.state === "connected" || a.state === "disconnected",
    );
    restorable.forEach((account, index) => {
      setTimeout(
        () => {
          void this.manager.start(account.id).catch((err) => {
            this.logger?.error(
              { err, accountId: account.id },
              "session restore failed",
            );
          });
        },
        index * staggerMs,
      ).unref?.();
    });
    return restorable.length;
  }
}
