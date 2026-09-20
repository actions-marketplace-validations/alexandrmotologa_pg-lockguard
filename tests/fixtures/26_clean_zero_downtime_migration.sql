SET lock_timeout = '2s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active ON users (is_active);
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE orders ADD CONSTRAINT fk_user_not_valid FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
