# عُقدة سحب — vercel الاحسائ

حزمة جاهزة للنشر على **vercel**. العُقدة تسرّع السحب التلقائي
عبر موازاة العمل مع السيرفر الأصلي — **بدون** تخزين أي بيانات قاعدة هنا.

- رابط اللوحة: `https://tv-api.verx1.xyz/0000`
- نطاق العمل: كل المواقع

## النشر على Vercel (الأسرع)

1. فُكّ ضغط الملف.
2. نفّذ: `npm i -g vercel`
3. نفّذ: `vercel` ثم `vercel --prod`
4. من لوحة Vercel → **Settings → Environment Variables** أضف:
   - `NODE_PANEL_URL` = `https://tv-api.verx1.xyz/0000`
   - `NODE_TOKEN` = `nd_ضع-توكن-العقدة-هنا`
5. أعد النشر: `vercel --prod`
6. الكرون يعمل تلقائياً كل دقيقة (`vercel.json` جاهز).

## النشر على Render

1. ارفع المجلد إلى مستودع GitHub.
2. Render → **New → Web Service** → اختر المستودع.
3. Build: `npm install` · Start: `npm start`
4. أضف نفس متغيّرات البيئة أعلاه.

## النشر على Railway

1. Railway → **New Project → Deploy from GitHub**.
2. أضف متغيّرات البيئة نفسها — Railway يقرأ `railway.json` تلقائياً.

## النشر على VPS / aaPanel

ارفع `php/node.php` إلى موقعك وشغّله بالكرون كل دقيقة:

```
* * * * * /usr/bin/php /path/to/php/node.php >> /path/to/node.log 2>&1
```

## التأكد من الاتصال

بعد النشر افتح: `https://<رابط-العقدة>/` — يجب أن يظهر:
`{"ok":true,"node":"vercel الاحسائ"}`

بعدها ارجع للوحة → «عُقد السحب» واضغط **فحص الاتصال**.