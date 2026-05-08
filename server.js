const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let waClient = null;
let isReady = false;
let currentQR = null;

// Start WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'crownbet' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

client.on('qr', async (qr) => {
  console.log('QR מוכן — כנס ל /qr לסריקה');
  currentQR = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('✅ WhatsApp מחובר!');
  isReady = true;
  waClient = client;
  currentQR = null;
});

client.on('disconnected', () => {
  console.log('WhatsApp התנתק');
  isReady = false;
  waClient = null;
});

client.initialize();

// Routes
app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) {
    return res.send(`<html dir="rtl"><head><meta charset="utf-8"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!</div></body></html>`);
  }
  if (currentQR) {
    return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}.steps{background:#1a1a26;border-radius:12px;padding:1rem;display:inline-block;margin:1rem auto;text-align:right;font-size:14px;color:#7070a0}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><div class="steps">1. פתח וואטסאפ בטלפון<br>2. לחץ על שלוש הנקודות ⋮<br>3. מכשירים מקושרים<br>4. קשר מכשיר<br>5. סרוק את הQR</div><br><img src="${currentQR}" /><p style="color:#7070a0;font-size:12px;margin-top:1rem">הדף מתרענן כל 30 שניות</p></body></html>`);
  }
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}</style></head><body><h1>👑 CrownBet WA Server</h1><p style="color:#7070a0">⏳ מאתחל... מתרענן אוטומטית כל 5 שניות</p></body></html>`);
});

app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));
app.get('/api/getSessionInfo', (req, res) => res.json({ ready: isReady }));

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'WhatsApp לא מחובר' });
  const { chatId, content } = req.body;
  if (!chatId || !content) return res.status(400).json({ error: 'חסר chatId או content' });
  try {
    await waClient.sendMessage(chatId, content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'WhatsApp לא מחובר' });
  const { chatId, url, caption } = req.body;
  if (!chatId || !url) return res.status(400).json({ error: 'חסר chatId או url' });
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const media = await MessageMedia.fromUrl(url);
    await waClient.sendMessage(chatId, media, { caption: caption || '' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/getGroups', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  try {
    const chats = await waClient.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({ id: g.id._serialized, name: g.name }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 שרת פועל על פורט ${PORT}`));
