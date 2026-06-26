-- Outbox delivery. The dispatcher worker claims rows due for (re)delivery and
-- reschedules failures with backoff instead of dropping them on first failure.
-- Status vocabulary: pending (eligible when next_attempt_at <= now), delivered,
-- dead (retries exhausted), skipped (no n8n base URL configured).
ALTER TABLE gateway_webhook_deliveries
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS gateway_webhook_deliveries_due_idx
  ON gateway_webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';
