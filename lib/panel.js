// lib/panel.js — عميل الاتصال باللوحة الأصلية
// كل الطلبات تخرج بعنوان POST واحد + توكن، فلا تُكشف أي أسرار قاعدة.

const PANEL = (process.env.NODE_PANEL_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.NODE_TOKEN || '';
const NAME  = process.env.NODE_NAME || 'node';
const UA    = '3almCore-Node/1.0 (+scraper)';

export const config = { PANEL, TOKEN, NAME };

export function assertConfig() {
  if (!PANEL) throw new Error('NODE_PANEL_URL غير مضبوط');
  if (!TOKEN) throw new Error('NODE_TOKEN غير مضبوط');
}

async function call(action, extra = {}, timeoutMs = 55000) {
  assertConfig();
  const url = `${PANEL}/api/node.php`;
  const body = JSON.stringify({ action, token: TOKEN, node: NAME, ...extra });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body,
      signal: ac.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`رد غير صالح من اللوحة (HTTP ${res.status})`); }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

/** نبضة: تسجّل العُقدة وتأخذ معلومات الإصدار */
export const hello   = () => call('hello', {}, 15000);
/** تاخذ قائمة روابط للاستيراد (من قائمة انتظار مشتركة في اللوحة) */
export const fetchBatch = (limit = 50) => call('batch', { limit });
/** ترجّع نتيجة استيراد رابط */
export const report = (payload) => call('report', { payload });
/** نبضة دورية مع الإحصاء */
export const beat   = (stats) => call('beat', { stats }, 20000);