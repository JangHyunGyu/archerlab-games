const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function loadServer() {
  const context = { Request, Response, Headers, URL, crypto, TextEncoder, TextDecoder,
    console: { log() {}, error() {} },
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
  };
  context.globalThis = context;
  vm.createContext(context);
  let core = readFileSync(path.join(root, 'game-api-worker.js'), 'utf8')
    .replace('export default {', 'const api = {').replace(/export \{[^}]+\};/g, '');
  let entry = readFileSync(path.join(root, 'game-api-entry.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export (async function|class)/g, '$1')
    .replace('export default {', 'const deliveryWorker = {');
  vm.runInContext(core + '\n' + entry + '\nglobalThis.testing = { RankingDelivery, executeRankingCommand, initDB, deliveryWorker, api };', context);
  return context.testing;
}

function d1() {
  const sql = new DatabaseSync(':memory:');
  const db = { sql, offline: false, failStatement: -1, loseResponse: false,
    prepare(query) {
      function statement(values = []) {
        return {
          query, values,
          bind: (...next) => statement(next),
          async first() { if (db.offline) throw new Error('DB offline'); return sql.prepare(query).get(...values) || null; },
          async all() { if (db.offline) throw new Error('DB offline'); return { results: sql.prepare(query).all(...values) }; },
          async run() { if (db.offline) throw new Error('DB offline'); const result = sql.prepare(query).run(...values); return { meta: { changes: Number(result.changes) } }; },
        };
      }
      return statement();
    },
    async batch(statements) {
      if (db.offline) throw new Error('DB offline');
      sql.exec('BEGIN');
      try {
        for (let i = 0; i < statements.length; i++) {
          if (i === db.failStatement) throw new Error('injected mid-transaction failure');
          const s = statements[i]; sql.prepare(s.query).run(...s.values);
        }
        sql.exec('COMMIT');
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
      if (db.loseResponse) { db.loseResponse = false; throw new Error('committed but response lost'); }
      return statements.map(() => ({ success: true }));
    },
  };
  return db;
}

function storage() {
  const sql = new DatabaseSync(':memory:');
  const store = { alarmAt: null,
    sql: { exec(query, ...values) {
      const statement = sql.prepare(query);
      const rows = statement.columns().length ? statement.all(...values) : (statement.run(...values), []);
      return { toArray: () => rows };
    } },
    transactionSync(callback) { sql.exec('BEGIN'); try { const result = callback(); sql.exec('COMMIT'); return result; } catch (error) { sql.exec('ROLLBACK'); throw error; } },
    async setAlarm(at) { store.alarmAt = at; },
    async deleteAlarm() { store.alarmAt = null; },
  };
  return store;
}

const server = loadServer();
function fixture(game = 'lumen-shift') {
  const db = d1(); const durable = storage(); const session = crypto.randomUUID();
  const mailbox = new server.RankingDelivery({ storage: durable }, { DB: db });
  let after = null;
  function command(path, data = {}) {
    const item = { id: crypto.randomUUID(), path, body: { game_id: game, ...data }, after };
    if (path !== '/score-sessions') item.body.session_id = session;
    after = item.id;
    return item;
  }
  const accept = commands => mailbox.accept(session, game, commands, {});
  const event = () => command('/score-events', { events: [{ type: 'clear', lines: 1, level: 1, combo: 1, delta: 100 }] });
  const ranking = (score = 100, name = 'Recovery test') => command('/rankings', { player_name: name, score });
  const expireRetry = () => durable.sql.exec("UPDATE jobs SET next_at = 0 WHERE state = 'pending'");
  return { db, durable, mailbox, session, command, accept, event, ranking, expireRetry };
}


module.exports = { server, d1, storage, fixture };
