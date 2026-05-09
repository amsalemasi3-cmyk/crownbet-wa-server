const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let waClient = null;
let isReady = false;
let currentQR = null;

// שמירת messageId של כל הגרלה
const raffleMessages = {}; // raffleId -> messageId

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env.WA_SESSION || 'crownbet' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
           '--disable-accelerated-2d-canvas','--no-first-run','--no-zygote',
           '--single-process','--disable-gpu']
  }
});

client.on('qr', async (qr) => {
  console.log('📱 QR מוכן — כנס ל /qr');
  currentQR = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('✅ WhatsApp מחובר!');
  isReady = true;
  waClient = client;
  currentQR = null;
  require('./scheduler');
});

client.on('disconnected', () => {
  console.log('WhatsApp התנתק');
  isReady = false;
  waClient = null;
});

client.initialize();

// ── ROUTES ──

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!<br><small style="font-size:14px;margin-top:8px;display:block">התזמון האוטומטי פעיל 📅</small></div></body></html>`);
  if (currentQR) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}.steps{background:#1a1a26;border-radius:12px;padding:1rem;display:inline-block;margin:1rem auto;text-align:right;font-size:14px;color:#7070a0}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><div class="steps">1. פתח וואטסאפ בטלפון<br>2. שלוש נקודות ⋮ → מכשירים מקושרים<br>3. קשר מכשיר → סרוק</div><br><img src="${currentQR}" /></body></html>`);
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}</style></head><body><h1>👑 CrownBet WA Server</h1><p style="color:#7070a0">⏳ מאתחל... מתרענן כל 5 שניות</p></body></html>`);
});

app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));
app.get('/api/getSessionInfo', (req, res) => res.json({ ready: isReady }));

// ── שלח טקסט ──
app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    await waClient.sendMessage(chatId, content);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── שלח תמונה + שמור messageId ──
app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, url, caption, raffleId } = req.body;
  try {
    const media = await MessageMedia.fromUrl(url);
    const sentMsg = await waClient.sendMessage(chatId, media, { caption: caption || '' });
    
    // שמור messageId אם זו הגרלה
    if (raffleId) {
      raffleMessages[raffleId] = sentMsg.id._serialized;
      console.log(`💾 נשמר messageId להגרלה ${raffleId}: ${sentMsg.id._serialized}`);
    }
    
    res.json({ success: true, messageId: sentMsg.id._serialized });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── שלח טקסט + שמור messageId ──
app.post('/api/sendTextWithId', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content, raffleId } = req.body;
  try {
    const sentMsg = await waClient.sendMessage(chatId, content);
    
    if (raffleId) {
      raffleMessages[raffleId] = sentMsg.id._serialized;
      console.log(`💾 נשמר messageId להגרלה ${raffleId}`);
    }
    
    res.json({ success: true, messageId: sentMsg.id._serialized });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── שלוף תגובות על הודעה ──
app.get('/api/getMessageReplies', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { messageId } = req.query;
  if (!messageId) return res.status(400).json({ error: 'חסר messageId' });
  try {
    const GROUP_ID = process.env.GROUP_ID;
    const chat = await waClient.getChatById(GROUP_ID);
    const messages = await chat.fetchMessages({ limit: 1000 });
    const replies = messages.filter(m => {
      return m._data && m._data.quotedStanzaID && 
             (m._data.quotedStanzaID === messageId || 
              messageId.includes(m._data.quotedStanzaID));
    }).map(m => ({
      senderName: m._data.notifyName || m.from,
      senderId: m.from,
      body: m.body,
      timestamp: m.timestamp
    }));
    res.json({ replies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── קבל messageId של הגרלה ──
app.get('/api/getRaffleMessageId', (req, res) => {
  const { raffleId } = req.query;
  const messageId = raffleMessages[raffleId];
  res.json({ messageId: messageId || null });
});

// ── זיהוי זוכים ידני ──
app.post('/api/findWinners', async (req, res) => {
  const { raffleId } = req.body;
  if (!raffleId) return res.status(400).json({ error: 'חסר raffleId' });
  try {
    const messageId = raffleMessages[raffleId];
    if (!messageId) return res.status(404).json({ error: 'לא נמצא messageId להגרלה זו' });
    const { findWinners } = require('./winner-finder');
    const result = await findWinners(raffleId, messageId);
    res.json({ success: true, result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── רשימת קבוצות ──
app.get('/api/getGroups', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  try {
    const chats = await waClient.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({ id: g.id._serialized, name: g.name }));
    res.json({ groups });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
  setTimeout(() => {
    require('./scheduler');
    console.log('📅 תזמון אוטומטי פעיל!');
  }, 5000);
});
