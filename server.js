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

const PORT = process.env.PORT || 3000;

let waSocket = null;
let isReady = false;
let currentQR = null;
let store = null;

const raffleMessages = {};
const logger = pino({ level: 'silent' });

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  store = makeInMemoryStore({ logger });

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['CrownBet', 'Chrome', '120.0.0'],
  });

  store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('📱 QR מוכן — כנס ל /qr');
      currentQR = await qrcode.toDataURL(qr);
      isReady = false;
    }
    if (connection === 'open') {
      console.log('✅ WhatsApp מחובר!');
      isReady = true;
      waSocket = sock;
      currentQR = null;
      require('./scheduler');
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
  if (isReady) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}.ok{background:#0f2a1a;border:2px solid #22c55e;border-radius:12px;padding:2rem;display:inline-block;color:#22c55e;font-size:1.3rem;margin-top:1rem}</style></head><body><h1>👑 CrownBet WA Server</h1><div class="ok">✅ WhatsApp מחובר ומוכן לשליחה!</div></body></html>`);
  if (currentQR) return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30"><title>סרוק QR</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:2rem}h1{color:#f5c842}img{border:4px solid #f5c842;border-radius:12px;max-width:300px;margin-top:1rem}</style></head><body><h1>👑 CrownBet — סרוק QR</h1><p style="color:#7070a0">וואטסאפ → שלוש נקודות ⋮ → מכשירים מקושרים → סרוק</p><br><img src="${currentQR}" /></body></html>`);
  return res.send(`<html dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>CrownBet</title><style>body{background:#0a0a0f;color:#f0f0f5;font-family:sans-serif;text-align:center;padding:3rem}h1{color:#f5c842}</style></head><body><h1>👑 CrownBet WA Server</h1><p style="color:#7070a0">⏳ מאתחל...</p></body></html>`);
});

app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));
app.get('/api/getSessionInfo', (req, res) => res.json({ ready: isReady }));

app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sendImage', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, url, caption, raffleId } = req.body;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const sent = await waSocket.sendMessage(chatId, { image: buffer, caption: caption || '' });
    if (raffleId) {
      raffleMessages[raffleId] = sent.key.id;
      console.log(`💾 נשמר messageId להגרלה ${raffleId}`);
    }
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sendTextWithId', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content, raffleId } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    if (raffleId) {
      raffleMessages[raffleId] = sent.key.id;
      console.log(`💾 נשמר messageId להגרלה ${raffleId}`);
    }
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/getMessageReplies', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { messageId } = req.query;
  if (!messageId) return res.status(400).json({ error: 'חסר messageId' });
  try {
    const GROUP_ID = process.env.GROUP_ID;
    const msgs = await store.loadMessages(GROUP_ID, 1000);
    const replies = (msgs || []).filter(m =>
      m.message?.extendedTextMessage?.contextInfo?.stanzaId === messageId ||
      m.message?.imageMessage?.contextInfo?.stanzaId === messageId
    ).map(m => ({
      senderName: m.pushName || m.key.participant || m.key.remoteJid,
      senderId: m.key.participant || m.key.remoteJid,
      body: m.message?.extendedTextMessage?.text || m.message?.conversation || '',
      timestamp: m.messageTimestamp
    }));
    res.json({ replies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/getRaffleMessageId', (req, res) => {
  const { raffleId } = req.query;
  res.json({ messageId: raffleMessages[raffleId] || null });
});

app.post('/api/findWinners', async (req, res) => {
  const { raffleId } = req.body;
  if (!raffleId) return res.status(400).json({ error: 'חסר raffleId' });
  try {
    const messageId = raffleMessages[raffleId];
    if (!messageId) return res.status(404).json({ error: 'לא נמצא messageId' });
    const { findWinners } = require('./winner-finder');
    const result = await findWinners(raffleId, messageId);
    res.json({ success: true, result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/getGroups', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  try {
    const groups = await waSocket.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({ id: g.id, name: g.subject }));
    res.json({ groups: list });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
});
