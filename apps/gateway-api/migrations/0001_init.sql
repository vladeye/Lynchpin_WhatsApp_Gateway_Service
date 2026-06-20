-- Gateway account registry, message log, and webhook/event delivery log.

CREATE TABLE IF NOT EXISTS gateway_accounts (
  id UUID PRIMARY KEY,
  external_account_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,

  state TEXT NOT NULL DEFAULT 'created',
  phone_number TEXT,
  display_name TEXT,

  call_handling_mode TEXT NOT NULL DEFAULT 'log_and_auto_reply',

  session_path TEXT NOT NULL,
  last_qr TEXT,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_connected_at TIMESTAMPTZ,
  last_disconnected_at TIMESTAMPTZ,
  logged_out_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gateway_messages (
  id UUID PRIMARY KEY,
  gateway_account_id UUID NOT NULL REFERENCES gateway_accounts(id) ON DELETE CASCADE,

  wa_message_id TEXT,
  chat_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  type TEXT NOT NULL,

  body TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  request_id TEXT,

  normalized_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gateway_messages_unique_wa
  ON gateway_messages (gateway_account_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gateway_messages_unique_request
  ON gateway_messages (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS gateway_webhook_deliveries (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  gateway_account_id UUID,

  target_url TEXT,
  payload JSONB NOT NULL,
  message TEXT,

  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gateway_webhook_deliveries_created_idx
  ON gateway_webhook_deliveries (created_at DESC);
