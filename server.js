const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');

// ייבוא Baileys - הגדרה יציבה שעובדת בכל סביבה
const { 
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore // ייבוא ישיר מהחבילה הראשית - מונע MODULE_NOT_FOUND
} = require('@whiskeysockets/baileys');

const app = express();

// הגדרת CORS למניעת חסימות ב-Railway
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// פורט שמתאים ל-Railway
const PORT = process.env.PORT || 3000;

let waSocket = null;
let isReady = false;
let currentQR = null;
let store = null;

const raffleMessages = {};
const logger = pino({ level: 'silent' });

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  
  // אתחול הסטור
  store = makeInMemoryStore({ logger });

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['CrownBet', 'Chrome', '120.0.0'],
    // הוספת הגדרה שתעזור בחיבור יציב
    syncFullHistory: false
  });

  // חיבור הסטור לאירועים
  store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 QR ready - scan at /qr');
      currentQR = await qrcode.toDataURL(qr);
      isReady = false;
    }
    
    if (connection === 'open') {
      console.log('✅ WhatsApp Connected!');
      isReady = true;
      waSocket = sock;
      currentQR = null;
      try { require('./scheduler'); } catch (e) { console.log('Scheduler not found'); }
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Connection closed, reconnecting:', shouldReconnect);
      isReady = false;
      waSocket = null;
      if (shouldReconnect) setTimeout(startBaileys, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
}

// הפעלה
startBaileys();

// --- Routes ---

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!</div></body></html>`);
  if (currentQR) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><p style="color:#7070a0">וואטסאפ → שלוש נקודות ⋮ → מכשירים מקושרים → סרוק</p><br><img src="${currentQR}" /></body></html>`);
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}</style></head><body><h1>👑 CrownBet WA Server</h1><p style="color:#7070a0">⏳ מאתחל...</p></body></html>`);
});

app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'Not connected' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'Not connected' });
  const { chatId, url, caption, raffleId } = req.body;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const sent = await waSocket.sendMessage(chatId, { image: buffer, caption: caption || '' });
    if (raffleId) raffleMessages[raffleId] = sent.key.id;
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/getMessageReplies', async (req, res) => {
  if (!isReady || !waSocket || !store) return res.status(503).json({ error: 'Server not ready' });
  const { messageId } = req.query;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
  try {
    const GROUP_ID = process.env.GROUP_ID;
    // טעינת הודעות מהסטור
    const msgs = await store.loadMessages(GROUP_ID, 100);
    const replies = (msgs || []).filter(m =>
      m.message?.extendedTextMessage?.contextInfo?.stanzaId === messageId ||
      m.message?.imageMessage?.contextInfo?.stanzaId === messageId
    ).map(m => ({
      senderName: m.pushName || m.key.participant,
      body: m.message?.extendedTextMessage?.text || m.message?.conversation || '',
      timestamp: m.messageTimestamp
    }));
    res.json({ replies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// האזנה לפורט 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
