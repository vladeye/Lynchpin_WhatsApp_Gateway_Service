-- Per-account reading schedule. When a row exists, the gateway only forwards
-- inbound messages to n8n during the account's "reading" (green) windows; outside
-- them the message is still stored (console/history intact) but not forwarded, so
-- the agent does not reply. No row = read always (no gating).
CREATE TABLE IF NOT EXISTS gateway_reading_schedules (
  account_id UUID PRIMARY KEY REFERENCES gateway_accounts(id) ON DELETE CASCADE,
  schedule JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
