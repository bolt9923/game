import { Telegraf } from 'telegraf';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, off, get } from 'firebase/database';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || process.env.APP_URL;

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

const GAME_EMOJI = { ludo:'🎲', chess:'♟️', carrom:'🎳', tictactoe:'❌', rps:'✊', wordchain:'🔤', emojiquiz:'😂', word:'📝', reaction:'⚡' };
const GAME_NAME  = { ludo:'Ludo Plus', chess:'Chess', carrom:'Carrom', tictactoe:'Tic Tac Toe', rps:'Rock Paper Scissors', wordchain:'Word Chain', emojiquiz:'Emoji Quiz', word:'Word Guess', reaction:'Speed Catch' };
const LUDO_COLOR = { red:'🔴', green:'🟢', yellow:'🟡', blue:'🔵' };

// ── Room game-end watchers ────────────────────────────────────────────────────
function watchRoom(bot, roomCode, chatId, gameId) {
  const db = getDb();
  const unsubs = [];
  const knownPlayers = new Set();
  let gameStarted = false;

  const rRef = ref(db, `rooms/${roomCode}`);
  const rHandler = onValue(rRef, async (snap) => {
    if (!snap.exists()) return;
    const val = snap.val();
    const players = val.players ? Object.values(val.players) : [];

    for (const p of players) {
      if (!knownPlayers.has(p.id)) {
        knownPlayers.add(p.id);
        if (knownPlayers.size > 1) {
          try {
            await bot.telegram.sendMessage(chatId,
              `✅ *${p.name}* room mein join ho gaya!\n👥 ${players.length}/${val.max_players} players`,
              { parse_mode: 'Markdown' });
          } catch(e) { console.error('[bot] join notify:', e.message); }
        }
      }
    }

    if (val.status === 'playing' && !gameStarted) {
      gameStarted = true;
      const names = players.map(p => `• ${p.name}`).join('\n');
      try {
        await bot.telegram.sendMessage(chatId,
          `🚀 *${GAME_NAME[gameId] || gameId} — Game Shuru!*\n\n*Players:*\n${names}\n\nAll the best! 🎉`,
          { parse_mode: 'Markdown' });
      } catch(e) { console.error('[bot] start notify:', e.message); }
    }
  });
  unsubs.push(() => off(rRef, 'value', rHandler));

  // Ludo winner
  const lRef = ref(db, `gamestate/${roomCode}/ludo_sync_${roomCode}`);
  let lastLudoWin = null;
  const lHandler = onValue(lRef, async (snap) => {
    if (!snap.exists()) return;
    const d = snap.val()?.payload ?? snap.val();
    if (d.winner && d.winner !== lastLudoWin) {
      lastLudoWin = d.winner;
      try {
        const rs = await get(ref(db, `rooms/${roomCode}`));
        const pl = Object.values(rs.val()?.players || {});
        const wName = pl[['red','yellow','blue','green'].indexOf(d.winner)]?.name || d.winner;
        await bot.telegram.sendMessage(chatId,
          `${LUDO_COLOR[d.winner]||'🏆'} 🏆 *WINNER: ${wName}!*\n\n🎲 Ludo khatam! Congratulations! 🎉`,
          { parse_mode: 'Markdown' });
        unsubs.forEach(f => f());
      } catch(e) { console.error('[bot] ludo win:', e.message); }
    }
  });
  unsubs.push(() => off(lRef, 'value', lHandler));

  // Chess winner
  const cRef = ref(db, `gamestate/${roomCode}/chess_sync_state`);
  let lastChessWin = null;
  const cHandler = onValue(cRef, async (snap) => {
    if (!snap.exists()) return;
    const d = snap.val()?.payload ?? snap.val();
    if (d.winner && d.winner !== lastChessWin) {
      lastChessWin = d.winner;
      try {
        const rs = await get(ref(db, `rooms/${roomCode}`));
        const pl = Object.values(rs.val()?.players || {});
        const wName = d.winner === 'white' ? pl[0]?.name||'White' : pl[1]?.name||'Black';
        await bot.telegram.sendMessage(chatId,
          `♟️ 🏆 *WINNER: ${wName}!*\n\nChess khatam! Congratulations! 🎉`,
          { parse_mode: 'Markdown' });
        unsubs.forEach(f => f());
      } catch(e) { console.error('[bot] chess win:', e.message); }
    }
  });
  unsubs.push(() => off(cRef, 'value', cHandler));

  // TicTacToe winner
  const tRef = ref(db, `gamestate/${roomCode}/tictactoe_move`);
  let lastTttWin = null;
  const tHandler = onValue(tRef, async (snap) => {
    if (!snap.exists()) return;
    const d = snap.val()?.payload ?? snap.val();
    if (d.winner && d.winner !== lastTttWin) {
      lastTttWin = d.winner;
      try {
        const rs = await get(ref(db, `rooms/${roomCode}`));
        const pl = Object.values(rs.val()?.players || {});
        const msg = d.winner === 'draw'
          ? `🤝 *TicTacToe Draw!*`
          : `❌ 🏆 *WINNER: ${d.winner==='X' ? pl[0]?.name||'P1' : pl[1]?.name||'P2'}!*\n\nTicTacToe khatam! 🎉`;
        await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        unsubs.forEach(f => f());
      } catch(e) { console.error('[bot] ttt win:', e.message); }
    }
  });
  unsubs.push(() => off(tRef, 'value', tHandler));

  return unsubs;
}

// ── Watch Firebase for new room — announce in group when room appears ─────────
// FIX: Removed the 20-second timing window that caused rooms to be missed.
//      Now watches for 5 minutes and matches any new room by this creator/game.
//      Uses url buttons (not web_app) because web_app buttons are banned in groups.
function watchForRoomReady(bot, chatId, creatorName, gameId) {
  const db = getDb();
  const roomsRef = ref(db, 'rooms');
  const announced = new Set();
  const startTime = Date.now();
  const WATCH_MS = 5 * 60 * 1000; // 5 minutes

  console.log(`[bot] Watching for room: game=${gameId} creator=${creatorName} chat=${chatId}`);

  const handler = onValue(roomsRef, async (snap) => {
    if (!snap.exists()) return;

    for (const [code, room] of Object.entries(snap.val())) {
      if (announced.has(code)) continue;
      if (room.status !== 'waiting') continue;
      if (room.game_id !== gameId) continue;

      // Only consider rooms created after the /game command was sent
      const roomAge = Date.now() - new Date(room.created_at).getTime();
      if (roomAge > WATCH_MS) continue; // skip old rooms
      if (new Date(room.created_at).getTime() < startTime - 5000) continue; // must be fresh

      const players = room.players ? Object.values(room.players) : [];
      const isMatch = players.some(p =>
        p.name === creatorName ||
        (p.name || '').toLowerCase().includes(creatorName.toLowerCase().split(' ')[0])
      );
      if (!isMatch) continue;

      announced.add(code);
      off(roomsRef, 'value', handler);

      const emoji = GAME_EMOJI[gameId] || '🎮';
      const name  = GAME_NAME[gameId]  || gameId;
      const url   = `${WEBAPP_URL}?startapp=${code}`;

      console.log(`[bot] ✅ Room ${code} found — announcing in chat ${chatId}`);
      try {
        // Groups do NOT support web_app buttons → use plain url button
        await bot.telegram.sendMessage(chatId,
          `${emoji} *${name} — Room Ready!*\n\n` +
          `👤 *${creatorName}* ne room banaya\n` +
          `🔑 Room Code: \`${code}\`\n` +
          `👥 Players: 1/${room.max_players}\n\n` +
          `👇 *Button dabao — seedha room mein pohoncho!*`,
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: `${emoji} ${name} Join Karo!`, url }]] }
          }
        );
        watchRoom(bot, code, chatId, gameId);
      } catch(e) { console.error('[bot] announce error:', e.message); }
      return;
    }
  });

  // Stop watching after 5 minutes
  setTimeout(() => {
    off(roomsRef, 'value', handler);
    console.log(`[bot] Stopped watching for ${gameId} room by ${creatorName}`);
  }, WATCH_MS);
}

// ── Main bot ──────────────────────────────────────────────────────────────────
export function startBot() {
  if (!TOKEN)                          { console.warn('[bot] No TOKEN');        return null; }
  if (!WEBAPP_URL?.startsWith('https')){ console.warn('[bot] Bad WEBAPP_URL');  return null; }

  const bot = new Telegraf(TOKEN);

  // 1. Debug middleware
  bot.use(async (ctx, next) => {
    const from = ctx.from?.username || ctx.from?.first_name || '?';
    const chat = ctx.chat?.title || ctx.chat?.type || '?';
    const text = ctx.message?.text || ctx.message?.web_app_data?.data?.slice(0,40) || ctx.updateType;
    console.log(`[bot] ${ctx.updateType} | from:${from} | chat:${chat} | ${text}`);
    return next();
  });

  // 2. /start — private chat only, web_app button is fine here
  bot.start(async (ctx) => {
    const code = ctx.startPayload?.length >= 4 ? ctx.startPayload.toUpperCase() : '';
    const name = ctx.from.first_name || 'Player';
    const url  = code ? `${WEBAPP_URL}?startapp=${code}` : WEBAPP_URL;
    if (code) {
      await ctx.reply(
        `🎮 *${name}, room \`${code}\` join karo!*\n\n👇 Button dabao`,
        { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'🎮 Seedha Join Karo!', web_app:{ url } }]] } }
      );
    } else {
      await ctx.reply(
        `🎮 *GameSphere mein swagat hai, ${name}!* 🎉\n\n` +
        `Dosto ke saath khelo: 🎲 Ludo • ♟️ Chess • 🎳 Carrom • ❌ TicTacToe\n\n` +
        `📢 *Group mein:* \`/game\` type karo → room banao → sab join karo!`,
        { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:'🎮 Game Lobby Kholo', web_app:{ url } }]] } }
      );
    }
  });

  // 3. /game — works in groups; starts Firebase watcher, sends url button (not web_app)
  bot.command('game', async (ctx) => {
    const arg = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();
    const gameId = GAME_NAME[arg] ? arg : 'ludo';
    const emoji  = GAME_EMOJI[gameId];
    const name   = GAME_NAME[gameId];
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const creatorName = ctx.from.first_name || ctx.from.username || 'Player';
    const creator     = ctx.from.username ? `@${ctx.from.username}` : creatorName;
    const gameUrl     = `${WEBAPP_URL}?game=${gameId}&from=group`;

    if (isGroup) {
      // Start watching Firebase for the room this user is about to create
      watchForRoomReady(bot, ctx.chat.id, creatorName, gameId);
    }

    // Groups can't use web_app buttons — use url button instead
    const btn = isGroup
      ? { text: `${emoji} ${name} — Room Banao`, url: gameUrl }
      : { text: `${emoji} ${name} — Room Banao`, web_app: { url: gameUrl } };

    await ctx.reply(
      `${emoji} *${creator} — ${name} room banao!*\n\n` +
      `Button dabao → game khulega → *Create Room* dabao\n` +
      `Room bante hi group mein join link aa jaayega! 🚀`,
      { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[btn]] } }
    );
  });

  // 4. /help
  bot.command('help', (ctx) => ctx.reply(
    '🎮 *GameSphere Commands*\n\n' +
    '`/game` — Ludo\n`/game chess` — Chess\n`/game carrom` — Carrom\n' +
    '`/game tictactoe` — TicTacToe\n`/game rps` — RPS\n\n' +
    '📢 Room bante hi group mein join link aayega!\n🏆 Winner bhi announce hoga!',
    { parse_mode:'Markdown' }
  ));

  // 5. web_app_data — optional fallback if app ever calls Telegram.WebApp.sendData()
  bot.on('message', async (ctx) => {
    const data = ctx.message?.web_app_data?.data;
    if (!data) return;
    try {
      const payload = JSON.parse(data);
      if (payload.type === 'room_created') {
        const { code, gameId, hostName, maxPlayers } = payload;
        const chatId  = ctx.chat.id;
        const emoji   = GAME_EMOJI[gameId] || '🎮';
        const name    = GAME_NAME[gameId]  || gameId;
        const url     = `${WEBAPP_URL}?startapp=${code}`;
        const creator = ctx.from.username ? `@${ctx.from.username}` : hostName;
        watchRoom(bot, code, chatId, gameId);
        // Use url button (safe for all chat types)
        await bot.telegram.sendMessage(chatId,
          `${emoji} *${name} — Room Ready!*\n\n` +
          `👤 *${creator}* ne room banaya\n🔑 Room Code: \`${code}\`\n👥 Players: 1/${maxPlayers}\n\n` +
          `👇 *Button dabao — seedha room mein pohoncho!*`,
          { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{ text:`${emoji} ${name} Join Karo!`, url }]] } }
        );
      }
    } catch(e) { console.error('[bot] web_app_data:', e.message); }
  });

  bot.catch((err) => console.error('[bot] error:', err.message));
  console.log('[bot] Bot instance ready (webhook mode)');
  return bot;
}
