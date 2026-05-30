/* ── IMPORTS ──────────────────────────────────────── */
// ═══════════════════════════════════════════════════
//  CHESS ENGINE
// ═══════════════════════════════════════════════════

const PIECES = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

let gameMode = "friend"; // 'friend' | 'computer'
let aiLevel = "easy";
let humanColor = "white";

let board, turn, selected, validMoves, history, gameOver;
let lastMove, enPassantTarget, castlingRights;
let capturedByWhite, capturedByBlack;
let flipBoard = false;

function initBoard() {
  board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    board[0][c] = "b" + backRank[c];
    board[1][c] = "bP";
    board[6][c] = "wP";
    board[7][c] = "w" + backRank[c];
  }
  turn = "w";
  selected = null;
  validMoves = [];
  history = [];
  gameOver = false;
  lastMove = null;
  enPassantTarget = null;
  castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
  capturedByWhite = [];
  capturedByBlack = [];
}

// ── MOVE GENERATION ──────────────────────────────────

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}
function pieceColor(p) {
  return p ? p[0] : null;
}
function pieceType(p) {
  return p ? p[1] : null;
}

function rawMoves(r, c, b, epTarget) {
  const p = b[r][c];
  if (!p) return [];
  const color = pieceColor(p),
    type = pieceType(p);
  const opp = color === "w" ? "b" : "w";
  const moves = [];

  const slide = (dr, dc) => {
    let nr = r + dr,
      nc = c + dc;
    while (inBounds(nr, nc)) {
      if (b[nr][nc]) {
        if (pieceColor(b[nr][nc]) === opp) moves.push([nr, nc]);
        break;
      }
      moves.push([nr, nc]);
      nr += dr;
      nc += dc;
    }
  };
  const step = (dr, dc) => {
    const nr = r + dr,
      nc = c + dc;
    if (inBounds(nr, nc) && pieceColor(b[nr][nc]) !== color)
      moves.push([nr, nc]);
  };

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !b[r + dir][c]) {
      moves.push([r + dir, c]);
      if (r === startRow && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      if (inBounds(r + dir, c + dc)) {
        if (pieceColor(b[r + dir][c + dc]) === opp)
          moves.push([r + dir, c + dc]);
        if (epTarget && epTarget[0] === r + dir && epTarget[1] === c + dc)
          moves.push([r + dir, c + dc]);
      }
    }
  } else if (type === "N") {
    for (const [dr, dc] of [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ])
      step(dr, dc);
  } else if (type === "B") {
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
      slide(dr, dc);
  } else if (type === "R") {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      slide(dr, dc);
  } else if (type === "Q") {
    for (const d of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
      slide(...d);
  } else if (type === "K") {
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ])
      step(dr, dc);
  }
  return moves;
}

function isInCheck(color, b, epTarget) {
  let kr = -1,
    kc = -1;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (b[r][c] === color + "K") {
        kr = r;
        kc = c;
      }
  if (kr < 0) return false;
  const opp = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (pieceColor(b[r][c]) !== opp) continue;
      const ms = rawMoves(r, c, b, epTarget);
      if (ms.some(([mr, mc]) => mr === kr && mc === kc)) return true;
    }
  return false;
}

function applyMove(b, fr, fc, tr, tc, epTarget, cr) {
  const nb = b.map((r) => [...r]);
  const p = nb[fr][fc];
  const color = pieceColor(p),
    type = pieceType(p);
  let newEP = null;
  const newCR = { ...cr };
  let captured = null;

  // En passant capture
  if (type === "P" && epTarget && tr === epTarget[0] && tc === epTarget[1]) {
    const captRow = color === "w" ? tr + 1 : tr - 1;
    captured = nb[captRow][tc];
    nb[captRow][tc] = null;
  }

  // Castling
  if (type === "K") {
    newCR[color + "K"] = false;
    newCR[color + "Q"] = false;
    if (Math.abs(tc - fc) === 2) {
      if (tc > fc) {
        nb[tr][5] = nb[tr][7];
        nb[tr][7] = null;
      } // king-side
      else {
        nb[tr][3] = nb[tr][0];
        nb[tr][0] = null;
      } // queen-side
    }
  }
  if (type === "R") {
    if (fc === 7) newCR[color + "K"] = false;
    if (fc === 0) newCR[color + "Q"] = false;
  }

  // Double pawn push → en passant target
  if (type === "P" && Math.abs(tr - fr) === 2) newEP = [(fr + tr) / 2, fc];

  captured = captured || nb[tr][tc];
  nb[tr][tc] = p;
  nb[fr][fc] = null;

  return { nb, newEP, newCR, captured };
}

function legalMoves(r, c) {
  const p = board[r][c];
  if (!p) return [];
  const color = pieceColor(p),
    type = pieceType(p);
  const raw = rawMoves(r, c, board, enPassantTarget);

  // Add castling
  if (type === "K" && !isInCheck(color, board, enPassantTarget)) {
    const row = color === "w" ? 7 : 0;
    if (
      castlingRights[color + "K"] &&
      !board[row][5] &&
      !board[row][6] &&
      board[row][7] === color + "R"
    ) {
      const { nb: b1 } = applyMove(
        board,
        row,
        4,
        row,
        5,
        enPassantTarget,
        castlingRights,
      );
      if (!isInCheck(color, b1, null)) {
        const { nb: b2 } = applyMove(
          board,
          row,
          4,
          row,
          6,
          enPassantTarget,
          castlingRights,
        );
        if (!isInCheck(color, b2, null)) raw.push([row, 6]);
      }
    }
    if (
      castlingRights[color + "Q"] &&
      !board[row][3] &&
      !board[row][2] &&
      !board[row][1] &&
      board[row][0] === color + "R"
    ) {
      const { nb: b1 } = applyMove(
        board,
        row,
        4,
        row,
        3,
        enPassantTarget,
        castlingRights,
      );
      if (!isInCheck(color, b1, null)) {
        const { nb: b2 } = applyMove(
          board,
          row,
          4,
          row,
          2,
          enPassantTarget,
          castlingRights,
        );
        if (!isInCheck(color, b2, null)) raw.push([row, 2]);
      }
    }
  }

  return raw.filter(([tr, tc]) => {
    const { nb, newEP, newCR } = applyMove(
      board,
      r,
      c,
      tr,
      tc,
      enPassantTarget,
      castlingRights,
    );
    return !isInCheck(color, nb, newEP);
  });
}

function allLegalMoves(color) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (pieceColor(board[r][c]) === color) {
        const ms = legalMoves(r, c);
        ms.forEach(([tr, tc]) => moves.push([r, c, tr, tc]));
      }
    }
  return moves;
}

function isCheckmate(color) {
  return (
    allLegalMoves(color).length === 0 &&
    isInCheck(color, board, enPassantTarget)
  );
}
function isStalemate(color) {
  return (
    allLegalMoves(color).length === 0 &&
    !isInCheck(color, board, enPassantTarget)
  );
}

function isInsufficientMaterial() {
  const pieces = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) if (board[r][c]) pieces.push(board[r][c]);
  if (pieces.length === 2) return true;
  if (pieces.length === 3 && pieces.some((p) => p[1] === "B" || p[1] === "N"))
    return true;
  return false;
}

// ── PIECE-SQUARE TABLES FOR AI ────────────────────────

const PST = {
  P: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  N: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  B: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  R: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  Q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  K: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

function evaluate(b) {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const color = pieceColor(p),
        type = pieceType(p);
      const val = (PIECE_VALUES[type] || 0) * 100;
      const pstRow = color === "w" ? r : 7 - r;
      const pst = PST[type] ? PST[type][pstRow][c] : 0;
      score += (color === "w" ? 1 : -1) * (val + pst);
    }
  return score;
}

function minimax(b, depth, alpha, beta, maximizing, epTarget, cr) {
  const color = maximizing ? "w" : "b";
  if (depth === 0) return evaluate(b);

  // Collect all legal moves
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (pieceColor(b[r][c]) !== color) continue;
      const raw = rawMoves(r, c, b, epTarget);
      raw.forEach(([tr, tc]) => {
        const { nb, newEP, newCR } = applyMove(b, r, c, tr, tc, epTarget, cr);
        if (!isInCheck(color, nb, newEP)) moves.push({ nb, newEP, newCR });
      });
    }

  if (moves.length === 0) {
    if (isInCheck(color, b, epTarget))
      return maximizing ? -100000 + depth : 100000 - depth;
    return 0;
  }

  if (maximizing) {
    let best = -Infinity;
    for (const { nb, newEP, newCR } of moves) {
      best = Math.max(
        best,
        minimax(nb, depth - 1, alpha, beta, false, newEP, newCR),
      );
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { nb, newEP, newCR } of moves) {
      best = Math.min(
        best,
        minimax(nb, depth - 1, alpha, beta, true, newEP, newCR),
      );
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove(depth, noise = 0) {
  const aiColor = turn;
  const maximizing = aiColor === "w";
  const candidateMoves = [];

  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (pieceColor(board[r][c]) !== aiColor) continue;
      const raw = rawMoves(r, c, board, enPassantTarget);
      raw.forEach(([tr, tc]) => {
        const { nb, newEP, newCR, captured } = applyMove(
          board,
          r,
          c,
          tr,
          tc,
          enPassantTarget,
          castlingRights,
        );
        if (!isInCheck(aiColor, nb, newEP)) {
          let score = minimax(
            nb,
            depth - 1,
            -Infinity,
            Infinity,
            !maximizing,
            newEP,
            newCR,
          );
          score += (Math.random() - 0.5) * noise;
          candidateMoves.push({ fr: r, fc: c, tr, tc, score });
        }
      });
    }

  if (!candidateMoves.length) return null;
  candidateMoves.sort((a, b) =>
    maximizing ? b.score - a.score : a.score - b.score,
  );

  // For easy: pick from top ~40%
  if (noise > 0) {
    const pool = Math.max(1, Math.floor(candidateMoves.length * 0.4));
    const idx = Math.floor(Math.random() * pool);
    return candidateMoves[idx];
  }
  return candidateMoves[0];
}

// ── UI ─────────────────────────────────────────────────

function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showMode(mode) {
  gameMode = mode;
  if (mode === "friend") startGame("friend");
  else showScreen("levelScreen");
}

let selectedLevel = "easy",
  selectedColor = "white";
function selectLevel(l) {
  selectedLevel = l;
  aiLevel = l;
  document
    .querySelectorAll('[id^="lvl-"]')
    .forEach((b) => b.classList.remove("selected"));
  document.getElementById("lvl-" + l).classList.add("selected");
  const descs = {
    easy: "Beginner-friendly. Computer makes occasional mistakes.",
    medium: "Balanced challenge. Thinks 2 moves ahead.",
    hard: "Strong play. Thinks 3 moves ahead. Difficult to beat!",
  };
  document.getElementById("levelDesc").textContent = descs[l];
}
function selectColor(c) {
  selectedColor = c;
  humanColor = c;
  document
    .querySelectorAll('[id^="color-"]')
    .forEach((b) => b.classList.remove("selected"));
  document.getElementById("color-" + c).classList.add("selected");
}

async function startGame(mode) {
  gameMode = mode;
  if (mode === "computer") {
    aiLevel = selectedLevel;
    humanColor = selectedColor;
  }
  flipBoard = mode === "computer" && humanColor === "black";
  initBoard();
  updatePlayerLabels();
  renderBoard();
  showScreen("gameScreen");
  updateStatus();

  // Backend session start (if user logged in)
  try {
    await createGameSession(mode, aiLevel, humanColor);
  } catch (_) {
    // offline mode fallback is handled inside createGameSession
  }

  if (mode === "computer" && humanColor === "black") setTimeout(doAIMove, 500);
}

function updatePlayerLabels() {
  if (gameMode === "friend") {
    document.getElementById("p1Name").textContent = "♔ White";
    document.getElementById("p2Name").textContent = "♚ Black";
  } else {
    if (humanColor === "white") {
      document.getElementById("p1Name").textContent = "♔ You (White)";
      document.getElementById("p2Name").textContent = "♚ Computer";
    } else {
      document.getElementById("p1Name").textContent = "♚ You (Black)";
      document.getElementById("p2Name").textContent = "♔ Computer";
    }
  }
}

function renderBoard() {
  const container = document.getElementById("boardWithCoords");
  container.innerHTML = "";

  const files = flipBoard
    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
    : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = flipBoard ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  // File labels top
  const topLabels = document.createElement("div");
  topLabels.className = "file-labels";
  topLabels.innerHTML =
    '<div style="width:14px"></div>' +
    files
      .map(
        (f) =>
          `<div class="file-label" style="width:calc(clamp(280px,80vw,520px)/8)">${f}</div>`,
      )
      .join("");
  container.appendChild(topLabels);

  const boardEl = document.createElement("div");
  boardEl.style.display = "flex";

  const rankLabels = document.createElement("div");
  rankLabels.style.display = "flex";
  rankLabels.style.flexDirection = "column";
  ranks.forEach((r) => {
    const lbl = document.createElement("div");
    lbl.className = "rank-label";
    lbl.style.height = "calc(clamp(280px,80vw,520px)/8)";
    lbl.textContent = r;
    rankLabels.appendChild(lbl);
  });
  boardEl.appendChild(rankLabels);

  const grid = document.createElement("div");
  grid.id = "board";
  container.appendChild(boardEl);
  boardEl.appendChild(grid);

  for (let vi = 0; vi < 8; vi++) {
    for (let vj = 0; vj < 8; vj++) {
      const r = flipBoard ? 7 - vi : vi;
      const c = flipBoard ? 7 - vj : vj;
      const sq = document.createElement("div");
      sq.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      sq.dataset.r = r;
      sq.dataset.c = c;

      // Highlights
      if (selected && selected[0] === r && selected[1] === c)
        sq.classList.add("selected");
      if (
        lastMove &&
        ((lastMove.fr === r && lastMove.fc === c) ||
          (lastMove.tr === r && lastMove.tc === c))
      )
        sq.classList.add("last-move");
      if (
        board[r][c] &&
        board[r][c][1] === "K" &&
        isInCheck(board[r][c][0], board, enPassantTarget)
      )
        sq.classList.add("in-check");

      if (validMoves.some(([mr, mc]) => mr === r && mc === c)) {
        sq.classList.add(board[r][c] ? "valid-capture" : "valid-move");
      }

      if (board[r][c]) {
        const piece = document.createElement("div");
        piece.className = "piece";
        // color class add so pieces transparent na lage (white=light, black=dark)
        const pCode = board[r][c];
        if (pCode && pCode[0] === "w") piece.classList.add("white-piece");
        else if (pCode && pCode[0] === "b") piece.classList.add("black-piece");
        piece.textContent = PIECES[board[r][c]];
        sq.appendChild(piece);
      }

      sq.addEventListener("click", () => handleClick(r, c));
      grid.appendChild(sq);
    }
  }
}

function handleClick(r, c) {
  if (gameOver) return;
  if (gameMode === "computer" && turn !== humanColor[0]) return;

  if (selected) {
    const move = validMoves.find(([mr, mc]) => mr === r && mc === c);
    if (move) {
      executeMove(selected[0], selected[1], r, c);
      return;
    }
    selected = null;
    validMoves = [];
  }

  if (board[r][c] && pieceColor(board[r][c]) === turn) {
    selected = [r, c];
    validMoves = legalMoves(r, c);
  }
  renderBoard();
}

let pendingPromo = null;

function executeMove(fr, fc, tr, tc, promoChoice = null) {
  const p = board[fr][fc];
  const color = pieceColor(p),
    type = pieceType(p);

  // Promotion check
  if (type === "P" && (tr === 0 || tr === 7) && !promoChoice) {
    pendingPromo = { fr, fc, tr, tc };
    showPromoModal(color);
    return;
  }

  const { nb, newEP, newCR, captured } = applyMove(
    board,
    fr,
    fc,
    tr,
    tc,
    enPassantTarget,
    castlingRights,
  );

  // Apply promotion
  if (type === "P" && (tr === 0 || tr === 7)) {
    nb[tr][tc] = color + (promoChoice || "Q");
  }

  // Record history for undo
  history.push({
    board: board.map((r) => [...r]),
    enPassantTarget,
    castlingRights: { ...castlingRights },
    lastMove,
    turn,
    capturedByWhite: [...capturedByWhite],
    capturedByBlack: [...capturedByBlack],
  });

  board = nb;
  enPassantTarget = newEP;
  castlingRights = newCR;
  lastMove = { fr, fc, tr, tc };

  if (captured) {
    if (color === "w") capturedByWhite.push(captured);
    else capturedByBlack.push(captured);
  }

  selected = null;
  validMoves = [];
  turn = turn === "w" ? "b" : "w";

  updateCapturedDisplay();
  renderBoard();
  logMove(fr, fc, tr, tc, p, captured, promoChoice);
  updateStatus();

  // Check end conditions
  const opp = turn;
  if (isCheckmate(opp)) {
    endGame(
      color === "w" ? "White Wins!" : "Black Wins!",
      "Checkmate! " + (color === "w" ? "White" : "Black") + " is victorious.",
    );
    return;
  }
  if (isStalemate(opp)) {
    endGame("Draw!", "Stalemate — no legal moves.");
    return;
  }
  if (isInsufficientMaterial()) {
    endGame("Draw!", "Insufficient material.");
    return;
  }

  // AI turn
  if (!gameOver && gameMode === "computer" && turn !== humanColor[0]) {
    setTimeout(doAIMove, 400);
  }
}

function doAIMove() {
  if (gameOver) return;
  const depths = { easy: 1, medium: 2, hard: 3 };
  const noises = { easy: 200, medium: 50, hard: 0 };
  const move = getBestMove(depths[aiLevel], noises[aiLevel]);
  if (move) executeMove(move.fr, move.fc, move.tr, move.tc);
}

function showPromoModal(color) {
  const pieces =
    color === "w"
      ? [
          ["Q", "♕"],
          ["R", "♖"],
          ["B", "♗"],
          ["N", "♘"],
        ]
      : [
          ["Q", "♛"],
          ["R", "♜"],
          ["B", "♝"],
          ["N", "♞"],
        ];
  const container = document.getElementById("promoChoices");
  container.innerHTML = "";
  pieces.forEach(([type, sym]) => {
    const btn = document.createElement("button");
    btn.className = "promo-btn";
    btn.textContent = sym;
    btn.onclick = () => {
      document.getElementById("promoModal").classList.remove("open");
      const { fr, fc, tr, tc } = pendingPromo;
      pendingPromo = null;
      executeMove(fr, fc, tr, tc, type);
    };
    container.appendChild(btn);
  });
  document.getElementById("promoModal").classList.add("open");
}

function updateCapturedDisplay() {
  const fmt = (arr) => arr.map((p) => PIECES[p]).join("");
  document.getElementById("capturedByWhite").textContent = fmt(capturedByWhite);
  document.getElementById("capturedByBlack").textContent = fmt(capturedByBlack);

  // Material score
  const score = (p) => PIECE_VALUES[pieceType(p)] || 0;
  const wMat = capturedByWhite.reduce((s, p) => s + score(p), 0);
  const bMat = capturedByBlack.reduce((s, p) => s + score(p), 0);
  document.getElementById("whiteScore").textContent = wMat;
  document.getElementById("blackScore").textContent = bMat;
}

function updateStatus() {
  const wTurn = document.getElementById("whiteTurn");
  const bTurn = document.getElementById("blackTurn");
  const bar = document.getElementById("statusBar");

  const inCheck = isInCheck(turn, board, enPassantTarget);
  const colorName = turn === "w" ? "White" : "Black";

  if (inCheck) bar.textContent = "⚠ " + colorName + " is in Check!";
  else if (gameMode === "computer" && turn !== humanColor[0])
    bar.textContent = "🤖 Computer is thinking...";
  else bar.textContent = colorName + "'s turn";

  if (turn === "w") {
    wTurn.textContent =
      gameMode === "computer" && humanColor === "black"
        ? "🤖 Your Turn"
        : "Your Turn";
    wTurn.classList.add("active");
    wTurn.classList.remove("inactive");
    bTurn.textContent = "Waiting...";
    bTurn.classList.remove("active");
    bTurn.classList.add("inactive");
  } else {
    bTurn.textContent =
      gameMode === "computer" && humanColor === "white"
        ? "🤖 Thinking..."
        : "Your Turn";
    bTurn.classList.add("active");
    bTurn.classList.remove("inactive");
    wTurn.textContent = "Waiting...";
    wTurn.classList.remove("active");
    wTurn.classList.add("inactive");
  }
}

function endGame(title, msg) {
  gameOver = true;
  document.getElementById("gameOverTitle").textContent = title;
  document.getElementById("gameOverMsg").textContent = msg;
  document.getElementById("gameOverModal").classList.add("open");
  document.getElementById("statusBar").textContent = "🏆 " + title;

  // Save end result (if backend session active)
  try {
    if (typeof endGameSession === "function") {
      let result = "draw";
      const isWhiteWin =
        typeof title === "string" && title.includes("White Wins");
      const isBlackWin =
        typeof title === "string" && title.includes("Black Wins");
      if (isWhiteWin) result = "white";
      else if (isBlackWin) result = "black";
      endGameSession(result);
    }
  } catch (_) {
    // ignore backend failures
  }
}

function newGame() {
  document.getElementById("gameOverModal").classList.remove("open");
  document.getElementById("promoModal").classList.remove("open");
  startGame(gameMode);
}

function backToMenu() {
  // Close modals if open
  document.getElementById("gameOverModal").classList.remove("open");
  document.getElementById("promoModal").classList.remove("open");

  pendingPromo = null;
  selected = null;
  validMoves = [];
  history = [];
  gameOver = false;

  // Stop any possible AI thinking by preventing moves until restart
  turn = "w";

  showScreen("menuScreen");
}

function undoMove() {
  if (!history.length) return;
  if (gameMode === "computer" && history.length >= 2) {
    // Undo both AI and human moves
    history.pop();
    const state = history.pop();
    restoreState(state);
  } else if (gameMode === "friend" && history.length >= 1) {
    const state = history.pop();
    restoreState(state);
  }
}

function restoreState(state) {
  board = state.board;
  enPassantTarget = state.enPassantTarget;
  castlingRights = state.castlingRights;
  lastMove = state.lastMove;
  turn = state.turn;
  capturedByWhite = state.capturedByWhite;
  capturedByBlack = state.capturedByBlack;
  selected = null;
  validMoves = [];
  gameOver = false;
  updateCapturedDisplay();
  renderBoard();
  updateStatus();
  document.getElementById("gameOverModal").classList.remove("open");
}

// Move log
let moveNumber = 1;
function logMove(fr, fc, tr, tc, piece, captured, promo) {
  const files = "abcdefgh";
  const fromSq = files[fc] + (8 - fr);
  const toSq = files[tc] + (8 - tr);
  const type = pieceType(piece);
  const color = pieceColor(piece);
  let notation = "";
  if (type === "K" && Math.abs(tc - fc) === 2)
    notation = tc > fc ? "O-O" : "O-O-O";
  else {
    notation =
      (type !== "P" ? type : "") + (captured ? fromSq[0] + "x" : "") + toSq;
    if (promo) notation += "=" + promo;
  }

  const log = document.getElementById("moveLog");
  if (color === "w") {
    const span = document.createElement("span");
    span.innerHTML = `<span class="move-num">${moveNumber}.</span> ${notation} `;
    span.id = "move-" + moveNumber;
    log.appendChild(span);
  } else {
    const span = document.getElementById("move-" + moveNumber);
    if (span) span.innerHTML += notation + "  ";
    moveNumber++;
  }
  log.scrollTop = log.scrollHeight;
}

// Init
moveNumber = 1;
initBoard();
renderBoard();
updateCapturedDisplay();
