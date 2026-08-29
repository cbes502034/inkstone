"""
寄信。

支援三種通道，依設定自動選擇：

    Brevo / Resend  —— 走 HTTPS API（443 埠）
    SMTP            —— 傳統寄信協定（25 / 465 / 587 埠）
    日誌            —— 都沒設定時把連結印出來，本機開發用

**正式環境務必用 HTTPS API，不要用 SMTP。**
Render、Heroku、Vercel 這類平台都封鎖對外的 SMTP 連接埠來防垃圾郵件，
不管帳號密碼多正確都會得到 `OSError: [Errno 101] Network is unreachable`。
這個錯誤看起來像網路問題，實際上是平台政策，查很久也查不出來。

寄信改成非同步：SMTP 或 HTTP 的往返動輒數百毫秒，
用同步呼叫會把整個事件迴圈卡住，其他請求全部跟著等。
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from app.core.config import settings

log = logging.getLogger("inkstone.email")


class Mail:
    """一封信的內容。純文字與 HTML 都要有 —— 只有 HTML 的信容易被判定為垃圾郵件。"""

    def __init__(self, subject: str, text: str, html: str):
        self.subject = subject
        self.text = text
        self.html = html


# ---------------------------------------------------------------- 信件內容


def _shell(title: str, body_html: str, footer: str) -> str:
    return f"""<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;background:#0b0d13;padding:32px 16px;
             font-family:'Noto Sans TC',-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#14182a;border-radius:16px;
              padding:40px 32px;color:#eceef4;">
    <p style="margin:0 0 28px;font-size:22px;font-weight:600;">硯</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.5;">
      {title}
    </h1>
    {body_html}
    <p style="margin:28px 0 0;font-size:13px;line-height:1.8;color:#6e7486;">
      {footer}
    </p>
  </div>
</body>
</html>"""


def _button(link: str, label: str) -> str:
    return (
        f'<a href="{link}" style="display:inline-block;background:#6c9ffb;'
        'color:#0b0d13;text-decoration:none;padding:13px 28px;border-radius:999px;'
        f'font-size:15px;font-weight:600;">{label}</a>'
    )


def verification_mail(link: str, username: str) -> Mail:
    ttl = settings.VERIFICATION_TTL_MINUTES
    return Mail(
        subject="硯 — 完成你的註冊",
        text=(
            f"你好，\n\n有人用這個信箱在「硯」申請了帳號 {username}。\n\n"
            f"點下面的連結設定密碼，就完成註冊：\n\n{link}\n\n"
            f"這個連結 {ttl} 分鐘內有效，只能使用一次。\n\n"
            "如果這不是你本人的操作，忽略這封信就好，不會有任何帳號被建立。\n"
        ),
        html=_shell(
            "完成你的註冊",
            '<p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#a7adbd;">'
            f'有人用這個信箱申請了帳號 <strong style="color:#eceef4;">{username}</strong>。'
            "點下面的按鈕設定密碼，就完成註冊。</p>" + _button(link, "設定密碼"),
            f"連結 {ttl} 分鐘內有效，只能使用一次。<br>"
            "如果這不是你本人的操作，忽略這封信就好，不會有任何帳號被建立。",
        ),
    )


def reset_mail(link: str, username: str) -> Mail:
    ttl = settings.RESET_TTL_MINUTES
    return Mail(
        subject="硯 — 重設你的密碼",
        text=(
            f"你好，\n\n有人要求重設帳號 {username} 的密碼。\n\n"
            f"點下面的連結設定新密碼：\n\n{link}\n\n"
            f"這個連結 {ttl} 分鐘內有效，只能使用一次。\n\n"
            "如果這不是你本人的操作，忽略這封信就好，你的密碼不會有任何變動。\n"
        ),
        html=_shell(
            "重設你的密碼",
            '<p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#a7adbd;">'
            f'有人要求重設帳號 <strong style="color:#eceef4;">{username}</strong> 的密碼。</p>'
            + _button(link, "設定新密碼"),
            f"連結 {ttl} 分鐘內有效，只能使用一次。<br>"
            "如果這不是你本人的操作，忽略這封信就好，密碼不會有任何變動。",
        ),
    )


# ---------------------------------------------------------------- 通道


async def _send_brevo(mail: Mail, to: str) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
            json={
                "sender": {"name": settings.MAIL_FROM_NAME, "email": settings.MAIL_FROM},
                "to": [{"email": to}],
                "subject": mail.subject,
                "textContent": mail.text,
                "htmlContent": mail.html,
            },
        )
        r.raise_for_status()


async def _send_resend(mail: Mail, to: str) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
                "to": [to],
                "subject": mail.subject,
                "text": mail.text,
                "html": mail.html,
            },
        )
        r.raise_for_status()


def _send_smtp_blocking(mail: Mail, to: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = mail.subject
    msg["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    msg["To"] = to
    msg.set_content(mail.text)
    msg.add_alternative(mail.html, subtype="html")

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


async def _send_smtp(mail: Mail, to: str) -> None:
    import asyncio

    # smtplib 是同步的，丟到執行緒去跑，別卡住事件迴圈
    await asyncio.to_thread(_send_smtp_blocking, mail, to)


# ---------------------------------------------------------------- 對外


async def deliver(mail: Mail, to: str, link: str) -> None:
    provider = settings.email_provider

    if provider == "none":
        if settings.ENV == "prod":
            # 正式環境沒設定通道卻回成功，是最糟的失敗方式 ——
            # 使用者以為信寄出了，實際上永遠等不到，而且沒有任何跡象。
            # 寧可讓註冊直接失敗，至少看得見。
            log.error("正式環境沒有設定寄信通道，無法寄出。收件者=%s", to)
            raise RuntimeError("沒有設定寄信通道")

        # 本機開發：把連結印出來，直接複製就能繼續流程
        log.warning("沒有設定寄信通道，信沒有寄出。收件者=%s\n連結：%s", to, link)
        return

    try:
        if provider == "brevo":
            await _send_brevo(mail, to)
        elif provider == "resend":
            await _send_resend(mail, to)
        else:
            await _send_smtp(mail, to)
        log.info("已寄出（%s）：%s", provider, to)
    except OSError as e:
        # SMTP 被平台封鎖時就是這個錯。訊息像網路問題，其實是平台政策，
        # 這裡直接點名，免得又花好幾輪查錯方向
        if provider == "smtp":
            log.error(
                "SMTP 連線失敗（%s）。Render、Heroku 這類平台會封鎖對外的 "
                "SMTP 連接埠，請改用 Brevo 或 Resend 的 HTTPS API。收件者=%s",
                e,
                to,
            )
        else:
            log.exception("寄信失敗：%s", to)
        raise
    except Exception:
        # 例外細節只進日誌，不回給使用者 —— 那會洩漏寄信服務的設定
        log.exception("寄信失敗（%s）：%s", provider, to)
        raise


async def send_verification(to: str, link: str, username: str) -> None:
    await deliver(verification_mail(link, username), to, link)


async def send_password_reset(to: str, link: str, username: str) -> None:
    await deliver(reset_mail(link, username), to, link)
