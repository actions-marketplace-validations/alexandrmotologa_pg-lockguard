SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT false NOT NULL;
