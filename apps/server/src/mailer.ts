export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Fallback when no email provider is configured. In development it prints the
 * email (and its links) to the server log. In production it never logs the
 * recipient, body or links (they hold sign-in / reset tokens): emails are disabled.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly production = process.env.NODE_ENV === 'production') {
    if (this.production) {
      console.error('[rc-server] WARNING: NODE_ENV=production but no email provider (RESEND_API_KEY) is set — account emails are DISABLED and will not be sent.');
    }
  }

  async send(mail: Mail) {
    if (this.production) {
      console.warn('[mail] email disabled (no provider configured); message dropped');
      return;
    }
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

/** https://resend.com — free tier is 3,000 emails/month. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: Mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

export const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function linkEmail(to: string, subject: string, intro: string, action: string, url: string, outro: string): Mail {
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${url}\n\n${outro}\n\n— randomCall`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
<p>${escape(intro)}</p>
<p><a href="${escape(url)}" style="display:inline-block;background:#2f7de1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escape(action)}</a></p>
<p style="color:#64748b;font-size:13px">${escape(outro)}</p>
<p style="color:#64748b;font-size:13px">— randomCall</p></div>`,
  };
}
