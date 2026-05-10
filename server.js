const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');

// ייבוא Baileys בצורה בטוחה
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  makeInMemoryStore 
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// Railway משתמש בפורט 8080 בדרך כלל, נגדיר זאת כך
const PORT = process.env.PORT || 8080;

let waSocket = null;
let isReady = false;
let currentQR = null;
let store = null;

const raffleMessages = {};
const logger = pino({ level: 'silent' });

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  // הגדרת הסטור - אם נכשל, השרת ימשיך לעבוד
  try {
    store = makeInMemoryStore({ logger });
  } catch (e) {
    console.log("⚠️ Store failed to load, continuing without it.");
  }

  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: true, // כדי שתוכל לראות QR גם בלוגים של Railway
    browser: ['CrownBet', 'Chrome', '120.0.0'],
    syncFullHistory: false
  });

  if (store) store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 QR מוכן לסריקה');
      currentQR = await qrcode.toDataURL(qr);
      isReady = false;
    }
    
    if (connection === 'open') {
      console.log('✅ WhatsApp Connected!');
      isReady = true;
      waSocket = sock;
      currentQR = null;
      
      // כאן נטרלתי את ה-Scheduler כדי למנוע קריסה
      // ברגע שהכל יעבוד, נתקן את ה-Scheduler ונחזיר אותו
      console.log("ℹ️ Scheduler disabled for stability. Enable it after QR scan.");
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

// --- API Routes ---

app.get('/', (req, res) => res.redirect('/qr'));

app.get('/qr', (req, res) => {
  if (isReady) return res.send(`<html dir="rtl"><body style="background:#0a0a0f;color:#22c55e;text-align:center;padding-top:50px;font-family:sans-serif;"><h1>✅ מחובר בהצלחה!</h1><p>הבוט של אסי מוכן לפעולה.</p></body></html>`);
  if (currentQR) return res.send(`<html dir="rtl"><head><meta http-equiv="refresh" content="30"></head><body style="background:#0a0a0f;color:white;text-align:center;padding-top:50px;font-family:sans-serif;"><h1>👑 סרוק QR להתחברות</h1><br><img src="${currentQR}" style="border:5px solid #f5c842;border-radius:15px;" /><p>וואטסאפ > מכשירים מקושרים > קישור מכשיר</p></body></html>`);
  return res.send(`<html dir="rtl"><head><meta http-equiv="refresh" content="5"></head><body style="background:#0a0a0f;color:white;text-align:center;padding-top:50px;font-family:sans-serif;"><h1>⏳ מאתחל שרת...</h1></body></html>`);
});

// פונקציית שליחת הודעה
app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waSocket) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    const sent = await waSocket.sendMessage(chatId, { text: content });
    res.json({ success: true, messageId: sent.key.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// פונקציית קבלת תגובות (להגרלות)
app.get('/api/getMessageReplies', async (req, res) => {
  if (!isReady || !waSocket || !store) return res.status(503).json({ error: 'השרת לא מוכן או שהסטור כבוי' });
  const { messageId } = req.query;
  const GROUP_ID = process.env.GROUP_ID;
  try {
    const msgs = await store.loadMessages(GROUP_ID, 100);
    const replies = (msgs || []).filter(m =>
      m.message?.extendedTextMessage?.contextInfo?.stanzaId === messageId
    ).map(m => ({
      senderName: m.pushName || m.key.participant,
      body: m.message?.extendedTextMessage?.text || m.message?.conversation || ''
    }));
    res.json({ replies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
