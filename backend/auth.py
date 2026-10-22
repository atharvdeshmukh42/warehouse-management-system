"""Sign-in: password hashing, session tokens, and the check every protected route runs."""

import hashlib
import secrets

from fastapi import Header, HTTPException

from db import query

SESSION_DAYS = 7


def hash_password(password, salt=None):
    """Return "salt$hash". A random salt makes equal passwords hash differently."""
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def check_password(password, stored_hash):
    salt = stored_hash.split("$")[0]
    return secrets.compare_digest(hash_password(password, salt), stored_hash)


def create_session(conn, user_id):
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
        (token, user_id, f"+{SESSION_DAYS} days"),
    )
    return token


def token_from_header(authorization):
    # The header looks like "Bearer abc123"
    return authorization.removeprefix("Bearer ").strip()


def require_user(authorization: str = Header(default="")):
    """FastAPI dependency: returns the signed-in user or answers 401."""
    token = token_from_header(authorization)
    rows = query(
        """SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = ? AND s.expires_at > datetime('now')""",
        (token,),
    )
    if not token or not rows:
        raise HTTPException(401, "Please sign in")
    return rows[0]
