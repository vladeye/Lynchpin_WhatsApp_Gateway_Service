-- Media attachments for messages. The binary is stored on the session/media
-- volume; these columns record where and what it is so the conversations view
-- can render images/video/audio/documents and serve downloads.
ALTER TABLE gateway_messages ADD COLUMN IF NOT EXISTS media_path TEXT;
ALTER TABLE gateway_messages ADD COLUMN IF NOT EXISTS media_mime TEXT;
ALTER TABLE gateway_messages ADD COLUMN IF NOT EXISTS media_filename TEXT;
ALTER TABLE gateway_messages ADD COLUMN IF NOT EXISTS media_size BIGINT;
