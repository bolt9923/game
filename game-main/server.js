import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Telegram webhook endpoint
const updateQueue = [];
app.post(`/webhook/${TOKEN}`, (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  if (global.botInstance) {
    global.botInstance.handleUpdate(update).catch((e) =>
      console.error('[webhook] handleUpdate error:', e.message)
    );
  } else {
    console.warn('[webhook] botInstance not ready — queueing update');
    updateQueue.push(update);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

async function initBot() {
  if (!TOKEN || !WEBAPP_URL) {
    console.log('[bot] TOKEN ya WEBAPP_URL missing — bot skip');
    return;
  }
  try {
    const { startBot } = await import('./bot.js');
    const bot = startBot();
    if (!bot) { console.error('[bot] startBot null return kiya'); return; }
    global.botInstance = bot;

    // Pehle purana webhook delete karo
    await bot.telegram.deleteWebhook();

    // Naya webhook set karo
    const webhookUrl = `${WEBAPP_URL}/webhook/${TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
    console.log('[bot] ✅ Webhook set:', webhookUrl);

    // Bot info
    const me = await bot.telegram.getMe();
    console.log(`[bot] ✅ Bot running: @${me.username}`);

  } catch (e) {
    console.error('[bot] Init error:', e.message);
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  initBot();
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err?.message || err);
});
