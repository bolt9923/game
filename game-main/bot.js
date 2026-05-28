// Telegram bot for GameSphere — lets users launch the game inside Telegram
// (works in private chat AND in groups via inline "Play" button / WebApp).
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN  — token from @BotFather
//   WEBAPP_URL          — public HTTPS URL where this app is hosted
//                         (must be set in BotFather → /setdomain too)

import { Telegraf, Markup } from 'telegraf';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

export function startBot() {
  if (!TOKEN) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — skipping bot launch');
    return null;
  }
  if (!WEBAPP_URL || !WEBAPP_URL.startsWith('https://')) {
    console.warn('[bot] WEBAPP_URL must be an https:// URL — skipping bot launch');
    return null;
  }

  const bot = new Telegraf(TOKEN);

  const playKeyboard = (roomId) => {
    const url = roomId ? `${WEBAPP_URL}?room=${encodeURIComponent(roomId)}` : WEBAPP_URL;
    return Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 Play in Telegram', url)],
      [Markup.button.url('🌐 Open in browser', url)],
    ]);
  };

  // /start [room] — also handles deep links: /start room_<id>
  bot.start(async (ctx) => {
    const payload = ctx.startPayload?.replace(/^room_/, '') || '';
    await ctx.reply(
      `🎮 Welcome to GameSphere!\nPlay 9+ games with friends right inside Telegram.${
        payload ? `\n\nJoining room: ${payload}` : ''
      }`,
      playKeyboard(payload),
    );
  });

  // /play — works in groups
  bot.command('play', async (ctx) => {
    const roomId =
      ctx.message.text.split(/\s+/)[1] ||
      `${ctx.chat.id}_${Date.now().toString(36)}`;
    await ctx.reply(
      `🕹 GameSphere room ready!\nTap below to join — anyone in this group can play together.\n\nRoom code: \`${roomId}\``,
      { parse_mode: 'Markdown', ...playKeyboard(roomId) },
    );
  });

  bot.command('help', (ctx) =>
    ctx.reply(
      [
        '🎮 *GameSphere Bot Commands*',
        '',
        '/play — start a new game room (works in groups)',
        '/play <code> — join a specific room',
        '/start — open the game lobby',
        '',
        'Add me to any group and type /play to challenge friends!',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    ),
  );

  // Inline mode: type "@yourbot <code>" in any chat
  bot.on('inline_query', async (ctx) => {
    const roomId = (ctx.inlineQuery.query || `inline_${Date.now().toString(36)}`).trim();
    await ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: '1',
          title: '🎮 Play GameSphere',
          description: `Start a game room: ${roomId}`,
          input_message_content: {
            message_text: `🕹 *GameSphere room:* \`${roomId}\`\nTap below to join!`,
            parse_mode: 'Markdown',
          },
          reply_markup: playKeyboard(roomId).reply_markup,
        },
      ],
      { cache_time: 0 },
    );
  });

  bot.catch((err) => console.error('[bot] error', err));

  bot.launch().then(() => console.log('[bot] Telegram bot started'));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
