import { Telegraf, Markup } from 'telegraf';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

// 6 character random room code generate karo (A-Z, 2-9)
function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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

  // WebApp button + browser link
  const playKeyboard = (roomCode) => {
    const url = roomCode
      ? `${WEBAPP_URL}?startapp=${encodeURIComponent(roomCode)}`
      : WEBAPP_URL;
    return Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 Game Kholo', url)],
    ]);
  };

  // /start — private chat mein welcome
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';
    const roomCode = payload.length === 6 ? payload.toUpperCase() : '';
    await ctx.reply(
      `🎮 *GameSphere mein aapka swagat hai!*\n\nLudo, Chess, Carrom aur aur bhi games khelo dosto ke saath!${
        roomCode ? `\n\n📌 Room join karo: \`${roomCode}\`` : ''
      }`,
      { parse_mode: 'Markdown', ...playKeyboard(roomCode) },
    );
  });

  // /game — group aur private dono mein kaam karta hai
  bot.command('game', async (ctx) => {
    // Agar user ne code diya: /game ABC123
    const userCode = ctx.message.text.split(/\s+/)[1]?.toUpperCase();
    
    // Valid 6-char code hai to use karo, warna naya banao
    const roomCode = (userCode && userCode.length === 6) ? userCode : genRoomCode();

    await ctx.reply(
      `🕹 *GameSphere Room Ready!*\n\nRoom Code: \`${roomCode}\`\n\nNeeche button dabao aur khelo — group ke sab log join kar sakte hain!`,
      { parse_mode: 'Markdown', ...playKeyboard(roomCode) },
    );
  });

  // /help
  bot.command('help', (ctx) =>
    ctx.reply(
      [
        '🎮 *GameSphere Commands*',
        '',
        '/game — naya room banao',
        '/game ABC123 — kisi room mein join karo',
        '/start — game lobby kholo',
        '',
        'Group mein /game likho aur dosto ko challenge karo! 🏆',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    ),
  );

  // Inline mode: @GCGAMEROBOT type karne pe
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim().toUpperCase();
    const roomCode = (query && query.length === 6) ? query : genRoomCode();
    
    await ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: '1',
          title: '🎮 GameSphere Room Banao',
          description: `Room Code: ${roomCode} — Sab join kar sakte hain!`,
          input_message_content: {
            message_text: `🕹 *GameSphere Room Ready!*\n\nRoom Code: \`${roomCode}\`\n\nNeeche button dabao aur khelo!`,
            parse_mode: 'Markdown',
          },
          reply_markup: playKeyboard(roomCode).reply_markup,
        },
      ],
      { cache_time: 0 },
    );
  });

  bot.catch((err) => console.error('[bot] error', err));
  bot.launch().then(() => console.log('[bot] Telegram bot started ✅'));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
