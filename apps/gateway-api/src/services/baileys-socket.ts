import makeWASocketDefault, {
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import type { BaileysMessage } from "./normalizer";

// Baileys ships as CJS; under ESM/tsx interop the default export can be wrapped
// one level deep. Unwrap so we always call the actual factory function.
const makeWASocket =
  (makeWASocketDefault as unknown as { default?: typeof makeWASocketDefault })
    .default ?? makeWASocketDefault;
import { loadFileAuthState } from "../stores/auth-store/file-auth-store";
import type {
  BaileysSocket,
  CreatedSocket,
  SocketCreateArgs,
} from "./socket.types";

const silentLogger = pino({ level: "silent" });

/**
 * Real Baileys socket factory. Kept in its own module so unit tests can inject
 * a fake socket without pulling in the Baileys runtime.
 */
export async function createBaileysSocket({
  accountId,
  sessionRoot,
}: SocketCreateArgs): Promise<CreatedSocket> {
  const { state, saveCreds } = await loadFileAuthState(sessionRoot, accountId);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    logger: pino({ level: process.env.BAILEYS_LOG_LEVEL ?? "silent" }),
    browser: ["Lynchpin Gateway", "Chrome", "1.0.0"],
    // Request message history on connect so the conversation view can backfill
    // past chats (delivered via the messaging-history.set event).
    syncFullHistory: true,
  });

  return {
    socket: socket as unknown as BaileysSocket,
    saveCreds,
    isRegistered: Boolean(state.creds?.registered),
    downloadMedia: async (msg: BaileysMessage): Promise<Buffer | null> => {
      try {
        const buffer = await downloadMediaMessage(
          // Baileys' WAMessage type is far richer than our local subset; the
          // function only reads key/message which our shape provides.
          msg as unknown as Parameters<typeof downloadMediaMessage>[0],
          "buffer",
          {},
          {
            logger: silentLogger,
            reuploadRequest: socket.updateMediaMessage,
          },
        );
        return buffer as Buffer;
      } catch {
        return null;
      }
    },
  };
}
