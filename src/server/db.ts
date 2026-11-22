import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.ts";

let db: DatabaseSync | null = null;
let dbGeneration = 0;

const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  /* v1 */ `
  CREATE TABLE IF NOT EXISTS sources (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 1,
    config       TEXT NOT NULL DEFAULT '{}',
    cursor       TEXT,
    last_run_at  TEXT,
    last_status  TEXT,
    last_error   TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id    TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running',
    fetched      INTEGER NOT NULL DEFAULT 0,
    inserted     INTEGER NOT NULL DEFAULT 0,
    skipped      INTEGER NOT NULL DEFAULT 0,
    duration_ms  INTEGER,
    error        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runs_source ON runs(source_id, started_at DESC);

  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id     TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    url           TEXT NOT NULL,
    url_key       TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    author        TEXT,
    category      TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    score         REAL NOT NULL DEFAULT 0,
    expires_at    TEXT,
    published_at  TEXT,
    raw           TEXT NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'active',
    starred       INTEGER NOT NULL DEFAULT 0,
    ai            TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    UNIQUE(source_id, external_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_items_url_key ON items(url_key);
  CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_items_score ON items(score DESC);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

  CREATE TABLE IF NOT EXISTS digests (
    date        TEXT PRIMARY KEY,
    item_ids    TEXT NOT NULL DEFAULT '[]',
    payload     TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    pushed_at   TEXT
  );
  `,

  /* v2：关键词订阅与提醒 */
  `
  CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword     TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL,
    last_hit_at TEXT

  );
  CREATE INDEX IF NOT EXISTS idx_subs_keyword ON subscriptions(keyword);
  `,

  /* v3：时效性 —— 每源采集间隔、正文快照、抽取到的兑换码 */
  `
  ALTER TABLE sources ADD COLUMN interval_sec INTEGER NOT NULL DEFAULT 10800;
  ALTER TABLE items ADD COLUMN content TEXT;
  ALTER TABLE items ADD COLUMN codes TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE items ADD COLUMN pushed_at TEXT;
  CREATE INDEX IF NOT EXISTS idx_items_codes ON items(codes);
  `,

  /* v4：价格 —— 「最高能付多少」筛选 */
  `
  ALTER TABLE items ADD COLUMN price REAL;
  ALTER TABLE items ADD COLUMN is_free INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_items_price ON items(price);
  `,

  /* v5：屏蔽词规则 + 已读标记 */
  `
  CREATE TABLE IF NOT EXISTS block_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern    TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'keyword',
    scope      TEXT NOT NULL DEFAULT 'all',
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_block_unique ON block_rules(pattern, scope);
  ALTER TABLE items ADD COLUMN read_at TEXT;
  `,

  /* v6：推送设置 + 推送记录 + 标题归一化去重 */
  `
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    item_ids   TEXT NOT NULL DEFAULT '[]',
    text       TEXT NOT NULL DEFAULT '',
    count      INTEGER NOT NULL DEFAULT 0,
    ok         INTEGER NOT NULL DEFAULT 1,
    error      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_log_time ON push_log(created_at DESC);
  ALTER TABLE items ADD COLUMN title_key TEXT;
  CREATE INDEX IF NOT EXISTS idx_items_title_key ON items(title_key);
  `,

  /* v7：把 AI 判定摊平成独立列 —— 用 json_extract 过滤会让 4000+ 行的查询从 0.7s 掉到 90s 超时 */
  `
  ALTER TABLE items ADD COLUMN ai_keep INTEGER;
  CREATE INDEX IF NOT EXISTS idx_items_ai_keep ON items(ai_keep);
  UPDATE items SET ai_keep = json_extract(ai, '$.keep') WHERE ai IS NOT NULL AND ai_keep IS NULL;
  `,

  /* v8：列表默认按 status + ai_keep 过滤再按 score 排序，5000+ 行没复合索引要 4 秒 */
  `
  CREATE INDEX IF NOT EXISTS idx_items_feed ON items(status, ai_keep, score DESC);
  CREATE INDEX IF NOT EXISTS idx_items_score ON items(score DESC);
  `,

  /* v9：不带 ai_keep 条件时，(status, ai_keep, score) 用不上排序，退化成全表排序 */
  `
  CREATE INDEX IF NOT EXISTS idx_items_status_score ON items(status, score DESC);
  `,

  /* v10：获取方式 —— 区分「直接白嫖」与抽奖/试用/推广/有条件，单独隔离 */
  `
  ALTER TABLE items ADD COLUMN obtain TEXT;
  CREATE INDEX IF NOT EXISTS idx_items_obtain ON items(obtain);
  `,

  /* v11：保鲜期查询要按 COALESCE(published_at, first_seen_at) 过滤，普通索引覆盖不到 */
  `
  CREATE INDEX IF NOT EXISTS idx_items_effective_time ON items(COALESCE(published_at, first_seen_at));
  `,

  /* v12：双语跨源别名字典，让英文与纯中文报道在同一 title_key 下合并 */
  `
  CREATE TABLE IF NOT EXISTS title_aliases (
    alias     TEXT PRIMARY KEY,
    canonical TEXT NOT NULL
  );
  `,

  /* v13：停用实测 0 留存的纯新闻/硬折扣/静态清单源，避免白占 AI 一审配额 */
  `
  UPDATE sources SET enabled = 0
   WHERE id IN (
     'rss-hnrss',
     'rss-9to5toys',
     'rss-52pojie',
     'rss-fuliba',
     'github-public-apis',
     'github-awesome-ai',
     'github-selfhosted'
   );
  `,

  /* v14：清理与 NodeSeek 重复的 tg-cn-deals 及实测 <1% 留存的泛资讯/静态源；Reddit 拉长周期防 429 */
  `
  UPDATE sources SET enabled = 0
   WHERE id IN (
     'tg-cn-deals',
     'rss-smzdm',
     'rss-ithome',
     'linuxdo-resource',
     'v2ex-share',
     'rss-producthunt',
     'rss-sspai',
     'rss-appinn',
     'rss-ruanyifeng',
     'rss-iapps',
     'github-free-for-dev'
   );
  UPDATE sources SET interval_sec = 2700
   WHERE id LIKE 'rss-reddit-%' AND interval_sec < 2700;
  `,

  /* v15：引入内容形态 kind 与 AI 质量分 ai_quality，解耦「低噪有效」与「必须免费白嫖」 */
  `
  ALTER TABLE items ADD COLUMN kind TEXT;
  ALTER TABLE items ADD COLUMN ai_quality INTEGER;
  CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
  UPDATE items
     SET kind = CASE
       WHEN ai_keep = 0 THEN 'noise'
       WHEN category = 'opensource' THEN 'opensource'
       WHEN obtain = 'paid' THEN 'deal'
       ELSE 'freebie'
     END
   WHERE kind IS NULL;
  UPDATE items
     SET ai_quality = json_extract(ai, '$.quality')
   WHERE ai IS NOT NULL AND ai_quality IS NULL;
  `,

  /* v16：保存封面图 URL，支撑 2/3 列图文卡片布局 */
  `
  ALTER TABLE items ADD COLUMN image_url TEXT;
  `,

  /* v17：把旧版 AI 自定义入口噪音词自动迁移到全局屏蔽规则 block_rules，统一成一套规则 */
  `
  INSERT OR IGNORE INTO block_rules (pattern, mode, scope, enabled, created_at)
  SELECT DISTINCT TRIM(je.value), 'keyword', 'all', 1, datetime('now')
    FROM settings s, json_each(s.value, '$.customNoiseKeywords') je
   WHERE s.key = 'ai'
     AND json_valid(s.value)
     AND json_type(s.value, '$.customNoiseKeywords') = 'array'
     AND TRIM(je.value) != '';
  UPDATE settings
     SET value = json_set(value, '$.customNoiseKeywords', json('[]'))
   WHERE key = 'ai'
     AND json_valid(value)
     AND json_type(value, '$.customNoiseKeywords') = 'array';
  `,
  /* v18：推送记录保存「为什么推它」；日报表区分日报与周报 */
  `
  ALTER TABLE push_log ADD COLUMN reason TEXT;
  ALTER TABLE digests ADD COLUMN kind TEXT NOT NULL DEFAULT 'daily';
  `,
  /* v19：记录 AI 实际判定时间，让「最近判定样本」按真实审核时间倒序展示 */
  `
  ALTER TABLE items ADD COLUMN ai_reviewed_at TEXT;
  UPDATE items SET ai_reviewed_at = COALESCE(last_seen_at, first_seen_at) WHERE ai IS NOT NULL AND ai_reviewed_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_items_ai_reviewed ON items(ai_reviewed_at DESC);
  `,
  /* v20：把旧版统一归进 info 的时政/国际要闻拆分到 kind='news'（重要新闻），避免与行业资讯混杂 */
  `
  UPDATE items
     SET kind = 'news'
   WHERE kind = 'info'
    AND category IN ('headline', 'world');
  `,
  /* v21：AI 语义去重聚类 ID（同一活动/福利/事件共享 canonical_id，根条目自身也置为 rootId） */
  `
  ALTER TABLE items ADD COLUMN canonical_id INTEGER;
  CREATE INDEX IF NOT EXISTS idx_items_canonical_id ON items(canonical_id);
  `,
  /* v22：网盘资源与网课教程独立成类，历史条目按标题关键词重新落位 */
  `
  UPDATE items SET category = 'pan'
   WHERE status = 'active'
     AND COALESCE(category, '') IN ('media', 'cloud', 'other', '')
     AND title NOT LIKE '%浏览器%'
     AND (title LIKE '%网盘%' OR title LIKE '%云盘%' OR title LIKE '%阿里云盘%' OR title LIKE '%百度网盘%'
          OR title LIKE '%夸克%' OR title LIKE '%提取码%' OR title LIKE '%转存%' OR title LIKE '%115网盘%');

  UPDATE items SET category = 'course'
   WHERE status = 'active'
     AND COALESCE(category, '') IN ('edu', 'other', '')
     AND (title LIKE '%网课%' OR title LIKE '%课程%' OR title LIKE '%公开课%' OR title LIKE '%训练营%'
          OR title LIKE '%课件%' OR title LIKE '%讲义%' OR title LIKE '%视频教程%');
  `,
  /* v23：修正 v22 里裸 %115% 造成的误判（如「115 美元」），只保留真正带网盘信号的条目 */
  `
  UPDATE items SET category = 'other'
   WHERE status = 'active'
     AND category = 'pan'
     AND title NOT LIKE '%网盘%'
     AND title NOT LIKE '%云盘%'
     AND title NOT LIKE '%提取码%'
     AND title NOT LIKE '%转存%'
     AND title NOT LIKE '%夸克%';
  `,
  /* v24：规则内容分单独落库，AI 审核后从它重算综合分，避免二次校准漂移 */
  `
  ALTER TABLE items ADD COLUMN base_score REAL;
  UPDATE items SET base_score = score WHERE base_score IS NULL;
  `,
  /* v25：把误落进「网盘/网课」的影视剧集与新闻移回正确分类 */
  `
  UPDATE items SET category = 'media'
   WHERE status = 'active' AND category = 'pan'
     AND (title LIKE '%更至%' OR title LIKE '%1080P%' OR title LIKE '%4K%' OR title LIKE '%剧集%'
          OR title LIKE '%动漫%' OR title LIKE '%电影%' OR title LIKE '%全集%' OR title LIKE '%年番%');

  UPDATE items SET category = 'security'
   WHERE status = 'active' AND category = 'pan' AND title LIKE '%SOCKS5%';

  UPDATE items SET category = 'other'
   WHERE status = 'active' AND category IN ('pan', 'course')
     AND (title LIKE '%签署%' OR title LIKE '%备忘录%' OR title LIKE '%论坛%' OR title LIKE '%峰会%'
          OR title LIKE '%发布会%' OR title LIKE '%暗改%' OR title LIKE '%限制加码%');
`,
  /* v26：网盘里的课程/讲义/书籍资料归「网课/教程」，让 pan 只留纯网盘分享 */
  `
  UPDATE items SET category = 'course'
   WHERE status = 'active' AND category = 'pan'
     AND (title LIKE '%课程%' OR title LIKE '%讲义%' OR title LIKE '%训练班%' OR title LIKE '%讲完%'
          OR title LIKE '%节短课%' OR title LIKE '%实战篇%' OR title LIKE '%一套书%' OR title LIKE '%电子书%');
  `,
  /* v27：实地福利独立成类，把线下门店/快闪/商场现场领取的实物从「实物/优惠」里拆出来 */
  `
  UPDATE items SET category = 'offline'
   WHERE status = 'active'
     AND COALESCE(category, '') IN ('goods', 'other', '')
     AND (title LIKE '%现场%' OR title LIKE '%到店%' OR title LIKE '%进店%' OR title LIKE '%门店%'
          OR title LIKE '%实体店%' OR title LIKE '%快闪%' OR title LIKE '%商场%' OR title LIKE '%专柜%'
          OR title LIKE '%自提%' OR title LIKE '%试吃%' OR title LIKE '%试饮%' OR title LIKE '%派样%'
          OR title LIKE '%店庆%' OR title LIKE '%开业%' OR title LIKE '%附近%' OR title LIKE '%线下%')
     AND title NOT LIKE '%记者%' AND title NOT LIKE '%直播%' AND title NOT LIKE '%直击%'
     AND title NOT LIKE '%发布会%' AND title NOT LIKE '%峰会%' AND title NOT LIKE '%论坛%'
     AND title NOT LIKE '%通报%' AND title NOT LIKE '%签署%' AND title NOT LIKE '%白皮书%'
     AND title NOT LIKE '%备忘录%';
  `,
  /* v28：公开站多用户 —— 登录用户、会话、个人状态/规则/推送，以及邀请码与运营配置 */
  `
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    linuxdo_id     INTEGER NOT NULL UNIQUE,
    username       TEXT NOT NULL,
    name           TEXT,
    avatar_url     TEXT,
    trust_level    INTEGER NOT NULL DEFAULT 0,
    disabled       INTEGER NOT NULL DEFAULT 0,
    rss_token      TEXT NOT NULL UNIQUE,
    invited_by_id  INTEGER,
    created_at     TEXT NOT NULL,
    last_login_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS invite_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,
    max_uses   INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    disabled   INTEGER NOT NULL DEFAULT 0,
    note       TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_redemptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_id   INTEGER NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at TEXT NOT NULL,
    UNIQUE(invite_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS user_item_states (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    hidden     INTEGER NOT NULL DEFAULT 0,
    starred    INTEGER NOT NULL DEFAULT 0,
    read_at    TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_uis_user_hidden ON user_item_states(user_id, hidden);
  CREATE INDEX IF NOT EXISTS idx_uis_user_starred ON user_item_states(user_id, starred);
  CREATE INDEX IF NOT EXISTS idx_uis_item_starred ON user_item_states(item_id, starred);

  CREATE TABLE IF NOT EXISTS user_block_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern    TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'keyword',
    scope      TEXT NOT NULL DEFAULT 'all',
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, pattern, scope)
  );

  CREATE TABLE IF NOT EXISTS user_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    last_hit_at TEXT,
    UNIQUE(user_id, keyword)
  );

  CREATE TABLE IF NOT EXISTS user_push_configs (
    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled           INTEGER NOT NULL DEFAULT 0,
    bot_token_enc     TEXT,
    bot_token_mask    TEXT,
    chat_id           TEXT NOT NULL DEFAULT '',
    settings          TEXT NOT NULL DEFAULT '{}',
    use_global_blocks INTEGER NOT NULL DEFAULT 1,
    daily_enabled     INTEGER NOT NULL DEFAULT 0,
    consecutive_fails INTEGER NOT NULL DEFAULT 0,
    last_error        TEXT,
    last_flush_at     TEXT,
    last_pushed_at    TEXT,
    updated_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_push_deliveries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title_key  TEXT,
    status     TEXT NOT NULL,
    reason     TEXT,
    route_name TEXT,
    queued_at  TEXT NOT NULL,
    sent_at    TEXT,
    UNIQUE(user_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_upd_user_status ON user_push_deliveries(user_id, status, queued_at);
  CREATE INDEX IF NOT EXISTS idx_upd_user_sent ON user_push_deliveries(user_id, sent_at DESC);

  CREATE TABLE IF NOT EXISTS user_push_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    item_ids   TEXT NOT NULL DEFAULT '[]',
    text       TEXT NOT NULL DEFAULT '',
    count      INTEGER NOT NULL DEFAULT 0,
    ok         INTEGER NOT NULL DEFAULT 1,
    error      TEXT,
    reason     TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_upl_user_time ON user_push_logs(user_id, created_at DESC);
  `,
  /* v29：实地福利收紧 —— 只命中地点词（现场/附近/门店）却没有领取动作的资讯与闲聊被误判进 offline，移出 */
  `
  UPDATE items SET category = 'other'
   WHERE status = 'active' AND category = 'offline'
     AND (COALESCE(kind, '') IN ('news', 'info', 'noise')
          OR title LIKE '%不合格%' OR title LIKE '%抽检%' OR title LIKE '%通报%'
          OR title LIKE '%有吗%' OR title LIKE '%我想%' OR title LIKE '%求租%'
          OR title LIKE '%转租%' OR title LIKE '%租房%' OR title LIKE '%合租%'
          OR title LIKE '%记者%' OR title LIKE '%发布会%' OR title LIKE '%峰会%');
  `,
  /* v30：资源荟萃默认固定归网盘；保留自定义 config、启停和全部个人状态 */
  `
  UPDATE sources SET config = json_set(config, '$.fixedCategory', 'pan')
   WHERE id = 'linuxdo-resource' AND json_valid(config)
     AND json_type(config, '$.fixedCategory') IS NULL;
  UPDATE items SET category = 'pan',
    ai = CASE WHEN json_valid(ai) THEN CASE WHEN json_type(ai) = 'object' THEN json_set(ai, '$.category', 'pan') ELSE ai END ELSE ai END
   WHERE source_id = 'linuxdo-resource' AND
     NOT EXISTS (
       SELECT 1 FROM sources WHERE id = 'linuxdo-resource' AND json_valid(config)
         AND json_type(config, '$.fixedCategory') IS NOT NULL
         AND json_extract(config, '$.fixedCategory') IS NOT 'pan'
     );
  `,
  /* v31：人工分类优先于所有自动写入；SQLite 护栏覆盖 CLI/后台重审等写入 */
  `
  CREATE TABLE IF NOT EXISTS item_classification_overrides (
    item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    category TEXT,
    kind TEXT,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    CHECK(category IS NOT NULL OR kind IS NOT NULL)
  );
  CREATE TRIGGER IF NOT EXISTS enforce_manual_item_classification
  AFTER UPDATE OF category, kind ON items
  WHEN EXISTS (
    SELECT 1 FROM item_classification_overrides o WHERE o.item_id = NEW.id
      AND ((o.category IS NOT NULL AND NEW.category IS NOT o.category)
        OR (o.kind IS NOT NULL AND NEW.kind IS NOT o.kind))
  )
  BEGIN
    UPDATE items SET
      category = COALESCE((SELECT category FROM item_classification_overrides WHERE item_id = NEW.id), category),
      kind = COALESCE((SELECT kind FROM item_classification_overrides WHERE item_id = NEW.id), kind)
      WHERE id = NEW.id;
  END;
  CREATE TRIGGER IF NOT EXISTS apply_manual_item_classification
  AFTER INSERT ON item_classification_overrides
  BEGIN
    UPDATE items SET category = COALESCE(NEW.category, category), kind = COALESCE(NEW.kind, kind) WHERE id = NEW.item_id;
  END;
  CREATE TRIGGER IF NOT EXISTS update_manual_item_classification
  AFTER UPDATE OF category, kind ON item_classification_overrides
  BEGIN
    UPDATE items SET category = COALESCE(NEW.category, category), kind = COALESCE(NEW.kind, kind) WHERE id = NEW.item_id;
  END;
  `,

  /* v??：按「有效时间」排序的复合索引 —— 列表默认按 COALESCE(published_at, first_seen_at) DESC 排，
     旧索引都带 score，SQLite 只能走 status 前缀再建 TEMP B-TREE 排全表 1.6 万行（单次 4-7 秒）。 */
  `
  CREATE INDEX IF NOT EXISTS idx_items_status_time
    ON items(status, COALESCE(published_at, first_seen_at) DESC);
  `,

  /* v??：条目级翻译缓存。src_hash 记录原文指纹，正文快照变化后重译并覆盖。 */
  `
  CREATE TABLE IF NOT EXISTS item_translations (
    item_id     INTEGER NOT NULL,
    lang        TEXT NOT NULL,
    src_hash    TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    PRIMARY KEY (item_id, lang)
  );
  `,
];

export function dbPath(): string {
  const p = config.databasePath;
  return p === ":memory:" ? p : resolve(process.cwd(), p);
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  dbGeneration += 1;
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  // 调度器与手动 CLI 是两个进程共用一个 SQLite 文件，写锁竞争时多等一会儿，
  // 避免出现 "database is locked"（跑一次全量采集要几秒）。
  db.exec("PRAGMA busy_timeout = 20000;");
  // 限制 SQLite 内存占用，适配 ≤512MB 低配 VPS
  db.exec("PRAGMA cache_size = -8000;");
  db.exec("PRAGMA mmap_size = 0;");
  db.exec("PRAGMA temp_store = FILE;");
  db.function("is_zh", { deterministic: true }, (v) => {
    const t = typeof v === "string" ? v : "";
    let zh = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c >= 0x4e00 && c <= 0x9fff) zh += 1;
    }
    return zh >= 2 && zh / Math.max(t.length, 1) >= 0.12 ? 1 : 0;
  });
  return db;
}

export function migrate(): number {
  const conn = getDb();
  const row = conn.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const current = Number(row?.user_version ?? 0);
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    conn.exec(MIGRATIONS[v]!);
    conn.exec(`PRAGMA user_version = ${v + 1}`);
  }
  return Math.max(current, MIGRATIONS.length);
}

export function closeDb(): void {
  db?.close();
  db = null;
}

/** O(1) 版本号：覆盖本连接写入、外部 CLI 写入及数据库重新打开。 */
export function dbRevision(): string {
  const conn = getDb();
  const local = conn.prepare("SELECT total_changes() AS n").get() as { n: number };
  const external = conn.prepare("PRAGMA data_version").get() as { data_version: number };
  return `${dbGeneration}:${local.n}:${external.data_version}`;
}

export type SqlValue = string | number | bigint | null | Uint8Array;

export function all<T>(sql: string, ...params: SqlValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: SqlValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlValue[]) {
  return getDb().prepare(sql).run(...params);
}

/**
 * 写事务：BEGIN IMMEDIATE 先拿写锁再读，邀请码核销这类「读-判-写」必须用它，
 * 否则两个并发请求会同时读到 used_count 还没满而超发。
 */
export function txImmediate<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function tx<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
