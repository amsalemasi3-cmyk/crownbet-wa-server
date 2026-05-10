const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

const PORT = process.env.PORT || 8080;

let waSocket = null;
let isReady = false;
let currentQR = null;
let store = null;
let isConnecting = false;

const raffleMessages = {};
const logger = pino({ level: 'silent' });

async function startBaileys() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    try {
      store = makeInMemoryStore({ logger });
    } catch (e) {
      console.log('⚠️ Store failed to load, continuing...');
    }

    const sock = makeWASocket({
      logger,
      auth: state,
      printQRInTerminal: true,
      browser: ['CrownBet', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      // ← חשוב: מונע timeout מוקדם מדי
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 10_000,
    });

    if (store) store.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR חדש התקבל ──
      if (qr) {
        console.log('📱 QR חדש — כנס ל /qr');
        try {
          currentQR = await qrcode.toDataURL(qr);
        } catch (e) {
          console.error('❌ שגיאה ביצירת QR:', e.message);
        }
        isReady = false;
      }

      // ── מחובר ──
      if (connection === 'open') {
        console.log('✅ WhatsApp מחובר!');
        isReady = true;
        waSocket = sock;
        currentQR = null;
        isConnecting = false;

        try {
          console.log('📅 מפעיל Scheduler...');
          require('./schedule');
        } catch (e) {
          console.error('❌ שגיאה בטעינת Schedule:', e.message);
        }
      }

      // ── נותק ──
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(`🔌 חיבור נסגר. קוד: ${code} | מתחבר מחדש: ${shouldReconnect}`);

        isReady = false;
        waSocket = null;
        currentQR = null;
        isConnecting = false;

        if (shouldReconnect) {
          console.log('🔄 מנסה שוב בעוד 5 שניות...');
          setTimeout(startBaileys, 5000);
        } else {
          console.log('🚪 יצאת מה-WhatsApp. מחק את auth_info ועשה deploy מחדש.');
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error('❌ שגיאה קריטית ב-startBaileys:', err.message);
    isConnecting = false;
    setTimeout(startBaileys, 5000);
  }
}

// ── התחל התחברות ──
startBaileys();

// ── ראוט ראשי → QR ──
app.get('/', (req, res) => res.redirect('/qr'));

// ── דף QR ──
app.get('/qr', (req, res) => {
  if (isReady) {
    return res.send(`
      <html dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>CrownBet ✅</title>
        <style>
          body { background: #0a0a0f; color: #f0f0f5; font-family: sans-serif; text-align: center; padding: 3rem; }
          h1 { color: #f5c842; }
          .ok { background: #0f2a1a; border: 2px solid #22c55e; border-radius: 12px; padding: 2rem;
                display: inline-block; color: #22c55e; font-size: 1.3rem; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <h1>👑 CrownBet WA Server</h1>
        <div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!</div>
      </body>
      </html>
    `);
  }

  if (currentQR) {
    return res.send(`
      <html dir="rtl">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="refresh" content="30">
        <title>סרוק QR</title>
        <style>
          body { background: #0a0a0f; color: #f0f0f5; font-family: sans-serif; text-align: center; padding: 2rem; }
          h1 { color: #f5c842; }
          img { border: 4px solid #f5c842; border-radius: 12px; max-width: 300px; margin-top: 1rem; }
          p { color: #7070a0; }
        </style>
      </head>
      <body>
        <h1>👑 CrownBet — סרוק QR</h1>
        <p>וואטסאפ ← שלוש נקודות ⋮ ← מכשירים מקושרים ← קשר מכשיר ← סרוק</p>
        <br>
        <img src="${currentQR}" />
        <p style="margin-top:1rem; font-size:0.85rem;">הדף מתרענן כל 30 שניות</p>
      </body>
      </html>
    `);
  }

  // עדיין מאתחל
  return res.send(`
    <html dir="rtl">
    <head>
      <meta charset="utf-8">
      <meta http-equiv="refresh" content="4">
      <title>CrownBet</title>
      <style>
        body { background: #0a0a0f; color: #f0f0f5; font-family: sans-serif; text-align: center; padding: 3rem; }
        h1 { color: #f5c842; }
      </style>
    </head>
    <body>
      <h1>👑 CrownBet WA Server</h1>
      <p style="color:#7070a0">⏳ מאתחל חיבור... הדף יתרענן אוטומטית</p>
    </body>
    </html>
  `);
});

// ── סטטוס JSON (לבדיקה מהירה) ──
app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    hasQR: !!currentQR,
    isConnecting,
  });
});

// ── שלח טקסט ──
app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── שלח טקסט ושמור ID (לצורך הגרלות ללא תמונה) ──
app.post('/api/sendTextWithId', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content, raffleId } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    if (raffleId) raffleMessages[raffleId] = sent.key.id;
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── שלח תמונה ──
app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, url, caption, raffleId } = req.body;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const sent = await waSocket.sendMessage(chatId, { image: buffer, caption: caption || '' });
    if (raffleId) raffleMessages[raffleId] = sent.key.id;
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── קבל messageId של הגרלה ──
app.get('/api/getRaffleMessageId', (req, res) => {
  const { raffleId } = req.query;
  res.json({ messageId: raffleMessages[raffleId] || null });
});

// ── הפעל שרת ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
});
