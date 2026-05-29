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

// ── Room code generator ───────────────────────────────────────────────────────
function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Active rooms store ────────────────────────────────────────────────────────
// roomCode -> { chatId, gameId, unsubFns[], knownPlayers Set, announced }
const activeRooms = new Map();

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
const LUDO_COLOR_EMOJI = { red: '🔴', green: '🟢', yellow: '🟡', blue: '🔵' };

// ── Firebase watchers ─────────────────────────────────────────────────────────
function watchRoom(bot, roomCode, chatId, gameId) {
  const db = getDb();
  const fns = [];

  // 1. Room players watch — join/leave notifications
  const roomRef = ref(db, `rooms/${roomCode}`);
  let knownPlayers = new Set();
  let gameStarted = false;

  const roomHandler = onValue(roomRef, async (snap) => {
    if (!snap.exists()) return;
    const val = snap.val();
    const playersObj = val.players || {};
    const playerList = Object.values(playersObj);

    // Naye players detect karo
    for (const p of playerList) {
      if (!knownPlayers.has(p.id)) {
        knownPlayers.add(p.id);
        const isFirst = knownPlayers.size === 1;
        if (!isFirst) {
          // Join notification
          try {
            await bot.telegram.sendMessage(chatId,
              `👤 *${p.name}* room mein join ho gaya!\n\n` +
              `👥 Abhi ${playerList.length}/${val.max_players} players hain\n` +
              `Room: \`${roomCode}\``,
              { parse_mode: 'Markdown' }
            );
          } catch (e) { console.error('[bot] join notify err', e.message); }
        }
      }
    }

    // Game start notification
    if (val.status === 'playing' && !gameStarted) {
      gameStarted = true;
      const names = playerList.map(p => `• ${p.name}`).join('\n');
      try {
        await bot.telegram.sendMessage(chatId,
          `🚀 *Game Shuru Ho Gaya!*\n\n` +
          `${GAME_EMOJI[val.game_id] || '🎮'} *${GAME_NAME[val.game_id] || val.game_id}*\n\n` +
          `*Players:*\n${names}\n\n` +
          `Room: \`${roomCode}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.error('[bot] start notify err', e.message); }
    }
  });
  fns.push(() => off(roomRef, 'value', roomHandler));

  // 2. Ludo game watch
  const ludoRef = ref(db, `gamestate/${roomCode}/ludo_sync_${roomCode}`);
  let lastLudoTurn = null;
  let lastLudoWinner = null;

  const ludoHandler = onValue(ludoRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();

    if (data.winner && data.winner !== lastLudoWinner) {
      lastLudoWinner = data.winner;
      const e = LUDO_COLOR_EMOJI[data.winner] || '🏆';
      // Winner ka player name dhundo
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const rVal = rSnap.val();
        const players = Object.values(rVal?.players || {});
        // role se name match karo
        const roleMap = ['red','yellow','blue','green'];
        const winnerIdx = roleMap.indexOf(data.winner);
        const winnerPlayer = players[winnerIdx] || players[0];
        const winnerName = winnerPlayer?.name || data.winner;

        await bot.telegram.sendMessage(chatId,
          `${e} 🏆 *WINNER: ${winnerName}* 🏆\n\n` +
          `🎲 Ludo - Room \`${roomCode}\` khatam!\n\n` +
          `*${winnerName}* ne jeet li! Congratulations! 🎉`,
          { parse_mode: 'Markdown' }
        );
      } catch (e2) { console.error('[bot] ludo winner err', e2.message); }
    }

    if (data.turn && data.turn !== lastLudoTurn && !data.winner) {
      lastLudoTurn = data.turn;
      const e = LUDO_COLOR_EMOJI[data.turn] || '🎲';
      try {
        // Player name dhundo
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const rVal = rSnap.val();
        const players = Object.values(rVal?.players || {});
        const roleMap = ['red','yellow','blue','green'];
        const idx = roleMap.indexOf(data.turn);
        const player = players[idx] || players[0];
        const name = player?.name || data.turn;

        await bot.telegram.sendMessage(chatId,
          `${e} *${name}* ki baari! (${data.turn})`,
          { parse_mode: 'Markdown' }
        );
      } catch (e2) { console.error('[bot] ludo turn err', e2.message); }
    }
  });
  fns.push(() => off(ludoRef, 'value', ludoHandler));

  // 3. TicTacToe watch
  const tttRef = ref(db, `gamestate/${roomCode}/tictactoe_move`);
  let lastTttWinner = null;
  const tttHandler = onValue(tttRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.winner && data.winner !== lastTttWinner) {
      lastTttWinner = data.winner;
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const rVal = rSnap.val();
        const players = Object.values(rVal?.players || {});
        const msg = data.winner === 'draw'
          ? `🤝 *TicTacToe Draw!* Koi nahi jeeta!\nRoom: \`${roomCode}\``
          : `❌ 🏆 *WINNER!*\n\n${data.winner === 'X' ? players[0]?.name || 'Player 1' : players[1]?.name || 'Player 2'} (${data.winner}) jeet gaya!\nRoom: \`${roomCode}\``;
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      } catch (e) { console.error(e.message); }
    }
  });
  fns.push(() => off(tttRef, 'value', tttHandler));

  // 4. Chess watch
  const chessRef = ref(db, `gamestate/${roomCode}/chess_sync_state`);
  let lastChessWinner = null;
  const chessHandler = onValue(chessRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.winner && data.winner !== lastChessWinner) {
      lastChessWinner = data.winner;
      try {
        const rSnap = await get(ref(db, `rooms/${roomCode}`));
        const rVal = rSnap.val();
        const players = Object.values(rVal?.players || {});
        const winnerName = data.winner === 'white' ? players[0]?.name || 'White' : players[1]?.name || 'Black';
        await bot.telegram.sendMessage(chatId,
          `♟️ 🏆 *WINNER: ${winnerName}!*\n\nChess - Room \`${roomCode}\` khatam!\nCongratulations! 🎉`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.error(e.message); }
    }
  });
  fns.push(() => off(chessRef, 'value', chessHandler));

  // 5. RPS watch
  const rpsRef = ref(db, `gamestate/${roomCode}/rps_sync_state`);
  let lastRpsSeq = 0;
  const rpsHandler = onValue(rpsRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.val()?.payload ?? snap.val();
    if (data.roundResult && data.seq !== lastRpsSeq) {
      lastRpsSeq = data.seq || Date.now();
      try {
        await bot.telegram.sendMessage(chatId,
          `✊ *RPS Round Result!*\n\n${data.roundResult}\nRoom: \`${roomCode}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { console.error(e.message); }
    }
  });
  fns.push(() => off(rpsRef, 'value', rpsHandler));

  activeRooms.set(roomCode, { chatId, gameId, fns, knownPlayers });
  console.log(`[bot] Watching room ${roomCode} for chat ${chatId}`);
  return fns;
}

// ── Bot export ────────────────────────────────────────────────────────────────
export function startBot() {
  if (!TOKEN) { console.warn('[bot] No TOKEN'); return null; }
  if (!WEBAPP_URL?.startsWith('https://')) { console.warn('[bot] Bad WEBAPP_URL'); return null; }

  const bot = new Telegraf(TOKEN);

  // /start — private chat mein WebApp kholo
  bot.start(async (ctx) => {
    const roomCode = (ctx.startPayload && ctx.startPayload.length === 6) ? ctx.startPayload.toUpperCase() : '';
    const url = roomCode ? `${WEBAPP_URL}?startapp=${roomCode}` : WEBAPP_URL;
    await ctx.reply(
      `🎮 *GameSphere!*${roomCode ? `\n\n📌 Room: \`${roomCode}\` join karo 👇` : '\n\nGame lobby 👇'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🎮 Game Kholo', web_app: { url } }]] }
      }
    );
  });

  // /game [gameId] — room banao, GC mein announce karo, Firebase watch shuru
  bot.command('game', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const gameArg = parts[1]?.toLowerCase();
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const chatId = ctx.chat.id;
    const botUsername = ctx.botInfo.username;

    const gameId = GAME_NAME[gameArg] ? gameArg : 'ludo'; // default ludo
    const roomCode = genRoomCode();
    const deepLink = `https://t.me/${botUsername}?start=${roomCode}`;
    const emoji = GAME_EMOJI[gameId] || '🎮';
    const name = GAME_NAME[gameId] || 'Game';

    // Group mein Firebase watch shuru karo
    if (isGroup) {
      const existing = activeRooms.get(roomCode);
      if (existing) existing.fns.forEach(f => f());
      watchRoom(bot, roomCode, chatId, gameId);
    }

    // Telegram username agar ho
    const creator = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    await ctx.reply(
      `${emoji} *${name} — Room Ready!*\n\n` +
      `👤 *${creator}* ne room banaya\n` +
      `🔑 Room Code: \`${roomCode}\`\n\n` +
      `👇 *Join karne ke liye click karo:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `${emoji} ${name} Join Karo`, url: deepLink }]
          ]
        }
      }
    );
  });

  // /help
  bot.command('help', (ctx) =>
    ctx.reply(
      '🎮 *GameSphere Commands*\n\n' +
      '`/game` — Ludo room banao\n' +
      '`/game chess` — Chess room\n' +
      '`/game carrom` — Carrom room\n' +
      '`/game tictactoe` — TicTacToe\n' +
      '`/game rps` — Rock Paper Scissors\n\n' +
      '📢 _Join, game start, turns aur winner sab group mein dikhega!_',
      { parse_mode: 'Markdown' }
    )
  );

  bot.catch((err) => console.error('[bot] error:', err.message));
  bot.launch().then(() => console.log('[bot] ✅ Started!'));
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
  return bot;
}
