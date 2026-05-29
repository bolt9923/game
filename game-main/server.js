import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app        = express();
const PORT       = process.env.PORT || 3000;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;
const TOKEN      = process.env.TELEGRAM_BOT_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ── Telegram webhook ──────────────────────────────────────────────────────────
const updateQueue = [];

app.post(`/webhook/${TOKEN}`, (req, res) => {
  res.sendStatus(200);
  const update = req.body;
  console.log('[webhook] update_id:', update?.update_id, '| type:', Object.keys(update).find(k => k !== 'update_id'));
  if (global.botInstance) {
    global.botInstance.handleUpdate(update).catch(e =>
      console.error('[webhook] handleUpdate error:', e.message)
    );
  } else {
    console.warn('[webhook] bot not ready — queuing');
    updateQueue.push(update);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  if (!TOKEN || !WEBAPP_URL) {
    console.log('[bot] TOKEN or WEBAPP_URL missing — skipping bot');
    return;
  }

  try {
    const { startBot } = await import('./bot.js');
    const bot = startBot();
    if (!bot) return;

    global.botInstance = bot;

    // Delete old webhook first
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });

    // Set new webhook
    const webhookUrl = `${WEBAPP_URL}/webhook/${TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log('[bot] ✅ Webhook set:', webhookUrl);

    const me = await bot.telegram.getMe();
    console.log(`[bot] ✅ Bot running: @${me.username}`);

    // Process queued updates
    while (updateQueue.length > 0) {
      const upd = updateQueue.shift();
      bot.handleUpdate(upd).catch(e => console.error('[webhook] queued update error:', e.message));
    }

  } catch (e) {
    console.error('[bot] Init error:', e.message);
  }
});

process.on('uncaughtException',  err => console.error('[server] uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('[server] unhandledRejection:', err?.message || err));
