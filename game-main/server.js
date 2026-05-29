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
app.post(`/webhook/${TOKEN}`, (req, res) => {
  res.sendStatus(200); // pehle 200 do
  if (global.botInstance) {
    global.botInstance.handleUpdate(req.body).catch((e) =>
      console.error('[webhook] handleUpdate error:', e.message)
    );
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  if (!TOKEN || !WEBAPP_URL) {
    console.log('[bot] TOKEN ya WEBAPP_URL missing — bot skip');
    return;
  }

  try {
    const { startBot } = await import('./bot.js');
    const bot = startBot();
    if (bot) {
      global.botInstance = bot;

      // Webhook set karo
      const webhookUrl = `${WEBAPP_URL}/webhook/${TOKEN}`;
      await bot.telegram.setWebhook(webhookUrl);
      console.log('[bot] ✅ Webhook set:', webhookUrl);
    }
  } catch (e) {
    console.error('[bot] Error:', e.message);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err?.message || err);
});
