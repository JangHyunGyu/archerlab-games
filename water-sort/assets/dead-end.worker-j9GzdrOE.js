/* iOS < 13.4 compatibility polyfills */
(function () {
  'use strict';
  var root = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
  if (!root || root.__archerIos12CompatApplied) return;
  if (typeof globalThis === 'undefined') {
    try { root.globalThis = root; } catch (_e) {}
  }
  function def(obj, key, val) {
    if (!obj || typeof obj[key] === 'function') return;
    try {
      Object.defineProperty(obj, key, { value: val, writable: true, configurable: true });
    } catch (_e) {
      try { obj[key] = val; } catch (_e2) {}
    }
  }
  def(Object, 'hasOwn', function (obj, prop) {
    if (obj == null) throw new TypeError('Cannot convert undefined or null to object');
    return Object.prototype.hasOwnProperty.call(Object(obj), prop);
  });
  def(Object, 'fromEntries', function (entries) {
    var out = {};
    if (entries == null) throw new TypeError("Object.fromEntries requires an iterable");
    if (typeof Symbol === 'function' && Symbol.iterator && typeof entries[Symbol.iterator] === 'function') {
      var it = entries[Symbol.iterator]();
      var step;
      while (!(step = it.next()).done) {
        var pair = step.value;
        if (!pair || (typeof pair !== 'object' && typeof pair !== 'function')) throw new TypeError('Iterator value is not an entry object');
        out[pair[0]] = pair[1];
      }
      return out;
    }
    for (var i = 0; i < entries.length; i++) {
      out[entries[i][0]] = entries[i][1];
    }
    return out;
  });
  function atHelper(len, n) {
    var i = Number(n);
    i = i !== i ? 0 : (i < 0 ? Math.ceil(i) : Math.floor(i));
    if (i < 0) i += len;
    return (i < 0 || i >= len) ? -1 : i;
  }
  def(Array.prototype, 'at', function (n) {
    if (this == null) throw new TypeError("Array.prototype.at called on null or undefined");
    var list = Object(this);
    var k = atHelper(list.length >>> 0, n);
    return k < 0 ? undefined : list[k];
  });
  def(String.prototype, 'at', function (n) {
    if (this == null) throw new TypeError("String.prototype.at called on null or undefined");
    var s = String(this);
    var k = atHelper(s.length, n);
    return k < 0 ? undefined : s.charAt(k);
  });
  def(Array.prototype, 'findLastIndex', function (predicate, thisArg) {
    if (this == null) throw new TypeError("Array.prototype.findLastIndex called on null or undefined");
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    for (var i = (list.length >>> 0) - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) return i;
    }
    return -1;
  });
  def(Array.prototype, 'findLast', function (predicate, thisArg) {
    if (this == null) throw new TypeError("Array.prototype.findLast called on null or undefined");
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    for (var i = (list.length >>> 0) - 1; i >= 0; i--) {
      if (predicate.call(thisArg, list[i], i, list)) return list[i];
    }
    return undefined;
  });
  def(String.prototype, 'replaceAll', function (search, replacement) {
    if (this == null) throw new TypeError("String.prototype.replaceAll called on null or undefined");
    var str = String(this);
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return str.replace(search, replacement);
    }
    var needle = String(search);
    var isFn = typeof replacement === 'function';
    var repStr = isFn ? null : String(replacement);
    var hasDollar = !isFn && repStr.indexOf("$") !== -1;
    function subst(idx) {
      if (!hasDollar) return repStr;
      var outR = "";
      for (var k = 0; k < repStr.length; k++) {
        if (repStr.charAt(k) === "$" && k + 1 < repStr.length) {
          var ch = repStr.charAt(k + 1);
          if (ch === "$") { outR += "$"; k++; continue; }
          if (ch === "&") { outR += needle; k++; continue; }
          if (ch === "`") { outR += str.slice(0, idx); k++; continue; }
          if (ch === "'") { outR += str.slice(idx + needle.length); k++; continue; }
        }
        outR += repStr.charAt(k);
      }
      return outR;
    }
    var out = "";
    var pos = 0;
    if (needle.length === 0) {
      for (var i = 0; i <= str.length; i++) {
        var piece = isFn ? String(replacement("", i, str)) : subst(i);
        out += piece + (i < str.length ? str.charAt(i) : "");
      }
      return out;
    }
    while (true) {
      var idx = str.indexOf(needle, pos);
      if (idx === -1) return out + str.slice(pos);
      var val = isFn ? String(replacement(needle, idx, str)) : subst(idx);
      out += str.slice(pos, idx) + val;
      pos = idx + needle.length;
    }
  });
  def(String.prototype, 'matchAll', function (regexp) {
    if (this == null) throw new TypeError("String.prototype.matchAll called on null or undefined");
    var str = String(this);
    var re;
    if (regexp instanceof RegExp) {
      if (!regexp.global) throw new TypeError('matchAll must be called with a global RegExp');
      re = new RegExp(regexp.source, regexp.flags);
      re.lastIndex = regexp.lastIndex;
    } else {
      re = new RegExp(regexp, 'g');
    }
    var iter = {
      next: function () {
        var m = re.exec(str);
        if (!m) return { value: undefined, done: true };
        if (m[0] === '') re.lastIndex = re.lastIndex + 1;
        return { value: m, done: false };
      }
    };
    if (typeof Symbol === 'function' && Symbol.iterator) {
      iter[Symbol.iterator] = function () { return this; };
    }
    return iter;
  });
  if (typeof Promise === 'function') {
    def(Promise, 'allSettled', function (promises) {
      var list = Array.from(promises);
      if (!list.length) return Promise.resolve([]);
      return new Promise(function (resolve) {
        var results = new Array(list.length);
        var remaining = list.length;
        function done(i, item) {
          results[i] = item;
          remaining -= 1;
          if (remaining === 0) resolve(results);
        }
        for (var i = 0; i < list.length; i++) {
          (function (idx) {
            Promise.resolve(list[idx]).then(
              function (value) { done(idx, { status: 'fulfilled', value: value }); },
              function (reason) { done(idx, { status: 'rejected', reason: reason }); }
            );
          })(i);
        }
      });
    });
    def(Promise, 'any', function (promises) {
      var list = Array.from(promises);
      return new Promise(function (resolve, reject) {
        if (!list.length) {
          var emptyErr = new Error('All promises were rejected');
          emptyErr.name = 'AggregateError'; emptyErr.errors = [];
          reject(emptyErr); return;
        }
        var errors = new Array(list.length);
        var remaining = list.length;
        for (var i = 0; i < list.length; i++) {
          (function (idx) {
            Promise.resolve(list[idx]).then(resolve, function (err) {
              errors[idx] = err;
              remaining -= 1;
              if (remaining === 0) {
                var agg = new Error('All promises were rejected');
                agg.name = 'AggregateError'; agg.errors = errors;
                reject(agg);
              }
            });
          })(i);
        }
      });
    });
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function' && typeof AbortController === 'function') {
    def(AbortSignal, 'timeout', function (ms) {
      var controller = new AbortController();
      setTimeout(function () {
        try {
          controller.abort(typeof DOMException === 'function' ? new DOMException('The operation was aborted due to timeout', 'TimeoutError') : undefined);
        } catch (_e) {
          controller.abort();
        }
      }, Number(ms) || 0);
      return controller.signal;
    });
  }
  if (typeof root.crypto !== 'undefined' && typeof root.crypto.randomUUID !== 'function' && typeof root.crypto.getRandomValues === 'function') {
    def(root.crypto, 'randomUUID', function () {
      var b = new Uint8Array(16);
      root.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) {
        hex.push((b[i] < 16 ? '0' : '') + b[i].toString(16));
      }
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
    });
  }
  try { root.__archerIos12CompatApplied = true; } catch (_e) {}
})();
(function(){let b=e=>e.map(t=>[...t]),d=e=>e.length===4&&e.every(t=>t===e[0]),h=e=>e.every(t=>!t.length||d(t));function g(e,t,n){let r=e[t],l=e[n];if(!r||!l||t===n||!r.length||l.length===4||l.length&&l.at(-1)!==r.at(-1))return null;let s=b(e),o=r.at(-1);for(;s[t].at(-1)===o&&s[n].length<4;)s[n].push(s[t].pop());return s}let c=e=>e.some((t,n)=>t.length&&e.some((r,l)=>g(e,n,l))),p=e=>e.map(t=>t.join(",")).sort().join("|");function v(e,t=512){var s;if(h(e))return"solvable";if(!c(e))return"blocked";let n=new Map;for(let o of e)for(let a of o)n.set(a,((s=n.get(a))!=null?s:0)+1);if([...n.values()].some(o=>o!==4))return"unknown";let r=new Set([p(e)]),l=[e];for(;l.length;){let o=l.pop(),a=[];for(let i=0;i<o.length;i++)if(o[i].length)for(let u=0;u<o.length;u++){let f=g(o,i,u);if(!f)continue;if(h(f))return"solvable";let m=p(f);if(!r.has(m)){if(r.size>=t)return"unknown";r.add(m),a.push({board:f,priority:+(f[u].length===4)*4+ +!f[i].length*2+ +!!o[u].length})}}a.sort((i,u)=>i.priority-u.priority),l.push(...a.map(i=>i.board))}return"blocked"}self.onmessage=({data:e})=>{let t={id:e.id,version:e.version,outcome:v(e.board)};self.postMessage(t)}})();
