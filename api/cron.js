// api/cron.js — دورة واحدة. يستدعيها Vercel Cron كل دقيقة.
// Vercel Serverless لا يعمل فيه setInterval، لذا كل نداء = دورة كاملة.

import { config, assertConfig, hello, fetchBatch, report, beat } from '../lib/panel.js';
import { Pool, getHtml, sleep } from '../lib/sources.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  const started = Date.now();
  try {
    assertConfig();
    const h = await hello();
    const limit = Math.max(1, parseInt(process.env.NODE_BATCH || '20', 10));
    const conc  = Math.max(1, parseInt(process.env.NODE_CONCURRENCY || '6', 10));

    const { items = [] } = await fetchBatch(limit);
    if (!items.length) {
      res.status(200).json({ ok: true, node: config.NAME, handled: 0 });
      return;
    }

    const pool = new Pool(conc);
    let ok = 0;
    const errors = [];

    await pool.all(items.map((it) => async () => {
      try {
        // جلب الصفحة هنا يعني أن السحب يجري من شبكة Vercel — أسرع وأخفّ على سيرفرك
        const html = await getHtml(it.url).catch(() => '');
        await report({ url: it.url, ok: true, size: html.length });
        ok++;
      } catch (e) {
        errors.push({ url: it.url, error: String(e.message || e) });
        await report({ url: it.url, ok: false, error: String(e.message || e) }).catch(() => {});
      }
    }));

    const ms = Date.now() - started;
    await beat({ cycles: 1, jobs: ok, errors: errors.length, ms }).catch(() => {});

    res.status(200).json({ ok: true, node: config.NAME, handled: ok, errors: errors.length, ms });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}