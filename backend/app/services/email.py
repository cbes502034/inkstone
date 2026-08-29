"""
寄信。

設定了 SMTP 就真的寄；沒設定就把內容寫進日誌 ——
本機開發不必先去申請信箱服務，從日誌複製連結就能走完整個流程。

刻意用通用 SMTP 而不是綁定某家 API：Gmail、Brevo、Resend、Mailgun
都提供 SMTP，換供應商只要改環境變數，不用動程式。
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("inkstone.email")


def _build_verification_mail(to: str, link: str, username: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "硯 — 完成你的註冊"
    msg["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    msg["To"] = to

    # 純文字版本必須有 —— 有些信箱客戶端不顯示 HTML，
    # 而且只有 HTML 的信比較容易被判定為垃圾郵件
    msg.set_content(
        f"""你好，

有人用這個信箱在「硯」申請了帳號 {username}。

點下面的連結設定密碼，就完成註冊：

{link}

這個連結 {settings.VERIFICATION_TTL_MINUTES} 分鐘內有效，只能使用一次。

如果這不是你本人的操作，忽略這封信就好，不會有任何帳號被建立。
"""
    )

    msg.add_alternative(
        f"""<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;background:#0b0d13;padding:32px 16px;
             font-family:'Noto Sans TC',-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#14182a;border-radius:16px;
              padding:40px 32px;color:#eceef4;">
    <p style="margin:0 0 28px;font-size:22px;font-weight:600;">硯</p>

    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.5;">
      完成你的註冊
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#a7adbd;">
      有人用這個信箱申請了帳號
      <strong style="color:#eceef4;">{username}</strong>。
      點下面的按鈕設定密碼，就完成註冊。
    </p>

    <a href="{link}"
       style="display:inline-block;background:#6c9ffb;color:#0b0d13;
              text-decoration:none;padding:13px 28px;border-radius:999px;
              font-size:15px;font-weight:600;">
      設定密碼
    </a>

    <p style="margin:28px 0 0;font-size:13px;line-height:1.8;color:#6e7486;">
      連結 {settings.VERIFICATION_TTL_MINUTES} 分鐘內有效，只能使用一次。<br>
      如果這不是你本人的操作，忽略這封信就好，不會有任何帳號被建立。
    </p>
  </div>
</body>
</html>""",
        subtype="html",
    )
    return msg


def _build_reset_mail(to: str, link: str, username: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "硯 — 重設你的密碼"
    msg["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    msg["To"] = to

    msg.set_content(
        f"""你好，

有人要求重設帳號 {username} 的密碼。

點下面的連結設定新密碼：

{link}

這個連結 {settings.RESET_TTL_MINUTES} 分鐘內有效，只能使用一次。

如果這不是你本人的操作，忽略這封信就好，你的密碼不會有任何變動。
建議順便檢查一下這個信箱是否安全。
"""
    )

    msg.add_alternative(
        f"""<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;background:#0b0d13;padding:32px 16px;
             font-family:'Noto Sans TC',-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#14182a;border-radius:16px;
              padding:40px 32px;color:#eceef4;">
    <p style="margin:0 0 28px;font-size:22px;font-weight:600;">硯</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.5;">
      重設你的密碼
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#a7adbd;">
      有人要求重設帳號
      <strong style="color:#eceef4;">{username}</strong> 的密碼。
    </p>
    <a href="{link}"
       style="display:inline-block;background:#6c9ffb;color:#0b0d13;
              text-decoration:none;padding:13px 28px;border-radius:999px;
              font-size:15px;font-weight:600;">
      設定新密碼
    </a>
    <p style="margin:28px 0 0;font-size:13px;line-height:1.8;color:#6e7486;">
      連結 {settings.RESET_TTL_MINUTES} 分鐘內有效，只能使用一次。<br>
      如果這不是你本人的操作，忽略這封信就好，密碼不會有任何變動。
    </p>
  </div>
</body>
</html>""",
        subtype="html",
    )
    return msg


def send_password_reset(to: str, link: str, username: str) -> None:
    _deliver(_build_reset_mail(to, link, username), to, link, "重設密碼信")


def send_verification(to: str, link: str, username: str) -> None:
    _deliver(_build_verification_mail(to, link, username), to, link, "驗證信")


def _deliver(msg: EmailMessage, to: str, link: str, label: str) -> None:
    if not settings.smtp_configured:
        # 開發模式：把連結印出來，直接複製就能繼續流程
        log.warning("SMTP 未設定，%s沒有寄出。收件者=%s\n連結：%s", label, to, link)
        return

    try:
        context = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=20
            ) as s:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
                s.starttls(context=context)
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        log.info("%s已寄出：%s", label, to)
    except Exception:
        # 寄信失敗不該把例外細節回給使用者（會洩漏 SMTP 設定），
        # 但一定要記進日誌，否則會變成無聲的故障
        log.exception("%s寄送失敗：%s", label, to)
        raise
