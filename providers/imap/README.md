# IMAP Provider Implementation Guide

This directory is for implementing a real IMAP/SMTP mail provider.

## Implementation Steps

1. Install IMAP/SMTP libraries:
   ```bash
   npm install imap nodemailer
   npm install --save-dev @types/imap
   ```

2. Store credentials securely:
   - Use environment variables for connection details
   - Consider encrypting credentials in database
   - Never log credentials

3. Implement the MailProvider interface:
   - Map IMAP folders to Folder type
   - Map IMAP messages to MessageDetail/MessageListItem
   - Handle IMAP UIDs and sequence numbers
   - Implement pagination using IMAP FETCH with ranges

4. SMTP for sending:
   - Use nodemailer for sending emails
   - Handle attachments properly
   - Support HTML and plain text

5. Realtime updates:
   - Use IMAP IDLE command for real-time notifications
   - Map IMAP events to provider events

6. Error handling:
   - Handle connection errors
   - Retry logic for transient failures
   - Proper error messages

## Example Structure

```typescript
import Imap from 'imap';
import { MailProvider } from '../mail-provider';

export class ImapMailProvider implements MailProvider {
  private imap: Imap;
  
  constructor(config: { host: string; user: string; password: string }) {
    this.imap = new Imap(config);
  }
  
  // Implement all MailProvider methods
}
```
