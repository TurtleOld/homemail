# Auto-Sort Filter Guide

## Overview

The auto-sort filter system has been fixed to address two main issues:

1. **Background Processing**: Auto-sort rules now work even when the client is closed
2. **Body Matching**: Improved reliability when matching text in email bodies (e.g., `body:HomeNAS`)

## What Was Fixed

### 1. Background Processing

**Problem**: Auto-sort rules only triggered when the SSE (Server-Sent Events) connection was active in the browser. When you closed the client, new emails wouldn't be sorted.

**Solution**: Created a standalone script (`scripts/process-auto-sort-rules.ts`) that can be run independently to process auto-sort rules in the background. This script:

- Loads all enabled auto-sort rules from `data/filter-rules.json`
- Checks recent messages (last 7 days) in Inbox and Spam folders
- Applies matching rules to sort emails
- Tracks processed messages to avoid re-processing
- Handles errors gracefully with retry logic

### 2. Body Matching Improvements

**Problem**: Body matching conditions (like `body:HomeNAS`) were unreliable because:

- Only 50ms delay before fetching full message (too short)
- Failed message fetches would immediately return `false`
- HTML body content wasn't properly extracted
- No retry mechanism for failed fetches

**Solution**: Enhanced the filter matching logic in `lib/apply-auto-sort-rules.ts`:

- **Retry Logic**: Up to 3 retries with exponential backoff (200ms, 400ms, 800ms)
- **HTML Processing**: Strips HTML tags from HTML bodies to extract plain text
- **Better Fallback**: Uses snippet if full message body is unavailable
- **Detailed Logging**: Extensive console logs for debugging filter matches
- **Graceful Degradation**: Continues processing even if some parts fail

## How to Use

### Manual Trigger (via API)

You can manually trigger auto-sort processing through the web interface:

```bash
POST /api/mail/filters/rules/auto-sort/run
```

This will:
1. Load all enabled auto-sort rules
2. Process recent messages (last 7 days)
3. Apply matching rules
4. Return success status

### Manual Trigger (via CLI)

Run the auto-sort script directly from the command line:

```bash
npm run auto-sort
```

This is useful for:
- Testing your auto-sort rules
- Manually processing emails after creating new rules
- Debugging filter issues

### Automated Processing (Recommended)

For production use, set up a cron job or scheduled task to run auto-sort automatically.

#### Linux/macOS (Cron)

Add to crontab (`crontab -e`):

```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/homemail && npm run auto-sort >> /var/log/homemail-autosort.log 2>&1

# Run every 15 minutes
*/15 * * * * cd /path/to/homemail && npm run auto-sort >> /var/log/homemail-autosort.log 2>&1

# Run every hour
0 * * * * cd /path/to/homemail && npm run auto-sort >> /var/log/homemail-autosort.log 2>&1
```

#### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create a new task:
   - Trigger: "At 5 minute intervals" (or your preferred frequency)
   - Action: Start a program
     - Program: `node`
     - Arguments: `"C:\Users\alpav\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js" run auto-sort`
     - Start in: `c:\Users\alpav\PycharmProjects\homemail`

#### Docker

**Important**: The auto-sort script is now automatically integrated into Docker! When you start the containers using Docker Compose, the auto-sort script will run automatically before the web server starts.

Both `docker-compose.yml` and `docker-compose.production.yml` already include the auto-sort command:

```yaml
services:
  webmail:
    # ... existing config ...
    command: >
      sh -c "npm run auto-sort && npm start"
```

This means:
- Auto-sort runs automatically on container startup
- Emails will be processed even without a cron job
- Perfect for production deployments

**Note**: This runs auto-sort only once at startup. For continuous processing, you still need a cron job or the separate service approach.

For continuous processing in Docker, you can run a separate service:

```yaml
services:
  auto-sort:
    build: .
    volumes:
      - ./data:/app/data
    command: npm run auto-sort
    restart: always
```

## Testing Your Filters

### 1. Create a Test Rule

Create an auto-sort rule with a body condition:

```json
{
  "name": "Test HomeNAS Filter",
  "enabled": true,
  "conditions": {
    "logic": "AND",
    "conditions": [
      {
        "field": "body",
        "operator": "contains",
        "value": "HomeNAS"
      }
    ]
  },
  "actions": [
    {
      "type": "moveToFolder",
      "folderId": "your-folder-id"
    }
  ]
}
```

### 2. Run Auto-Sort

```bash
npm run auto-sort
```

### 3. Check Logs

Look for detailed output:

```
[auto-sort] Starting auto-sort rules processing
[auto-sort] Processing account your-account-id
[auto-sort] No enabled rules for account your-account-id
[apply-auto-sort-rules] Starting rule check: { ruleName: 'Test HomeNAS Filter', ... }
[apply-auto-sort-rules] Body check: { hasBody: true, hasText: false, hasHtml: true, ... }
[apply-auto-sort-rules] Rule check result: { ruleName: 'Test HomeNAS Filter', matches: true }
[auto-sort] Message message-id matches rule "Test HomeNAS Filter"
```

## Troubleshooting

### Filter Not Matching

**Problem**: A rule with `body:HomeNAS` isn't matching emails containing "HomeNAS"

**Solutions**:

1. **Check Logs**: Look for the body check output:
   ```
   [apply-auto-sort-rules] Body check: { ... }
   ```
   This shows what text was extracted and whether it matched.

2. **Verify Text Extraction**: Check if the email body is being read:
   - `hasText`: true if plain text body exists
   - `hasHtml`: true if HTML body exists
   - `extractedLength`: length of extracted text

3. **HTML Stripping**: If the email is HTML only, ensure the stripping logic works:
   - HTML tags are removed
   - `<style>` and `<script>` tags are removed
   - Multiple spaces are collapsed

4. **Case Sensitivity**: Matching is case-insensitive, so "homenas" will match "HomeNAS"

### Too Many Requests Errors

**Problem**: Getting "Too Many Requests" errors from the email provider

**Solution**: The system now handles rate limits with:
- Retry logic with exponential backoff
- Longer delays (2 seconds) on rate limit errors
- Graceful degradation on failures

### Duplicate Processing

**Problem**: Messages are being processed multiple times

**Solution**: The system now:
- Tracks processed messages in `data/autoSortProcessedMessages.json`
- Skips already processed messages
- Cleans up old entries (older than 30 days)
- Limits to 10,000 most recent processed messages

### Performance Issues

**Problem**: Auto-sort is taking too long

**Solutions**:

1. **Reduce Frequency**: Run auto-sort less frequently (e.g., every 15-30 minutes instead of every 5)
2. **Limit Messages**: The script only processes last 7 days, 100 messages per folder
3. **Optimize Rules**: Reduce the number of enabled rules or make conditions more specific

## Advanced Configuration

### Custom Time Range

Edit `scripts/process-auto-sort-rules.ts` to change the time range:

```typescript
// Change from 7 days to 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

if (messageDate < thirtyDaysAgo) {
  continue;
}
```

### Process Additional Folders

Edit the folder filter to include more folders:

```typescript
const foldersToCheck = folders.filter((f: Folder) => 
  f.role === 'inbox' || 
  f.role === 'spam' ||
  f.role === 'drafts' || // Add drafts
  f.name.toLowerCase().includes('important') // Or custom folder names
);
```

### Adjust Message Limits

Change how many messages are checked per folder:

```typescript
const messages = await provider.listMessages(accountId, folder.id, {
  limit: 200, // Increase from 100
  sortOrder: 'desc',
});
```

## Monitoring

### Log Files

Keep logs for debugging:

```bash
# Linux/macOS
tail -f /var/log/homemail-autosort.log

# Windows (PowerShell)
Get-Content C:\path\to\log.txt -Wait
```

### Success Metrics

Watch for these log messages:

```
[auto-sort] Folder inbox: processed 50 messages, matched 3
[auto-sort] Folder spam: processed 20 messages, matched 1
[auto-sort] Auto-sort rules processing completed
```

## Best Practices

1. **Test First**: Always test new rules manually before enabling auto-processing
2. **Start Small**: Begin with simple rules and a single folder
3. **Monitor Logs**: Check logs regularly to ensure rules are working as expected
4. **Backup**: Keep backups of your `data/filter-rules.json` file
5. **Gradual Rollout**: Start with less frequent runs (hourly) and increase if needed
6. **Specific Conditions**: Use specific conditions to avoid false positives

## Support

If you encounter issues:

1. Check the logs for detailed error messages
2. Verify your filter rules in the UI
3. Test with `npm run auto-sort` manually
4. Review the body check output to see what text is being matched
5. Ensure the email provider credentials are valid

## Future Enhancements

Potential improvements for the auto-sort system:

- Web UI for viewing filter match history
- Real-time filter statistics dashboard
- Filter rule templates library
- A/B testing for filter rules
- Machine learning for automatic rule suggestions
- Integration with external spam filtering services