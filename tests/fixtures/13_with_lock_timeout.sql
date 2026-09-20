SET lock_timeout = '3s';
CREATE INDEX CONCURRENTLY idx_t ON t (c);
