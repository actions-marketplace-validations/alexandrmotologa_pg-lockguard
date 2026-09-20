SET lock_timeout = '2s';
ALTER TABLE users ADD CONSTRAINT uq_username UNIQUE (username);
