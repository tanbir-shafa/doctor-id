/**
 * Transactional email via AWS SES v2.
 *
 * Silently no-ops in dev when AWS creds aren't configured — logs the email
 * payload to the console instead so the verification/reset flow remains
 * exercisable end-to-end without a real SES account.
 *
 * Production deploys must set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY +
 * SES_FROM_EMAIL, *and* the FROM domain must be SES-verified. While SES is
 * in sandbox, recipients must also be individually verified — README calls
 * this out.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "@/lib/env";

let _client: SESv2Client | null = null;
function getClient(): SESv2Client | null {
  if (_client) return _client;
  const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = env();
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return null;
  _client = new SESv2Client({
    region: AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  });
  return _client;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean; messageId?: string }> {
  const { SES_FROM_EMAIL, SES_REPLY_TO } = env();
  const client = getClient();
  const from = SES_FROM_EMAIL ?? "no-reply@doctor.id.bd";

  if (!client) {
    // Dev fallback — log the would-be email so the developer can hand-verify.
    console.log("─── [SES no-op] would have sent email ───");
    console.log(`To: ${msg.to}`);
    console.log(`From: ${from}`);
    console.log(`Subject: ${msg.subject}`);
    console.log(`Text:\n${msg.text}`);
    console.log("──────────────────────────────────────────");
    return { sent: false };
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [msg.to] },
    ...(SES_REPLY_TO ? { ReplyToAddresses: [SES_REPLY_TO] } : {}),
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: msg.html, Charset: "UTF-8" },
          Text: { Data: msg.text, Charset: "UTF-8" },
        },
      },
    },
  });

  const response = await client.send(command);
  return { sent: true, messageId: response.MessageId };
}
