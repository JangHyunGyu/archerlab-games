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

  for (const userAgent of [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/136.0.0.0 Safari/537.36 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
    'Mozilla/5.0 (compatible; YandexRenderResourcesBot/1.0; +http://yandex.com/bots) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0'
  ]) {
    const automatedDb = createDb();
    const automatedRequest = new Request('https://game-api.yama5993.workers.dev/client-errors', {
      method: 'POST',
      headers: { 'User-Agent': userAgent }
    });
    const automatedResponse = await context.__gameApiTest.storeClientError(automatedDb, automatedRequest, {
      appId: 'slimevolley',
      errorType: 'resource_error',
      message: '[resource_error] Failed to load resource: SCRIPT'
    });
    assert.deepEqual(await automatedResponse.json(), { ok: true, ignored: true });
    assert.equal(automatedDb.writes.length, 0);
  }

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

  const recoveredDb = createDb();
  const recoveredResponse = await context.__gameApiTest.storeClientError(recoveredDb, browserRequest, {
    appId: 'lumen-shift',
    errorType: 'RendererError',
    message: 'WebGL renderer failed',
    context: { fallbackSucceeded: true }
  });
  assert.deepEqual(await recoveredResponse.json(), {
    ok: true,
    ignored: true,
    reason: 'recovered_by_fallback'
  });
  assert.equal(recoveredDb.writes.length, 0);

  const exhaustedDb = createDb();
  const exhaustedResponse = await context.__gameApiTest.storeClientError(exhaustedDb, browserRequest, {
    appId: 'lumen-shift',
    errorType: 'RendererError',
    message: 'Canvas fallback also failed',
    extra: { fallbackSucceeded: true, recoveryExhausted: true }
  });
  assert.deepEqual(await exhaustedResponse.json(), { ok: true });
  assert.equal(exhaustedDb.writes.length, 1);

  const base64Db = createDb();
  const base64Response = await context.__gameApiTest.storeClientError(base64Db, browserRequest, {
    appId: 'custom-game',
    errorType: 'console_error',
    message: '[R2] Avatar upload failed, base64 폴백: Failed to fetch'
  });
  assert.deepEqual(await base64Response.json(), {
    ok: true,
    ignored: true,
    reason: 'successful_base64_fallback'
  });
  assert.equal(base64Db.writes.length, 0);

  console.log('✓ game API client-error automation filtering verified');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
