import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';

const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'images');
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const TEMP_FRAMES_DIR = path.join(process.cwd(), 'scripts', 'temp_frames');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_FRAMES_DIR)) fs.mkdirSync(TEMP_FRAMES_DIR, { recursive: true });

function createTerminalSvg({ title, command, outputLines, width = 1200, height = 760 }) {
  const lineHeight = 24;
  const startY = 80;

  let contentSvg = '';
  // Command line
  contentSvg += `<text x="40" y="${startY}" font-family="Consolas, 'Cascadia Code', Menlo, monospace" font-size="16" font-weight="bold" fill="#38bdf8">❯ </text>`;
  contentSvg += `<text x="60" y="${startY}" font-family="Consolas, 'Cascadia Code', Menlo, monospace" font-size="16" font-weight="bold" fill="#f8fafc">${escapeHtml(command)}</text>`;

  let currentY = startY + 34;

  for (const line of outputLines) {
    contentSvg += `<text x="40" y="${currentY}" font-family="Consolas, 'Cascadia Code', Menlo, monospace" font-size="15" xml:space="preserve">${line}</text>`;
    currentY += lineHeight;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <filter id="winShadow" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Window Container -->
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="14" fill="#090d16" stroke="#1e293b" stroke-width="2" filter="url(#winShadow)"/>

  <!-- Window Top Bar -->
  <path d="M 20 34 C 20 26 26 20 34 20 L ${width - 34} 20 C ${width - 26} 20 ${width - 20} 26 ${width - 20} 34 L ${width - 20} 60 L 20 60 Z" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>

  <!-- Window Controls (Mac Traffic Lights) -->
  <circle cx="46" cy="40" r="6" fill="#ef4444"/>
  <circle cx="68" cy="40" r="6" fill="#f59e0b"/>
  <circle cx="90" cy="40" r="6" fill="#10b981"/>

  <!-- Window Title -->
  <text x="${width / 2}" y="45" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">${escapeHtml(title)}</text>

  <!-- Terminal Content Area -->
  ${contentSvg}
</svg>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderSvgToPng(svg, outPath) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const pngData = resvg.render();
  fs.writeFileSync(outPath, pngData.asPng());
}

// 1. SCREENSHOT 1: LINT WITH EXPLAIN
const lintLines = [
  `<tspan fill="#38bdf8" font-weight="bold">🛡️  PG Lockguard</tspan><tspan fill="#64748b"> v1.0.0 — Zero-Downtime Migration Linter</tspan>`,
  `<tspan fill="#64748b">Target: PostgreSQL 16 | Max Allowed Lock: SHARE</tspan>`,
  ``,
  `<tspan fill="#ef4444" font-weight="bold">✖ migrations/002_add_user_index.sql</tspan><tspan fill="#94a3b8"> (1 error)</tspan>`,
  `<tspan fill="#64748b">  2:1  </tspan><tspan fill="#ef4444">error</tspan><tspan fill="#cbd5e1">  Creating index without CONCURRENTLY  </tspan><tspan fill="#64748b">PG001</tspan><tspan fill="#f59e0b"> [SHARE]</tspan>`,
  ``,
  `<tspan fill="#64748b">  1 | </tspan><tspan fill="#94a3b8">SET lock_timeout = &apos;2s&apos;;</tspan>`,
  `<tspan fill="#ef4444">&gt; 2 | </tspan><tspan fill="#f8fafc" font-weight="bold">CREATE INDEX idx_users_email ON users (email);</tspan>`,
  `<tspan fill="#64748b">    | </tspan><tspan fill="#ef4444">^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^</tspan>`,
  ``,
  `<tspan fill="#38bdf8">  💡 Safe Zero-Downtime Migration Recipe:</tspan>`,
  `<tspan fill="#10b981">     -- Step 1: Create the index concurrently outside a transaction block</tspan>`,
  `<tspan fill="#10b981">     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);</tspan>`,
  ``,
  `<tspan fill="#ef4444" font-weight="bold">✖ migrations/003_add_orders_fk.sql</tspan><tspan fill="#94a3b8"> (1 error)</tspan>`,
  `<tspan fill="#64748b">  3:1  </tspan><tspan fill="#ef4444">error</tspan><tspan fill="#cbd5e1">  Adding foreign key without NOT VALID  </tspan><tspan fill="#64748b">PG004</tspan><tspan fill="#ef4444"> [SHARE ROW EXCLUSIVE]</tspan>`,
  `<tspan fill="#38bdf8">  💡 Safe Zero-Downtime Migration Recipe:</tspan>`,
  `<tspan fill="#10b981">     -- Step 1: Add foreign key constraint with NOT VALID (instant metadata lock)</tspan>`,
  `<tspan fill="#10b981">     ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;</tspan>`,
  `<tspan fill="#10b981">     -- Step 2: Validate constraint in subsequent transaction without write locks</tspan>`,
  `<tspan fill="#10b981">     ALTER TABLE orders VALIDATE CONSTRAINT fk_user;</tspan>`,
  ``,
  `<tspan fill="#ef4444" font-weight="bold">✖ 2 lock safety hazards detected</tspan><tspan fill="#94a3b8"> (2 errors, 0 warnings) in 2 files [18ms]</tspan>`,
];

const svgLint = createTerminalSvg({
  title: 'pg-lockguard lint "migrations/**/*.sql" --explain',
  command: 'pg-lockguard lint "migrations/**/*.sql" --explain',
  outputLines: lintLines,
  height: 800,
});
renderSvgToPng(svgLint, path.join(OUTPUT_DIR, 'screenshot_lint.png'));
console.log('Created docs/images/screenshot_lint.png');

// 2. SCREENSHOT 2: AUTO-FIX ENGINE
const fixLines = [
  `<tspan fill="#38bdf8" font-weight="bold">🔧 PG Lockguard Auto-Fix Engine</tspan>`,
  `<tspan fill="#64748b">Scanning and safely remediating migration files...</tspan>`,
  ``,
  `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/001_initial_schema.sql </tspan><tspan fill="#38bdf8">(1 fix)</tspan>`,
  `<tspan fill="#38bdf8">  [PG006]</tspan><tspan fill="#cbd5e1"> Line 1: Injected &apos;SET lock_timeout = &apos;2s&apos;;&apos; at top of migration</tspan>`,
  ``,
  `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/002_add_user_index.sql </tspan><tspan fill="#38bdf8">(1 fix)</tspan>`,
  `<tspan fill="#38bdf8">  [PG001]</tspan><tspan fill="#cbd5e1"> Line 2: Rewrote index creation with CONCURRENTLY IF NOT EXISTS</tspan>`,
  ``,
  `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/003_add_orders_fk.sql </tspan><tspan fill="#38bdf8">(2 fixes)</tspan>`,
  `<tspan fill="#38bdf8">  [PG006]</tspan><tspan fill="#cbd5e1"> Line 1: Injected &apos;SET lock_timeout = &apos;2s&apos;;&apos; at top of migration</tspan>`,
  `<tspan fill="#38bdf8">  [PG004]</tspan><tspan fill="#cbd5e1"> Line 3: Appended NOT VALID to foreign key constraint</tspan>`,
  ``,
  `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/004_add_price_check.sql </tspan><tspan fill="#38bdf8">(1 fix)</tspan>`,
  `<tspan fill="#38bdf8">  [PG010]</tspan><tspan fill="#cbd5e1"> Line 2: Appended NOT VALID to check constraint</tspan>`,
  ``,
  `<tspan fill="#10b981" font-weight="bold">🎉 Applied 5 safe zero-downtime fix(es) across 4 migration file(s).</tspan>`,
  `<tspan fill="#94a3b8">Run &apos;pg-lockguard lint&apos; to verify clean execution state.</tspan>`,
];

const svgFix = createTerminalSvg({
  title: 'pg-lockguard fix "migrations/**/*.sql"',
  command: 'pg-lockguard fix "migrations/**/*.sql"',
  outputLines: fixLines,
  height: 740,
});
renderSvgToPng(svgFix, path.join(OUTPUT_DIR, 'screenshot_fix.png'));
console.log('Created docs/images/screenshot_fix.png');

// 3. SCREENSHOT 3: LIVE DATABASE RISK ESTIMATOR
const estimateLines = [
  `<tspan fill="#38bdf8" font-weight="bold">📊 PostgreSQL Live Database Risk Estimator</tspan>`,
  `<tspan fill="#64748b">Connected to: postgresql://postgres:***@prod-replica.internal:5432/primary_db</tspan>`,
  `<tspan fill="#64748b">Evaluating table size, row counts (reltuples), and active lock hold impact...</tspan>`,
  ``,
  `<tspan fill="#f8fafc" font-weight="bold">Target Database Table Statistics &amp; Lock Holding Estimates:</tspan>`,
  `<tspan fill="#334155">────────────────────────────────────────────────────────────────────────────────</tspan>`,
  ``,
  `<tspan fill="#cbd5e1" font-weight="bold">Table: </tspan><tspan fill="#f8fafc" font-weight="bold">users</tspan>`,
  `<tspan fill="#64748b">  Live Rows:       </tspan><tspan fill="#38bdf8">14,250,000</tspan>`,
  `<tspan fill="#64748b">  Total Disk Size: </tspan><tspan fill="#38bdf8">3.8 GB</tspan>`,
  `<tspan fill="#64748b">  Lock Risk Level: </tspan><tspan fill="#ef4444" font-weight="bold">CRITICAL</tspan>`,
  `<tspan fill="#64748b">  Hold Time Est:   </tspan><tspan fill="#f8fafc" font-weight="bold">&gt; 30s to minutes</tspan>`,
  `<tspan fill="#94a3b8">  Traffic Impact:  High-volume table will exhaust connection pool without CONCURRENTLY.</tspan>`,
  ``,
  `<tspan fill="#cbd5e1" font-weight="bold">Table: </tspan><tspan fill="#f8fafc" font-weight="bold">orders</tspan>`,
  `<tspan fill="#64748b">  Live Rows:       </tspan><tspan fill="#38bdf8">5,420,000</tspan>`,
  `<tspan fill="#64748b">  Total Disk Size: </tspan><tspan fill="#38bdf8">1.2 GB</tspan>`,
  `<tspan fill="#64748b">  Lock Risk Level: </tspan><tspan fill="#ef4444" font-weight="bold">CRITICAL</tspan>`,
  `<tspan fill="#64748b">  Hold Time Est:   </tspan><tspan fill="#f8fafc" font-weight="bold">15s – 45s</tspan>`,
  `<tspan fill="#94a3b8">  Traffic Impact:  Validation scan blocks concurrent INSERT and UPDATE traffic.</tspan>`,
  ``,
  `<tspan fill="#cbd5e1" font-weight="bold">Table: </tspan><tspan fill="#f8fafc" font-weight="bold">settings</tspan>`,
  `<tspan fill="#64748b">  Live Rows:       </tspan><tspan fill="#38bdf8">84</tspan><tspan fill="#64748b"> | Size: </tspan><tspan fill="#38bdf8">16 kB</tspan><tspan fill="#64748b"> | Risk: </tspan><tspan fill="#10b981" font-weight="bold">LOW</tspan><tspan fill="#64748b"> (&lt; 50ms hold time)</tspan>`,
  ``,
  `<tspan fill="#334155">────────────────────────────────────────────────────────────────────────────────</tspan>`,
  `<tspan fill="#f8fafc" font-weight="bold">Overall Migration Lock Risk: </tspan><tspan fill="#ef4444" font-weight="bold">CRITICAL</tspan><tspan fill="#cbd5e1"> (Requires CONCURRENTLY &amp; NOT VALID)</tspan>`,
];

const svgEstimate = createTerminalSvg({
  title: 'pg-lockguard estimate "migrations/**/*.sql" --db $DATABASE_URL',
  command: 'pg-lockguard estimate "migrations/**/*.sql" --db $DATABASE_URL',
  outputLines: estimateLines,
  height: 840,
});
renderSvgToPng(svgEstimate, path.join(OUTPUT_DIR, 'screenshot_estimate.png'));
console.log('Created docs/images/screenshot_estimate.png');

// 4. ANIMATED DEMO GIF FRAMES
// Frame 1: Scanning migrations...
const f1 = createTerminalSvg({
  title: 'pg-lockguard — zsh',
  command: 'pg-lockguard lint "migrations/**/*.sql" --explain',
  outputLines: [
    `<tspan fill="#38bdf8" font-weight="bold">🛡️  PG Lockguard</tspan><tspan fill="#64748b"> v1.0.0 — Zero-Downtime Migration Linter</tspan>`,
    `<tspan fill="#94a3b8">🔍 Analyzing 12 migration files across PostgreSQL 16 DDL lock matrix...</tspan>`,
  ],
  height: 700,
});

// Frame 2: Violations found
const f2 = createTerminalSvg({
  title: 'pg-lockguard — zsh',
  command: 'pg-lockguard lint "migrations/**/*.sql" --explain',
  outputLines: [
    `<tspan fill="#38bdf8" font-weight="bold">🛡️  PG Lockguard</tspan><tspan fill="#64748b"> v1.0.0 — Zero-Downtime Migration Linter</tspan>`,
    ``,
    `<tspan fill="#ef4444" font-weight="bold">✖ migrations/002_add_user_index.sql</tspan><tspan fill="#94a3b8"> (1 error)</tspan>`,
    `<tspan fill="#64748b">  2:1  </tspan><tspan fill="#ef4444">error</tspan><tspan fill="#cbd5e1">  Creating index without CONCURRENTLY  </tspan><tspan fill="#64748b">PG001</tspan><tspan fill="#f59e0b"> [SHARE]</tspan>`,
    `<tspan fill="#ef4444">&gt; 2 | </tspan><tspan fill="#f8fafc" font-weight="bold">CREATE INDEX idx_users_email ON users (email);</tspan>`,
    `<tspan fill="#38bdf8">  💡 Recipe: </tspan><tspan fill="#10b981">CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);</tspan>`,
    ``,
    `<tspan fill="#ef4444" font-weight="bold">✖ migrations/003_add_orders_fk.sql</tspan><tspan fill="#94a3b8"> (1 error)</tspan>`,
    `<tspan fill="#64748b">  3:1  </tspan><tspan fill="#ef4444">error</tspan><tspan fill="#cbd5e1">  Adding foreign key without NOT VALID  </tspan><tspan fill="#64748b">PG004</tspan><tspan fill="#ef4444"> [SHARE ROW EXCLUSIVE]</tspan>`,
    `<tspan fill="#38bdf8">  💡 Recipe: </tspan><tspan fill="#10b981">ADD CONSTRAINT fk_user FOREIGN KEY ... NOT VALID;</tspan>`,
    ``,
    `<tspan fill="#ef4444" font-weight="bold">✖ 2 lock safety hazards detected</tspan><tspan fill="#94a3b8"> (2 errors, 0 warnings)</tspan>`,
  ],
  height: 700,
});

// Frame 3: Running fix
const f3 = createTerminalSvg({
  title: 'pg-lockguard — zsh',
  command: 'pg-lockguard fix "migrations/**/*.sql"',
  outputLines: [
    `<tspan fill="#38bdf8" font-weight="bold">🔧 PG Lockguard Auto-Fix Engine</tspan>`,
    ``,
    `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/001_setup.sql </tspan><tspan fill="#38bdf8">[PG006: Injected SET lock_timeout = &apos;2s&apos;]</tspan>`,
    `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/002_add_user_index.sql </tspan><tspan fill="#38bdf8">[PG001: Rewrote to CONCURRENTLY IF NOT EXISTS]</tspan>`,
    `<tspan fill="#10b981" font-weight="bold">✔</tspan><tspan fill="#f8fafc" font-weight="bold"> migrations/003_add_orders_fk.sql </tspan><tspan fill="#38bdf8">[PG004: Appended NOT VALID]</tspan>`,
    ``,
    `<tspan fill="#10b981" font-weight="bold">🎉 Applied 3 safe zero-downtime fix(es) across 3 migration file(s).</tspan>`,
  ],
  height: 700,
});

// Frame 4: Running lint again - clean!
const f4 = createTerminalSvg({
  title: 'pg-lockguard — zsh',
  command: 'pg-lockguard lint "migrations/**/*.sql"',
  outputLines: [
    `<tspan fill="#38bdf8" font-weight="bold">🛡️  PG Lockguard</tspan><tspan fill="#64748b"> v1.0.0 — Zero-Downtime Migration Linter</tspan>`,
    ``,
    `<tspan fill="#10b981" font-weight="bold">✔ migrations/001_setup.sql</tspan>`,
    `<tspan fill="#10b981" font-weight="bold">✔ migrations/002_add_user_index.sql</tspan>`,
    `<tspan fill="#10b981" font-weight="bold">✔ migrations/003_add_orders_fk.sql</tspan>`,
    ``,
    `<tspan fill="#10b981" font-weight="bold">✨ All 3 migration files passed lock safety checks!</tspan>`,
    `<tspan fill="#64748b">0 errors, 0 warnings (0ms wait, maximum lock: ROW_EXCLUSIVE)</tspan>`,
    `<tspan fill="#10b981">Zero-downtime deployment verified.</tspan>`,
  ],
  height: 700,
});

renderSvgToPng(f1, path.join(TEMP_FRAMES_DIR, 'frame_001.png'));
renderSvgToPng(f2, path.join(TEMP_FRAMES_DIR, 'frame_002.png'));
renderSvgToPng(f3, path.join(TEMP_FRAMES_DIR, 'frame_003.png'));
renderSvgToPng(f4, path.join(TEMP_FRAMES_DIR, 'frame_004.png'));

console.log('Rendered animation frames.');

// Compile frames into animated GIF using ffmpeg
// Each frame shown for ~2.5 seconds
const gifPath = path.join(OUTPUT_DIR, 'pg-lockguard-demo.gif');
const assetsGifPath = path.join(ASSETS_DIR, 'pg-lockguard-demo.gif');

// Create concat script or use framerate filter
const ffmpegCmd = `ffmpeg -y -framerate 0.4 -i "${path.join(TEMP_FRAMES_DIR, 'frame_%03d.png')}" -vf "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${gifPath}"`;
execSync(ffmpegCmd, { stdio: 'inherit' });

// Also copy to assets/
fs.copyFileSync(gifPath, assetsGifPath);

console.log(`Successfully created animated GIF at ${gifPath} and ${assetsGifPath}`);
