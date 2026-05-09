const cron = require('node-cron');
const axios = require('axios');
const {
  GROUP_ID, morningMessages, afterRaffleMessages,
  weekdayNoon, weekdayAfternoon, weekdayEvening,
  weekdayLateEvening, weekdayMidnight, weekendMessages,
  motzashMessages, getRandom, isWeekend, isMoatzash
} = require('./messages');

const SUPABASE_URL = 'https://oxraakhcpvthlvjvapay.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cmFha2hjcHZ0aGx2anZhcGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzY4MTUsImV4cCI6MjA5MzY1MjgxNX0.dftK8Qb9zjzwEVGRLv4Q54Pqn2SLrzOxUqydIYf3Xd8';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// ── האם עכשיו שבת? ──
function isShabbat() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 5 && hour >= 17) return true;
  if (day === 6 && hour < 20) return true;
  return false;
}

// ── שלח הודעת טקסט ──
async function sendText(text) {
  if (isShabbat()) {
    console.log('🕌 שבת — לא שולחים הודעות');
    return;
  }
  try {
    await axios.post(`${SERVER_URL}/api/sendText`, {
      chatId: GROUP_ID,
      content: text
    });
    console.log('✅ הודעה נשלחה:', text.substring(0, 40) + '...');
  } catch (err) {
    console.error('❌ שגיאה בשליחת הודעה:', err.message);
  }
}

// ── שלח הגרלה ──
async function sendRaffle(raffle) {
  if (isShabbat()) {
    console.log('🕌 שבת — לא שולחים הגרלות');
    return false;
  }
  try {
    if (raffle.image_url) {
      await axios.post(`${SERVER_URL}/api/sendImage`, {
        chatId: GROUP_ID,
        url: raffle.image_url,
        caption: raffle.raffle_text || ''
      });
    } else {
      await axios.post(`${SERVER_URL}/api/sendText`, {
        chatId: GROUP_ID,
        content: raffle.raffle_text || ''
      });
    }
    console.log('✅ הגרלה נשלחה:', raffle.match_title);
    return true;
  } catch (err) {
    console.error('❌ שגיאה בשליחת הגרלה:', err.message);
    return false;
  }
}

// ── שלח תוצאות (רק results) ──
async function sendResults(raffle) {
  try {
    if (raffle.results_image_url) {
      await axios.post(`${SERVER_URL}/api/sendImage`, {
        chatId: GROUP_ID,
        url: raffle.results_image_url,
        caption: raffle.results || ''
      });
    } else {
      await axios.post(`${SERVER_URL}/api/sendText`, {
        chatId: GROUP_ID,
        content: raffle.results || ''
      });
    }
    console.log('✅ תוצאות נשלחו:', raffle.match_title);
  } catch (err) {
    console.error('❌ שגיאה בשליחת תוצאות:', err.message);
  }
}

// ── שלוף הגרלות היום ──
async function getTodayRaffles() {
  const today = new Date().toISOString().split('T')[0];
  const res = await axios.get(`${SUPABASE_URL}/rest/v1/raffles?raffle_date=eq.${today}&order=created_at.asc`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.data;
}

// ── שלוף תוצאות אתמול ──
async function getYesterdayResults() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  const res = await axios.get(`${SUPABASE_URL}/rest/v1/raffles?raffle_date=eq.${dateStr}&results=not.is.null&is_finished=eq.true`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.data;
}

// ══════════════════════════════════════
// ── לוח הזמנים ──
// ══════════════════════════════════════

// 09:00 — תוצאות אתמול
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ 09:00 — שולח תוצאות אתמול');
  const results = await getYesterdayResults();
  if (results.length === 0) { console.log('אין תוצאות אתמול'); return; }
  for (const r of results) {
    await sendResults(r);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}, { timezone: 'Asia/Jerusalem' });

// 10:00 — הודעת בוקר
cron.schedule('0 10 * * *', async () => {
  console.log('⏰ 10:00 — הודעת בוקר');
  await sendText(getRandom(morningMessages));
}, { timezone: 'Asia/Jerusalem' });

// 11:00 — הגרלה ראשונה
cron.schedule('0 11 * * *', async () => {
  console.log('⏰ 11:00 — הגרלה ראשונה');
  const raffles = await getTodayRaffles();
  if (raffles.length > 0) {
    const sent = await sendRaffle(raffles[0]);
    if (sent) {
      setTimeout(async () => {
        await sendText(getRandom(afterRaffleMessages));
      }, 60 * 60 * 1000);
    }
  }
}, { timezone: 'Asia/Jerusalem' });

// 12:00 — הודעת צהריים
cron.schedule('0 12 * * *', async () => {
  console.log('⏰ 12:00 — הודעת צהריים');
  if (isMoatzash()) { await sendText(getRandom(motzashMessages)); return; }
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayNoon);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

// 15:00 — הודעת אחר הצהריים
cron.schedule('0 15 * * *', async () => {
  console.log('⏰ 15:00 — הודעת אחר הצהריים');
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayAfternoon);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

// 18:00 — הודעת ערב
cron.schedule('0 18 * * *', async () => {
  console.log('⏰ 18:00 — הודעת ערב');
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayEvening);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

// 20:00 — הגרלה שנייה / מוצאי שבת
cron.schedule('0 20 * * *', async () => {
  console.log('⏰ 20:00 — הגרלה שנייה');
  if (isMoatzash()) {
    await sendText(getRandom(motzashMessages));
    return;
  }
  const raffles = await getTodayRaffles();
  if (raffles.length > 1) {
    const sent = await sendRaffle(raffles[1]);
    if (sent) {
      setTimeout(async () => {
        await sendText(getRandom(afterRaffleMessages));
      }, 60 * 60 * 1000);
    }
  } else if (raffles.length === 1) {
    console.log('רק הגרלה אחת היום');
  }
}, { timezone: 'Asia/Jerusalem' });

// 22:00 — הודעת לילה + בונוס
cron.schedule('0 22 * * *', async () => {
  console.log('⏰ 22:00 — הודעת לילה');
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayLateEvening);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

// 00:00 — הודעת חצות
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ 00:00 — הודעת חצות');
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayMidnight);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

console.log('📅 תזמון אוטומטי פעיל — שעון ישראל');
