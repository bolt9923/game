import { Telegraf } from 'telegraf';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, off, get } from 'firebase/database';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

// ── Firebase init ─────────────────────────────────────────────────────────────
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
  ludo: '🎲', chess: '♟️', carrom: '🎳',
  tictactoe: '❌', rps: '✊', wordchain: '🔤',
  emojiquiz: '😂', word: '📝', reaction: '⚡',
};
const GAME_NAME = {
  ludo: 'Ludo Plus', chess: 'Chess', carrom: 'Carrom',
  tictactoe: 'Tic Tac Toe', rps: 'Rock Paper Scissors',
  wordchain: 'Word Chain', emojiquiz: 'Emoji Quiz',
  word: 'Word Guess', reaction: 'Speed Catch',
};

// chatId -> { gameId, announced }
const pendingRooms = new Map();

// ── Firebase: room ready hote hi group mein message bhejo ─────────────────────
function watchForRoomReady(bot, chatId, creatorName, gameId) {
  const db = getDb();
  const roomsRef = ref(db, 'rooms');

  // Naye rooms dekho — jo abhi ban rahe hain
  const handler = onValue(roomsRef, async (snap) => {
    if (!snap.exists()) return;
    const allRooms = snap.val();

    for (const [code, room] of Object.entries(allRooms)) {
      const r = room;
      // Sirf wo rooms jo is creator ne abhi banaye (last 10 seconds)
      const createdAt = new Date(r.created_at).getTime();
      const now = Date.now();
      const isNew = (now - createdAt) < 15000; // 15 seconds window
      const isWaiting = r.status === 'waiting';
      const alreadyAnnounced = pendingRooms.get(code)?.announced;

      if (isNew && isWaiting && !alreadyAnnounced && r.game_id === gameId) {
        // Check karo creator is room mein host hai
        const players = r.players ? Object.values(r.players) : [];
        const isCreatorRoom = players.some(p =>
          p.name === creatorName || p.name?.includes(creatorName)
        );

        if (isCreatorRoom) {
          pendingRooms.set(code, { announced: true, chatId });
          off(roomsRef, 'value', handler);

          const emoji = GAME_EMOJI[gameId] || '🎮';
          const name = GAME_NAME[gameId] || gameId;
          const joinUrl = `${WEBAPP_URL}?startapp=${code}`;
          const maxP = r.max_players || 2;

          try {
            await bot.telegram.sendMessage(chatId,
              `${emoji} *${name} — Room Ready!*\n\n` +
              `👤 *${creatorName}* ne room banaya\n` +
              `🔑 Room Code: \`${code}\`\n` +
              `👥 Players: 1/${maxP}\n\n` +
              `👇 *Join karne ke liye button dabao — seedha room mein pohoncho!*`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: `${emoji} ${name} Join Karo!`, web_app: { url: joinUrl } }
                  ]]
                }
              }
            );
          } catch (e) {
            console.error('[bot] group message error:', e.message);
          }

          // Cleanup after 5 minutes
          setTimeout(() => pendingRooms.delete(code), 5 * 60 * 1000);
        }
      }
    }
  });

  // 2 minute baad watch band karo
  setTimeout(() => {
    off(roomsRef, 'value', handler);
  }, 2 * 60 * 1000);
}

// ── Firebase watchers for game events ────────────────────────────────────────
const LUDO_COLOR_EMOJI = { red: '🔴', green: '🟢', yellow: '🟡', blue: '🔵' };

function watchRoom(bot, roomCode, chatId, gameId) {
  const db = getDb();
  const fns = [];

  const roomRef = ref(db, `rooms/${roomCode}`);
  let knownPlayers = new Set();
  let gameStarted = false;

  const roomHandler = onValue(roomRef, async (snap) => {
    if (!snap.exists()) return;
    const val = snap.val();
    const playersObj = val.players || {};
    const playerList = Object.values(playersObj);

    for (const p of playerList) {
      if (!knownPlayers.has(p.id)) {
        knownPlayers.add(p.id);
        const isFirst = knownPlayers.size === 1;
        if (!isFirst) {
          try {
            await bot.telegram.sendMessage(chatId,
              `✅ *${p.name}* room mein join ho gaya!\n👥 ${playerList.length}/${val.max_players} players`,
              { parse_mode: 'Markdown' }
            );
          } catch (e) { console.error('[bot] join notify:', e.message); }
        }
      }
    }

    if (val.status === 'playing' && !gameStarted) {
      gameStarted = true;
      const names = playerList.map(p => `• ${p.name}`).join('\n');
      try {
        await bot.telegram.sendMessage(chatId,
          `🚀 *Game Shuru!*\n\n` +
          `${GAME_EMOJI[val.game_id] || '🎮'} *${GAME_NAME[val.game_id] || val.game_id}*\n\n` +
          `*Players:*\n${names}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.error('[bot] start notify:', e.message); }
    }
  });
  fns.push(() => off(roomRef, 'value', roomHandler));

  // Ludo winner watch
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
        const roleMap = ['red', 'yellow', 'blue', 'green'];
        const winnerIdx = roleMap.indexOf(data.winner);
        const winnerName = players[winnerIdx]?.name || data.winner;
        const e = LUDO_COLOR_EMOJI[data.winner] || '🏆';
        await bot.telegram.sendMessage(chatId,
          `${e} 🏆 *WINNER: ${winnerName}!*\n\n🎲 Ludo khatam! Congratulations! 🎉`,
          { parse_mode: 'Markdown' }
        );
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
          ? `🤝 *TicTacToe Draw!*`
          : `❌ 🏆 *WINNER: ${data.winner === 'X' ? players[0]?.name || 'P1' : players[1]?.name || 'P2'}!*`;
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      } catch (e) { console.error('[bot] ttt winner:', e.message); }
    }
  });
  fns.push(() => off(tttRef, 'value', tttHandler));

  return fns;
}

// ── Bot export ────────────────────────────────────────────────────────────────
export function startBot() {
  if (!TOKEN) { console.warn('[bot] No TOKEN'); return null; }
  if (!WEBAPP_URL?.startsWith('https://')) { console.warn('[bot] Bad WEBAPP_URL:', WEBAPP_URL); return null; }

  const bot = new Telegraf(TOKEN);

  // WebApp sendData handler — jab user app mein room banaye
  bot.on('message', async (ctx) => {
    // Telegram WebApp sendData se aata hai
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

          // Watch room for notifications
          watchRoom(bot, code, chatId, gameId);

          await bot.telegram.sendMessage(chatId,
            `${emoji} *${name} — Room Ready!*

` +
            `👤 *${creator}* ne room banaya
` +
            `🔑 Room Code: \`${code}\`
` +
            `👥 Players: 1/${maxPlayers}

` +
            `👇 *Join karne ke liye button dabao!*`,
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

  // /start — seedha Mini App kholo, agar room code hai to join karo
  bot.start(async (ctx) => {
    const roomCode = (ctx.startPayload?.length === 6) ? ctx.startPayload.toUpperCase() : '';
    const url = roomCode ? `${WEBAPP_URL}?startapp=${roomCode}` : WEBAPP_URL;
    const name = ctx.from.first_name || 'Player';

    if (roomCode) {
      await ctx.reply(
        `🎮 *${name}, room \`${roomCode}\` mein join karo!*\n\n👇 Button dabao`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🎮 Seedha Join Karo!', web_app: { url } }]] }
        }
      );
    } else {
      await ctx.reply(
        `🎮 *GameSphere mein swagat hai, ${name}!*\n\nDosto ke saath multiplayer games khelo!\n\n📢 Group mein \`/game\` type karo room banane ke liye.`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🎮 Game Lobby Kholo', web_app: { url } }]] }
        }
      );
    }
  });

  // /game — Mini App kholo, room banao, group mein auto-announce
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

    // Game URL — seedha us game pe jaaye
    const gameUrl = `${WEBAPP_URL}?game=${gameId}&from=group&chatId=${chatId}`;

    // Group mein watch shuru karo — jab room bane to announce karo
    if (isGroup) {
      watchForRoomReady(bot, chatId, creatorName, gameId);
    }

    // Sirf us member ko Mini App button bhejo
    await ctx.reply(
      `${emoji} *${creator} — ${name} room banao!*\n\nNeeche button dabao, game khulega — room banao aur group mein link aayega automatically!`,
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
      '`/game rps` — Rock Paper Scissors\n\n' +
      '📢 Room bante hi group mein join link aayega!',
      { parse_mode: 'Markdown' }
    )
  );

  bot.catch((err) => console.error('[bot] error:', err.message));

  // Webhook mode — polling nahi, server se handle hoga
  // Bot sirf return karo — server.js webhook set karega
  console.log('[bot] Bot instance ready (webhook mode)');
  return bot;
}
