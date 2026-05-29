import { Telegraf } from 'telegraf';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, off, get } from 'firebase/database';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

// ── Firebase ──────────────────────────────────────────────────────────────────
function getDb() {
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

const GAME_EMOJI = {
  ludo:'🎲', chess:'♟️', carrom:'🎳',
  tictactoe:'❌', rps:'✊', wordchain:'🔤',
  emojiquiz:'😂', word:'📝', reaction:'⚡',
};
const GAME_NAME = {
  ludo:'Ludo Plus', chess:'Chess', carrom:'Carrom',
  tictactoe:'Tic Tac Toe', rps:'Rock Paper Scissors',
  wordchain:'Word Chain', emojiquiz:'Emoji Quiz',
  word:'Word Guess', reaction:'Speed Catch',
};
const LUDO_COLOR_EMOJI = { red:'🔴', green:'🟢', yellow:'🟡', blue:'🔵' };

// ── Room watcher — join/start/winner notifications ────────────────────────────
function watchRoom(bot, roomCode, chatId, gameId) {
  const db = getDb();
  const fns = [];
  const roomRef = ref(db, `rooms/${roomCode}`);
  let knownPlayers = new Set();
  let gameStarted = false;

  const roomHandler = onValue(roomRef, async (snap) => {
    if (!snap.exists()) return;
    const val = snap.val();
    const playerList = val.players ? Object.values(val.players) : [];

    // Naye player join notification
    for (const p of playerList) {
      if (!knownPlayers.has(p.id)) {
        knownPlayers.add(p.id);
        if (knownPlayers.size > 1) {
          try {
            await bot.telegram.sendMessage(chatId,
              `✅ *${p.name}* room mein join ho gaya!\n👥 ${playerList.length}/${val.max_players} players`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) { console.error('[bot] join notify:', e.message); }
        }
      }
    }

    // Game start notification
    if (val.status === 'playing' && !gameStarted) {
      gameStarted = true;
      const names = playerList.map(p => `• ${p.name}`).join('\n');
      const emoji = GAME_EMOJI[val.game_id] || '🎮';
      const name = GAME_NAME[val.game_id] || val.game_id;
      try {
        await bot.telegram.sendMessage(chatId,
          `🚀 *${name} — Game Shuru!*\n\n*Players:*\n${names}\n\nAll the best! 🎉`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.error('[bot] start notify:', e.message); }
    }
  });
  fns.push(() => off(roomRef, 'value', roomHandler));

  // Ludo winner
  const ludoRef = ref(db, `gamestate/${roomCode}/ludo_sync_${roomCode}`);
  let lastLudoWinner = null;
  const ludoHandler = onValue(ludoRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.winner && data.winner !== lastLudoWinner) {
      lastLudoWinner = data.winner;
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const players = Object.values(rSnap.val()?.players || {});
        const roleMap = ['red','yellow','blue','green'];
        const winnerName = players[roleMap.indexOf(data.winner)]?.name || data.winner;
        const e = LUDO_COLOR_EMOJI[data.winner] || '🏆';
        await bot.telegram.sendMessage(chatId,
          `${e} 🏆 *WINNER: ${winnerName}!*\n\n🎲 Ludo khatam! Congratulations! 🎉`,
          { parse_mode: 'Markdown' }
        );
        fns.forEach(f => f()); // cleanup
      } catch (e) { console.error('[bot] ludo winner:', e.message); }
    }
  });
  fns.push(() => off(ludoRef, 'value', ludoHandler));

  // Chess winner
  const chessRef = ref(db, `gamestate/${roomCode}/chess_sync_state`);
  let lastChessWinner = null;
  const chessHandler = onValue(chessRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.winner && data.winner !== lastChessWinner) {
      lastChessWinner = data.winner;
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const players = Object.values(rSnap.val()?.players || {});
        const winnerName = data.winner === 'white' ? players[0]?.name || 'White' : players[1]?.name || 'Black';
        await bot.telegram.sendMessage(chatId,
          `♟️ 🏆 *WINNER: ${winnerName}!*\n\nChess khatam! Congratulations! 🎉`,
          { parse_mode: 'Markdown' }
        );
        fns.forEach(f => f());
      } catch (e) { console.error('[bot] chess winner:', e.message); }
    }
  });
  fns.push(() => off(chessRef, 'value', chessHandler));

  // TicTacToe winner
  const tttRef = ref(db, `gamestate/${roomCode}/tictactoe_move`);
  let lastTttWinner = null;
  const tttHandler = onValue(tttRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.winner && data.winner !== lastTttWinner) {
      lastTttWinner = data.winner;
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const players = Object.values(rSnap.val()?.players || {});
        const msg = data.winner === 'draw'
          ? `🤝 *TicTacToe Draw!* Koi nahi jeeta!`
          : `❌ 🏆 *WINNER: ${data.winner === 'X' ? players[0]?.name || 'P1' : players[1]?.name || 'P2'}!*\n\nTicTacToe khatam! 🎉`;
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        fns.forEach(f => f());
      } catch (e) { console.error('[bot] ttt winner:', e.message); }
    }
  });
  fns.push(() => off(tttRef, 'value', tttHandler));

  return fns;
}

// ── Room ready watcher — jab room bane to GC mein announce karo ───────────────
function watchForRoomReady(bot, chatId, creatorName, gameId) {
  const db = getDb();
  const roomsRef = ref(db, 'rooms');
  const announced = new Set();

  const handler = onValue(roomsRef, async (snap) => {
    if (!snap.exists()) return;
    const allRooms = snap.val();

    for (const [code, room] of Object.entries(allRooms)) {
      if (announced.has(code)) continue;
      const createdAt = new Date(room.created_at).getTime();
      const isNew = (Date.now() - createdAt) < 20000;
      const isWaiting = room.status === 'waiting';
      if (!isNew || !isWaiting || room.game_id !== gameId) continue;

      const players = room.players ? Object.values(room.players) : [];
      const isCreatorRoom = players.some(p =>
        p.name === creatorName || (p.name || '').toLowerCase().includes(creatorName.toLowerCase())
      );

      if (isCreatorRoom) {
        announced.add(code);
        off(roomsRef, 'value', handler);

        const emoji = GAME_EMOJI[gameId] || '🎮';
        const name = GAME_NAME[gameId] || gameId;
        const joinUrl = `${WEBAPP_URL}?startapp=${code}`;

        try {
          await bot.telegram.sendMessage(chatId,
            `${emoji} *${name} — Room Ready!*\n\n` +
            `👤 *${creatorName}* ne room banaya\n` +
            `🔑 Room Code: \`${code}\`\n` +
            `👥 Players: 1/${room.max_players}\n\n` +
            `👇 *Button dabao — seedha room mein pohoncho!*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: `${emoji} ${name} Join Karo!`, web_app: { url: joinUrl } }
                ]]
              }
            }
          );
          // Ab room watch shuru karo
          watchRoom(bot, code, chatId, gameId);
        } catch (e) {
          console.error('[bot] room announce error:', e.message);
        }
        return;
      }
    }
  });

  // 3 min baad cleanup
  setTimeout(() => off(roomsRef, 'value', handler), 3 * 60 * 1000);
}

// ── Bot ───────────────────────────────────────────────────────────────────────
export function startBot() {
  if (!TOKEN) { console.warn('[bot] No TOKEN'); return null; }
  if (!WEBAPP_URL?.startsWith('https://')) { console.warn('[bot] Bad WEBAPP_URL:', WEBAPP_URL); return null; }

  const bot = new Telegraf(TOKEN);

  // WebApp sendData — jab user app se room banaye
  bot.on('message', async (ctx) => {
    if (ctx.message?.web_app_data?.data) {
      try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        if (data.type === 'room_created') {
          const { code, gameId, hostName, maxPlayers } = data;
          const chatId = ctx.chat.id;
          const emoji = GAME_EMOJI[gameId] || '🎮';
          const name = GAME_NAME[gameId] || gameId;
          const joinUrl = `${WEBAPP_URL}?startapp=${code}`;
          const creator = ctx.from.username ? `@${ctx.from.username}` : hostName;

          watchRoom(bot, code, chatId, gameId);

          await bot.telegram.sendMessage(chatId,
            `${emoji} *${name} — Room Ready!*\n\n` +
            `👤 *${creator}* ne room banaya\n` +
            `🔑 Room Code: \`${code}\`\n` +
            `👥 Players: 1/${maxPlayers}\n\n` +
            `👇 *Button dabao — seedha room mein pohoncho!*`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: `${emoji} ${name} Join Karo!`, web_app: { url: joinUrl } }
                ]]
              }
            }
          );
        }
      } catch (e) {
        console.error('[bot] web_app_data error:', e.message);
      }
    }
  });

  // /start
  bot.start(async (ctx) => {
    const roomCode = (ctx.startPayload?.length === 6) ? ctx.startPayload.toUpperCase() : '';
    const name = ctx.from.first_name || 'Player';
    const url = roomCode ? `${WEBAPP_URL}?startapp=${roomCode}` : WEBAPP_URL;

    if (roomCode) {
      await ctx.reply(
        `🎮 *${name}, room \`${roomCode}\` join karo!*\n\n👇 Button dabao — seedha room mein pohoncho`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🎮 Seedha Join Karo!', web_app: { url } }]] }
        }
      );
    } else {
      await ctx.reply(
        `🎮 *GameSphere mein swagat hai, ${name}!* 🎉\n\n` +
        `Apne dosto ke saath multiplayer games khelo:\n` +
        `🎲 Ludo • ♟️ Chess • 🎳 Carrom • ❌ TicTacToe\n\n` +
        `📢 *Group mein kaise khele:*\n` +
        `1. Bot ko group mein add karo\n` +
        `2. \`/game\` type karo\n` +
        `3. Room banao — link group mein aayega\n` +
        `4. Sab milke join karo aur khelo! 🎉`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🎮 Game Lobby Kholo', web_app: { url } }]] }
        }
      );
    }
  });

  // /game
  bot.command('game', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const gameArg = parts[1]?.toLowerCase();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const chatId = ctx.chat.id;

    const gameId = GAME_NAME[gameArg] ? gameArg : 'ludo';
    const emoji = GAME_EMOJI[gameId] || '🎮';
    const name = GAME_NAME[gameId] || 'Game';
    const creatorName = ctx.from.first_name || ctx.from.username || 'Player';
    const creator = ctx.from.username ? `@${ctx.from.username}` : creatorName;
    const gameUrl = `${WEBAPP_URL}?game=${gameId}&from=group`;

    if (isGroup) {
      watchForRoomReady(bot, chatId, creatorName, gameId);
    }

    await ctx.reply(
      `${emoji} *${creator} — ${name} room banao!*\n\n` +
      `Button dabao → game khulega → *Create Room* dabao\n` +
      `Room bante hi group mein join link aa jaayega! 🚀`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: `${emoji} ${name} — Room Banao`, web_app: { url: gameUrl } }
          ]]
        }
      }
    );
  });

  // /help
  bot.command('help', (ctx) =>
    ctx.reply(
      '🎮 *GameSphere Commands*\n\n' +
      '`/game` — Ludo room banao\n' +
      '`/game chess` — Chess\n' +
      '`/game carrom` — Carrom\n' +
      '`/game tictactoe` — TicTacToe\n' +
      '`/game rps` — Rock Paper Scissors\n' +
      '`/game wordchain` — Word Chain\n\n' +
      '📢 Room bante hi group mein join link aayega!\n' +
      '🏆 Winner ka announcement bhi group mein aayega!',
      { parse_mode: 'Markdown' }
    )
  );

  // Debug — log all incoming updates
  bot.use((ctx, next) => {
    const type = ctx.updateType;
    const text = ctx.message?.text || ctx.message?.web_app_data?.data || '';
    const from = ctx.from?.username || ctx.from?.first_name || 'unknown';
    const chat = ctx.chat?.title || ctx.chat?.type || '';
    console.log(`[bot] update: ${type} | from: ${from} | chat: ${chat} | text: ${text.slice(0,50)}`);
    return next();
  });

  bot.catch((err) => console.error('[bot] error:', err.message));
  console.log('[bot] Bot instance ready (webhook mode)');
  return bot;
}
