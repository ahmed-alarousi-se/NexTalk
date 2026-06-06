import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.core.config import settings

logger = logging.getLogger(__name__)


async def send_password_reset_email(to_email: str, username: str, reset_token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/#reset-password?token={reset_token}"

    html = f"""
    <html>
    <body style="font-family: 'DM Sans', sans-serif; background: #0a0a0f; color: #e8e8f0; padding: 40px;">
        <div style="max-width: 480px; margin: 0 auto; background: #13131a; border-radius: 16px; padding: 40px; border: 1px solid #1e1e2e;">
            <h2 style="color: #4f8ef7; margin-top: 0;">Reset your NexTalk password</h2>
            <p>Hi <strong>{username}</strong>,</p>
            <p>We received a request to reset your password. Click the button below to set a new one:</p>
            <a href="{reset_url}" style="display:inline-block; background:#4f8ef7; color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:600; margin: 16px 0;">
                Reset Password
            </a>
            <p style="color:#5a5a7a; font-size:13px;">This link expires in 15 minutes and can only be used once.</p>
            <p style="color:#5a5a7a; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your NexTalk password"
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    await asyncio.to_thread(_send_smtp, msg, to_email)


def _send_smtp(msg: MIMEMultipart, to_email: str) -> None:
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
        logger.info("Password reset email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)
        # Suppress exception soforgot-password endpoint doesn't crash on bad SMTP config
