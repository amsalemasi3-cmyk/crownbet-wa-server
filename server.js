const express = require('express');
const cors = require('cors');
const { create } = require('@open-wa/wa-automate');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let waClient = null;
let isReady = false;

// ── Start WA Client ──
create({
  sessionId: process.env.WA_SESSION || 'crownbet',
  multiDevice: true,
  authTimeout: 60,
  blockCrashLogs: true,
  disableSpins: true,
  headless: true,
  logConsole: false,
  popup: false,
  qrTimeout: 0,
  killProcessOnBrowserClose: true,
  throwErrorOnTosBlock: false,
  chromiumArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
}).then(client => {
  waClient = client;
  isReady = true;
  console.log('✅ WhatsApp מחובר ומוכן!');

  client.onStateChanged(state => {
    console.log('WA State:', state);
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
      client.forceRefocus();
    }
  });

}).catch(err => {
  console.error('❌ שגיאה בהפעלת WhatsApp:', err.message);
});

// ── ROUTES ──

// Status check
app.get('/api/status', (req, res) => {
  res.json({
    ready: isReady,
    message: isReady ? 'WhatsApp מחובר' : 'ממתין לחיבור...'
  });
});

// Get session info
app.get('/api/getSessionInfo', (req, res) => {
  res.json({ ready: isReady, session: process.env.WA_SESSION || 'crownbet' });
});

// Send text message
app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waClient) {
    return res.status(503).json({ error: 'WhatsApp לא מחובר עדיין' });
  }

  const { chatId, content } = req.body;

  if (!chatId || !content) {
    return res.status(400).json({ error: 'חסר chatId או content' });
  }

  try {
    await waClient.sendText(chatId, content);
    console.log(`✅ הודעה נשלחה ל-${chatId}`);
    res.json({ success: true, message: 'הודעה נשלחה!' });
  } catch (err) {
    console.error('❌ שגיאה בשליחה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send image with caption
app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waClient) {
    return res.status(503).json({ error: 'WhatsApp לא מחובר עדיין' });
  }

  const { chatId, url, caption } = req.body;

  if (!chatId || !url) {
    return res.status(400).json({ error: 'חסר chatId או url' });
  }

  try {
    await waClient.sendImage(chatId, url, 'raffle', caption || '');
    console.log(`✅ תמונה נשלחה ל-${chatId}`);
    res.json({ success: true, message: 'תמונה נשלחה!' });
  } catch (err) {
    console.error('❌ שגיאה בשליחת תמונה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get all groups
app.get('/api/getGroups', async (req, res) => {
  if (!isReady || !waClient) {
    return res.status(503).json({ error: 'WhatsApp לא מחובר' });
  }
  try {
    const chats = await waClient.getAllGroups();
    const groups = chats.map(g => ({ id: g.id, name: g.name }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QR code endpoint (for display)
app.get('/qr', (req, res) => {
  res.send(`
    <html dir="rtl">
    <head><meta charset="utf-8"><title>CrownBet QR</title></head>
    <body style="background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem">
      <h1 style="color:#f5c842">👑 CrownBet WA Server</h1>
      <p>סטטוס: ${isReady ? '✅ מחובר!' : '⏳ ממתין לסריקת QR...'}</p>
      <p style="color:#7070a0;font-size:14px">בדוק את הלוגים ב-Railway לסריקת ה-QR code</p>
      <br>
      <a href="/api/status" style="color:#f5c842">בדוק סטטוס</a>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => res.redirect('/qr'));

app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
  console.log(`📱 כנס ל-/qr לבדיקת סטטוס`);
});
