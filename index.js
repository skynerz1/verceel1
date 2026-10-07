// index.js — نقطة دخول عُقدة السحب (Web Service + حلقة نبض دائمة)
// على Vercel لا يعمل هذا الملف؛ يعمل api/cron.js بدلاً منه.

import http from 'node:http';
import { config, assertConfig, hello, beat } from './lib/panel.js';
import { Pool } from './lib/sources.js';

const INTERVAL = Math.max(30, parseInt(process.env.NODE_INTERVAL || '60', 10));
const BATCH    = Math.max(1, parseInt(process.env.NODE_BATCH || '50', 10));
const CONC     = Math.max(1, parseInt(process.env.NODE_CONCURRENCY || '8', 10));
const PORT     = parseInt(process.env.PORT || '3000', 10);

const stats = { cycles: 0, jobs: 0, errors: 0, startedAt: Date.now(), lastMs: 0 };

// سيرفر صغير للصحة (منصّات النشر تحتاجه)
const server = http.createServer(async (req, res) => {
  if (req.url === '/run') {
    const t0 = Date.now();
    try {
      const r = await cycle();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...r, ms: Date.now() - t0 }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, node: config.NAME, stats }));
});

async function cycle() {
  const t0 = Date.now();
  stats.cycles++;
  let handled = 0;
  try {
    // 1) نبضة: العُقدة حيّة + تأخذ إعداداتها
    const h = await hello();
    const limit = Math.min(BATCH, h.batch || BATCH);

    // 2) نطلب روابط للاستيراد — اللوحة تعطي كل عقدة دفعة مختلفة
    const { items = [] } = await fetchBatchSafe(limit);
    if (!items.length) { stats.lastMs = Date.now() - t0; return { handled: 0 }; }

    // 3) نستورد بالتوازي ثم نُبلّغ اللوحة
    const pool = new Pool(CONC);
    await pool.all(items.map((it) => async () => {
      try {
        await handleItem(it);
        stats.jobs++; handled++;
        await report({ url: it.url, ok: true });
      } catch (e) {
        stats.errors++;
        await report({ url: it.url, ok: false, error: String(e.message || e) }).catch(() => {});
      }
    }));
    await beat({ ...stats, handled });
  } catch (e) {
    stats.errors++;
    console.error('[node] cycle error:', e.message);
  }
  stats.lastMs = Date.now() - t0;
  return { handled };
}

async function fetchBatchSafe(limit) {
  const mod = await import('./lib/panel.js');
  return mod.fetchBatch(limit);
}

/** معالجة عنصر واحد: نطبّع الرابط ونرسله للوحة لتسجيله في الطابور */
async function handleItem(it) {
  // العُقدة لا تكتب في القاعدة أبداً — ترسل النتيجة للوحة فقط
  const mod = await import('./lib/panel.js');
  return mod.report({ url: it.url, ok: true, scraped: true, node: config.NAME });
}

async function loop() {
  try { assertConfig(); } catch (e) { console.error('✖', e.message); process.exit(1); }
  console.log(`▶ عُقدة ${config.NAME} — تتصل بـ ${config.PANEL}`);
  server.listen(PORT, () => console.log(`✔ صحة على المنفذ ${PORT}`));
  cycle();
  setInterval(cycle, INTERVAL * 1000);
}

loop();