import { FileText, FileImage, FileSpreadsheet, FileArchive, File } from 'lucide-react';
import type { AttachmentSummary } from '@/lib/types';

function renderAttachmentIcon(mime: string) {
  const className = 'h-3 w-3 flex-shrink-0';
  const strokeWidth = 1.8;

  if (mime.startsWith('image/')) return <FileImage className={className} strokeWidth={strokeWidth} />;
  if (mime === 'application/pdf') return <FileText className={className} strokeWidth={strokeWidth} />;
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    mime.includes('rar') ||
    mime.includes('7z')
  ) {
    return <FileArchive className={className} strokeWidth={strokeWidth} />;
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return <FileSpreadsheet className={className} strokeWidth={strokeWidth} />;
  }
  return <File className={className} strokeWidth={strokeWidth} />;
}

export function AttachmentChip({ attachment }: { attachment: AttachmentSummary }) {
  return (
    <span
      className="inline-flex max-w-[9rem] flex-shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
      title={attachment.filename}
    >
      {renderAttachmentIcon(attachment.mime)}
      <span className="truncate">{attachment.filename}</span>
    </span>
  );
}
