# Media (send & receive)

## Status

Active — `apps/gateway-api` (normalizer, Baileys manager, media store, messages
route) + console Conversations screen.

## What it does

Two-way media in the conversation view: images, video, audio and documents
(incl. PDFs).

### Receiving

- The normalizer detects `image / video / audio / document / sticker`, including
  content wrapped in `ephemeralMessage`, `viewOnceMessage(V2/Extension)`,
  `documentWithCaptionMessage` and `editedMessage` (unwrapped before detection).
- Content-less messages (reactions, receipts, empty edits) are skipped as
  `message.unsupported` so the thread isn't littered with empty bubbles.
- The binary is downloaded via the account socket and stored by `MediaStore`
  under `MEDIA_ROOT/<accountId>/<messageId>.<ext>`; `media_mime` is recorded only
  when the file is actually saved.
- Served back to the console at `GET /api/accounts/:id/media/:messageId`.

### Sending

- `POST /api/messages/send-media` (multipart/form-data) with `file`,
  `gateway_account_id`, `chat_id`, `request_id` and optional `caption`
  (≤ 64 MB, one file). Idempotent on `request_id`.
- The gateway picks the Baileys content shape from the mime type
  (`image` / `video` / `audio` / `document`), sends it, and persists an outbound
  row + the saved file so the bubble renders immediately.
- Console: the composer has a 📎 attach button; the text box doubles as the
  caption.

## Access

Authenticated console / API (session cookie or `X-Gateway-Api-Key`). See
[Security & Auth](security-auth.md).

## Depends

- `gateway_messages.media_*` columns (migration `0003`).
- `@fastify/multipart` for uploads; Baileys `downloadMediaMessage` for receipt.

## See also

- [Admin Console](admin-console.md)
- [Gateway Accounts & Baileys Runtime](gateway-accounts-module.md)
