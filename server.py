"""
╔═══════════════════════════════════════════════════╗
║         CHESS MASTER — BACKEND SERVER             ║
║         Flask + SQLite + JWT Auth                 ║
╚═══════════════════════════════════════════════════╝
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3, bcrypt, uuid, json, os
from datetime import datetime, timedelta
from jose import jwt, JWTError

# ── CONFIG ──────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "chess_master_secret_change_in_prod")
DB_PATH    = os.environ.get("DB_PATH", "chess.db")
JWT_EXPIRY = 24  # hours

app = Flask(__name__, static_folder=os.path.abspath(os.path.dirname(__file__)))
CORS(app, resources={r"/api/*": {"origins": "*"}})



# ── DATABASE SETUP ───────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                username    TEXT UNIQUE NOT NULL,
                email       TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now')),
                last_login  TEXT
            );

            CREATE TABLE IF NOT EXISTS games (
                id          TEXT PRIMARY KEY,
                white_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
                black_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
                mode        TEXT NOT NULL CHECK(mode IN ('friend','computer')),
                ai_level    TEXT CHECK(ai_level IN ('easy','medium','hard',NULL)),
                status      TEXT NOT NULL DEFAULT 'active'
                                  CHECK(status IN ('active','completed','abandoned')),
                result      TEXT CHECK(result IN ('white','black','draw',NULL)),
                board_state TEXT,
                castling_rights TEXT,
                en_passant  TEXT,
                current_turn TEXT DEFAULT 'w',
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now')),
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS moves (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                move_number INTEGER NOT NULL,
                color       TEXT NOT NULL CHECK(color IN ('w','b')),
                from_row    INTEGER NOT NULL,
                from_col    INTEGER NOT NULL,
                to_row      INTEGER NOT NULL,
                to_col      INTEGER NOT NULL,
                piece       TEXT NOT NULL,
                captured    TEXT,
                promotion   TEXT,
                notation    TEXT,
                board_after TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS stats (
                user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                wins        INTEGER DEFAULT 0,
                losses      INTEGER DEFAULT 0,
                draws       INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                total_moves INTEGER DEFAULT 0,
                rating      INTEGER DEFAULT 1000
            );

            CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_id);
            CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_id);
            CREATE INDEX IF NOT EXISTS idx_moves_game  ON moves(game_id);
        """)
    print("✅ Database initialised →", DB_PATH)


# ── JWT HELPERS ──────────────────────────────────────
def create_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None

def require_auth(f):
    """Decorator: injects current_user into route."""
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorised"}), 401
        payload = verify_token(auth[7:])
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        with get_db() as db:
            user = db.execute("SELECT * FROM users WHERE id = ?",
                              (payload["sub"],)).fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 401
        return f(*args, current_user=dict(user), **kwargs)
    return wrapper


# ══════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "username, email, password required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be ≥ 6 characters"}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    uid = str(uuid.uuid4())

    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO users(id, username, email, password_hash) VALUES(?,?,?,?)",
                (uid, username, email, pw_hash)
            )
            db.execute("INSERT INTO stats(user_id) VALUES(?)", (uid,))
        token = create_token(uid, username)
        return jsonify({"token": token, "userId": uid, "username": username}), 201
    except sqlite3.IntegrityError as e:
        field = "username" if "username" in str(e) else "email"
        return jsonify({"error": f"That {field} is already taken"}), 409


@app.route("/api/auth/login", methods=["POST"])
def login():
    data     = request.get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    with get_db() as db:
        user = db.execute(
            "SELECT * FROM users WHERE username = ? OR email = ?",
            (username, username.lower())
        ).fetchone()

    if not user or not bcrypt.checkpw(password.encode(),
                                       user["password_hash"].encode()):
        return jsonify({"error": "Invalid username or password"}), 401

    with get_db() as db:
        db.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?",
                   (user["id"],))

    token = create_token(user["id"], user["username"])
    return jsonify({"token": token, "userId": user["id"],
                    "username": user["username"]})


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me(current_user):
    return jsonify({
        "id":        current_user["id"],
        "username":  current_user["username"],
        "email":     current_user["email"],
        "createdAt": current_user["created_at"],
        "lastLogin": current_user["last_login"],
    })


# ══════════════════════════════════════════════════════
# GAME ROUTES
# ══════════════════════════════════════════════════════

INITIAL_BOARD = [
    ["bR","bN","bB","bQ","bK","bB","bN","bR"],
    ["bP","bP","bP","bP","bP","bP","bP","bP"],
    [None]*8, [None]*8, [None]*8, [None]*8,
    ["wP","wP","wP","wP","wP","wP","wP","wP"],
    ["wR","wN","wB","wQ","wK","wB","wN","wR"],
]
INITIAL_CASTLING = {"wK": True, "wQ": True, "bK": True, "bQ": True}


@app.route("/api/games", methods=["POST"])
@require_auth
def create_game(current_user):
    data     = request.get_json()
    mode     = data.get("mode", "friend")           # friend | computer
    ai_level = data.get("aiLevel")                  # easy | medium | hard
    color    = data.get("color", "white")           # which color human plays

    white_id = current_user["id"] if color == "white" else None
    black_id = current_user["id"] if color == "black" else None

    gid = str(uuid.uuid4())
    with get_db() as db:
        db.execute("""
            INSERT INTO games(id, white_id, black_id, mode, ai_level,
                              board_state, castling_rights, current_turn)
            VALUES(?,?,?,?,?,?,?,?)
        """, (
            gid, white_id, black_id, mode, ai_level,
            json.dumps(INITIAL_BOARD),
            json.dumps(INITIAL_CASTLING),
            "w"
        ))

    return jsonify({"gameId": gid}), 201


@app.route("/api/games/<gid>", methods=["GET"])
@require_auth
def get_game(gid, current_user):
    with get_db() as db:
        game = db.execute("SELECT * FROM games WHERE id = ?", (gid,)).fetchone()
    if not game:
        return jsonify({"error": "Game not found"}), 404

    game = dict(game)
    game["boardState"]     = json.loads(game["board_state"] or "null")
    game["castlingRights"] = json.loads(game["castling_rights"] or "null")
    return jsonify(game)


@app.route("/api/games/<gid>/moves", methods=["POST"])
@require_auth
def save_move(gid, current_user):
    """Save a move and update the board state."""
    data = request.get_json()

    required = ["fromRow","fromCol","toRow","toCol","piece",
                "boardAfter","moveNumber","color","notation"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing fields: " + str(required)}), 400

    with get_db() as db:
        game = db.execute("SELECT * FROM games WHERE id = ?", (gid,)).fetchone()
        if not game:
            return jsonify({"error": "Game not found"}), 404

        # Save the move
        db.execute("""
            INSERT INTO moves(game_id, move_number, color,
                from_row, from_col, to_row, to_col,
                piece, captured, promotion, notation, board_after)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            gid, data["moveNumber"], data["color"],
            data["fromRow"], data["fromCol"], data["toRow"], data["toCol"],
            data["piece"], data.get("captured"), data.get("promotion"),
            data["notation"], json.dumps(data["boardAfter"])
        ))

        # Update game state
        new_turn = "b" if data["color"] == "w" else "w"
        db.execute("""
            UPDATE games SET
                board_state     = ?,
                castling_rights = ?,
                en_passant      = ?,
                current_turn    = ?,
                updated_at      = datetime('now')
            WHERE id = ?
        """, (
            json.dumps(data["boardAfter"]),
            json.dumps(data.get("castlingRights", INITIAL_CASTLING)),
            json.dumps(data.get("enPassant")),
            new_turn, gid
        ))

    return jsonify({"ok": True})


@app.route("/api/games/<gid>/moves", methods=["GET"])
@require_auth
def get_moves(gid, current_user):
    with get_db() as db:
        moves = db.execute(
            "SELECT * FROM moves WHERE game_id = ? ORDER BY move_number, color",
            (gid,)
        ).fetchall()
    return jsonify([dict(m) for m in moves])


@app.route("/api/games/<gid>/end", methods=["POST"])
@require_auth
def end_game(gid, current_user):
    """Mark game as completed and update player stats."""
    data   = request.get_json()
    result = data.get("result")  # 'white' | 'black' | 'draw'

    if result not in ("white", "black", "draw"):
        return jsonify({"error": "result must be white/black/draw"}), 400

    with get_db() as db:
        game = db.execute("SELECT * FROM games WHERE id = ?", (gid,)).fetchone()
        if not game:
            return jsonify({"error": "Game not found"}), 404

        db.execute("""
            UPDATE games SET status='completed', result=?,
                completed_at=datetime('now'), updated_at=datetime('now')
            WHERE id = ?
        """, (result, gid))

        # Update stats for both players
        def update_stats(uid, outcome):
            """outcome: 'win' | 'loss' | 'draw'"""
            if not uid:
                return
            rating_delta = {"win": 15, "loss": -10, "draw": 3}[outcome]
            db.execute(f"""
                INSERT INTO stats(user_id, {outcome}s, games_played, rating)
                    VALUES(?, 1, 1, 1000 + {rating_delta})
                ON CONFLICT(user_id) DO UPDATE SET
                    {outcome}s      = {outcome}s + 1,
                    games_played    = games_played + 1,
                    rating          = MAX(100, rating + {rating_delta})
            """, (uid,))

        wid = game["white_id"]
        bid = game["black_id"]

        if result == "white":
            update_stats(wid, "win")
            update_stats(bid, "loss")
        elif result == "black":
            update_stats(wid, "loss")
            update_stats(bid, "win")
        else:
            update_stats(wid, "draw")
            update_stats(bid, "draw")

    return jsonify({"ok": True})


@app.route("/api/games", methods=["GET"])
@require_auth
def list_games(current_user):
    """Get all games for current user (active + completed)."""
    uid    = current_user["id"]
    status = request.args.get("status", "all")  # active | completed | all

    query = """
        SELECT g.id, g.mode, g.ai_level, g.status, g.result,
               g.current_turn, g.created_at, g.updated_at, g.completed_at,
               u1.username AS white_name, u2.username AS black_name
        FROM games g
        LEFT JOIN users u1 ON g.white_id = u1.id
        LEFT JOIN users u2 ON g.black_id = u2.id
        WHERE (g.white_id = ? OR g.black_id = ?)
    """
    params = [uid, uid]

    if status != "all":
        query += " AND g.status = ?"
        params.append(status)

    query += " ORDER BY g.updated_at DESC LIMIT 50"

    with get_db() as db:
        games = db.execute(query, params).fetchall()

    return jsonify([dict(g) for g in games])


# ══════════════════════════════════════════════════════
# STATS & LEADERBOARD
# ══════════════════════════════════════════════════════

@app.route("/api/stats/me", methods=["GET"])
@require_auth
def my_stats(current_user):
    with get_db() as db:
        stats = db.execute(
            "SELECT * FROM stats WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
    if not stats:
        return jsonify({"wins":0,"losses":0,"draws":0,"games_played":0,"rating":1000})
    return jsonify(dict(stats))


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    limit = min(int(request.args.get("limit", 20)), 100)
    with get_db() as db:
        rows = db.execute("""
            SELECT u.username, s.wins, s.losses, s.draws,
                   s.games_played, s.rating,
                   ROUND(CAST(s.wins AS REAL) /
                         NULLIF(s.games_played,0) * 100, 1) AS win_pct
            FROM stats s
            JOIN users u ON s.user_id = u.id
            WHERE s.games_played > 0
            ORDER BY s.rating DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return jsonify([dict(r) for r in rows])


# ══════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "Chess Master API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    })


# ── STATIC FRONTEND SERVE ────────────────────────────
# Ye route aapke browser me "server start link" (http://localhost:5000) open karne pe chess_game.html serve karega.
@app.route("/", methods=["GET"])
def index():
    return app.send_static_file("chess_game.html")

@app.route("/chess_game.html", methods=["GET"])
def chess_game_page():
    return app.send_static_file("chess_game.html")

# Explicitly serve other required static assets for reliability
@app.route("/script.js", methods=["GET"])
def serve_script_js():
    return app.send_static_file("script.js")

@app.route("/chess_api.js", methods=["GET"])
def serve_chess_api_js():
    return app.send_static_file("chess_api.js")

@app.route("/style.css", methods=["GET"])
def serve_style_css():
    return app.send_static_file("style.css")


# ── ENTRYPOINT ───────────────────────────────────────
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀  Chess Master API + Frontend  →  http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)

