/* ══════════════════════════════════════════════════════
   CHESS MASTER — BACKEND INTEGRATION
   Yeh file apne script.js ke UPAR paste karo
   ══════════════════════════════════════════════════════ */

const API_BASE = "http://localhost:5000/api"; // ← apna server URL yahan daalo

// ── Token helpers ──────────────────────────────────────
function getToken()       { return localStorage.getItem("cm_token"); }
function getUser()        { return JSON.parse(localStorage.getItem("cm_user") || "null"); }
function setSession(data) {
  localStorage.setItem("cm_token", data.token);
  localStorage.setItem("cm_user", JSON.stringify({ id: data.userId, username: data.username }));
}
function clearSession()   { localStorage.removeItem("cm_token"); localStorage.removeItem("cm_user"); }

async function apiCall(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body)  opts.body = JSON.stringify(body);
  const res  = await fetch(API_BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API error");
  return data;
}

// ── AUTH ───────────────────────────────────────────────
async function registerUser(username, email, password) {
  const data = await apiCall("/auth/register", "POST", { username, email, password });
  setSession(data);
  return data;
}

async function loginUser(username, password) {
  const data = await apiCall("/auth/login", "POST", { username, password });
  setSession(data);
  return data;
}

function logoutUser() {
  clearSession();
  currentGameId = null;
  showScreen("menuScreen");
}

// ── GAME SESSION ───────────────────────────────────────
let currentGameId   = null;
let localMoveNumber = 1;

async function createGameSession(mode, aiLevel, color) {
  try {
    const data = await apiCall("/games", "POST", { mode, aiLevel, color });
    currentGameId   = data.gameId;
    localMoveNumber = 1;
    console.log("🎮 Game started:", currentGameId);
  } catch (e) {
    console.warn("Backend offline — playing offline mode:", e.message);
  }
}

async function saveMove(fr, fc, tr, tc, piece, captured, promo, boardAfter, notation) {
  if (!currentGameId || !getToken()) return;
  const color = pieceColor(piece);
  try {
    await apiCall(`/games/${currentGameId}/moves`, "POST", {
      moveNumber:     localMoveNumber,
      color,
      fromRow: fr, fromCol: fc,
      toRow:   tr, toCol:   tc,
      piece, captured, promotion: promo,
      notation, boardAfter,
      castlingRights: castlingRights,
      enPassant:      enPassantTarget,
    });
    if (color === "b") localMoveNumber++;
  } catch (e) {
    console.warn("Move save failed:", e.message);
  }
}

async function endGameSession(result) {  // 'white' | 'black' | 'draw'
  if (!currentGameId || !getToken()) return;
  try {
    await apiCall(`/games/${currentGameId}/end`, "POST", { result });
    console.log("🏆 Game result saved:", result);
  } catch (e) {
    console.warn("End game save failed:", e.message);
  }
}

async function loadMyGames() {
  return await apiCall("/games?status=active");
}

async function fetchLeaderboard() {
  return await apiCall("/leaderboard?limit=10");
}

async function fetchMyStats() {
  return await apiCall("/stats/me");
}

/* ── HOW TO HOOK INTO YOUR EXISTING script.js ──────────

1.  startGame() function ke andar, add karo:
    ─────────────────────────────────────────
    async function startGame(mode) {
      // ...existing code...
      await createGameSession(mode, aiLevel, humanColor);  // ← ADD
    }

2.  executeMove() ke end mein, logMove ke baad add karo:
    ─────────────────────────────────────────────────────
    await saveMove(fr, fc, tr, tc, p, captured, promoChoice,
                   board, notation);   // ← ADD

3.  endGame() ke andar add karo:
    ─────────────────────────────
    const result = title.includes("White") ? "white"
                 : title.includes("Black") ? "black" : "draw";
    await endGameSession(result);       // ← ADD

4.  HTML mein auth UI add karo (neeche dekho)
   ─────────────────────────────────────────
*/

// ── AUTH UI (DOM inject) ───────────────────────────────
function injectAuthUI() {
  const user = getUser();
  const existing = document.getElementById("authBar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "authBar";
  bar.style.cssText = `
    position:fixed; top:10px; right:16px; z-index:200;
    display:flex; gap:8px; align-items:center;
    font-family:'Cinzel',serif; font-size:0.78rem;
  `;

  if (user) {
    bar.innerHTML = `
      <span style="color:#c9a84c">♟ ${user.username}</span>
      <button onclick="showStatsModal()" style="
        background:transparent; border:1px solid #3d2e1e; border-radius:6px;
        color:#d4c4a0; padding:4px 10px; cursor:pointer; font-family:inherit;
        font-size:0.75rem;">📊 Stats</button>
      <button onclick="logoutUser()" style="
        background:transparent; border:1px solid #7a2020; border-radius:6px;
        color:#c07070; padding:4px 10px; cursor:pointer; font-family:inherit;
        font-size:0.75rem;">Sign Out</button>
    `;
  } else {
    bar.innerHTML = `
      <button onclick="showAuthModal('login')" style="
        background:transparent; border:1px solid #3d2e1e; border-radius:6px;
        color:#d4c4a0; padding:4px 12px; cursor:pointer; font-family:inherit;
        font-size:0.78rem;">Login</button>
      <button onclick="showAuthModal('register')" style="
        background:linear-gradient(135deg,#3d2e1e,#2a1f10);
        border:1px solid #c9a84c; border-radius:6px;
        color:#e8cc7a; padding:4px 12px; cursor:pointer; font-family:inherit;
        font-size:0.78rem;">Register</button>
    `;
  }
  document.body.appendChild(bar);
}

function showAuthModal(mode) {
  const existing = document.getElementById("authModal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "authModal";
  overlay.className = "modal-overlay open";
  overlay.innerHTML = `
    <div class="modal" style="max-width:340px">
      <div class="modal-title">${mode === "login" ? "♚ Login" : "♔ Register"}</div>
      <div id="authErr" style="color:#c07070;font-size:0.85rem;margin-bottom:8px;min-height:20px"></div>
      ${mode === "register" ? `
        <input id="authEmail" placeholder="Email" type="email"
          style="width:100%;margin-bottom:10px;padding:10px;background:#0d0a07;
                 border:1px solid #3d2e1e;border-radius:6px;color:#d4c4a0;
                 font-family:inherit;font-size:0.9rem"/>` : ""}
      <input id="authUser" placeholder="Username" autocomplete="username"
        style="width:100%;margin-bottom:10px;padding:10px;background:#0d0a07;
               border:1px solid #3d2e1e;border-radius:6px;color:#d4c4a0;
               font-family:inherit;font-size:0.9rem"/>
      <input id="authPass" placeholder="Password" type="password" autocomplete="current-password"
        style="width:100%;margin-bottom:16px;padding:10px;background:#0d0a07;
               border:1px solid #3d2e1e;border-radius:6px;color:#d4c4a0;
               font-family:inherit;font-size:0.9rem"/>
      <button class="btn primary" id="authSubmitBtn"
        onclick="submitAuth('${mode}')">
        ${mode === "login" ? "Login" : "Create Account"}
      </button>
      <button class="btn" onclick="document.getElementById('authModal').remove()">Cancel</button>
      <div style="text-align:center;margin-top:8px;font-size:0.8rem;color:#6a5a3a">
        ${mode === "login"
          ? `No account? <a href="#" style="color:#c9a84c" onclick="showAuthModal('register')">Register</a>`
          : `Have an account? <a href="#" style="color:#c9a84c" onclick="showAuthModal('login')">Login</a>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("authUser").focus();
}

async function submitAuth(mode) {
  const btn = document.getElementById("authSubmitBtn");
  btn.disabled = true; btn.textContent = "...";
  const errEl = document.getElementById("authErr");
  try {
    const user = document.getElementById("authUser").value.trim();
    const pass = document.getElementById("authPass").value;
    if (mode === "register") {
      const email = document.getElementById("authEmail").value.trim();
      await registerUser(user, email, pass);
    } else {
      await loginUser(user, pass);
    }
    document.getElementById("authModal").remove();
    injectAuthUI();
  } catch (e) {
    errEl.textContent = "⚠ " + e.message;
    btn.disabled = false;
    btn.textContent = mode === "login" ? "Login" : "Create Account";
  }
}

async function showStatsModal() {
  let stats, board;
  try {
    [stats, board] = await Promise.all([fetchMyStats(), fetchLeaderboard()]);
  } catch {
    alert("Could not load stats — is server running?");
    return;
  }
  const winPct = stats.games_played
    ? ((stats.wins / stats.games_played) * 100).toFixed(1) : 0;

  const overlay = document.createElement("div");
  overlay.id = "statsModal";
  overlay.className = "modal-overlay open";
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;max-height:80vh;overflow-y:auto">
      <div class="modal-title">📊 Your Stats</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        ${[["Wins","wins","#27ae60"],["Losses","losses","#c0392b"],["Draws","draws","#c9a84c"]]
          .map(([l,k,c])=>`<div style="text-align:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid #3d2e1e">
            <div style="font-size:1.6rem;color:${c};font-family:Cinzel,serif">${stats[k]||0}</div>
            <div style="font-size:0.72rem;color:#6a5a3a;text-transform:uppercase">${l}</div>
          </div>`).join("")}
      </div>
      <div style="text-align:center;margin-bottom:20px;font-size:0.9rem;color:#8a7a5a">
        ♟ ${stats.games_played||0} games · ${winPct}% win rate · 
        <span style="color:#c9a84c">⭐ ${stats.rating||1000} rating</span>
      </div>
      <div class="modal-title" style="font-size:1rem">🏆 Leaderboard</div>
      <table style="width:100%;font-size:0.82rem;border-collapse:collapse">
        <tr style="color:#6a5a3a;text-align:left;border-bottom:1px solid #3d2e1e">
          <th style="padding:6px 4px">#</th><th>Player</th>
          <th style="text-align:right">Rating</th><th style="text-align:right">W/L/D</th>
        </tr>
        ${board.map((r,i)=>`
          <tr style="border-bottom:1px solid #1a1410;color:${r.username===getUser()?.username?"#e8cc7a":"#d4c4a0"}">
            <td style="padding:6px 4px;color:#6a5a3a">${i+1}</td>
            <td>${r.username}</td>
            <td style="text-align:right;color:#c9a84c">${r.rating}</td>
            <td style="text-align:right;font-size:0.75rem">${r.wins}/${r.losses}/${r.draws}</td>
          </tr>`).join("")}
      </table>
      <button class="btn" style="margin-top:16px" onclick="document.getElementById('statsModal').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Auto-inject auth bar on load
document.addEventListener("DOMContentLoaded", injectAuthUI);
