const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');

// ייבוא Baileys - גרסה גמישה
const Baileys = require('@whiskeysockets/baileys');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason 
} = Baileys;

// בדיקה של מיקום ה-makeInMemoryStore
const makeInMemoryStore = Baileys.makeInMemoryStore || require('@whiskeysockets/baileys/lib/Store/make-in-memory-store').makeInMemoryStore;

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

let waSocket = null;
let isReady = false;
let currentQR = null;
let store = null;

const logger = pino({ level: 'silent' });

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  
  // הגדרת הסטור בצורה בטוחה
  try {
    store = makeInMemoryStore({ logger });
  } catch (e) {
    console.log("Store initialization failed, continuing without store...");
  }

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['CrownBet', 'Chrome', '120.0.0'],
    syncFullHistory: false
  });

  if (store) store.bind(sock.ev);

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
      try { require('./scheduler'); } catch (e) {}
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      isReady = false;
      waSocket = null;
      if (shouldReconnect) setTimeout(startBaileys, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
}

startBaileys();

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר!</div></body></html>`);
  if (currentQR) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><br><img src="${currentQR}" /></body></html>`);
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title></head><body><h1>⏳ מאתחל...</h1></body></html>`);
});

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'Not connected' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
