/**
 * Transactional email via AWS SES v2.
 *
 * TypeScript port of shafa-monorepo/apps/api/app/services/emailService.js — the
 * two apps share one AWS account, so this mirrors that service exactly:
 *   - SESv2 `SendEmailCommand` with an HTML body,
 *   - an optional `From` display name (`SES_FROM_NAME`),
 *   - an optional configuration set (`SES_CONFIG_SET`) and reply-to (`SES_REPLY_TO`),
 *   - a DynamoDB-backed app-level suppression list (`isSuppressed` /
 *     `SuppressedRecipientError`) checked before every send.
 *
 * Two doctor.id.bd-specific adaptations to keep the repo's conventions intact:
 *   - Credentials resolve by `NODE_ENV`, exactly like `getS3()` (decision #17):
 *     production → cross-account STS role; any other env → static access keys.
 *   - When the active mode's credentials are absent the send is a dev no-op that
 *     logs the payload instead of throwing, so offline dev isn't blocked
 *     (CLAUDE.md #13 — same fallback the SMS client uses).
 *
 * Production deploys must SES-verify the `From` domain. While SES is in sandbox,
 * recipients must also be individually verified.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from "@aws-sdk/types";
import { env } from "@/lib/env";
import { crossAccountCredentialsProvider } from "@/lib/s3/aws-credentials";

/**
 * Resolve AWS credentials the same way `getS3()` does (decision #17):
 *   - production → cross-account STS role (base creds from the ECS task role)
 *   - any other  → static access keys from .env
 * Returns `null` when the selected mode's credentials are absent, so callers
 * degrade to the dev no-op instead of constructing a client that can't auth.
 */
function resolveAwsCredentials(): AwsCredentialIdentity | AwsCredentialIdentityProvider | null {
  const e = env();
  if (e.NODE_ENV === "production") {
    return crossAccountCredentialsProvider();
  }
  if (!e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY) return null;
  return { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY };
}

let _ses: SESv2Client | null = null;
function getSesClient(): SESv2Client | null {
  if (_ses) return _ses;
  const credentials = resolveAwsCredentials();
  if (!credentials) return null;
  _ses = new SESv2Client({ region: env().AWS_REGION, credentials });
  return _ses;
}

let _ddb: DynamoDBDocumentClient | null = null;
function getDdbDocClient(): DynamoDBDocumentClient | null {
  if (_ddb) return _ddb;
  const credentials = resolveAwsCredentials();
  if (!credentials) return null;
  _ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env().AWS_REGION, credentials }));
  return _ddb;
}

/** Thrown by `sendEmail` when the recipient is on the suppression list. */
export class SuppressedRecipientError extends Error {
  readonly code = "SUPPRESSED" as const;
  constructor(email: string) {
    super(`Recipient ${email} is on the suppression list`);
    this.name = "SuppressedRecipientError";
  }
}

/**
 * App-level suppression check against the `SES_SUPPRESSION_TABLE` DynamoDB table
 * (partition key: `email`). Returns `false` when the table isn't configured or
 * credentials are absent — SES still enforces its own native account-level
 * suppression list on send regardless.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const { SES_SUPPRESSION_TABLE } = env();
  if (!SES_SUPPRESSION_TABLE) return false;
  const ddb = getDdbDocClient();
  if (!ddb) return false;
  const result = await ddb.send(
    new GetCommand({
      TableName: SES_SUPPRESSION_TABLE,
      Key: { email: email.toLowerCase() },
      ProjectionExpression: "email",
    }),
  );
  return Boolean(result.Item);
}

export interface SendEmailInput {
  /** Recipient address. */
  email: string;
  subject: string;
  /** HTML body. */
  body: string;
}

export async function sendEmail({ email, subject, body }: SendEmailInput): Promise<{ messageId?: string }> {
  if (!email || !subject || !body) {
    throw new Error("email, subject, and body are required");
  }

  if (await isSuppressed(email)) {
    throw new SuppressedRecipientError(email);
  }

  const { SES_FROM_ADDRESS, SES_FROM_NAME, SES_CONFIG_SET, SES_REPLY_TO } = env();
  const fromAddress = SES_FROM_ADDRESS ?? "no-reply@doctor.id.bd";
  const from = SES_FROM_NAME ? `"${SES_FROM_NAME}" <${fromAddress}>` : fromAddress;

  const client = getSesClient();
  if (!client) {
    // Dev fallback (CLAUDE.md #13) — log the would-be email so the flow stays
    // exercisable end-to-end without real SES credentials.
    console.log("─── [SES no-op] would have sent email ───");
    console.log(`To: ${email}`);
    console.log(`From: ${from}`);
    console.log(`Subject: ${subject}`);
    console.log("──────────────────────────────────────────");
    return {};
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [email] },
    ...(SES_REPLY_TO ? { ReplyToAddresses: [SES_REPLY_TO] } : {}),
    ...(SES_CONFIG_SET ? { ConfigurationSetName: SES_CONFIG_SET } : {}),
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: body, Charset: "UTF-8" } },
      },
    },
  });

  const { MessageId } = await client.send(command);
  return { messageId: MessageId };
}
