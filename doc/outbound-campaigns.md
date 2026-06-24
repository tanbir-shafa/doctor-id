# Outbound Campaigns — Email & SMS to Unclaimed Doctors

This guide covers sending bulk email and SMS to unclaimed doctor profiles, targeting specific cohorts, and automating weekly sends.

## Overview

An **unclaimed doctor** is a profile imported from a data source (e.g. Popular Diagnostic) that hasn't been claimed via the registration flow. They exist in the database with `isClaimed: false` and `status: "published"`, making them visible in search and eligible for outreach campaigns.

The outbound system provides:

- **Bulk campaign runner** (`scripts/outbound.ts`) — dispatch SMS or email to matched doctors
- **Template management** — predefined or custom message templates
- **Cohort filtering** — target by district, specialty, or custom criteria
- **Opt-out tracking** — respects user unsubscribe preferences
- **Idempotency** — won't re-send the same template to the same doctor within 7 days
- **Automation** — scheduled weekly sends via cron or cloud agents

## Quick Start: One-Off Campaign

### Send SMS to all unclaimed doctors in Dhaka

```bash
npm run outbound -- \
  --campaign=2026-w25-dhaka-claim \
  --template=en-claim-rx-pad \
  --channel=sms \
  --cohort=district=Dhaka \
  --dry-run
```

If the dry-run output looks good, remove `--dry-run`:

```bash
npm run outbound -- \
  --campaign=2026-w25-dhaka-claim \
  --template=en-claim-rx-pad \
  --channel=sms \
  --cohort=district=Dhaka
```

### Send email instead

```bash
npm run outbound -- \
  --campaign=2026-w25-claim-email \
  --template=en-claim-profile \
  --channel=email \
  --limit=100
```

## Campaign Structure

Every campaign requires:

| Argument | Example | Notes |
|----------|---------|-------|
| `--campaign=ID` | `2026-w25-dhaka-claim` | Unique identifier for this run. Persisted in `OutboundMessage` for audit + dedup. Use: `YYYY-wNN-description`. |
| `--template=ID` | `en-claim-rx-pad` | Template ID from the registry below. Defines message body + language. |
| `--channel=sms\|email` | `sms` | Delivery medium. Affects which contact field is used (phone vs email). |

Optional arguments:

| Argument | Example | Notes |
|----------|---------|-------|
| `--cohort=k=v,...` | `district=Dhaka,specialty=Cardiology` | Narrows the doctor set. Supports `district` and `specialty` filters. Omit for all unclaimed doctors. |
| `--limit=N` | `--limit=100` | Cap the send to the first N matched doctors. Useful for phased rollout or testing. |
| `--dry-run` | (flag) | **Recommended first step.** Parses cohorts, renders templates, estimates SMS segments + call count — but makes no API calls and writes no database rows. |

Production-only safety:

| Argument | Example | Notes |
|----------|---------|-------|
| `--force-prod` | (flag) | Required to run in `NODE_ENV=production`. Prevents accidental bulk sends on prod. **Omit in dev.** |

## Available Templates

### SMS Templates

| Template ID | Language | Type | Body | Use Case |
|-------------|----------|------|------|----------|
| `en-claim-rx-pad` | English | Personalized | Claims invite + Rx pad benefit | General English claim push |
| `bn-claim-rx-pad` | Bangla | Personalized | দাবি করুন (claim) + রেসিপ্যাড | General Bangla claim push |

Each template **deep-links** to `/auth/register?slug={{firstName}}` so doctors land on their own profile with pre-filled details. Personalized templates yield ~100 messages per SSL call (dynamic endpoint).

### Email Templates

| Template ID | Language | Type | Body | Use Case |
|-------------|----------|------|------|----------|
| `en-claim-profile` | English | Personalized | Profile preview + verification benefits | General English claim (personalized card) |

Email templates render a rich HTML card showing the doctor's profile summary, chamber details, schedule, and a personal claim link. Supports up to 50 concurrent sends.

### Adding New Templates

Edit [`src/lib/outbound/templates.ts`](../src/lib/outbound/templates.ts) (SMS) or [`src/lib/outbound/email-templates.ts`](../src/lib/outbound/email-templates.ts) (email):

```typescript
// SMS example
export const OUTBOUND_TEMPLATES: Record<string, OutboundTemplate> = {
  "en-offer-emr": {
    id: "en-offer-emr",
    description: "EMR onboarding offer — EMR benefits + free seat",
    body: "Daktar.Link: Dr. {{firstName}}, claim your free EMR seat: https://daktar.link/auth/register?slug={{slug}}. Reply STOP to opt out.",
    personalized: true,
    language: "en",
  },
  // ...rest of templates
};
```

For email, define a new template in `OUTBOUND_EMAIL_TEMPLATES` and a renderer function.

## How Targeting Works

### Cohort Filters

Filter by `--cohort=key=value` pairs (comma-separated):

```bash
# Cardiology specialists in Dhaka
--cohort=district=Dhaka,specialty=Cardiology

# Only the Chittagong district
--cohort=district=Chittagong
```

**Supported keys:**
- `district` — matches `Doctor.chambers[].district` (exact match)
- `specialty` — matches `Doctor.specialties[].name` (exact match)

To discover valid district/specialty names, query the database:

```bash
# SSH into the DB and run:
db.doctors.distinct("chambers.district")   # All districts
db.doctors.distinct("specialties.name")    # All specialties
```

Or check the seed file: [`src/lib/geo/bd-districts.ts`](../src/lib/geo/bd-districts.ts) (districts) and the Specialty seed in [`scripts/seed.ts`](../scripts/seed.ts).

### Targeting Specific Doctors

To send to specific doctors instead of a cohort, create a temporary cohort filter or use a one-off script.

**Option 1: Filter by specific district + specialty combo**

```bash
npm run outbound -- \
  --campaign=2026-w25-surgeons-dhaka \
  --template=en-claim-rx-pad \
  --channel=sms \
  --cohort=district=Dhaka,specialty=General Surgery \
  --limit=50
```

**Option 2: Script a custom filter**

Create a temp script (e.g. `scripts/outbound-custom.ts`) that queries doctors by your custom logic (e.g. `bmdcNumber` prefix, profile completeness, etc.) and calls `sendSmsBatch` or `sendEmailBatch` directly:

```typescript
import { Doctor } from "@/lib/db/models";
import { sendSmsBatch } from "@/lib/sms/client";
import { dbConnect } from "@/lib/db/mongoose";

await dbConnect();
const doctors = await Doctor.find({
  isClaimed: false,
  "specialties.name": "Cardiology",
  "qualifications.year": { $gte: 2020 }, // Graduated recently
}).lean();

const messages = doctors
  .filter(d => d.contact?.publicPhone)
  .map(d => ({
    to: d.contact.publicPhone,
    body: `Dr. ${d.name.first}, claim your profile: https://daktar.link/auth/register?slug=${d.slug}`,
  }));

const results = await sendSmsBatch(messages);
console.log("Sent:", results.filter(r => r.sent).length);
```

Run with:
```bash
npx ts-node scripts/outbound-custom.ts
```

## Send Tracking & Opt-Out

Every send is logged to the `OutboundMessage` collection:

```typescript
{
  _id: ObjectId,
  doctorId: ObjectId,
  campaignId: "2026-w25-dhaka-claim",      // The campaign ID you passed
  templateId: "en-claim-rx-pad",           // The template used
  channel: "sms" | "email",
  to: "+8801700000000" | "dr@example.com",
  status: "sent" | "failed" | "suppressed" | "opted_out" | "skipped",
  body: "Dr. John, claim your profile...", // Compact version
  sentAt: Date,                             // When it was sent
  errorMessage: "...",                      // If failed
  batchId: "...",                           // Provider's message group ID
}
```

**Status meanings:**
- `sent` — successfully delivered by the SMS/email provider
- `failed` — provider rejected (e.g. bad number, network error)
- `suppressed` — email suppressed by AWS DynamoDB suppression list
- `opted_out` — recipient on the OptOut list
- `skipped` — already sent this template within 7 days (idempotency)

### Opt-Out Management

Users can opt out by replying **STOP** to an SMS, which triggers the provider webhook. Email unsubscribe links in the message (`/api/unsubscribe?token=...`) also add to the opt-out list.

To manually add/remove opt-outs:

```typescript
// MongoDB shell or Node.js
use('doctor-id-dev');

// Add an opt-out
db.optouts.insertOne({
  channel: "sms",     // or "email"
  phone: "+8801700000000",
  email: "dr@example.com",  // For email channel
  createdAt: new Date(),
});

// View opted-out doctors
db.optouts.find({ channel: "sms" }).limit(10);

// Remove an opt-out (to retry)
db.optouts.deleteOne({ phone: "+8801700000000" });
```

## Automation: Weekly Sends

### Option 1: Scheduled Cloud Agent (Recommended)

Use Claude Code's built-in scheduling to run campaigns on a fixed schedule:

```bash
/schedule "Weekly unclaimed claim push" --cron "0 9 * * 1" \
  "npm run outbound -- --campaign=2026-w\$(date +%V)-weekly-claim --template=en-claim-rx-pad --channel=sms --force-prod"
```

This runs every **Monday at 9 AM** (UTC), sending to unclaimed doctors. The campaign ID is auto-timestamped with the ISO week number (`2026-w25-...`).

### Option 2: System Cron Job

If you prefer traditional cron, add to your EC2 instance's crontab:

```bash
crontab -e
```

Add:
```cron
# Every Monday at 9 AM — send SMS to unclaimed doctors in high-opportunity districts
0 9 * * 1 cd /opt/daktar.link && npm run outbound -- --campaign="2026-w$(date +\%V)-weekly-claim" --template=en-claim-rx-pad --channel=sms --cohort=district=Dhaka,specialty=Cardiology --force-prod >> /var/log/daktar/outbound.log 2>&1
```

**Key points:**
- Runs from the app directory so `npm run` finds `package.json`
- Uses `--force-prod` to authorize production sends
- Logs to a file for audit trail (create `/var/log/daktar/` first)
- Weeks are numbered 1–53 (ISO 8601), so each run has a unique campaign ID

### Option 3: PM2 Ecosystem Scheduler

Add to [`ecosystem.config.cjs`](../ecosystem.config.cjs):

```javascript
module.exports = {
  apps: [
    // ... existing Next.js app config
    {
      name: "outbound-weekly",
      script: "./scripts/outbound.ts",
      args: "--campaign=2026-weekly --template=en-claim-rx-pad --channel=sms --force-prod",
      cron_restart: "0 9 * * 1", // Every Monday 9 AM UTC
    },
  ],
};
```

Then update PM2:
```bash
pm2 delete ecosystem.config.cjs && pm2 start ecosystem.config.cjs
```

## Dry-Run & Testing

**Always start with `--dry-run`:**

```bash
npm run outbound -- \
  --campaign=test-2026-w25 \
  --template=en-claim-rx-pad \
  --channel=sms \
  --cohort=district=Dhaka \
  --dry-run
```

**Output:**
```
→ Campaign: test-2026-w25
→ Channel:  sms
→ Template: en-claim-rx-pad (en, personalized)
  (dry-run: no API calls, no DB writes)
→ Cohort matched 342 unclaimed published doctors
→ Skipped (no contact):    12
→ Skipped (opt-out):       5
→ Skipped (recently sent): 0
→ Queued to send:          325
→ Body groups: 1 · ~4 SSL call(s) · 1 segment/SMS (ASCII)

Sample rendered message:
  Daktar.Link: Dr. John, claim your free doctor profile + printable prescription pad: https://daktar.link/auth/register?slug=john-doe-cardiologist Reply STOP to opt out.
```

The dry-run shows:
- **Cohort match** — how many doctors matched your filters
- **Skip breakdown** — contact issues, opt-outs, recent sends
- **Queue size** — how many will actually send
- **Provider calls** — estimated SSL API calls (helps estimate SMS cost)
- **Sample message** — a real rendered message so you can review it

## Troubleshooting

### "Unknown SMS/email template"

```
Error: Unknown SMS template "en-offer-emr". Available: en-claim-rx-pad, bn-claim-rx-pad
```

→ Check the template ID matches exactly (case-sensitive). List available templates in the template registry files.

### "Refusing to run in production without --force-prod"

→ Add `--force-prod` flag for production sends. This is intentional — prevents accidental bulk sends.

### "Template has unresolved placeholders"

```
✗ Template has unresolved placeholders. Sample: "Daktar.Link: Dr. {{firstName}}, claim your profile..."
```

→ The template body uses a placeholder (e.g. `{{firstName}}`) but the renderer didn't provide it. Check that the template's placeholders match the context passed to `renderTemplate()` in `scripts/outbound.ts`.

### 0 messages queued, but cohort matched doctors

Common causes:
- **No contact field**: doctors have no phone (SMS) or email (email channel). Check: `db.doctors.find({ isClaimed: false, "contact.publicPhone": null }).count()`
- **All opted-out**: everyone is on the opt-out list for this cohort
- **All recently sent**: you sent this template to these doctors within the last 7 days
- **`isClaimed: true`**: the cohort filter might be matching claimed doctors. Verify the filter.

### SMS not arriving

- Confirm the doctor's phone number is valid: `normalizeBdPhone("+8801700000000")` should return `"+8801700000000"`
- Check provider status: is SSL Wireless responding? (Check `/api/health` response time or provider docs)
- View the sent message: query `OutboundMessage.findOne({ to: "+8801700000000" })` and check the `status` and `errorMessage` fields

### Email not arriving (Inbox or Spam)

- Check if the email was `suppressed` in the OutboundMessage — view the [AWS SES suppression list](https://console.aws.amazon.com/ses)
- Verify the sender domain is verified in AWS SES (run `npm run setup-email` or check the SES console)
- Check the email body for unresolved placeholders (dry-run should catch this)
- If in dev/sandbox, email sends are no-ops; only production sends actually mail

## Performance & Cost

### SMS Cost Estimation

The dry-run shows estimated provider calls. Each call batches up to 100 messages (SSL Wireless):

```
→ Body groups: 1 · ~4 SSL call(s) · 1 segment/SMS (ASCII)
```

If you have 400 unique personalized bodies:
- **Cost**: 4 calls × ~0.10 BDT/SMS × 100/call = ~40 BDT

Unicode (Bangla) messages use 70-char segments instead of 160, so expect 2–3× more segments and cost.

### Email Cost

AWS SES is $0.10 per 1,000 emails. A 3,000-doctor campaign costs ~$0.30.

### Database Performance

The script makes these queries:

1. **Doctor load** (1 query) — filters by `isClaimed`, `status`, contact, cohort
2. **Opt-out load** (1 query) — batched `$in` on all recipients
3. **7-day idempotency** (1 query) — batched `$in` on doctorIds + template
4. **OutboundMessage insert** (1 write) — one row per recipient

For a 3,000-doctor cohort, expect <500ms total DB time. The bottleneck is the SMS/email dispatch (50–200ms per call, depending on provider).

## Audit & Reporting

To report on a campaign:

```javascript
// Total sent
db.outboundmessages.countDocuments({ campaignId: "2026-w25-dhaka-claim", status: "sent" });

// Breakdown by status
db.outboundmessages.aggregate([
  { $match: { campaignId: "2026-w25-dhaka-claim" } },
  { $group: { _id: "$status", count: { $sum: 1 } } },
]);

// Doctors who haven't claimed yet (follow-up)
db.doctors.find({
  _id: { $in: /* extract doctorIds from sent OutboundMessages */ },
  isClaimed: false,
});
```

## See Also

- **Registration flow**: [`doc/registration-flow.md`](./registration-flow.md) — how doctors claim their profile
- **Template docs**: [`src/lib/outbound/templates.ts`](../src/lib/outbound/templates.ts) (SMS) and [`src/lib/outbound/email-templates.ts`](../src/lib/outbound/email-templates.ts) (email)
- **Opt-out model**: [`src/lib/db/models/OptOut.ts`](../src/lib/db/models/OptOut.ts)
- **SMS client**: [`src/lib/sms/client.ts`](../src/lib/sms/client.ts)
- **Email client**: [`src/lib/email/ses.ts`](../src/lib/email/ses.ts)
- **Outbound message model**: [`src/lib/db/models/OutboundMessage.ts`](../src/lib/db/models/OutboundMessage.ts)
