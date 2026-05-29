import { Telegraf, Markup } from 'telegraf';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, off } from 'firebase/database';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

// Firebase init
function getFirebaseDb() {
  const config = {
    apiKey:            process.env.VITE_FIREBASE_API_KEY,
    authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL:       process.env.VITE_FIREBASE_DATABASE_URL,
    projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.VITE_FIREBASE_APP_ID,
  };
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  return getDatabase(app);
}

// 6 char room code
function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Active rooms: roomCode -> { chatId, botInstance, unsubFns, players, game }
const activeRooms = new Map();

// Firebase se game events sun kar group mein bhejo
function watchRoom(bot, roomCode, chatId, gameId) {
  const db = getFirebaseDb();
  const unsubFns = [];

  // Ludo events
  if (gameId === 'ludo' || !gameId) {
    const ludoRef = ref(db, `gamestate/${roomCode}/ludo_sync_${roomCode}`);
    let lastWinner = null;
    let lastTurn = null;

    const handler = onValue(ludoRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.val()?.payload ?? snap.val();

      // Winner announce
      if (data.winner && data.winner !== lastWinner) {
        lastWinner = data.winner;
        const colorEmoji = { red: '🔴', green: '🟢', yellow: '🟡', blue: '🔵' };
        const emoji = colorEmoji[data.winner] || '🏆';
        try {
          await bot.telegram.sendMessage(chatId,
            `${emoji} *${data.winner.toUpperCase()} JEET GAYA!* 🏆\n\nRoom: \`${roomCode}\`\nGame khatam ho gaya!`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.error('send winner error', e.message); }
      }

      // Turn change announce
      if (data.turn && data.turn !== lastTurn) {
        lastTurn = data.turn;
        const colorEmoji = { red: '🔴', green: '🟢', yellow: '🟡', blue: '🔵' };
        const emoji = colorEmoji[data.turn] || '🎲';
        try {
          await bot.telegram.sendMessage(chatId,
            `${emoji} *${data.turn.toUpperCase()}* ki baari hai!`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.error('send turn error', e.message); }
      }
    });

    unsubFns.push(() => off(ludoRef, 'value', handler));
  }

  // TicTacToe events
  if (gameId === 'tictactoe' || !gameId) {
    const tttRef = ref(db, `gamestate/${roomCode}/tictactoe_move`);
    let lastWinner = null;

    const handler = onValue(tttRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.val()?.payload ?? snap.val();

      if (data.winner && data.winner !== lastWinner) {
        lastWinner = data.winner;
        try {
          await bot.telegram.sendMessage(chatId,
            data.winner === 'draw'
              ? `🤝 *TicTacToe Draw!*\n\nRoom: \`${roomCode}\``
              : `🏆 *${data.winner} JEET GAYA!*\n\nTicTacToe - Room: \`${roomCode}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.error(e.message); }
      }
    });
    unsubFns.push(() => off(tttRef, 'value', handler));
  }

  // Chess events
  if (gameId === 'chess' || !gameId) {
    const chessRef = ref(db, `gamestate/${roomCode}/chess_sync_state`);
    let lastWinner = null;

    const handler = onValue(chessRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.val()?.payload ?? snap.val();

      if (data.winner && data.winner !== lastWinner) {
        lastWinner = data.winner;
        try {
          await bot.telegram.sendMessage(chatId,
            `♟️ *${data.winner.toUpperCase()} JEET GAYA!* 🏆\n\nChess - Room: \`${roomCode}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.error(e.message); }
      }
    });
    unsubFns.push(() => off(chessRef, 'value', handler));
  }

  // RPS events
  if (gameId === 'rps' || !gameId) {
    const rpsRef = ref(db, `gamestate/${roomCode}/rps_sync_state`);
    let lastResult = null;

    const handler = onValue(rpsRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.val()?.payload ?? snap.val();

      if (data.result && data.result !== lastResult) {
        lastResult = data.result;
        try {
          await bot.telegram.sendMessage(chatId,
            `✊ *RPS Result!*\n\n${data.result}\n\nRoom: \`${roomCode}\``,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { console.error(e.message); }
      }
    });
    unsubFns.push(() => off(rpsRef, 'value', handler));
  }

  activeRooms.set(roomCode, { chatId, unsubFns, gameId });
  return unsubFns;
}

export function startBot() {
  if (!TOKEN) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  if (!WEBAPP_URL || !WEBAPP_URL.startsWith('https://')) {
    console.warn('[bot] WEBAPP_URL must be https://');
    return null;
  }

  const bot = new Telegraf(TOKEN);

  // /start — private chat
  bot.start(async (ctx) => {
    const payload = ctx.startPayload || '';
    const roomCode = payload.length === 6 ? payload.toUpperCase() : '';
    const url = roomCode ? `${WEBAPP_URL}?startapp=${roomCode}` : WEBAPP_URL;

    await ctx.reply(
      `🎮 *GameSphere mein swagat!*\n\nLudo · Chess · Carrom · TicTacToe aur aur bhi!${roomCode ? `\n\n📌 Room: \`${roomCode}\`\nGame join karo 👇` : '\n\nGame lobby kholo 👇'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🎮 Game Kholo', web_app: { url } }]]
        }
      }
    );
  });

  // /game — group mein room banao + Firebase watch shuru karo
  bot.command('game', async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const userCode = parts[1]?.toUpperCase();
    const gameArg = parts[2]?.toLowerCase(); // optional: /game ABC123 ludo
    const roomCode = (userCode && userCode.length === 6) ? userCode : genRoomCode();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const chatId = ctx.chat.id;
    const botUsername = ctx.botInfo.username;
    const deepLink = `https://t.me/${botUsername}?start=${roomCode}`;

    // Firebase watch shuru karo — group mein updates aayenge
    if (isGroup) {
      // Agar already watch ho raha hai to pehle band karo
      const existing = activeRooms.get(roomCode);
      if (existing) {
        existing.unsubFns.forEach(fn => fn());
      }
      watchRoom(bot, roomCode, chatId, gameArg || null);
    }

    const gameNames = {
      ludo: '🎲 Ludo Plus',
      chess: '♟️ Chess',
      carrom: '🎳 Carrom',
      tictactoe: '❌⭕ TicTacToe',
      rps: '✊ Rock Paper Scissors',
    };
    const gameName = gameNames[gameArg] || '🎮 GameSphere';

    await ctx.reply(
      `${gameName} *Room Ready!*\n\nRoom Code: \`${roomCode}\`\n\n👥 Sab log neeche click karo aur join karo!\n📢 _Winner ka naam is group mein announce hoga!_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎮 Game Join Karo', url: deepLink }],
          ]
        }
      }
    );
  });

  // /help
  bot.command('help', (ctx) =>
    ctx.reply(
      [
        '🎮 *GameSphere Commands*',
        '',
        '/game — naya room banao (koi bhi game)',
        '/game ABC123 — existing room join karo',
        '/game ABC123 ludo — specific game ke liye',
        '',
        'Available games:',
        'ludo · chess · carrom · tictactoe · rps',
        '',
        '📢 Winner ka naam group mein announce hoga!',
      ].join('\n'),
      { parse_mode: 'Markdown' }
    )
  );

  // Inline mode
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim().toUpperCase();
    const roomCode = (query && query.length === 6) ? query : genRoomCode();
    const botUsername = ctx.botInfo.username;
    const deepLink = `https://t.me/${botUsername}?start=${roomCode}`;

    await ctx.answerInlineQuery([
      {
        type: 'article',
        id: '1',
        title: '🎮 GameSphere Room Banao',
        description: `Room Code: ${roomCode} — Click karo aur khelo!`,
        input_message_content: {
          message_text: `🎮 *GameSphere Room Ready!*\n\nRoom Code: \`${roomCode}\`\n\nJoin karo 👇`,
          parse_mode: 'Markdown',
        },
        reply_markup: {
          inline_keyboard: [[{ text: '🎮 Game Join Karo', url: deepLink }]]
        }
      },
    ], { cache_time: 0 });
  });

  bot.catch((err) => console.error('[bot] error', err));
  bot.launch().then(() => console.log('[bot] ✅ GameSphere bot started'));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
