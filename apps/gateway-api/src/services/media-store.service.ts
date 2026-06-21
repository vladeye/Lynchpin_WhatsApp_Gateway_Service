import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Maps a few common mime types to a sensible file extension. */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

function extFor(mimetype: string | null, filename: string | null): string {
  if (filename) {
    const ext = path.extname(filename).replace(/^\./, "");
    if (ext) return ext.toLowerCase();
  }
  if (mimetype) {
    const base = mimetype.split(";")[0]!.trim();
    if (EXT_BY_MIME[base]) return EXT_BY_MIME[base]!;
    const sub = base.split("/")[1];
    if (sub) return sub.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  }
  return "bin";
}

/**
 * Persists downloaded WhatsApp media to disk under the session/media volume.
 * Files live at `<root>/<accountId>/<messageId>.<ext>`; the relative path is
 * stored on the message row so it can be served back later.
 */
export class MediaStore {
  constructor(private readonly root: string) {}

  /** Write a media buffer and return its relative path + size. */
  async save(
    accountId: string,
    messageId: string,
    buffer: Buffer,
    mimetype: string | null,
    filename: string | null,
  ): Promise<{ relativePath: string; size: number }> {
    const dir = path.join(this.root, accountId);
    await mkdir(dir, { recursive: true });
    const name = `${messageId}.${extFor(mimetype, filename)}`;
    await writeFile(path.join(dir, name), buffer);
    return { relativePath: path.join(accountId, name), size: buffer.length };
  }

  /** Absolute path for a stored relative media path. */
  resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }
}
