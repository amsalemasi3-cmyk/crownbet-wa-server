# 👑 CrownBet WA Server

שרת WhatsApp אוטומציה לשליחת הגרלות ספורט.

## העלאה ל-Railway

1. העלה את כל הקבצים ל-GitHub repo חדש
2. ב-Railway לחץ "New Project" → "Deploy from GitHub"
3. בחר את ה-repo
4. Railway יבנה ויפעיל אוטומטית

## Environment Variables

הגדר ב-Railway תחת Variables:
- `WA_SESSION` = crownbet
- `PORT` = 3000

## שימוש

אחרי ההעלאה:
1. כנס ל-URL שRailway נותן לך
2. תראה את סטטוס החיבור
3. סרוק QR מהלוגים
4. הכנס את כתובת השרת בפאנל הניהול

## API

- `GET /api/status` — סטטוס חיבור
- `GET /api/getGroups` — רשימת קבוצות
- `POST /api/sendText` — שלח טקסט
- `POST /api/sendImage` — שלח תמונה עם כיתוב
