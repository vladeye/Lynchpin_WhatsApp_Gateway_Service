-- Per-conversation ownership cache. The gateway never decides ownership; it
-- records Odoo's routing decisions (via POST /api/routes) and stamps inbound
-- events with the cached owner + status. owner is a free label (e.g. odoo, rush);
-- status is the conversation lifecycle (active/paused/closed) — labels only, the
-- gateway always still emits inbound (pure transport).
CREATE TABLE IF NOT EXISTS gateway_conversation_routes (
  gateway_account_id UUID NOT NULL REFERENCES gateway_accounts(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'odoo',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_account_id, chat_id)
);
