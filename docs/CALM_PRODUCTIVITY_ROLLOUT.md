# Calm Productivity Rollout

## Environment values

### Production

```env
NEXT_PUBLIC_MAIL_DESIGN=legacy
```

### Staging / internal preview

```env
NEXT_PUBLIC_MAIL_DESIGN=calm-productivity
```

## Rollout plan

1. Deploy to staging with `NEXT_PUBLIC_MAIL_DESIGN=calm-productivity`.
2. Run visual smoke test for `Inbox`, `Thread`, `Compose`, empty states, search, filters, bulk actions.
3. Validate desktop widths: `1280`, `1440`, `1920`.
4. Validate mobile widths: `390`, `430`, `768`.
5. Validate real data states:
   - unread
   - selected
   - attachments
   - labels
   - long sender names
   - long subjects
   - HTML-heavy messages
6. Release to internal users.
7. Compare UX metrics before switching production default.

## Smoke checklist

- Sidebar opens, collapses, and folder selection remains readable.
- Search field, saved searches, and help dropdown render correctly.
- Quick filters and thread toggle keep spacing and hover states.
- Message list rows show correct unread, selected, hover, and action states.
- Viewer header, attachments, overflow menu, and reply actions remain aligned.
- Empty states do not collapse or look visually broken.
- Mobile list-to-thread transition works without clipped panels.
- Bulk action bar remains usable with multiple selections.

## Metrics to watch

- Time to first message open
- Reply action rate
- Archive/delete action rate
- Search usage rate
- UI error rate after rollout
- Support complaints related to navigation or readability

## Rollback

If any rollout issue appears, switch back to:

```env
NEXT_PUBLIC_MAIL_DESIGN=legacy
```

No data migration is required because the rollout is presentation-only.
