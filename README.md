# Unica Home

דשבורד בית חכם למסך קיר / טאבלט: אתר סטטי (`docs/`) + עטיפת אנדרואיד ב-Capacitor.
בלי build ובלי framework. כרגע הנתונים הם דמו (נשמרים ב-localStorage).

## הרצה מקומית
```bash
npm install
npm run serve        # http://localhost:8080
```

## GitHub Pages
Settings → Pages → Source: *Deploy from a branch* → Branch `main`, תיקייה `/docs`.
הכתובת: `https://<משתמש>.github.io/<ריפו>/`

## APK
**בענן (מומלץ):** Actions → *Build Android APK* → Run workflow → להוריד את ה-artifact `unica-home-debug-apk`.

**מקומית** (דורש Android SDK + JDK 21 + רשת):
```bash
npm install
npm run apk          # → android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release  # דורש חתימה (keystore)
```
אחרי שינוי באתר: `npm run sync`. אחרי החלפת הלוגו ב-`assets/`: `npm run assets`.

### אחרי ההתקנה על המכשיר
- להעניק *Display over other apps* (אנדרואיד 10+) כדי שההפעלה אוטומטית בעליית המכשיר תעבוד.
- המסך נשאר דלוק ובמצב immersive. נגינה ברקע עם מסך כבוי לא נתמכת (WebView עוצר אודיו).

## ניווט
האתר בנוי כ-Pager אופקי (swipe): מדיה, תאורה, מיזוג, תריסים, אבטחה, אנרגיה. סרגל לשוניות בתחתית מסמן את הדף. מותאם ל-Galaxy Tab A11 (8.7", לרוחב ולאורך). בקוד: `Widgets.register({ page: "lights", ... })`, `unica.Pager.goto("climate")`.

## הוספת יכולת חדשה
קובץ JS חדש שנטען אחרי `app.js`:
```js
Widgets.register({ id: 'x', size: 6, order: 60, render(el, home) { el.innerHTML = '…'; } });
```
כל שינוי מצב עובר דרך `home.set(path, val)` – שם מחברים בעתיד Home Assistant / MQTT.
API לאוטומציות: `unica.radio.play('Kan Bet')`, `unica.scene('night')`, `unica.lights.all(false)`.

## רדיו
Radio Browser (radio-browser.info), עם fallback בין מראות. כתובות השידור נפתרות בזמן ניגון ולא מקודדות.

## שומר מסך
אחרי 5 דקות בלי מגע: מסך שחור, הלוגו עולה בפייד במקום אקראי, הספרות נמסות מטה כמו Matrix, האותיות מתמוססות בסדר אקראי, ושוב מחדש במקום אחר. מגע או מקש מעירים (המגע לא מפעיל כלום מתחת). הרדיו ממשיך לנגן.
שליטה מהקונסול / אוטומציה: `unica.screensaver.start()`, `.stop()`, `.setMinutes(10)`, `.setEnabled(false)`.
