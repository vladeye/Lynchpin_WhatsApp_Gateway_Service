-- Store the account's own WhatsApp LID so self-chats (note-to-self) can be
-- identified in the conversations view.
ALTER TABLE gateway_accounts ADD COLUMN IF NOT EXISTS self_lid TEXT;
