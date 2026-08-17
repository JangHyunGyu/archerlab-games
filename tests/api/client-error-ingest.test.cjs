const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let source = fs.readFileSync(path.join(__dirname, '../../game-api-worker.js'), 'utf8');
source = source.replace('export default {', 'const __workerExport = {');
source += '\nglobalThis.__gameApiTest = { storeClientError };';

const context = {
  console,
  Request,
  Response,
  Headers,
  URL,
  crypto,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'game-api-worker.js' });

function createDb() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              writes.push({ sql, values });
              return { success: true };
            }
          };
        }
      };
    }
  };
}

(async () => {
  const crawlerDb = createDb();
  const crawlerRequest = new Request('https://game-api.yama5993.workers.dev/client-errors', {
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Google-Read-Aloud)' }
  });
  const crawlerResponse = await context.__gameApiTest.storeClientError(crawlerDb, crawlerRequest, {
    appId: 'blockpang',
    errorType: 'manual',
    message: '[manual] Rejected'
  });
  assert.deepEqual(await crawlerResponse.json(), { ok: true, ignored: true });
  assert.equal(crawlerDb.writes.length, 0);

  const yetiDb = createDb();
  const yetiRequest = new Request('https://game-api.yama5993.workers.dev/client-errors', {
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd) Chrome/149.0.0.0 Safari/537.36' }
  });
  const yetiResponse = await context.__gameApiTest.storeClientError(yetiDb, yetiRequest, {
    appId: 'parking_escape',
    errorType: 'manual',
    message: '[manual] Service Worker registration failed'
  });
  assert.deepEqual(await yetiResponse.json(), { ok: true, ignored: true });
  assert.equal(yetiDb.writes.length, 0);

  const browserDb = createDb();
  const browserRequest = new Request('https://game-api.yama5993.workers.dev/client-errors', {
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36' }
  });
  const browserResponse = await context.__gameApiTest.storeClientError(browserDb, browserRequest, {
    appId: 'blockpang',
    errorType: 'error',
    message: 'Real player failure'
  });
  assert.deepEqual(await browserResponse.json(), { ok: true });
  assert.equal(browserDb.writes.length, 1);

  console.log('✓ game API client-error automation filtering verified');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
