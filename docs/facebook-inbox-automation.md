# Facebook Inbox Automation (Bachata Exotica)

## Quick commands

```bash
cd /Users/danielcastillo/Projects/Websites/Bots/ghostai-x-bot

# 1) Context-only read (no sends)
npm run facebook:context -- --page-id=266552527115323 --limit=5

# 2) Dry run auto-responder (classifies + drafts, no sends)
npm run facebook:respond -- --mode=dry --page-id=266552527115323 --profile=bachata_exotica --limit=5

# 3) Live canary (send at most 1 reply)
npm run facebook:respond -- --mode=live --page-id=266552527115323 --profile=bachata_exotica --limit=1
```

## Manual smoke-check procedure

1. Run context-only command and confirm classification output includes expected categories.
2. Run dry-run responder and verify only inquiry threads are `dry_run` eligible.
3. Run live canary with `--limit=1`.
4. Verify one `sent` action in:
   - `logs/facebook-responses/bachata-exotica/<YYYY-MM-DD>.json`
5. Monitor logs for 72 hours and check for false positives, send failures, or missed genuine inquiries.
