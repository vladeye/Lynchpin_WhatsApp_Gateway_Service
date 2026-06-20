import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  useMultiFileAuthState,
  type AuthenticationState,
} from "@whiskeysockets/baileys";

export interface FileAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/** Per-account directory under SESSION_ROOT. */
export function sessionDir(sessionRoot: string, accountId: string): string {
  return path.join(sessionRoot, accountId);
}

/**
 * Multi-file Baileys auth state on a persistent volume so sessions survive
 * restarts. One directory per account.
 */
export async function loadFileAuthState(
  sessionRoot: string,
  accountId: string,
): Promise<FileAuthState> {
  const dir = sessionDir(sessionRoot, accountId);
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return { state, saveCreds };
}

/** Remove an account's session directory (on logout / delete). */
export async function clearSession(
  sessionRoot: string,
  accountId: string,
): Promise<void> {
  await rm(sessionDir(sessionRoot, accountId), { recursive: true, force: true });
}
