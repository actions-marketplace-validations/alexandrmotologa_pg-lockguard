import * as fs from 'node:fs';
import * as path from 'node:path';

const fixturesDir = path.resolve('tests/fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

const fixtures = {
  '01_safe_index.sql': `SET lock_timeout = '2s';\nCREATE INDEX CONCURRENTLY idx_users_email ON users (email);\n`,
  '02_unsafe_index.sql': `SET lock_timeout = '2s';\nCREATE INDEX idx_users_email ON users (email);\n`,
  '03_safe_drop_index.sql': `SET lock_timeout = '2s';\nDROP INDEX CONCURRENTLY idx_users_email;\n`,
  '04_unsafe_drop_index.sql': `SET lock_timeout = '2s';\nDROP INDEX idx_users_email;\n`,
  '05_safe_column_default_pg16.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT false NOT NULL;\n`,
  '06_unsafe_column_no_default.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD COLUMN score INT NOT NULL;\n`,
  '07_unsafe_column_volatile_default.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD COLUMN token UUID DEFAULT gen_random_uuid() NOT NULL;\n`,
  '08_safe_fk_not_valid.sql': `SET lock_timeout = '2s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;\n`,
  '09_unsafe_fk.sql': `SET lock_timeout = '2s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);\n`,
  '10_safe_alter_type_text.sql': `SET lock_timeout = '2s';\nALTER TABLE users ALTER COLUMN description TYPE text;\n`,
  '11_unsafe_alter_type_bigint.sql': `SET lock_timeout = '2s';\nALTER TABLE users ALTER COLUMN id TYPE bigint;\n`,
  '12_missing_lock_timeout.sql': `CREATE INDEX CONCURRENTLY idx_t ON t (c);\n`,
  '13_with_lock_timeout.sql': `SET lock_timeout = '3s';\nCREATE INDEX CONCURRENTLY idx_t ON t (c);\n`,
  '14_safe_unique_index.sql': `SET lock_timeout = '2s';\nCREATE UNIQUE INDEX CONCURRENTLY idx_uq ON users (username);\nALTER TABLE users ADD CONSTRAINT uq_username UNIQUE USING INDEX idx_uq;\n`,
  '15_unsafe_unique_constraint.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD CONSTRAINT uq_username UNIQUE (username);\n`,
  '16_unsafe_vacuum_full.sql': `SET lock_timeout = '2s';\nVACUUM FULL users;\n`,
  '17_unsafe_cluster.sql': `SET lock_timeout = '2s';\nCLUSTER users USING idx_users_id;\n`,
  '18_safe_vacuum.sql': `SET lock_timeout = '2s';\nVACUUM (ANALYZE) users;\n`,
  '19_unsafe_concurrent_in_tx.sql': `BEGIN;\nCREATE INDEX CONCURRENTLY idx_users ON users (id);\nCOMMIT;\n`,
  '20_safe_check_not_valid.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18) NOT VALID;\n`,
  '21_unsafe_check.sql': `SET lock_timeout = '2s';\nALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18);\n`,
  '22_unsafe_rename_column.sql': `SET lock_timeout = '2s';\nALTER TABLE users RENAME COLUMN old_name TO new_name;\n`,
  '23_unsafe_rename_table.sql': `SET lock_timeout = '2s';\nALTER TABLE users RENAME TO accounts;\n`,
  '24_unsafe_drop_column.sql': `SET lock_timeout = '2s';\nALTER TABLE users DROP COLUMN phone;\n`,
  '25_unsafe_drop_table.sql': `SET lock_timeout = '2s';\nDROP TABLE deprecated_users;\n`,
  '26_clean_zero_downtime_migration.sql': `SET lock_timeout = '2s';\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active ON users (is_active);\nALTER TABLE users ADD COLUMN bio TEXT;\nALTER TABLE orders ADD CONSTRAINT fk_user_not_valid FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;\n`
};

for (const [name, content] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(fixturesDir, name), content, 'utf-8');
}

console.log(`Generated ${Object.keys(fixtures).length} test fixtures in ${fixturesDir}`);
