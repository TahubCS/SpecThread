import type { EmailConfig } from "./auth-config";

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type SendEmail = (message: EmailMessage) => Promise<void>;

export function createEmailSender(config: EmailConfig): SendEmail {
  if (config.delivery === "log") {
    return async message => {
      console.info(`[email:log] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
    };
  }
  return async message => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.from, ...message }),
      signal: AbortSignal.timeout(10_000),
    });
    // Never log the message body or key: they contain one-time links and credentials.
    if (!response.ok) throw new Error(`Email delivery failed with status ${response.status}.`);
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

function linkMessage(to: string, subject: string, intro: string, action: string, url: string): EmailMessage {
  const note = "If you did not request this, you can ignore this email.";
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${url}\n\n${note}`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p><p>${escapeHtml(note)}</p>`,
  };
}

export const verificationEmail = (to: string, url: string) =>
  linkMessage(to, "Verify your SpecThread email", "Confirm this email address to finish creating your SpecThread account.", "Verify email", url);

export const passwordResetEmail = (to: string, url: string) =>
  linkMessage(to, "Reset your SpecThread password", "Someone asked to reset the password for your SpecThread account.", "Reset password", url);
