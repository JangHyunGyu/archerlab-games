const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let source = fs.readFileSync(path.join(__dirname, '../../game-api-worker.js'), 'utf8');
source = source.replace(/export \{[^}]+\};/g, '');
source = source.replace('export default {', 'const __workerExport = {');
source += '\nglobalThis.__gameApiTest = { storeClientError, worker: __workerExport };';

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

  const localDb = createDb();
  const localRequest = new Request('https://game-api.yama5993.workers.dev/client-errors', {
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36' }
  });
  const localResponse = await context.__gameApiTest.storeClientError(localDb, localRequest, {
    appId: 'school-zombie-defense',
    errorType: 'console_error',
    message: '[console_error] Failed to process file: image zombie-walk-charger',
    url: 'http://127.0.0.1:8765/school-zombie-defense/?autostart=1'
  });
  assert.deepEqual(await localResponse.json(), {
    ok: true,
    ignored: true,
    reason: 'local_development_session'
  });
  assert.equal(localDb.writes.length, 0);

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

  // 같은 출처 이미지 preload 링크 실패는 IMG·CSS가 다시 받으므로 저장하지 않는다.
  const linuxUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
  for (const [appId, page, source] of [
    ['jewelria', 'https://game.archerlab.dev/jewelria/', 'https://game.archerlab.dev/jewelria/assets/images/ui/crafted-frame-v1.webp'],
    ['jewelria', 'https://game.archerlab.dev/jewelria/', 'https://game.archerlab.dev/jewelria/assets/images/ui/jewelria-splash.webp'],
    ['cat-tower', 'https://game.archerlab.dev/cat-tower/', 'https://game.archerlab.dev/cat-tower/assets/ui/crafted-button-v1.webp']
  ]) {
    const preloadDb = createDb();
    const preloadResponse = await context.__gameApiTest.storeClientError(preloadDb, new Request(browserRequest.url, {
      method: 'POST',
      headers: { 'User-Agent': linuxUa }
    }), {
      appId,
      errorType: 'resource_error',
      message: '[resource_error] Failed to load resource: LINK',
      url: page,
      source,
      context: { language: 'ko', tag: 'LINK' }
    });
    assert.deepEqual(await preloadResponse.json(), { ok: true, ignored: true, reason: 'optional_image_preload_hint' });
    assert.equal(preloadDb.writes.length, 0);
  }
  // 스타일시트 LINK, 다른 출처 이미지, IMG 태그 실패는 그대로 남긴다.
  for (const [source, tag] of [
    ['https://game.archerlab.dev/jewelria/assets/css/premium.css', 'LINK'],
    ['https://cdn.example.com/jewelria/assets/images/ui/frame.webp', 'LINK'],
    ['https://game.archerlab.dev/jewelria/assets/images/ui/crafted-frame-v1.webp', 'IMG']
  ]) {
    const keptDb = createDb();
    const keptResponse = await context.__gameApiTest.storeClientError(keptDb, new Request(browserRequest.url, {
      method: 'POST',
      headers: { 'User-Agent': linuxUa }
    }), {
      appId: 'jewelria',
      errorType: 'resource_error',
      message: '[resource_error] Failed to load resource: ' + tag,
      url: 'https://game.archerlab.dev/jewelria/',
      source,
      context: { tag }
    });
    assert.deepEqual(await keptResponse.json(), { ok: true });
    assert.equal(keptDb.writes.length, 1);
  }

  // PeerJS 시그널링 서버 연결이 끊긴 것(err.type 'network')은 실제 네트워크 끊김이라 저장하지 않는다.
  const peerUa = 'Mozilla/5.0 (iPad; CPU OS 17_7_11 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/605.1 NAVER(inapp; search; 2100; 12.23.72)';
  for (const message of [
    '[console_error] ERROR PeerJS:  Error: Lost connection to server.',
    '[console_error] [PeerJS] Host error: network Lost connection to server.',
    '[console_error] [PeerJS] Client error: network Lost connection to server.'
  ]) {
    const peerDb = createDb();
    const peerResponse = await context.__gameApiTest.storeClientError(peerDb, new Request(browserRequest.url, {
      method: 'POST',
      headers: { 'User-Agent': peerUa }
    }), {
      appId: 'slimevolley',
      errorType: 'console_error',
      message,
      url: 'https://game.archerlab.dev/slimevolley/'
    });
    assert.deepEqual(await peerResponse.json(), { ok: true, ignored: true, reason: 'peerjs_signaling_network_lost' });
    assert.equal(peerDb.writes.length, 0);
  }
  // 네트워크가 아닌 PeerJS 오류와 코드 버그는 그대로 남긴다.
  for (const message of [
    '[console_error] [PeerJS] Host error: browser-incompatible The current browser does not support WebRTC',
    "[console_error] TypeError: Cannot read properties of null (reading 'send')"
  ]) {
    const keepDb = createDb();
    const keepResponse = await context.__gameApiTest.storeClientError(keepDb, browserRequest, {
      appId: 'slimevolley',
      errorType: 'console_error',
      message
    });
    assert.deepEqual(await keepResponse.json(), { ok: true });
    assert.equal(keepDb.writes.length, 1);
  }

  // sendBeacon은 CORS 사전 요청을 피하려고 text/plain으로 보낸다. fetch 핸들러가 이 본문도 JSON으로 저장해야 한다.
  const beaconDb = createDb();
  const beaconResponse = await context.__gameApiTest.worker.fetch(new Request('https://game-api.yama5993.workers.dev/client-errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Origin: 'https://game.archerlab.dev',
      'User-Agent': 'Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36'
    },
    body: JSON.stringify({ game_id: 'blockpang', error_type: 'error', message: 'beacon text/plain body', url: 'https://game.archerlab.dev/blockpang/' })
  }), { DB: beaconDb });
  assert.equal(beaconResponse.status, 200);
  assert.equal(beaconDb.writes.length, 1);
  assert.equal(beaconDb.writes[0].values[0], 'blockpang');
  assert.equal(beaconDb.writes[0].values[2], '[error] beacon text/plain body');

  console.log('✓ game API client-error automation filtering verified');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
