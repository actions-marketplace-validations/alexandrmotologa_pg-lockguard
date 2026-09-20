SET lock_timeout = '2s';
CREATE UNIQUE INDEX CONCURRENTLY idx_uq ON users (username);
ALTER TABLE users ADD CONSTRAINT uq_username UNIQUE USING INDEX idx_uq;
