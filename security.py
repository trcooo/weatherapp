import secrets
from flask import session, request, abort

CSRF_SESSION_KEY = "_csrf_token"


def generate_csrf_token() -> str:
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def validate_csrf() -> None:
    # Only for state-changing requests
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return

    token = session.get(CSRF_SESSION_KEY, "")
    sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token") or ""
    if not token or not sent or token != sent:
        abort(400, description="CSRF token invalid")
