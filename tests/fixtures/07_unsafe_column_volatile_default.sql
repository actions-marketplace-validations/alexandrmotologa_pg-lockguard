SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN token UUID DEFAULT gen_random_uuid() NOT NULL;
