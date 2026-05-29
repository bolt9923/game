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

// ── /api/notify-room — called by Mini App after room creation ─────────────────
// Mini App sends: { chatId, code, gameId, hostName, maxPlayers }
// Bot sends join message to the group chat
app.post('/api/notify-room', async (req, res) => {
  try {
    const { chatId, code, gameId, hostName, maxPlayers } = req.body;
    if (!chatId || !code || !gameId) {
      return res.status(400).json({ ok: false, error: 'Missing fields' });
    }

    const bot = global.botInstance;
    if (!bot) return res.status(503).json({ ok: false, error: 'Bot not ready' });

    const GAME_EMOJI = { ludo:'🎲', chess:'♟️', carrom:'🎳', tictactoe:'❌', rps:'✊', wordchain:'🔤', emojiquiz:'😂', word:'📝', reaction:'⚡' };
    const GAME_NAME  = { ludo:'Ludo Plus', chess:'Chess', carrom:'Carrom', tictactoe:'Tic Tac Toe', rps:'Rock Paper Scissors', wordchain:'Word Chain', emojiquiz:'Emoji Quiz', word:'Word Guess', reaction:'Speed Catch' };

    const emoji = GAME_EMOJI[gameId] || '🎮';
    const name  = GAME_NAME[gameId]  || gameId;
    const url   = `${WEBAPP_URL}?startapp=${code}`;

    await bot.telegram.sendMessage(chatId,
      `${emoji} *${name} — Room Ready!*\n\n` +
      `👤 *${hostName}* ne room banaya\n` +
      `🔑 Room Code: \`${code}\`\n` +
      `👥 Players: 1/${maxPlayers}\n\n` +
      `👇 *Neeche button dabao — seedha room mein pohoncho!*`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: `${emoji} ${name} Join Karo!`, url }]] }
      }
    );

    console.log(`[api] notify-room: sent to chat ${chatId} for room ${code}`);
    // Start watching for winner/join notifications
    if (bot._watchRoom) bot._watchRoom(code, chatId, gameId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api] notify-room error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
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

    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    const webhookUrl = `${WEBAPP_URL}/webhook/${TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log('[bot] ✅ Webhook set:', webhookUrl);

    const me = await bot.telegram.getMe();
    console.log(`[bot] ✅ Bot running: @${me.username}`);

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
