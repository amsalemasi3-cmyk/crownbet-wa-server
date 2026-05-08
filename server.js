const express = require('express');
const cors = require('cors');
const { create } = require('@open-wa/wa-automate');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let waClient = null;
let isReady = false;
let currentQR = null;

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
  useChrome: false,
  chromiumArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--single-process'
  ],
  onQr: (qr) => {
    currentQR = qr;
    console.log('QR מוכן — כנס ל /qr');
  }
}).then(client => {
  waClient = client;
  isReady = true;
  currentQR = null;
  console.log('WhatsApp מחובר!');
  client.onStateChanged(state => {
    if (state === 'CONFLICT' || state === 'UNLAUNCHED') client.forceRefocus();
  });
}).catch(err => {
  console.error('שגיאה:', err.message);
});

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) {
    return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר ומוכן!</div></body></html>`);
  }
  if (currentQR) {
    return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:280px}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><p style="color:#7070a0">וואטסאפ → שלוש נקודות → מכשירים מקושרים → סרוק</p><img src="${currentQR}" /><p style="color:#7070a0;font-size:12px;margin-top:1rem">מתרענן כל 10 שניות</p></body></html>`);
  }
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}</style></head><body><h1>👑 CrownBet WA Server</h1><p style="color:#7070a0">⏳ מאתחל... מתרענן אוטומטית</p></body></html>`);
});

app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));
app.get('/api/getSessionInfo', (req, res) => res.json({ ready: isReady }));

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try { await waClient.sendText(chatId, content); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, url, caption } = req.body;
  try { await waClient.sendImage(chatId, url, 'raffle', caption || ''); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/getGroups', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  try { const chats = await waClient.getAllGroups(); res.json({ groups: chats.map(g => ({ id: g.id, name: g.name })) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`שרת פועל על פורט ${PORT}`));
