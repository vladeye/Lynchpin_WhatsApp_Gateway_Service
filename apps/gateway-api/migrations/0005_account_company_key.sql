-- Multi-tenant attribution. Each WhatsApp account belongs to exactly one
-- corporate; a corporate may own many accounts. This column lets the gateway
-- stamp `company_key` per account so Odoo can resolve the tenant. Nullable for
-- now (single-corporate via COMPANY_KEY env); per-account values arrive with
-- inbound events (M1).
ALTER TABLE gateway_accounts ADD COLUMN IF NOT EXISTS company_key TEXT;
