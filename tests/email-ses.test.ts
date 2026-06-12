// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the SES v2 port (src/lib/email/ses.ts). The AWS SDK clients are
 * mocked at the module boundary so these stay DB-/network-less. Mirrors the
 * mocking + env-isolation style of tests/sms-client.test.ts.
 */

// Shared mock handles — hoisted so the vi.mock factories can close over them.
const h = vi.hoisted(() => ({
  sesSend: vi.fn(),
  ddbSend: vi.fn(),
  sendEmailInputs: [] as any[],
  getInputs: [] as any[],
}));

// NB: the `new`-invoked mocks use regular functions (arrow functions can't be
// constructed) so `new SESv2Client()` / `new SendEmailCommand()` work.
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn(function () {
    return { send: h.sesSend };
  }),
  SendEmailCommand: vi.fn(function (input) {
    h.sendEmailInputs.push(input);
    return { input };
  }),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(function () {
    return {};
  }),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: h.ddbSend })) },
  GetCommand: vi.fn(function (input) {
    h.getInputs.push(input);
    return { input };
  }),
}));

const AWS_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ASSUME_ROLE_ARN",
  "AWS_S3_EXTERNAL_ID",
  "SES_FROM_ADDRESS",
  "SES_FROM_NAME",
  "SES_REPLY_TO",
  "SES_CONFIG_SET",
  "SES_SUPPRESSION_TABLE",
];

describe("sendEmail — SES v2 port", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    // Clean AWS/SES slate so each test opts in only what it needs, regardless
    // of the developer's shell or .env.local.
    process.env = { ...originalEnv };
    for (const k of AWS_KEYS) delete process.env[k];
    h.sesSend.mockReset();
    h.ddbSend.mockReset();
    h.sendEmailInputs.length = 0;
    h.getInputs.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("dev no-op: returns no messageId and skips SES when credentials are absent", async () => {
    vi.resetModules();
    const { sendEmail } = await import("@/lib/email/ses");
    const r = await sendEmail({ email: "a@b.com", subject: "Hi", body: "<p>Hi</p>" });
    expect(r.messageId).toBeUndefined();
    expect(h.sesSend).not.toHaveBeenCalled();
  });

  it("rejects when a required field is missing", async () => {
    vi.resetModules();
    const { sendEmail } = await import("@/lib/email/ses");
    await expect(sendEmail({ email: "", subject: "s", body: "b" })).rejects.toThrow(/required/);
    expect(h.sesSend).not.toHaveBeenCalled();
  });

  it("sends via SES with a display-name From, config set, and reply-to, returning the MessageId", async () => {
    process.env.AWS_ACCESS_KEY_ID = "key";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.SES_FROM_ADDRESS = "sender@daktar.link";
    process.env.SES_FROM_NAME = "Daktar.Link";
    process.env.SES_REPLY_TO = "support@daktar.link";
    process.env.SES_CONFIG_SET = "primary-config-set";
    vi.resetModules();
    h.sesSend.mockResolvedValue({ MessageId: "MID-123" });

    const { sendEmail } = await import("@/lib/email/ses");
    const r = await sendEmail({ email: "Recipient@Example.com", subject: "Reset", body: "<p>x</p>" });

    expect(r.messageId).toBe("MID-123");
    expect(h.sesSend).toHaveBeenCalledTimes(1);

    const input = h.sendEmailInputs[0];
    expect(input.FromEmailAddress).toBe('"Daktar.Link" <sender@daktar.link>');
    expect(input.ConfigurationSetName).toBe("primary-config-set");
    expect(input.ReplyToAddresses).toEqual(["support@daktar.link"]);
    expect(input.Destination.ToAddresses).toEqual(["Recipient@Example.com"]);
    expect(input.Content.Simple.Subject.Data).toBe("Reset");
    expect(input.Content.Simple.Body.Html.Data).toBe("<p>x</p>");
  });

  it("uses a bare From and omits reply-to/config set when those are unset", async () => {
    process.env.AWS_ACCESS_KEY_ID = "key";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.SES_FROM_ADDRESS = "sender@daktar.link";
    vi.resetModules();
    h.sesSend.mockResolvedValue({ MessageId: "MID" });

    const { sendEmail } = await import("@/lib/email/ses");
    await sendEmail({ email: "a@b.com", subject: "s", body: "b" });

    const input = h.sendEmailInputs[0];
    expect(input.FromEmailAddress).toBe("sender@daktar.link");
    expect(input.ReplyToAddresses).toBeUndefined();
    expect(input.ConfigurationSetName).toBeUndefined();
  });

  it("throws SuppressedRecipientError and skips SES when the recipient is suppressed", async () => {
    process.env.AWS_ACCESS_KEY_ID = "key";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.SES_SUPPRESSION_TABLE = "ses-suppression";
    vi.resetModules();
    h.ddbSend.mockResolvedValue({ Item: { email: "blocked@x.com" } });

    const { sendEmail, SuppressedRecipientError } = await import("@/lib/email/ses");
    const err = await sendEmail({ email: "Blocked@X.com", subject: "s", body: "b" }).catch((e) => e);

    expect(err).toBeInstanceOf(SuppressedRecipientError);
    expect(err.code).toBe("SUPPRESSED");
    expect(h.sesSend).not.toHaveBeenCalled();
    // Suppression lookup is case-normalized to the table's lowercase key.
    expect(h.getInputs[0].Key.email).toBe("blocked@x.com");
    expect(h.getInputs[0].TableName).toBe("ses-suppression");
  });

  it("isSuppressed short-circuits to false when no suppression table is configured", async () => {
    vi.resetModules();
    const { isSuppressed } = await import("@/lib/email/ses");
    expect(await isSuppressed("anyone@x.com")).toBe(false);
    expect(h.ddbSend).not.toHaveBeenCalled();
  });
});
