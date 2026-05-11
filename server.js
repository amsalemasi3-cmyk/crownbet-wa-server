app.get('/api/status', (req, res) => res.json({ ready: isReady, hasQR: !!currentQR }));
app.get('/api/getSessionInfo', (req, res) => res.json({ ready: isReady }));

// ── פונקציה עזר: הכן צ'אט לפני שליחה ──
// ── פונקציה עזר: הכן צ'אט ──
async function prepareChat(chatId) {
  try {
    const chat = await waClient.getChatById(chatId);
    await chat.sendSeen();
    return chat;
  } catch (err) {
    console.log('prepareChat error (non-critical):', err.message);
    console.log('prepareChat error:', err.message);
    return null;
  }
}

// ── שלח טקסט ──
// ── שלח טקסט עם אפשרויות מלאות ──
app.post('/api/sendText', async (req, res) => {
  if (!isReady || !waClient) return res.status(503).json({ error: 'לא מחובר' });
  const { chatId, content } = req.body;
  try {
    await prepareChat(chatId);
    const sentMsg = await waClient.sendMessage(chatId, content);
    const sentMsg = await waClient.sendMessage(chatId, content, {
      isViewOnce: false,
      forwardingScore: 0,
    });
    res.json({ success: true, messageId: sentMsg.id._serialized });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
@@ -87,9 +90,11 @@
  try {
    await prepareChat(chatId);
    const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
    const sentMsg = await waClient.sendMessage(chatId, media, { 
    const sentMsg = await waClient.sendMessage(chatId, media, {
      caption: caption || '',
      sendMediaAsDocument: false
      sendMediaAsDocument: false,
      isViewOnce: false,
      forwardingScore: 0,
    });
    if (raffleId) {
      raffleMessages[raffleId] = sentMsg.id._serialized;
@@ -105,7 +110,10 @@
  const { chatId, content, raffleId } = req.body;
  try {
    await prepareChat(chatId);
    const sentMsg = await waClient.sendMessage(chatId, content);
    const sentMsg = await waClient.sendMessage(chatId, content, {
      isViewOnce: false,
      forwardingScore: 0,
    });
    if (raffleId) {
      raffleMessages[raffleId] = sentMsg.id._serialized;
      console.log(`💾 נשמר messageId להגרלה ${raffleId}`);
@@ -124,52 +132,52 @@
    const chat = await waClient.getChatById(GROUP_ID);
    const messages = await chat.fetchMessages({ limit: 1000 });
    const replies = messages.filter(m => {
      return m._data && m._data.quotedStanzaID && 
             (m._data.quotedStanzaID === messageId || 
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
  res.json({ messageId: raffleMessages[raffleId] || null });
});

// ── זיהוי זוכים ──
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
