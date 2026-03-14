# 💃 Bachata Promotion — Mailing List & Campaign Guide

> **Owner:** Daniel Castillo (Daniel Sensual)
> **Brand:** Daniel Sensual — Bachata Dance & Personal Brand
> **Last Updated:** 2026-03-05

---

## When To Use This Mailing List

Use `mailing-list.csv` when **any** of the following are true:

1. **A new bachata event is being promoted** — check `../events/` for upcoming event configs
2. **Daniel asks to "blast" or "send" a promotion** for a dance event, class, or workshop
3. **A new event config is added** to `../events/` with `style` containing "bachata" or "dance"
4. **An email campaign is requested** related to Daniel Sensual, dance classes, or Orlando dance community
5. **Re-engagement campaigns** — when no event has been promoted in 30+ days, send a "what's coming" teaser

### Do NOT use this list for:
- Ghost AI Systems / agency marketing
- MediaGeekz video production outreach
- ReelEstate realtor leads
- Any B2B cold outreach

---

## Mailing List Details

| Field | Value |
|-------|-------|
| **File** | `./mailing-list.csv` |
| **Source** | Square POS customer export (dance classes, events, workshops) |
| **Total Contacts** | 878 |
| **With Phone** | 431 |
| **Sorted By** | Lifetime spend (descending — VIPs first) |
| **Last Processed** | 2026-03-05 |

### CSV Columns

| Column | Description |
|--------|-------------|
| `email` | Primary contact email (deduplicated, lowercase) |
| `first_name` | Customer first name |
| `last_name` | Customer last name |
| `full_name` | Combined first + last |
| `phone` | Phone number (E.164 format where available) |
| `city` | City (sparse — only 23 records have this) |
| `state` | State |
| `total_visits` | Combined visit count across all Square records |
| `total_spent` | Combined lifetime spend in USD |
| `last_visit` | Most recent visit date |
| `status` | Email subscription status: `subscribed`, `unknown`, or blank |

### Filtering Already Done
- ❌ Bounced emails removed
- ❌ Unsubscribed contacts removed
- ❌ Invalid emails removed (`.com.com`, missing `@`)
- ❌ Duplicate emails merged (kept best record, summed spend/visits)

---

## How To Send a Campaign

### Step 1: Load the list
```javascript
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const csv = readFileSync('./marketing/bachata-promotion/mailing-list.csv', 'utf-8');
const contacts = parse(csv, { columns: true, skip_empty_lines: true });
```

### Step 2: Match with active event
```javascript
import { readFileSync } from 'fs';
import { readdirSync } from 'fs';

// Check for active events
const eventDirs = readdirSync('./events');
for (const dir of eventDirs) {
  const config = JSON.parse(readFileSync(`./events/${dir}/config.json`, 'utf-8'));
  // Use config.event.name, config.event.date, config.post.text, etc.
}
```

### Step 3: Generate email content
Use the existing outreach pattern from `ghostai-lead-hunter/src/outreach.js` — call Grok API with the event details + contact name for personalization.

### Step 4: Send via Resend or Postmark
Use the transactional email service configured in the `.env`. Recommended: **Resend** (already in the stack).

---

## Segmentation Guide

When building campaigns, segment the list by engagement level:

| Segment | Filter | Use For |
|---------|--------|---------|
| **VIP** | `total_spent > 200 OR total_visits > 10` | Early access, free entry, special offers |
| **Regulars** | `total_visits >= 3 AND total_visits <= 10` | Standard event promos, loyalty perks |
| **One-timers** | `total_visits <= 2` | Re-engagement, "we miss you" campaigns |
| **Recent** | `last_visit` within 90 days | Hot leads — most likely to attend |
| **Dormant** | `last_visit` older than 6 months | Win-back campaigns with strong offer |
| **Has Phone** | `phone` is not empty | SMS blast candidates (431 contacts) |

---

## Coordination With Other Bots

### Social Posts (ghostai-x-bot)
When an email blast goes out, a matching social post should go out on the same day. Check `events/{event}/config.json` for the pre-written `post.text` and `post.textShort`.

### Event Config Pattern
Every event should have a folder in `events/` with:
```
events/
  {event-slug}/
    config.json    ← event details, post copy, FB groups
    flyer.jpg      ← event flyer image
```

The `config.json` schema matches the existing `bachata-pool-party/config.json`.

---

## Email Rules

1. **Always include an unsubscribe link** — system must append one
2. **Max 2 emails per event** — one announcement, one reminder (day before)
3. **Never email more than once per week** to this list
4. **Personalize with first_name** when available
5. **Include the event flyer** as an embedded image when possible
6. **Track opens/clicks** if the email service supports it
7. **From address:** Use Daniel Sensual brand email, not Ghost AI
