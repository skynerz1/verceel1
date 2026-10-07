// lib/sources.js — جلب خفيف للصفحات
// نستعمل fetch الأصلية مع توازٍ محدود حتى لا نُغرق الموقع المصدر.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** يحدّد عدد الطلبات المتوازية */
export class Pool {
  constructor(size = 8) { this.size = Math.max(1, size); this.q = []; this.active = 0; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const exec = async () => {
        this.active++;
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally { this.active--; this.next(); }
      };
      if (this.active < this.size) exec(); else this.q.push(exec);
    });
  }
  next() { const n = this.q.shift(); if (n && this.active < this.size) n(); }
  async all(tasks) { return Promise.all(tasks.map((t) => this.run(t))); }
}

export async function getHtml(url, { timeout = 25000, retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.8,en;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: ac.signal,
        redirect: 'follow',
      });
      const body = await res.text();
      if (res.ok) return body;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
    if (i < retries) await sleep(400 * (i + 1));
  }
  throw lastErr || new Error('فشل الجلب');
}

/** يستخرج أول عدد صحيح من نص (نفس منطق المحرك الأصلي) */
export function firstInt(s) {
  const m = String(s || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** يستخرج روابط العناصر من صفحة قائمة بسيطة */
export function extractLinks(html, pattern) {
  const out = new Set();
  const re = new RegExp(pattern, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return [...out];
}

export { sleep };