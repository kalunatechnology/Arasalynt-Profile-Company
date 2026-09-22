'use strict';

/**
 * Database Connection & Migration Module
 * 
 * Supports MySQL/MariaDB (Hostinger Business single source of truth)
 * with SQLite fallback for local development or during offline migration.
 * All tables use the `wa_` prefix.
 */

const path = require('path');
const fs = require('fs');

let mysqlPool = null;
let sqliteDb = null;
let dbType = 'sqlite';

const DB_CONFIG = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let initPromise = null;

async function initDatabase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const hasMySQLConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
    const isServerlessRuntime = Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.env.NOW_REGION
    );
    const requireMySQL =
      String(process.env.WA_REQUIRE_MYSQL || 'false').toLowerCase() === 'true' ||
      (process.env.NODE_ENV === 'production' && isServerlessRuntime);

    if (hasMySQLConfig) {
      try {
        const mysql = require('mysql2/promise');
        mysqlPool = mysql.createPool({
          ...DB_CONFIG,
          connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
        });
        const conn = await mysqlPool.getConnection();
        await conn.ping();
        conn.release();
        dbType = 'mysql';
        console.log(`[Database] Terhubung ke MySQL/MariaDB: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
        await runMySQLMigrations(mysqlPool);
        return;
      } catch (err) {
        mysqlPool = null;
        if (requireMySQL) {
          throw new Error(`MySQL connection required but failed: ${err.message}`);
        }
        console.warn(`[Database] Gagal koneksi ke MySQL (${err.message}). Menggunakan SQLite persisten fallback.`);
      }
    } else if (requireMySQL) {
      throw new Error('MySQL persistence is required for this runtime, but DB_HOST/DB_USER/DB_NAME are incomplete.');
    }

    const Database = require('better-sqlite3');
    const dbPath = process.env.SQLITE_DB_PATH
      ? path.resolve(process.env.SQLITE_DB_PATH)
      : path.join(__dirname, '..', 'wa_reliability.db');

    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    dbType = 'sqlite';
    console.log(`[Database] SQLite persisten fallback aktif: ${dbPath}`);
    runSQLiteMigrations(sqliteDb);
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

async function runMySQLMigrations(pool) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS wa_conversations (
      id VARCHAR(64) PRIMARY KEY,
      short_code VARCHAR(16) NOT NULL UNIQUE,
      session_id VARCHAR(128),
      guest_name VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      logical_route VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
      priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
      ai_summary TEXT,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      resolved_at DATETIME NULL,
      INDEX idx_conv_status (status),
      INDEX idx_conv_short (short_code),
      INDEX idx_conv_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_messages (
      id VARCHAR(64) PRIMARY KEY,
      conversation_id VARCHAR(64) NOT NULL,
      direction VARCHAR(16) NOT NULL,
      sender_type VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      provider_message_id VARCHAR(128) NULL,
      delivery_status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_msg_conv (conversation_id, created_at),
      INDEX idx_msg_provider (provider_message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_outbound_events (
      id VARCHAR(64) PRIMARY KEY,
      request_id VARCHAR(128) NOT NULL UNIQUE,
      conversation_id VARCHAR(64) NOT NULL,
      message_id VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(128) NOT NULL UNIQUE,
      logical_route VARCHAR(32) NOT NULL DEFAULT 'GENERAL',
      physical_destination VARCHAR(32) NOT NULL,
      routing_mode VARCHAR(16) NOT NULL DEFAULT 'TEST',
      status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
      attempt_count INT NOT NULL DEFAULT 0,
      next_attempt_at DATETIME NULL,
      gateway_message_id VARCHAR(128) NULL,
      last_error TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      sent_at DATETIME NULL,
      delivered_at DATETIME NULL,
      read_at DATETIME NULL,
      INDEX idx_out_status_next (status, next_attempt_at),
      INDEX idx_out_conv (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_outbound_attempts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      outbound_event_id VARCHAR(64) NOT NULL,
      attempt_number INT NOT NULL,
      error_message TEXT NULL,
      response_payload TEXT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_att_event (outbound_event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_gateway_message_map (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      provider_message_id VARCHAR(128) NOT NULL UNIQUE,
      conversation_id VARCHAR(64) NOT NULL,
      outbound_event_id VARCHAR(64) NULL,
      short_code VARCHAR(16) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_map_prov (provider_message_id),
      INDEX idx_map_conv (conversation_id),
      INDEX idx_map_code (short_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_routing_decisions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      conversation_id VARCHAR(64) NOT NULL,
      requested_route VARCHAR(32) NOT NULL,
      resolved_route VARCHAR(32) NOT NULL,
      confidence DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
      ai_summary TEXT NULL,
      routing_mode VARCHAR(16) NOT NULL DEFAULT 'TEST',
      physical_destination VARCHAR(32) NOT NULL,
      fallback_used TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      INDEX idx_route_conv (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_inbound_events (
      id VARCHAR(64) PRIMARY KEY,
      provider_message_id VARCHAR(128) NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      from_jid VARCHAR(64) NOT NULL,
      body TEXT NULL,
      quoted_message_id VARCHAR(128) NULL,
      short_code VARCHAR(16) NULL,
      conversation_id VARCHAR(64) NULL,
      processing_status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
      processed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_inbound_semantic (provider_message_id, event_type),
      INDEX idx_in_status (processing_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wa_health_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      component VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      details TEXT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_health_comp (component, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
  console.log('[Database] Migrasi tabel MySQL (prefix wa_) selesai.');
}

function runSQLiteMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_conversations (
      id TEXT PRIMARY KEY,
      short_code TEXT NOT NULL UNIQUE,
      session_id TEXT,
      guest_name TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      logical_route TEXT NOT NULL DEFAULT 'GENERAL',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      ai_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conv_status ON wa_conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conv_short ON wa_conversations(short_code);
    CREATE INDEX IF NOT EXISTS idx_conv_session ON wa_conversations(session_id);

    CREATE TABLE IF NOT EXISTS wa_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      content TEXT NOT NULL,
      provider_message_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'CREATED',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON wa_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_msg_provider ON wa_messages(provider_message_id);

    CREATE TABLE IF NOT EXISTS wa_outbound_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      logical_route TEXT NOT NULL DEFAULT 'GENERAL',
      physical_destination TEXT NOT NULL,
      routing_mode TEXT NOT NULL DEFAULT 'TEST',
      status TEXT NOT NULL DEFAULT 'QUEUED',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      gateway_message_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_out_status_next ON wa_outbound_events(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_out_conv ON wa_outbound_events(conversation_id);

    CREATE TABLE IF NOT EXISTS wa_outbound_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outbound_event_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      error_message TEXT,
      response_payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wa_gateway_message_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_message_id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      outbound_event_id TEXT,
      short_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_map_prov ON wa_gateway_message_map(provider_message_id);
    CREATE INDEX IF NOT EXISTS idx_map_conv ON wa_gateway_message_map(conversation_id);

    CREATE TABLE IF NOT EXISTS wa_routing_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      requested_route TEXT NOT NULL,
      resolved_route TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      ai_summary TEXT,
      routing_mode TEXT NOT NULL DEFAULT 'TEST',
      physical_destination TEXT NOT NULL,
      fallback_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wa_inbound_events (
      id TEXT PRIMARY KEY,
      provider_message_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_jid TEXT NOT NULL,
      body TEXT,
      quoted_message_id TEXT,
      short_code TEXT,
      conversation_id TEXT,
      processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
      processed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider_message_id, event_type)
    );

    CREATE TABLE IF NOT EXISTS wa_health_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);
  console.log('[Database] Migrasi tabel SQLite (prefix wa_) selesai.');
}

async function query(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.query(sql, params);
    return rows;
  } else {
    // SQLite adapter
    const stmt = sqliteDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params);
    } else {
      const info = stmt.run(...params);
      return { insertId: info.lastInsertRowid, affectedRows: info.changes };
    }
  }
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

module.exports = {
  initDatabase,
  query,
  getOne,
  isMySQL: () => dbType === 'mysql',
  getPool: () => mysqlPool,
  getSqlite: () => sqliteDb,
};
