const cron = require('node-cron');
const axios = require('axios');
const {
  GROUP_ID, morningMessages, afterRaffleMessages,
  weekdayNoon, weekdayAfternoon, weekdayEvening,
  weekdayMidnight, weekendMessages, getRandom, isWeekend
} = require('./messages');

const SUPABASE_URL = 'https://oxraakhcpvthlvjvapay.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94cmFha2hjcHZ0aGx2anZhcGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzY4MTUsImV4cCI6MjA5MzY1MjgxNX0.dftK8Qb9zjzwEVGRLv4Q54Pqn2SLrzOxUqydIYf3Xd8';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// ── שלח הודעת טקסט ──
async function sendText(text) {
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

// ── שלח הגרלה (תמונה + טקסט) ──
async function sendRaffle(raffle) {
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

// ── שלח תוצאות ──
async function sendResults(raffle) {
  try {
    const text = raffle.raffle_text + '\n\n🏁 *תוצאה:* ' + raffle.results;
    if (raffle.results_image_url) {
      await axios.post(`${SERVER_URL}/api/sendImage`, {
        chatId: GROUP_ID,
        url: raffle.results_image_url,
        caption: text
      });
    } else {
      await axios.post(`${SERVER_URL}/api/sendText`, {
        chatId: GROUP_ID,
        content: text
      });
    }
    console.log('✅ תוצאות נשלחו:', raffle.match_title);
  } catch (err) {
    console.error('❌ שגיאה בשליחת תוצאות:', err.message);
  }
}

// ── שלוף הגרלות היום מ-Supabase ──
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
  const res = await axios.get(`${SUPABASE_URL}/rest/v1/raffles?raffle_date=eq.${dateStr}&results=not.is.null`, {
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
  if (results.length === 0) {
    console.log('אין תוצאות אתמול');
    return;
  }
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
      // שעה אחרי — הודעת עידוד
      setTimeout(async () => {
        await sendText(getRandom(afterRaffleMessages));
      }, 60 * 60 * 1000);
    }
  }
}, { timezone: 'Asia/Jerusalem' });

// 12:00 — הודעת צהריים
cron.schedule('0 12 * * *', async () => {
  console.log('⏰ 12:00 — הודעת צהריים');
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

// 20:00 — הגרלה שנייה
cron.schedule('0 20 * * *', async () => {
  console.log('⏰ 20:00 — הגרלה שנייה');
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

// 00:00 — הודעת לילה
cron.schedule('10 22 * * *', async () => {
  console.log('⏰ 00:00 — הודעת לילה');
  const msg = isWeekend() ? getRandom(weekendMessages) : getRandom(weekdayMidnight);
  await sendText(msg);
}, { timezone: 'Asia/Jerusalem' });

console.log('📅 תזמון אוטומטי פעיל — שעון ישראל');
