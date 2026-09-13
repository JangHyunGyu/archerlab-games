const GAME_ID = 'lumen-shift';
const RANK_API_BASE = 'https://game-api.yama5993.workers.dev';
const MAX_RANK_EVENT_QUEUE = 96;

export class RankClient {
  constructor() {
    this.sessionId = '';
    this.queue = [];
    this.disabled = false;
    this.syncing = false;
  }

  async start() {
    this.sessionId = '';
    this.queue = [];
    this.disabled = false;
    try {
      const res = await fetch(`${RANK_API_BASE}/score-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ game_id: GAME_ID }),
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const data = await res.json();
      this.sessionId = data.session_id || '';
      if (!this.sessionId) throw new Error('empty session');
    } catch {
      this.disabled = true;
    }
  }

  record(event) {
    if (this.disabled || !event) return;
    const delta = Math.floor(Number(event.delta || 0));
    if (!Number.isFinite(delta) || delta <= 0) return;
    const queuedEvent = {
      ...event,
      delta,
      level: Math.floor(Number(event.level || 1)),
      combo: Math.floor(Number(event.combo || 0)),
      at: Date.now(),
    };
    globalThis.ArcherRanking?.track(GAME_ID, queuedEvent, this.sessionId);
    this.queue.push(queuedEvent);
    if (this.queue.length >= 8) this.flush().catch(() => null);
  }

  async flush() {
    if (this.flushPromise) return this.flushPromise;
    if (this.disabled || !this.sessionId) return false;
    if (this.queue.length === 0) return true;
    this.flushPromise = this.flushQueue();
    try { return await this.flushPromise; } finally { this.flushPromise = null; }
  }

  async flushQueue() {
    this.syncing = true;
    try {
      while (this.queue.length > 0) {
        const events = this.queue.slice(0, 20);
        const res = await fetch(`${RANK_API_BASE}/score-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ game_id: GAME_ID, session_id: this.sessionId, events }),
        });
        if (!res.ok) throw new Error(`events ${res.status}`);
        this.queue.splice(0, events.length);
      }
      return true;
    } catch {
      return false;
    } finally {
      this.syncing = false;
    }
  }

  async submit(playerName, score, extraData) {
    if (globalThis.ArcherRanking) {
      this.queue.forEach(event => globalThis.ArcherRanking.track(GAME_ID, event, this.sessionId));
      return globalThis.ArcherRanking.submit({ game_id: GAME_ID, player_name: playerName,
        score: Math.floor(score), session_id: this.sessionId, extra_data: extraData });
    }
    if (this.disabled || !this.sessionId) throw new Error('ranking offline');
    const synced = await this.flush();
    if (!synced) throw new Error('score sync failed');
    const res = await fetch(`${RANK_API_BASE}/rankings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        game_id: GAME_ID,
        player_name: playerName,
        score: Math.floor(score),
        session_id: this.sessionId,
        extra_data: extraData,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `submit ${res.status}`);
    return data;
  }

  async fetchTop(limit = 20) {
    const res = await fetch(`${RANK_API_BASE}/rankings?game_id=${encodeURIComponent(GAME_ID)}&limit=${limit}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ranking ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.rankings) ? data.rankings : [];
  }
}
