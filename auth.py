from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_user, logout_user, current_user

from extensions import db
from models import User


auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _clean(s: str) -> str:
    return (s or "").strip()


@auth_bp.get("/login")
def login():
    if current_user.is_authenticated:
        return redirect(url_for("profile"))
    return render_template("auth/login.html")


@auth_bp.post("/login")
def login_post():
    email = _clean(request.form.get("email", "")).lower()
    password = request.form.get("password", "") or ""

    if not email or not password:
        flash("Введите email и пароль.", "error")
        return redirect(url_for("auth.login"))

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        flash("Неверный email или пароль.", "error")
        return redirect(url_for("auth.login"))

    login_user(user, remember=True)
    flash("Вы вошли в аккаунт.", "ok")
    next_url = request.args.get("next")
    return redirect(next_url or url_for("index"))


@auth_bp.get("/register")
def register():
    if current_user.is_authenticated:
        return redirect(url_for("profile"))
    return render_template("auth/register.html")


@auth_bp.post("/register")
def register_post():
    email = _clean(request.form.get("email", "")).lower()
    username = _clean(request.form.get("username", ""))
    password = request.form.get("password", "") or ""

    if not email or not username or not password:
        flash("Заполните все поля.", "error")
        return redirect(url_for("auth.register"))

    if len(password) < 6:
        flash("Пароль должен быть минимум 6 символов.", "error")
        return redirect(url_for("auth.register"))

    if User.query.filter_by(email=email).first():
        flash("Этот email уже зарегистрирован.", "error")
        return redirect(url_for("auth.register"))

    if User.query.filter_by(username=username).first():
        flash("Этот username уже занят.", "error")
        return redirect(url_for("auth.register"))

    user = User(email=email, username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    login_user(user, remember=True)
    flash("Аккаунт создан.", "ok")
    return redirect(url_for("profile"))


@auth_bp.get("/logout")
def logout():
    if current_user.is_authenticated:
        logout_user()
        flash("Вы вышли из аккаунта.", "ok")
    return redirect(url_for("index"))
