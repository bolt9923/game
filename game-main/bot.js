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

export function startBot() {
  if (!TOKEN)                          { console.warn('[bot] No TOKEN');        return null; }
  if (!WEBAPP_URL?.startsWith('https')){ console.warn('[bot] Bad WEBAPP_URL');  return null; }

  const bot = new Telegraf(TOKEN);

  bot.use(async (ctx, next) => {
    const from = ctx.from?.username || ctx.from?.first_name || '?';
    const chat = ctx.chat?.title || ctx.chat?.type || '?';
    const text = ctx.message?.text || ctx.updateType;
    console.log(`[bot] ${ctx.updateType} | from:${from} | chat:${chat} | ${text}`);
    return next();
  });

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

  // /game — passes chatId in URL so Mini App can call /api/notify-room
  bot.command('game', async (ctx) => {
    const arg = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();
    const gameId = GAME_NAME[arg] ? arg : 'ludo';
    const emoji  = GAME_EMOJI[gameId];
    const name   = GAME_NAME[gameId];
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const creator = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Player';

    // Pass chatId in URL → Mini App will call /api/notify-room with it after room creation
    const chatId  = ctx.chat.id;
    const gameUrl = `${WEBAPP_URL}?game=${gameId}&from=group&chatId=${chatId}`;

    // Groups require url buttons, private chats can use web_app
    const btn = isGroup
      ? { text: `${emoji} ${name} — Room Banao`, url: gameUrl }
      : { text: `${emoji} ${name} — Room Banao`, web_app: { url: gameUrl } };

    await ctx.reply(
      `${emoji} *${creator} — ${name} room banao!*\n\n` +
      `Button dabao → game khulega → *Create Room* dabao\n` +
      `Room bante hi group mein message aa jaayega! 🚀`,
      { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[btn]] } }
    );
  });

  // watchRoom is exposed so /api/notify-room can call it after posting
  bot._watchRoom = (roomCode, chatId, gameId) => watchRoom(bot, roomCode, chatId, gameId);

  bot.command('help', (ctx) => ctx.reply(
    '🎮 *GameSphere Commands*\n\n' +
    '`/game` — Ludo\n`/game chess` — Chess\n`/game carrom` — Carrom\n' +
    '`/game tictactoe` — TicTacToe\n`/game rps` — RPS\n\n' +
    '📢 Room bante hi group mein join link aayega!\n🏆 Winner bhi announce hoga!',
    { parse_mode:'Markdown' }
  ));

  bot.catch((err) => console.error('[bot] error:', err.message));
  console.log('[bot] Bot instance ready (webhook mode)');
  return bot;
}
