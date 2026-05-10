const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const pino = require('pino');

const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason 
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

let isReady = false;
let currentQR = null;
let waSocket = null;

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
    browser: ['CrownBet', 'Chrome', '120.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('New QR Generated');
      currentQR = await qrcode.toDataURL(qr);
    }
    
    if (connection === 'open') {
      console.log('✅ WhatsApp Connected!');
      isReady = true;
      waSocket = sock;
      currentQR = null;
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      isReady = false;
      if (shouldReconnect) startBaileys();
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

startBaileys();

app.get('/', (req, res) => {
  if (isReady) return res.send('<h1>Connected! ✅</h1>');
  if (currentQR) return res.send(`<h1>Scan QR:</h1><br><img src="${currentQR}">`);
  return res.send('<h1>Initializing... please wait and refresh</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on port ${PORT}`);
});
