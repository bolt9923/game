import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

interface CarromProps {
  onGameOver: (score: number, result?: 'Win' | 'Loss' | 'Draw' | 'Completed') => void;
  onBack: () => void;
}

const CARROM_CSS = `
  :root {
    --wood-dark: #4a2800;
    --wood-mid:  #7c4a10;
    --wood-light:#c8860a;
    --wood-grain:#b8760a;
    --gold:      #e8a020;
    --gold-light:#f5cc60;
    --cream:     #fdf4e3;
    --ivory:     #f5edd8;
    --ink:       #1a0e00;
    --ink-soft:  #3d2800;
    --white-coin:#f0ede5;
    --black-coin:#1e1a2e;
    --queen-red: #cc2222;
    --queen-glow:#ff4444;
    --green-felt:#2d5a1b;
    --rule-box:  #fef9ee;
    --border-warm:#d4921a;
    --shadow-deep:rgba(30,10,0,0.35);
    --foul-red:  #c0392b;
    --win-gold:  #d4ac0d;
    --section-bg:#fffbf0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: linear-gradient(160deg, #2a1400 0%, #1a0c00 40%, #0d0600 100%);
    font-family: 'DM Sans', sans-serif;
    color: var(--ink);
    min-height: 100vh;
    padding: 0;
  }

  /* ── HEADER ── */
  .header {
    background: linear-gradient(135deg, var(--wood-dark) 0%, #2a1200 50%, var(--wood-dark) 100%);
    border-bottom: 4px solid var(--gold);
    padding: 36px 40px 28px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute; inset: 0;
    background: repeating-linear-gradient(45deg, transparent, transparent 18px, rgba(255,200,80,0.04) 18px, rgba(255,200,80,0.04) 36px);
  }
  .header-badge {
    display: inline-block;
    background: var(--gold);
    color: var(--wood-dark);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 11px;
    letter-spacing: 4px;
    padding: 4px 18px;
    border-radius: 2px;
    margin-bottom: 10px;
  }
  .header h1 {
    font-family: 'Playfair Display', serif;
    font-size: clamp(38px, 7vw, 72px);
    font-weight: 900;
    color: var(--gold-light);
    line-height: 1;
    text-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 60px rgba(232,160,32,0.3);
    letter-spacing: -1px;
  }
  .header h1 span { color: var(--cream); }
  .header-sub {
    font-family: 'Crimson Pro', serif;
    font-size: 18px;
    color: rgba(245,220,160,0.75);
    margin-top: 8px;
    font-style: italic;
  }
  .header-coins {
    display: flex; align-items: center; justify-content: center; gap: 18px;
    margin-top: 16px;
  }
  .hcoin {
    display: flex; align-items: center; gap: 7px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 20px;
    padding: 5px 14px;
    font-size: 12px; font-weight: 600; color: var(--cream);
  }
  .hcoin-dot {
    width: 16px; height: 16px; border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }

  /* ── MAIN LAYOUT ── */
  .page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 40px 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .full-width { grid-column: 1 / -1; }

  /* ── SECTION CARD ── */
  .card {
    background: var(--section-bg);
    border-radius: 16px;
    border: 2px solid var(--border-warm);
    overflow: hidden;
    box-shadow: 0 8px 32px var(--shadow-deep), 0 2px 0 rgba(255,220,100,0.15) inset;
  }
  .card-header {
    background: linear-gradient(135deg, var(--wood-mid) 0%, var(--wood-dark) 100%);
    padding: 14px 20px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 2px solid var(--gold);
  }
  .card-num {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--gold);
    color: var(--wood-dark);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .card-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 22px;
    letter-spacing: 2px;
    color: var(--gold-light);
  }
  .card-body { padding: 20px; }

  /* ── BOARD SECTION ── */
  .board-wrap {
    display: flex; gap: 24px; align-items: flex-start;
  }
  .board-svg-container {
    flex-shrink: 0;
    position: relative;
  }
  .board-labels { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .label-item {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--rule-box);
    border: 1px solid rgba(200,140,20,0.3);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
  }
  .label-dot {
    width: 10px; height: 10px; border-radius: 50%; margin-top: 3px; flex-shrink: 0;
  }
  .label-item strong { display: block; font-weight: 700; color: var(--ink); font-size: 12px; }
  .label-item span { color: var(--ink-soft); font-size: 11px; line-height: 1.4; }

  /* ── RULE BOXES ── */
  .rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rule-box {
    background: var(--rule-box);
    border: 1.5px solid rgba(200,140,20,0.35);
    border-radius: 10px;
    padding: 12px 14px;
    position: relative;
  }
  .rule-box.foul {
    border-color: rgba(192,57,43,0.4);
    background: #fff8f6;
  }
  .rule-box.win {
    border-color: rgba(212,172,13,0.5);
    background: #fffbec;
  }
  .rule-icon { font-size: 22px; margin-bottom: 5px; display: block; }
  .rule-title {
    font-family: 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 12px;
    color: var(--ink);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .rule-desc {
    font-size: 11.5px;
    color: var(--ink-soft);
    line-height: 1.5;
  }
  .rule-desc em { font-style: normal; font-weight: 600; color: var(--foul-red); }
  .rule-desc strong { color: var(--wood-dark); }

  /* ── PLAYER DIAGRAMS ── */
  .player-diagram {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 14px;
    background: var(--rule-box);
    border: 1.5px solid rgba(200,140,20,0.35);
    border-radius: 12px;
  }
  .diagram-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 17px; letter-spacing: 1.5px;
    color: var(--wood-dark);
  }

  /* ── TURN FLOW DIAGRAM ── */
  .turn-flow {
    display: flex; align-items: center; gap: 0;
    background: var(--rule-box);
    border: 1.5px solid rgba(200,140,20,0.35);
    border-radius: 12px;
    padding: 16px;
    overflow-x: auto;
  }
  .flow-step {
    text-align: center;
    flex: 1;
    min-width: 90px;
  }
  .flow-bubble {
    width: 58px; height: 58px; border-radius: 50%;
    margin: 0 auto 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
  }
  .flow-label { font-size: 10.5px; font-weight: 600; color: var(--ink); line-height: 1.3; }
  .flow-arrow {
    font-size: 20px; color: var(--gold);
    flex-shrink: 0;
    padding: 0 4px;
  }
  .flow-outcome {
    display: flex; flex-direction: column; gap: 6px;
    flex: 1; min-width: 120px;
  }
  .outcome-yes, .outcome-no {
    border-radius: 8px; padding: 6px 10px;
    font-size: 10.5px; font-weight: 600;
  }
  .outcome-yes { background: #e8f8e8; border: 1px solid #5cb85c; color: #1a5c1a; }
  .outcome-no  { background: #fdecea; border: 1px solid #e74c3c; color: #8b1a1a; }

  /* ── QUEEN STEPS ── */
  .queen-steps { display: flex; gap: 12px; align-items: flex-start; }
  .qstep {
    flex: 1;
    background: var(--rule-box);
    border: 1.5px solid rgba(200,140,20,0.3);
    border-radius: 10px;
    padding: 12px 10px;
    text-align: center;
    position: relative;
  }
  .qstep-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--gold);
    color: var(--wood-dark);
    font-weight: 700; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 6px;
  }
  .qstep-icon { font-size: 26px; display: block; margin-bottom: 4px; }
  .qstep-title { font-weight: 700; font-size: 11px; margin-bottom: 4px; color: var(--ink); }
  .qstep-desc { font-size: 10.5px; color: var(--ink-soft); line-height: 1.4; }
  .qstep-arrow {
    font-size: 22px; color: var(--gold);
    align-self: center; flex-shrink: 0;
  }
  .qstep.warning {
    border-color: rgba(192,57,43,0.4);
    background: #fff8f6;
  }
  .qstep.success {
    border-color: rgba(80,180,80,0.4);
    background: #f6fff6;
  }

  /* ── FOUL GRID ── */
  .foul-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .foul-item {
    background: #fff5f4;
    border: 1.5px solid rgba(192,57,43,0.3);
    border-radius: 10px;
    padding: 12px 10px;
    text-align: center;
  }
  .foul-icon { font-size: 26px; margin-bottom: 6px; display: block; }
  .foul-name { font-weight: 700; font-size: 11px; color: #8b1a1a; margin-bottom: 3px; }
  .foul-desc { font-size: 10px; color: #5a3030; line-height: 1.35; }
  .foul-penalty {
    margin-top: 5px;
    font-size: 9.5px;
    font-weight: 700;
    color: #c0392b;
    background: rgba(192,57,43,0.1);
    border-radius: 4px;
    padding: 2px 6px;
    display: inline-block;
  }

  /* ── WINNING SECTION ── */
  .win-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .win-step {
    background: linear-gradient(135deg, #fffbec, #fff8da);
    border: 2px solid rgba(212,172,13,0.45);
    border-radius: 12px;
    padding: 14px 12px;
    text-align: center;
  }
  .win-step-num {
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--gold);
    color: var(--wood-dark);
    font-weight: 900; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 8px;
  }
  .win-step-icon { font-size: 30px; display: block; margin-bottom: 6px; }
  .win-step-title { font-weight: 700; font-size: 12px; color: var(--ink); margin-bottom: 3px; }
  .win-step-desc { font-size: 10.5px; color: var(--ink-soft); line-height: 1.4; }

  .score-demo {
    background: var(--wood-dark);
    border-radius: 12px;
    padding: 16px;
    color: var(--cream);
    display: flex; gap: 12px; align-items: center;
  }
  .score-title { font-family: 'Bebas Neue', sans-serif; font-size: 14px; letter-spacing: 2px; color: var(--gold); margin-bottom: 8px; }
  .score-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
  .score-player { font-size: 11px; font-weight: 600; }
  .score-bar-wrap { flex: 1; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; }
  .score-bar { height: 100%; border-radius: 5px; }
  .score-pts { font-size: 12px; font-weight: 700; width: 22px; text-align: right; }

  /* ── FOOTER ── */
  .footer {
    background: var(--wood-dark);
    border-top: 3px solid var(--gold);
    padding: 20px 40px;
    text-align: center;
  }
  .footer-text {
    font-family: 'Crimson Pro', serif;
    font-size: 14px;
    color: rgba(245,220,160,0.7);
    font-style: italic;
  }

  /* ── SEATING DIAGRAMS ── */
  .seat-container { display: flex; gap: 20px; flex-wrap: wrap; }
  .seat-diagram { flex: 1; min-width: 200px; }

  /* Responsive */
  @media (max-width: 860px) {
    .page { grid-template-columns: 1fr; }
    .board-wrap { flex-direction: column; align-items: center; }
    .rules-grid { grid-template-columns: 1fr; }
    .foul-grid { grid-template-columns: 1fr 1fr; }
    .win-grid { grid-template-columns: 1fr; }
    .queen-steps { flex-wrap: wrap; }
  }
`;

const CARROM_HTML = `

<!-- ═══════════════════════════ HEADER ═══════════════════════════ -->
<div class="header">
  <div class="header-badge">OFFICIAL RULES &amp; VISUAL GUIDE</div>
  <h1>CARROM <span>BOARD</span></h1>
  <div class="header-sub">Complete Professional Gameplay Manual · 2-Player &amp; 4-Player Modes</div>
  <div class="header-coins">
    <div class="hcoin"><div class="hcoin-dot" style="background:#f0ede5; border:1px solid #aaa;"></div>9 White Coins</div>
    <div class="hcoin"><div class="hcoin-dot" style="background:#1e1a2e; border:1px solid #555;"></div>9 Black Coins</div>
    <div class="hcoin"><div class="hcoin-dot" style="background:#cc2222; border:1px solid #ff6060;"></div>1 Red Queen</div>
    <div class="hcoin" style="background:rgba(232,160,32,0.15); border-color:rgba(232,160,32,0.4);">🎯 1 Striker</div>
  </div>
</div>

<!-- ═══════════════════════════ PAGE ═══════════════════════════ -->
<div class="page">

  <!-- ══════════════ 1. BOARD SETUP ══════════════ -->
  <div class="card full-width">
    <div class="card-header">
      <div class="card-num">1</div>
      <div class="card-title">CARROM BOARD SETUP &amp; ANATOMY</div>
    </div>
    <div class="card-body">
      <div class="board-wrap">

        <!-- SVG Board -->
        <div class="board-svg-container">
          <svg width="360" height="360" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- Wood gradient -->
              <radialGradient id="wood" cx="50%" cy="50%" r="70%">
                <stop offset="0%" stop-color="#d4a820"/>
                <stop offset="55%" stop-color="#b8860b"/>
                <stop offset="100%" stop-color="#7c5a08"/>
              </radialGradient>
              <!-- Coin gradients -->
              <radialGradient id="wCoin" cx="35%" cy="35%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="100%" stop-color="#c8c8c8"/>
              </radialGradient>
              <radialGradient id="bCoin" cx="35%" cy="35%">
                <stop offset="0%" stop-color="#4a4a70"/>
                <stop offset="100%" stop-color="#0e0e20"/>
              </radialGradient>
              <radialGradient id="queen" cx="35%" cy="35%">
                <stop offset="0%" stop-color="#ff7070"/>
                <stop offset="100%" stop-color="#aa1a1a"/>
              </radialGradient>
              <radialGradient id="striker" cx="30%" cy="30%">
                <stop offset="0%" stop-color="#d0d0ff"/>
                <stop offset="100%" stop-color="#505080"/>
              </radialGradient>
              <radialGradient id="pocket" cx="40%" cy="40%">
                <stop offset="0%" stop-color="#333"/>
                <stop offset="100%" stop-color="#000"/>
              </radialGradient>
              <!-- Glow filter -->
              <filter id="queenGlow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="softShadow">
                <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
              </filter>
            </defs>

            <!-- Board surface -->
            <rect width="360" height="360" fill="url(#wood)" rx="8"/>
            <!-- Wood grain lines -->
            <g opacity="0.06" stroke="#000" stroke-width="1">
              <line x1="0" y1="60" x2="360" y2="0"/>
              <line x1="0" y1="120" x2="360" y2="60"/>
              <line x1="0" y1="180" x2="360" y2="120"/>
              <line x1="0" y1="240" x2="360" y2="180"/>
              <line x1="0" y1="300" x2="360" y2="240"/>
              <line x1="0" y1="360" x2="360" y2="300"/>
            </g>

            <!-- Outer frame border -->
            <rect x="3" y="3" width="354" height="354" fill="none" stroke="#5c2a07" stroke-width="5" rx="7"/>
            <!-- Playing area border -->
            <rect x="36" y="36" width="288" height="288" fill="none" stroke="#6b3a10" stroke-width="2.5"/>
            <rect x="39" y="39" width="282" height="282" fill="none" stroke="#8a5020" stroke-width="1"/>

            <!-- Corner pockets -->
            <circle cx="36" cy="36" r="18" fill="url(#pocket)"/>
            <circle cx="324" cy="36" r="18" fill="url(#pocket)"/>
            <circle cx="36" cy="324" r="18" fill="url(#pocket)"/>
            <circle cx="324" cy="324" r="18" fill="url(#pocket)"/>
            <!-- Pocket rings -->
            <circle cx="36" cy="36" r="21" fill="none" stroke="#3d1a00" stroke-width="2"/>
            <circle cx="324" cy="36" r="21" fill="none" stroke="#3d1a00" stroke-width="2"/>
            <circle cx="36" cy="324" r="21" fill="none" stroke="#3d1a00" stroke-width="2"/>
            <circle cx="324" cy="324" r="21" fill="none" stroke="#3d1a00" stroke-width="2"/>
            <!-- Pocket labels -->
            <text x="36" y="14" text-anchor="middle" font-size="8" fill="#f5cc60" font-weight="600">POCKET</text>
            <text x="324" y="14" text-anchor="middle" font-size="8" fill="#f5cc60" font-weight="600">POCKET</text>
            <text x="36" y="353" text-anchor="middle" font-size="8" fill="#f5cc60" font-weight="600">POCKET</text>
            <text x="324" y="353" text-anchor="middle" font-size="8" fill="#f5cc60" font-weight="600">POCKET</text>

            <!-- Center circles -->
            <circle cx="180" cy="180" r="70" fill="none" stroke="rgba(100,60,10,0.4)" stroke-width="1.5"/>
            <circle cx="180" cy="180" r="44" fill="none" stroke="rgba(100,60,10,0.4)" stroke-width="1.2"/>
            <circle cx="180" cy="180" r="26" fill="none" stroke="rgba(100,60,10,0.45)" stroke-width="1"/>
            <circle cx="180" cy="180" r="14" fill="none" stroke="rgba(100,60,10,0.45)" stroke-width="1"/>
            <!-- Center dot -->
            <circle cx="180" cy="180" r="5" fill="rgba(100,60,10,0.5)"/>

            <!-- Diagonal lines -->
            <line x1="180" y1="180" x2="62" y2="62" stroke="rgba(100,60,10,0.3)" stroke-width="1"/>
            <line x1="180" y1="180" x2="298" y2="62" stroke="rgba(100,60,10,0.3)" stroke-width="1"/>
            <line x1="180" y1="180" x2="62" y2="298" stroke="rgba(100,60,10,0.3)" stroke-width="1"/>
            <line x1="180" y1="180" x2="298" y2="298" stroke="rgba(100,60,10,0.3)" stroke-width="1"/>

            <!-- Baseline (P1 - bottom) -->
            <line x1="60" y1="300" x2="300" y2="300" stroke="#d4921a" stroke-width="1.5" stroke-dasharray="5,5" opacity="0.8"/>
            <!-- Baseline (P2 - top) -->
            <line x1="60" y1="60" x2="300" y2="60" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="5,5" opacity="0.8"/>
            <!-- Baseline (P3 - left) -->
            <line x1="60" y1="60" x2="60" y2="300" stroke="#10b981" stroke-width="1.5" stroke-dasharray="5,5" opacity="0.8"/>
            <!-- Baseline (P4 - right) -->
            <line x1="300" y1="60" x2="300" y2="300" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="5,5" opacity="0.8"/>

            <!-- Striker circles (P1 bottom) -->
            <circle cx="120" cy="308" r="8" fill="none" stroke="#d4921a" stroke-width="1.5" opacity="0.9"/>
            <circle cx="180" cy="308" r="8" fill="none" stroke="#d4921a" stroke-width="1.5" opacity="0.9"/>
            <circle cx="240" cy="308" r="8" fill="none" stroke="#d4921a" stroke-width="1.5" opacity="0.9"/>
            <!-- Striker circles (P2 top) -->
            <circle cx="120" cy="52" r="8" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.9"/>
            <circle cx="180" cy="52" r="8" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.9"/>
            <circle cx="240" cy="52" r="8" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.9"/>

            <!-- ── COIN ARRANGEMENT ── -->
            <!-- Outer ring: 12 coins, alternating black/white, r=52 -->
            <!-- 0° = right, going clockwise. offset 15° -->
            <!-- i=0 black, i=1 white, i=2 black ... -->
            <!-- Positions: 15°, 45°, 75°, 105°, 135°, 165°, 195°, 225°, 255°, 285°, 315°, 345° -->
            <g filter="url(#softShadow)">
              <!-- Outer ring coins (12) -->
              <!-- 15° -->
              <circle cx="230.3" cy="166.5" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 45° -->
              <circle cx="216.8" cy="143.2" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 75° -->
              <circle cx="193.5" cy="127.7" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 105° -->
              <circle cx="166.5" cy="127.7" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 135° -->
              <circle cx="143.2" cy="143.2" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 165° -->
              <circle cx="129.7" cy="166.5" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 195° -->
              <circle cx="129.7" cy="193.5" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 225° -->
              <circle cx="143.2" cy="216.8" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 255° -->
              <circle cx="166.5" cy="230.3" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 285° -->
              <circle cx="193.5" cy="230.3" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 315° -->
              <circle cx="216.8" cy="216.8" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 345° -->
              <circle cx="230.3" cy="193.5" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>

              <!-- Inner ring coins (6), r=26, alternating w/b starting white -->
              <!-- 0°=right: white -->
              <circle cx="206" cy="180" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 60°: black -->
              <circle cx="193" cy="157.4" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 120°: white -->
              <circle cx="167" cy="157.4" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 180°: black -->
              <circle cx="154" cy="180" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>
              <!-- 240°: white -->
              <circle cx="167" cy="202.6" r="10" fill="url(#wCoin)" stroke="#888" stroke-width="0.8"/>
              <!-- 300°: black -->
              <circle cx="193" cy="202.6" r="10" fill="url(#bCoin)" stroke="#000" stroke-width="0.8"/>

              <!-- Queen at center -->
              <circle cx="180" cy="180" r="10" fill="url(#queen)" stroke="#8b0000" stroke-width="1" filter="url(#queenGlow)"/>
              <circle cx="180" cy="180" r="5" fill="#ffcc00"/>
            </g>

            <!-- Queen glow ring -->
            <circle cx="180" cy="180" r="13" fill="none" stroke="#ff4444" stroke-width="1.5" opacity="0.5"/>

            <!-- Coin labels -->
            <text x="205" y="174" text-anchor="middle" font-size="7" fill="rgba(0,0,0,0.4)">W</text>
            <text x="180" y="184" text-anchor="middle" font-size="7" fill="#ffcc00" font-weight="700">Q</text>

            <!-- P1 Striker shown at bottom center -->
            <circle cx="180" cy="310" r="13" fill="url(#striker)" stroke="#c0c0ff" stroke-width="1.5" filter="url(#softShadow)"/>
            <text x="180" y="314" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)">S</text>
            <text x="180" y="332" text-anchor="middle" font-size="9" fill="#d4921a" font-weight="600">STRIKER</text>

            <!-- Player labels on sides -->
            <!-- P1 bottom -->
            <text x="180" y="354" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="11" fill="#f5cc60" letter-spacing="1">PLAYER 1 · WHITE ⚪</text>
            <!-- P2 top -->
            <text x="180" y="27" text-anchor="middle" font-family="Bebas Neue, sans-serif" font-size="11" fill="#f5cc60" letter-spacing="1">PLAYER 2 · BLACK ⚫</text>

            <!-- Arrow annotations -->
            <!-- Center circle label -->
            <line x1="180" y1="138" x2="180" y2="170" stroke="#e8a020" stroke-width="1" marker-end="url(#arr)"/>
            <text x="180" y="133" text-anchor="middle" font-size="9" fill="#e8a020" font-weight="600">CENTER CIRCLE</text>

            <!-- Queen label -->
            <line x1="200" y1="168" x2="188" y2="178" stroke="#ff6666" stroke-width="1"/>
            <text x="215" y="165" font-size="9" fill="#ff6666" font-weight="700">QUEEN👑</text>

            <!-- Outer ring label -->
            <text x="290" y="178" text-anchor="start" font-size="8" fill="#f5cc60">OUTER</text>
            <text x="290" y="188" text-anchor="start" font-size="8" fill="#f5cc60">RING (12)</text>
            <line x1="288" y1="183" x2="241" y2="183" stroke="#f5cc60" stroke-width="0.8" opacity="0.6"/>

            <!-- Inner ring label -->
            <text x="75" y="178" text-anchor="end" font-size="8" fill="#f5cc60">INNER</text>
            <text x="75" y="188" text-anchor="end" font-size="8" fill="#f5cc60">RING (6)</text>
            <line x1="77" y1="183" x2="156" y2="183" stroke="#f5cc60" stroke-width="0.8" opacity="0.6"/>
          </svg>
        </div>

        <!-- Board Labels -->
        <div class="board-labels">
          <div class="label-item">
            <div class="label-dot" style="background:#cc2222;"></div>
            <div><strong>Red Queen (Centre)</strong><span>The most valuable piece. Must be pocketed AND covered to win. Worth 3 bonus points.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#f0ede5; border:1px solid #999;"></div>
            <div><strong>White Coins × 9</strong><span>Player 1 (2P) or Team A (P1+P3 in 4P) scores by pocketing these.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#1e1a2e; border:1px solid #555;"></div>
            <div><strong>Black Coins × 9</strong><span>Player 2 (2P) or Team B (P2+P4 in 4P) scores by pocketing these.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#9090c0; border:1px solid #c0c0ff;"></div>
            <div><strong>Striker</strong><span>The large disc used to hit coins into pockets. Must be placed in the striker circle on your baseline.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#000;"></div>
            <div><strong>Four Corner Pockets</strong><span>Circular holes at each corner where coins are scored. Striker pocketed = FOUL.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#d4921a;"></div>
            <div><strong>Baseline &amp; Striker Circles</strong><span>Dashed line on each side. Striker must touch or be behind the baseline before each shot.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#8a5020;"></div>
            <div><strong>Diagonal Lines</strong><span>Decorative lines from centre to near each pocket. Coins landing on diagonals are repositioned.</span></div>
          </div>
          <div class="label-item">
            <div class="label-dot" style="background:#b8860b;"></div>
            <div><strong>Centre Circles (4 rings)</strong><span>Starting arrangement zone. Coins set up in two concentric rings around the queen at game start.</span></div>
          </div>
        </div>
      </div>

      <!-- Coin arrangement explanation -->
      <div style="margin-top:16px; background:linear-gradient(135deg,#fffbec,#fff6d0); border:2px solid rgba(200,140,20,0.4); border-radius:12px; padding:16px;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:16px; letter-spacing:2px; color:var(--wood-dark); margin-bottom:10px;">📐 OFFICIAL COIN ARRANGEMENT</div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; font-size:11.5px; color:var(--ink-soft);">
          <div style="background:white; border-radius:8px; padding:10px; border:1px solid rgba(200,140,20,0.3);">
            <strong style="color:var(--ink); display:block; margin-bottom:4px;">🎯 Centre</strong>
            Red Queen placed exactly at the centre point of the board.
          </div>
          <div style="background:white; border-radius:8px; padding:10px; border:1px solid rgba(200,140,20,0.3);">
            <strong style="color:var(--ink); display:block; margin-bottom:4px;">🔵 Inner Ring (6 coins)</strong>
            Alternating White–Black, starting with White at top. 3 white + 3 black.
          </div>
          <div style="background:white; border-radius:8px; padding:10px; border:1px solid rgba(200,140,20,0.3);">
            <strong style="color:var(--ink); display:block; margin-bottom:4px;">⭕ Outer Ring (12 coins)</strong>
            Alternating Black–White. 6 white + 6 black. Total: 9W + 9B + 1Q = 19 pieces.
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ 2. 2-PLAYER RULES ══════════════ -->
  <div class="card">
    <div class="card-header">
      <div class="card-num">2</div>
      <div class="card-title">2-PLAYER MODE</div>
    </div>
    <div class="card-body">

      <!-- Seating diagram -->
      <div class="player-diagram" style="margin-bottom:14px;">
        <div class="diagram-title">SEATING &amp; SIDES</div>
        <svg width="200" height="200" viewBox="0 0 200 200">
          <!-- Board -->
          <rect x="40" y="40" width="120" height="120" fill="#b8860b" rx="6" stroke="#6b3a10" stroke-width="2"/>
          <rect x="50" y="50" width="100" height="100" fill="#c89a0c" rx="3" opacity="0.6"/>
          <!-- Pockets -->
          <circle cx="40" cy="40" r="7" fill="#111"/>
          <circle cx="160" cy="40" r="7" fill="#111"/>
          <circle cx="40" cy="160" r="7" fill="#111"/>
          <circle cx="160" cy="160" r="7" fill="#111"/>
          <!-- Centre -->
          <circle cx="100" cy="100" r="4" fill="#cc2222"/>

          <!-- P1 bottom -->
          <rect x="60" y="173" width="80" height="20" fill="#f59e0b" rx="4"/>
          <text x="100" y="187" text-anchor="middle" font-size="10" fill="white" font-weight="700">PLAYER 1 · WHITE</text>
          <!-- P2 top -->
          <rect x="60" y="7" width="80" height="20" fill="#3b82f6" rx="4"/>
          <text x="100" y="21" text-anchor="middle" font-size="10" fill="white" font-weight="700">PLAYER 2 · BLACK</text>

          <!-- Arrows between players -->
          <path d="M 100 165 L 100 155" stroke="#f59e0b" stroke-width="2" marker-end="url(#arr2)"/>
          <path d="M 100 45 L 100 35" stroke="#3b82f6" stroke-width="2" marker-end="url(#arr3)"/>

          <!-- Baselines -->
          <line x1="52" y1="163" x2="148" y2="163" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"/>
          <line x1="52" y1="47" x2="148" y2="47" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3"/>

          <!-- Turn flow arrows -->
          <path d="M 148 120 Q 175 100 148 80" stroke="#e8a020" stroke-width="1.5" fill="none" stroke-dasharray="3,3"/>
          <text x="182" y="103" text-anchor="middle" font-size="8" fill="#e8a020">TURNS</text>
          <text x="182" y="113" text-anchor="middle" font-size="8" fill="#e8a020">ALTERNATE</text>

          <defs>
            <marker id="arr2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b"/>
            </marker>
            <marker id="arr3" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#3b82f6"/>
            </marker>
          </defs>
        </svg>
        <div style="font-size:10.5px; color:var(--ink-soft); text-align:center; max-width:200px;">Players sit on opposite sides. P1 uses White ⚪, P2 uses Black ⚫. Coin color is fixed throughout the game.</div>
      </div>

      <!-- 2P Rules -->
      <div class="rules-grid">
        <div class="rule-box">
          <span class="rule-icon">🎯</span>
          <div class="rule-title">Pocket Own Coin → Extra Turn</div>
          <div class="rule-desc">If you pocket <strong>your own colour</strong> coin, you score 1 point and get to <em>shoot again</em> immediately. Chain multiple coins for extra turns!</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">❌</span>
          <div class="rule-title">Miss / No Pocket → Pass Turn</div>
          <div class="rule-desc">If the striker hits coins but nothing is pocketed, or only the striker moves, your turn <em>ends immediately</em> and the opponent takes their turn.</div>
        </div>
        <div class="rule-box foul">
          <span class="rule-icon">⚠️</span>
          <div class="rule-title">Wrong Coin Penalty</div>
          <div class="rule-desc">Pocket <em>opponent's colour</em> coin = FOUL! That coin immediately returns to the board (near centre). Turn passes to opponent.</div>
        </div>
        <div class="rule-box foul">
          <span class="rule-icon">🚫</span>
          <div class="rule-title">Striker Foul</div>
          <div class="rule-desc">If the <em>striker falls into a pocket</em>, it's a foul. One of your pocketed coins returns to the board as penalty. Turn passes.</div>
        </div>
      </div>

      <div style="margin-top:12px; background:linear-gradient(90deg,#fff8e8,#fffbf0); border-left:4px solid var(--gold); border-radius:0 8px 8px 0; padding:10px 14px; font-size:11.5px; color:var(--ink-soft);">
        <strong style="color:var(--ink);">🏆 Objective:</strong> Be the first player to pocket all 9 of your coins AND successfully cover the Queen. Toss to decide who plays first.
      </div>
    </div>
  </div>

  <!-- ══════════════ 3. 4-PLAYER RULES ══════════════ -->
  <div class="card">
    <div class="card-header">
      <div class="card-num">3</div>
      <div class="card-title">4-PLAYER MODE</div>
    </div>
    <div class="card-body">

      <!-- 4P seating diagram -->
      <div class="player-diagram" style="margin-bottom:14px;">
        <div class="diagram-title">SEATING, TEAMS &amp; TURN ORDER</div>
        <svg width="220" height="220" viewBox="0 0 220 220">
          <!-- Board -->
          <rect x="50" y="50" width="120" height="120" fill="#b8860b" rx="6" stroke="#6b3a10" stroke-width="2"/>
          <!-- Pockets -->
          <circle cx="50" cy="50" r="7" fill="#111"/>
          <circle cx="170" cy="50" r="7" fill="#111"/>
          <circle cx="50" cy="170" r="7" fill="#111"/>
          <circle cx="170" cy="170" r="7" fill="#111"/>
          <!-- Centre -->
          <circle cx="110" cy="110" r="4" fill="#cc2222"/>

          <!-- TEAM A: P1 (bottom) + P3 (left) = WHITE -->
          <!-- P1 bottom -->
          <rect x="65" y="182" width="90" height="22" fill="#f59e0b" rx="4"/>
          <text x="110" y="197" text-anchor="middle" font-size="9.5" fill="white" font-weight="700">P1 · WHITE ⚪ (Team A)</text>
          <!-- P3 left -->
          <rect x="2" y="96" width="22" height="28" fill="#10b981" rx="4" transform="rotate(0)"/>
          <text x="13" y="108" text-anchor="middle" font-size="7" fill="white" font-weight="700" transform="rotate(-90,13,110)">P3·W·A</text>

          <!-- TEAM B: P2 (top) + P4 (right) = BLACK -->
          <!-- P2 top -->
          <rect x="65" y="16" width="90" height="22" fill="#3b82f6" rx="4"/>
          <text x="110" y="31" text-anchor="middle" font-size="9.5" fill="white" font-weight="700">P2 · BLACK ⚫ (Team B)</text>
          <!-- P4 right -->
          <rect x="196" y="96" width="22" height="28" fill="#a855f7" rx="4"/>
          <text x="207" y="108" text-anchor="middle" font-size="7" fill="white" font-weight="700" transform="rotate(90,207,110)">P4·B·B</text>

          <!-- Clockwise arrows -->
          <path d="M 110 172 L 110 160" stroke="#f59e0b" stroke-width="1.5" fill="none" marker-end="url(#arrY)"/>
          <path d="M 60 110 L 72 110" stroke="#10b981" stroke-width="1.5" fill="none" marker-end="url(#arrG)"/>
          <path d="M 110 60 L 110 72" stroke="#3b82f6" stroke-width="1.5" fill="none" marker-end="url(#arrB)"/>
          <path d="M 160 110 L 148 110" stroke="#a855f7" stroke-width="1.5" fill="none" marker-end="url(#arrP)"/>

          <!-- Turn rotation circle -->
          <path d="M 110 42 A 68 68 0 1 0 42 110" fill="none" stroke="#e8a020" stroke-width="2" stroke-dasharray="5,4" opacity="0.7"/>
          <polygon points="42,110 36,104 48,102" fill="#e8a020" opacity="0.7"/>
          <text x="154" y="44" font-size="9" fill="#e8a020" font-weight="700">CLOCKWISE</text>

          <!-- Team A & B badges -->
          <rect x="92" y="82" width="36" height="14" fill="#f59e0b" rx="3" opacity="0.85"/>
          <text x="110" y="92" text-anchor="middle" font-size="8.5" fill="white" font-weight="700">TEAM A</text>
          <rect x="92" y="100" width="36" height="14" fill="#3b82f6" rx="3" opacity="0.85"/>
          <text x="110" y="110" text-anchor="middle" font-size="8.5" fill="white" font-weight="700">TEAM B</text>

          <defs>
            <marker id="arrY" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b"/></marker>
            <marker id="arrG" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#10b981"/></marker>
            <marker id="arrB" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3b82f6"/></marker>
            <marker id="arrP" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a855f7"/></marker>
          </defs>
        </svg>
      </div>

      <!-- 4P Rules -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
        <div style="background:#fff8ec; border:1.5px solid rgba(245,158,11,0.4); border-radius:10px; padding:12px;">
          <div style="font-weight:700; font-size:11px; color:#92400e; margin-bottom:5px; text-transform:uppercase;">🟡 Team A (White)</div>
          <div style="font-size:10.5px; color:var(--ink-soft); line-height:1.5;">
            <b>Player 1</b> — sits at bottom<br>
            <b>Player 3</b> — sits at left side<br>
            Both pocket White coins ⚪<br>
            Opposite sides, shared score
          </div>
        </div>
        <div style="background:#eff6ff; border:1.5px solid rgba(59,130,246,0.4); border-radius:10px; padding:12px;">
          <div style="font-weight:700; font-size:11px; color:#1e3a5f; margin-bottom:5px; text-transform:uppercase;">🔵 Team B (Black)</div>
          <div style="font-size:10.5px; color:var(--ink-soft); line-height:1.5;">
            <b>Player 2</b> — sits at top<br>
            <b>Player 4</b> — sits at right side<br>
            Both pocket Black coins ⚫<br>
            Opposite sides, shared score
          </div>
        </div>
      </div>

      <div class="rules-grid">
        <div class="rule-box">
          <span class="rule-icon">🔄</span>
          <div class="rule-title">Clockwise Turn Order</div>
          <div class="rule-desc">Order: <strong>P1 → P4 → P2 → P3 → P1…</strong> (clockwise around the board). If a player is disqualified, skip them.</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">🤝</span>
          <div class="rule-title">Teammate Strategy</div>
          <div class="rule-desc">You can help set up shots for your partner. Pocket your colour to continue. If you accidentally pocket partner's coin — it still counts for your team!</div>
        </div>
        <div class="rule-box foul">
          <span class="rule-icon">🚫</span>
          <div class="rule-title">Pocketing Opponents</div>
          <div class="rule-desc">Pocketing the <em>enemy team's coin</em> returns that coin to the board near centre. Your turn ends immediately.</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">🏆</span>
          <div class="rule-title">Team Wins Together</div>
          <div class="rule-desc">Either teammate can pocket all team coins. The team wins when all <strong>9 of their colour</strong> are pocketed AND queen is covered.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ 4. QUEEN RULES ══════════════ -->
  <div class="card full-width">
    <div class="card-header">
      <div class="card-num" style="background:#cc2222; color:white;">👑</div>
      <div class="card-title">QUEEN RULES — THE MOST IMPORTANT RULE</div>
    </div>
    <div class="card-body">

      <div style="display:grid; grid-template-columns:1fr 2fr; gap:20px; align-items:start;">

        <!-- Queen visual -->
        <div style="text-align:center;">
          <svg width="180" height="180" viewBox="0 0 180 180" style="display:block; margin:0 auto;">
            <defs>
              <radialGradient id="qrd" cx="35%" cy="35%">
                <stop offset="0%" stop-color="#ff7070"/>
                <stop offset="100%" stop-color="#aa1a1a"/>
              </radialGradient>
              <filter id="qglow2">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <!-- Board bg -->
            <rect width="180" height="180" fill="#c89a0c" rx="10" opacity="0.3"/>
            <!-- Glow circles -->
            <circle cx="90" cy="90" r="60" fill="none" stroke="#ff4444" stroke-width="1" opacity="0.3"/>
            <circle cx="90" cy="90" r="44" fill="none" stroke="#ff4444" stroke-width="1" opacity="0.4"/>
            <circle cx="90" cy="90" r="30" fill="none" stroke="#ff4444" stroke-width="1.5" opacity="0.5"/>
            <!-- Queen coin -->
            <circle cx="90" cy="90" r="22" fill="url(#qrd)" filter="url(#qglow2)" stroke="#8b0000" stroke-width="1.5"/>
            <circle cx="90" cy="90" r="10" fill="#ffcc00"/>
            <!-- Crown symbol -->
            <text x="90" y="95" text-anchor="middle" font-size="14" fill="#aa1a1a">♛</text>
            <!-- Red aura pulses -->
            <circle cx="90" cy="90" r="26" fill="none" stroke="#ff3333" stroke-width="2" opacity="0.6"/>
            <!-- Label -->
            <text x="90" y="130" text-anchor="middle" font-family="Bebas Neue,sans-serif" font-size="16" fill="#ff4444" letter-spacing="2">RED QUEEN</text>
            <text x="90" y="145" text-anchor="middle" font-size="10" fill="var(--ink-soft)">+3 Bonus Points</text>
            <text x="90" y="158" text-anchor="middle" font-size="10" fill="var(--ink-soft)">Must be Covered to Win</text>
          </svg>
        </div>

        <!-- Queen steps -->
        <div>
          <div style="font-family:'Bebas Neue',sans-serif; font-size:15px; letter-spacing:2px; color:var(--wood-dark); margin-bottom:12px;">STEP-BY-STEP QUEEN SEQUENCE</div>
          <div class="queen-steps">
            <div class="qstep">
              <div class="qstep-num">1</div>
              <span class="qstep-icon">👑</span>
              <div class="qstep-title">Pocket the Queen</div>
              <div class="qstep-desc">Strike the red queen into any corner pocket at any point during your turn. This can be before, after, or along with your own coins.</div>
            </div>
            <div class="qstep-arrow">→</div>
            <div class="qstep success">
              <div class="qstep-num">2</div>
              <span class="qstep-icon">⚪</span>
              <div class="qstep-title">Cover the Queen</div>
              <div class="qstep-desc">On the SAME shot or the very next shot, pocket at least one of YOUR OWN colour coins. This "covers" the queen — it's now yours permanently!</div>
            </div>
            <div class="qstep-arrow">→</div>
            <div class="qstep warning">
              <div class="qstep-num">2B</div>
              <span class="qstep-icon">🔄</span>
              <div class="qstep-title">Failed Cover = Queen Returns</div>
              <div class="qstep-desc">If you CANNOT pocket your own coin in the next shot after queening, the queen returns to the centre. You must try again later!</div>
            </div>
          </div>

          <div style="margin-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div style="background:#f6fff6; border:1.5px solid rgba(80,160,80,0.4); border-radius:10px; padding:12px;">
              <div style="font-weight:700; font-size:11px; color:#1a5c1a; margin-bottom:5px; text-transform:uppercase;">✅ Queen Successfully Covered</div>
              <ul style="font-size:10.5px; color:var(--ink-soft); line-height:1.6; padding-left:14px;">
                <li>Queen stays pocketed permanently</li>
                <li>You earn <strong>+3 bonus points</strong></li>
                <li>Now only need to clear your remaining coins</li>
                <li>If all your coins are already gone — you WIN now!</li>
              </ul>
            </div>
            <div style="background:#fff8f6; border:1.5px solid rgba(192,57,43,0.3); border-radius:10px; padding:12px;">
              <div style="font-weight:700; font-size:11px; color:#8b1a1a; margin-bottom:5px; text-transform:uppercase;">⚠️ Special Queen Rule</div>
              <ul style="font-size:10.5px; color:var(--ink-soft); line-height:1.6; padding-left:14px;">
                <li>You can't win without covering the queen</li>
                <li>The queen can be pocketed by ANY player</li>
                <li>But only the one who covers it scores the bonus</li>
                <li>If you pocket all coins without the queen → queen must still be covered!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ 5. FOULS & PENALTIES ══════════════ -->
  <div class="card">
    <div class="card-header">
      <div class="card-num" style="background:#c0392b; color:white;">⚠</div>
      <div class="card-title">FOULS &amp; PENALTIES</div>
    </div>
    <div class="card-body">
      <div class="foul-grid">
        <div class="foul-item">
          <span class="foul-icon">🕳️</span>
          <div class="foul-name">Striker in Pocket</div>
          <div class="foul-desc">The striker falls into any corner pocket during or after a shot.</div>
          <div class="foul-penalty">📌 One own pocketed coin returns to centre</div>
        </div>
        <div class="foul-item">
          <span class="foul-icon">🖐️</span>
          <div class="foul-name">Touching Coins by Hand</div>
          <div class="foul-desc">Repositioning, touching, or moving any coin or the striker by hand (except when permitted).</div>
          <div class="foul-penalty">📌 Turn passes. Coin returned.</div>
        </div>
        <div class="foul-item">
          <span class="foul-icon">🔁</span>
          <div class="foul-name">Illegal Double Hit</div>
          <div class="foul-desc">The striker hitting the same coin twice in one shot (double touch/double hit).</div>
          <div class="foul-penalty">📌 Turn ends immediately</div>
        </div>
        <div class="foul-item">
          <span class="foul-icon">🚫</span>
          <div class="foul-name">Pocket Opponent Coin</div>
          <div class="foul-desc">Deliberately or accidentally pocketing the opponent's colour coin.</div>
          <div class="foul-penalty">📌 That coin returns near centre. Turn passes.</div>
        </div>
        <div class="foul-item">
          <span class="foul-icon">⏱️</span>
          <div class="foul-name">Time Violation</div>
          <div class="foul-desc">Taking more than the allowed time (25 seconds) to complete a shot in timed formats.</div>
          <div class="foul-penalty">📌 Own coin returns + turn passes</div>
        </div>
        <div class="foul-item">
          <span class="foul-icon">📐</span>
          <div class="foul-name">Wrong Striker Position</div>
          <div class="foul-desc">Placing striker outside the baseline area or not touching/crossing the baseline.</div>
          <div class="foul-penalty">📌 Re-place correctly or turn forfeited</div>
        </div>
      </div>

      <!-- 3 Fouls rule -->
      <div style="margin-top:14px; background:linear-gradient(135deg,#ffe0dc,#ffeae8); border:2px solid rgba(192,57,43,0.4); border-radius:12px; padding:14px;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:15px; letter-spacing:2px; color:#8b1a1a; margin-bottom:8px;">⚡ 3 CONSECUTIVE FOULS = HEAVY PENALTY</div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div style="display:flex; gap:6px;">
            <div style="width:28px; height:28px; border-radius:50%; background:#c0392b; color:white; font-weight:900; display:flex; align-items:center; justify-content:center; font-size:14px;">1</div>
            <div style="width:28px; height:28px; border-radius:50%; background:#c0392b; color:white; font-weight:900; display:flex; align-items:center; justify-content:center; font-size:14px;">2</div>
            <div style="width:28px; height:28px; border-radius:50%; background:#8b1a1a; color:white; font-weight:900; display:flex; align-items:center; justify-content:center; font-size:14px;">3</div>
          </div>
          <div style="font-size:20px;">→</div>
          <div style="font-size:24px; font-weight:900; color:#8b1a1a;">−5 POINTS</div>
          <div style="font-size:11px; color:#5a3030; flex:1; min-width:120px;">Three fouls in a row (no successful shot between them) results in a 5-point deduction and the foul counter resets. This is separate from individual foul penalties.</div>
        </div>
      </div>

      <!-- Penalty return visual -->
      <div style="margin-top:12px; background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:12px;">
        <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:6px; text-transform:uppercase;">♻️ Penalty Coin Return to Board</div>
        <div style="display:flex; gap:10px; align-items:center; font-size:10.5px; color:var(--ink-soft);">
          <div style="text-align:center;">
            <div style="font-size:18px; margin-bottom:2px;">🕳️</div>
            <div>Coin in pocket</div>
          </div>
          <div style="font-size:18px; color:var(--gold);">→</div>
          <div style="text-align:center;">
            <div style="font-size:18px; margin-bottom:2px;">⚠️</div>
            <div>Foul occurs</div>
          </div>
          <div style="font-size:18px; color:var(--gold);">→</div>
          <div style="text-align:center;">
            <div style="font-size:18px; margin-bottom:2px;">🎯</div>
            <div>Coin placed back near centre circle on the board</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ 6. TURN RULES ══════════════ -->
  <div class="card">
    <div class="card-header">
      <div class="card-num">6</div>
      <div class="card-title">TURN RULES &amp; FLOW</div>
    </div>
    <div class="card-body">

      <!-- Big turn flow diagram -->
      <div style="background:linear-gradient(135deg,#fffbec,#fff6d0); border:2px solid rgba(200,140,20,0.4); border-radius:14px; padding:16px; margin-bottom:14px;">
        <div style="font-family:'Bebas Neue',sans-serif; font-size:15px; letter-spacing:2px; color:var(--wood-dark); margin-bottom:12px; text-align:center;">TURN SEQUENCE FLOWCHART</div>

        <div style="display:flex; align-items:center; gap:4px; overflow-x:auto; justify-content:center; flex-wrap:wrap; gap:8px;">
          <!-- Step 1 -->
          <div style="text-align:center; min-width:80px;">
            <div style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#f59e0b,#d97706); margin:0 auto 5px; display:flex; align-items:center; justify-content:center; font-size:22px; box-shadow:0 3px 10px rgba(0,0,0,0.2);">🎯</div>
            <div style="font-size:9.5px; font-weight:600; color:var(--ink);">Place Striker<br>on Baseline</div>
          </div>
          <div style="font-size:20px; color:var(--gold);">→</div>

          <!-- Step 2 -->
          <div style="text-align:center; min-width:80px;">
            <div style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#3b82f6,#2563eb); margin:0 auto 5px; display:flex; align-items:center; justify-content:center; font-size:22px; box-shadow:0 3px 10px rgba(0,0,0,0.2);">💥</div>
            <div style="font-size:9.5px; font-weight:600; color:var(--ink);">Flick / Shoot<br>Striker</div>
          </div>
          <div style="font-size:20px; color:var(--gold);">→</div>

          <!-- Decision -->
          <div style="text-align:center; min-width:90px;">
            <div style="width:64px; height:64px; background:white; border:2px solid var(--gold); border-radius:8px; transform:rotate(45deg); margin:0 auto 5px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.15);">
              <span style="transform:rotate(-45deg); font-size:18px;">🎲</span>
            </div>
            <div style="font-size:9.5px; font-weight:700; color:var(--ink);">Result?</div>
          </div>

          <!-- Outcomes -->
          <div style="display:flex; flex-direction:column; gap:8px; min-width:120px;">
            <div style="background:#e8f8e8; border:1.5px solid #5cb85c; border-radius:8px; padding:7px 10px; font-size:10px; font-weight:600; color:#1a5c1a;">
              ✅ Own coin pocketed<br>
              <span style="font-weight:400; font-size:9.5px;">Score +1 · Shoot Again!</span>
            </div>
            <div style="background:#fff3cd; border:1.5px solid #e6ac00; border-radius:8px; padding:7px 10px; font-size:10px; font-weight:600; color:#7a5700;">
              👑 Queen pocketed<br>
              <span style="font-weight:400; font-size:9.5px;">Cover next shot or queen returns</span>
            </div>
            <div style="background:#fdecea; border:1.5px solid #e74c3c; border-radius:8px; padding:7px 10px; font-size:10px; font-weight:600; color:#8b1a1a;">
              ❌ Miss / Foul / Wrong coin<br>
              <span style="font-weight:400; font-size:9.5px;">Turn passes to next player</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Specific rules -->
      <div class="rules-grid">
        <div class="rule-box">
          <span class="rule-icon">🔗</span>
          <div class="rule-title">Chain Shots</div>
          <div class="rule-desc">You can pocket multiple own coins in one shot. Each counts as +1 point. You keep shooting as long as you score!</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">👁️</span>
          <div class="rule-title">Striker Must Cross Baseline</div>
          <div class="rule-desc">The striker must be placed ON or within the baseline area. It must cross the centre line during the shot — no shooting sideways along the baseline.</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">↩️</span>
          <div class="rule-title">Rebounding Striker</div>
          <div class="rule-desc">The striker may bounce off walls and other coins — this is legal. Coins pocketed by rebound still count.</div>
        </div>
        <div class="rule-box">
          <span class="rule-icon">🔀</span>
          <div class="rule-title">4P: Same Turn Logic</div>
          <div class="rule-desc">In 4-player, same rules apply per turn. Your partner cannot help you physically. Turns rotate clockwise regardless of team.</div>
        </div>
      </div>

      <!-- 2P vs 4P comparison -->
      <div style="margin-top:12px; background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:12px;">
        <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:8px; text-transform:uppercase;">🔄 2P vs 4P Turn Order Comparison</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:10.5px; color:var(--ink-soft);">
          <div>
            <strong style="color:var(--ink);">2-Player:</strong><br>
            P1 → P2 → P1 → P2…<br>
            Simple back-and-forth alternation.<br>
            Each player controls ALL their coins alone.
          </div>
          <div>
            <strong style="color:var(--ink);">4-Player:</strong><br>
            P1 → P4 → P2 → P3 → P1…<br>
            Clockwise rotation. Teammates separated.<br>
            You support your partner by setting up shots.
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ 7. WINNING RULES ══════════════ -->
  <div class="card full-width">
    <div class="card-header">
      <div class="card-num" style="background:var(--win-gold); color:#1a0e00;">🏆</div>
      <div class="card-title">WINNING THE GAME</div>
    </div>
    <div class="card-body">

      <div style="display:grid; grid-template-columns:2fr 1fr; gap:24px; align-items:start;">
        <div>
          <div class="win-grid">
            <div class="win-step">
              <div class="win-step-num">1</div>
              <span class="win-step-icon">⚪⚫</span>
              <div class="win-step-title">Clear All Your Coins</div>
              <div class="win-step-desc">Pocket all 9 of your team's colour coins (White or Black) into any of the four corner pockets.</div>
            </div>
            <div class="win-step">
              <div class="win-step-num">2</div>
              <span class="win-step-icon">👑</span>
              <div class="win-step-title">Cover the Queen</div>
              <div class="win-step-desc">The red queen must be pocketed AND covered with your own coin before or during clearing all your coins.</div>
            </div>
            <div class="win-step">
              <div class="win-step-num">3</div>
              <span class="win-step-icon">🎉</span>
              <div class="win-step-title">Declare Victory</div>
              <div class="win-step-desc">Both conditions met = you win the board! Earn your score points. Best of 3 or 5 boards determines the match winner.</div>
            </div>
          </div>

          <!-- Edge cases -->
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:10px;">
            <div style="background:#fff8ec; border:1.5px solid rgba(245,158,11,0.4); border-radius:10px; padding:12px; font-size:10.5px; color:var(--ink-soft);">
              <div style="font-weight:700; color:var(--ink); margin-bottom:4px; font-size:11px;">⚡ Last Coin + Queen</div>
              If you pocket your last own coin AND the queen in the same shot — you must still cover the queen. If you can't, the queen returns.
            </div>
            <div style="background:#fff8ec; border:1.5px solid rgba(245,158,11,0.4); border-radius:10px; padding:12px; font-size:10.5px; color:var(--ink-soft);">
              <div style="font-weight:700; color:var(--ink); margin-bottom:4px; font-size:11px;">🤝 4P Team Win</div>
              Either teammate clearing all coins + queen covered = Team wins together. Both players' scores are combined for the team total.
            </div>
            <div style="background:#fff8ec; border:1.5px solid rgba(245,158,11,0.4); border-radius:10px; padding:12px; font-size:10.5px; color:var(--ink-soft);">
              <div style="font-weight:700; color:var(--ink); margin-bottom:4px; font-size:11px;">🎯 Score Calculation</div>
              1 point per coin pocketed + 3 bonus for queen cover. Scores carry across boards in multi-board matches.
            </div>
          </div>
        </div>

        <!-- Score demo -->
        <div>
          <div class="score-demo">
            <div style="flex:1;">
              <div class="score-title">SAMPLE SCOREBOARD</div>
              <div class="score-row">
                <div class="score-player" style="color:#f59e0b;">P1 ⚪ White</div>
                <div class="score-bar-wrap"><div class="score-bar" style="width:90%; background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div></div>
                <div class="score-pts" style="color:#f59e0b;">9</div>
              </div>
              <div style="font-size:9px; color:rgba(255,255,255,0.5); margin:-3px 0 5px; text-align:right;">+3 Queen cover = 12 pts</div>
              <div class="score-row">
                <div class="score-player" style="color:#3b82f6;">P2 ⚫ Black</div>
                <div class="score-bar-wrap"><div class="score-bar" style="width:50%; background:linear-gradient(90deg,#3b82f6,#60a5fa);"></div></div>
                <div class="score-pts" style="color:#3b82f6;">5</div>
              </div>
              <div style="margin-top:14px; border-top:1px solid rgba(255,255,255,0.15); padding-top:10px; text-align:center;">
                <div style="font-size:10px; color:rgba(245,220,160,0.7); margin-bottom:4px;">WINNER</div>
                <div style="font-size:20px; font-weight:900; color:var(--gold-light);">🏆 PLAYER 1</div>
                <div style="font-size:10px; color:rgba(245,220,160,0.6);">All 9 white + Queen covered</div>
              </div>
            </div>
          </div>

          <!-- Match format -->
          <div style="background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:12px; margin-top:12px;">
            <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:6px; text-transform:uppercase;">🎮 Match Formats</div>
            <div style="font-size:10.5px; color:var(--ink-soft); line-height:1.6;">
              <strong>Casual:</strong> First to clear coins wins the board.<br>
              <strong>Scored:</strong> Points tracked across multiple boards.<br>
              <strong>Tournament:</strong> Best of 3 or 5 boards. 29 points wins match.<br>
              <strong>Toss:</strong> Flip a coin or draw lots to choose who starts.
            </div>
          </div>

          <!-- Quick reference -->
          <div style="background:linear-gradient(135deg,var(--wood-dark),#2a1200); border-radius:10px; padding:12px; margin-top:12px; color:var(--cream);">
            <div style="font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:2px; color:var(--gold); margin-bottom:8px;">⚡ QUICK POINT GUIDE</div>
            <div style="font-size:10.5px; line-height:1.8;">
              <span style="color:var(--white-coin);">⚪ Own coin pocketed</span> = +1 pt<br>
              <span style="color:#ff8888;">👑 Queen cover bonus</span> = +3 pts<br>
              <span style="color:#ff6666;">⚠️ Striker foul penalty</span> = coin returns<br>
              <span style="color:#ff6666;">🚫 3 fouls in row</span> = −5 pts<br>
              <span style="color:#aaa;">🎯 Opponent coin pocketed</span> = coin returns (no pts)
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════ BONUS: STRIKER TECHNIQUE ══════════════ -->
  <div class="card full-width">
    <div class="card-header">
      <div class="card-num">+</div>
      <div class="card-title">STRIKER TECHNIQUE &amp; SHOOTING TIPS</div>
    </div>
    <div class="card-body">
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:14px;">

        <div style="background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:14px; text-align:center;">
          <svg width="80" height="80" viewBox="0 0 80 80" style="margin-bottom:8px;">
            <!-- Hand flicking striker -->
            <circle cx="40" cy="35" r="14" fill="#9090c0" stroke="#c0c0ff" stroke-width="1.5"/>
            <path d="M 30 60 Q 35 50 40 48 Q 45 50 50 60" fill="#f5d0a0" stroke="#c8a060" stroke-width="1"/>
            <path d="M 35 58 L 35 52 Q 37 48 40 48" fill="none" stroke="#c8a060" stroke-width="1.5"/>
            <path d="M 45 58 L 45 52 Q 43 48 40 48" fill="none" stroke="#c8a060" stroke-width="1.5"/>
            <path d="M 40 48 L 40 40" stroke="#f5d0a0" stroke-width="3"/>
            <!-- Arrow showing flick direction -->
            <path d="M 50 30 L 65 20" stroke="#e8a020" stroke-width="2" marker-end="url(#arrW)"/>
            <defs>
              <marker id="arrW" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#e8a020"/>
              </marker>
            </defs>
          </svg>
          <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:4px;">Index Finger Flick</div>
          <div style="font-size:10px; color:var(--ink-soft);">Most common technique. Place index finger behind striker, flick forward with a sharp snap of the wrist.</div>
        </div>

        <div style="background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">📐</div>
          <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:4px;">Aiming Angle</div>
          <div style="font-size:10px; color:var(--ink-soft);">Think of the pocket as your target. Aim the striker so the coin will deflect toward the pocket. Adjust for rebound angles.</div>
        </div>

        <div style="background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">⚡</div>
          <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:4px;">Power Control</div>
          <div style="font-size:10px; color:var(--ink-soft);">Too hard = striker may foul or scatter coins randomly. Too soft = coins won't reach pockets. Practice moderate, controlled power.</div>
        </div>

        <div style="background:var(--rule-box); border:1.5px solid rgba(200,140,20,0.3); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🧴</div>
          <div style="font-weight:700; font-size:11px; color:var(--ink); margin-bottom:4px;">Board Powder</div>
          <div style="font-size:10px; color:var(--ink-soft);">Boric acid powder is sprinkled on the board to reduce friction. Helps coins slide smoothly. Always use approved powder.</div>
        </div>

      </div>
    </div>
  </div>

</div>

<!-- ═══════════════════════════ FOOTER ═══════════════════════════ -->
<div class="footer">
  <div style="display:flex; justify-content:center; gap:24px; margin-bottom:10px; flex-wrap:wrap;">
    <div style="font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1.5px; color:var(--gold); display:flex; align-items:center; gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#f0ede5;display:inline-block;"></span>
      9 WHITE COINS
    </div>
    <div style="font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1.5px; color:var(--gold); display:flex; align-items:center; gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#1e1a2e;display:inline-block;"></span>
      9 BLACK COINS
    </div>
    <div style="font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1.5px; color:var(--gold); display:flex; align-items:center; gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#cc2222;display:inline-block;"></span>
      1 RED QUEEN
    </div>
    <div style="font-family:'Bebas Neue',sans-serif; font-size:13px; letter-spacing:1.5px; color:var(--gold); display:flex; align-items:center; gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#9090c0;display:inline-block;"></span>
      1 STRIKER
    </div>
  </div>
  <div class="footer-text">
    Official Carrom Rules Visual Guide · Based on International Carrom Federation Standards · Educational Reference
  </div>
</div>

`;


export default function Carrom({ onGameOver, onBack }: CarromProps) {
  useEffect(() => {
    const id = 'carrom-fonts-link';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: CARROM_CSS }} />
      <button
        onClick={onBack}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 50,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: '#e8a020',
          color: '#1a0e00',
          border: 'none',
          borderRadius: 8,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div dangerouslySetInnerHTML={{ __html: CARROM_HTML }} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 40px' }}>
        <button
          onClick={() => onGameOver(0, 'Completed')}
          style={{
            padding: '12px 28px',
            background: '#e8a020',
            color: '#1a0e00',
            border: 'none',
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          DONE READING
        </button>
      </div>
    </div>
  );
}
