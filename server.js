const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

const PORT = process.env.PORT || 8080;

let waSocket = null;
let isReady = false;
let currentQR = null;
let isConnecting = false;
let schedulerLoaded = false;

// שמירת הודעות בזיכרון (במקום Redis)
const msgStore = new Map();

const raffleMessages = {};
const logger = pino({ level: 'silent' });

async function startBaileys() {
  if (isConnecting) return;
  isConnecting = true;
  console.log('🔄 מתחיל Baileys...');

  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
      logger,
      auth: {
        creds: state.creds,
        // ← זה הפתרון לבעיית "בהמתנה להודעה"
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['Windows', 'Desktop', '10.0'],
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 10_000,
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
        if (!key.id) return undefined;
        const msg = msgStore.get(key.id);
        if (msg) return msg;
        return undefined;
      },
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key?.id && msg.message) {
          msgStore.set(msg.key.id, msg.message);
          // מחק אחרי 24 שעות
          setTimeout(() => msgStore.delete(msg.key.id), 24 * 60 * 60 * 1000);
        }
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 QR התקבל — כנס ל /qr');
        try {
          currentQR = await qrcode.toDataURL(qr);
          isReady = false;
        } catch (e) {
          console.error('❌ שגיאה ביצירת QR:', e.message);
        }
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp מחובר!');
        isReady = true;
        waSocket = sock;
        currentQR = null;
        isConnecting = false;

        if (!schedulerLoaded) {
          schedulerLoaded = true;
          try {
            console.log('📅 מפעיל Scheduler...');
            require('./scheduler');
          } catch (e) {
            console.error('❌ שגיאה בטעינת Schedule:', e.message);
          }
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;

        console.log(`🔌 חיבור נסגר — קוד: ${code}`);
        isReady = false;
        waSocket = null;
        currentQR = null;
        isConnecting = false;

        if (shouldReconnect) {
          console.log('🔄 מתחבר מחדש בעוד 5 שניות...');
          setTimeout(startBaileys, 5000);
        } else {
          console.log('🚪 נותקת מ-WhatsApp. מחק auth_info ועשה redeploy.');
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error('❌ שגיאה קריטית:', err.message);
    isConnecting = false;
    setTimeout(startBaileys, 5000);
  }
}

startBaileys();

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

app.get('/status', (req, res) => {
  res.json({ connected: isReady, hasQR: !!currentQR, isConnecting });
});

app.get('/qr', (req, res) => {
  if (isReady) {
    return res.send(`
      <html dir="rtl"><head><meta charset="utf-8"><title>CrownBet ✅</title>
      <style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}
      h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;
      display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head>
      <body><h1>👑 CrownBet WA Server</h1>
      <div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!</div></body></html>
    `);
  }

  if (currentQR) {
    return res.send(`
      <html dir="rtl"><head><meta charset="utf-8">
      <meta http-equiv="refresh" content="30">
      <title>סרוק QR</title>
      <style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}
      h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}
      p{color:#7070a0}</style></head>
      <body><h1>👑 CrownBet — סרוק QR</h1>
      <p>וואטסאפ ← שלוש נקודות ⋮ ← מכשירים מקושרים ← קשר מכשיר ← סרוק</p>
      <br><img src="${currentQR}" />
      <p style="margin-top:1rem;font-size:0.85rem">הדף מתרענן כל 30 שניות</p>
      </body></html>
    `);
  }

  return res.send(`
    <html dir="rtl"><head><meta charset="utf-8">
    <meta http-equiv="refresh" content="4">
    <title>CrownBet</title>
    <style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}
    h1{color:#f5c842}</style></head>
    <body><h1>👑 CrownBet WA Server</h1>
    <p style="color:#7070a0">⏳ מאתחל חיבור... הדף יתרענן אוטומטית</p>
    </body></html>
  `);
});

app.get('/api/test', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  try {
    const chatId = process.env.GROUP_ID;
    const text = '🧪 טסט מהבוט — ' + new Date().toLocaleTimeString('he-IL');
    const sent = await waSocket.sendMessage(chatId, { text });
    if (sent?.key?.id) msgStore.set(sent.key.id, { conversation: text });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  try {
    const groups = await waSocket.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({ id: g.id, name: g.subject }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    if (sent?.key?.id) msgStore.set(sent.key.id, { conversation: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sendTextWithId', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content, raffleId } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    if (sent?.key?.id) msgStore.set(sent.key.id, { conversation: content });
    if (raffleId) raffleMessages[raffleId] = sent.key.id;
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.get('/api/getRaffleMessageId', (req, res) => {
  const { raffleId } = req.query;
  res.json({ messageId: raffleMessages[raffleId] || null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
});
