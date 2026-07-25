import { useRef, useState } from 'react';
import { useCreateAttachment } from '@workspace/api-client-react';
import { Upload, Loader2, FileCheck2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

/**
 * Uploads a file through the Document Engine (Book 09) and stores the returned
 * attachment UUID as the field's value.
 *
 * Before this existed, Book 07's file_upload / image / signature fields held a
 * bare storage string with nothing behind it — no size, no MIME type, no
 * uploader, no audit trail. The value is now a UUID resolving to a real
 * `attachments` row.
 *
 * Content is sent base64-encoded. That inflates the payload by ~33%, which is
 * why uploads are capped client-side: this deployment stores bytes inline in
 * Postgres, so a large file would be a genuine problem rather than just slow.
 */
const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File into base64 without the data-URI prefix the API doesn't want. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export interface UploadedFile {
  uuid: string;
  fileName: string;
  sizeBytes: number;
}

export function FileUploadField({
  value,
  onChange,
  tenantId,
  fieldKey,
  accept,
  disabled,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  tenantId: number;
  fieldKey: string;
  accept?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const createAttachment = useCreateAttachment();

  // The stored value is a UUID string; keep the friendly name alongside it for
  // display, since the value itself carries no filename.
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const currentUuid = typeof value === 'string' && value ? value : null;

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({
        title: 'File is too large',
        description: `${formatSize(file.size)} exceeds the ${formatSize(MAX_BYTES)} limit.`,
        variant: 'destructive',
      });
      return;
    }

    let content: string;
    try {
      content = await toBase64(file);
    } catch {
      toast({ title: 'Could not read that file', variant: 'destructive' });
      return;
    }

    createAttachment.mutate(
      {
        data: {
          tenantId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          content,
          attachedToType: 'form_submission',
          fieldKey,
        },
      },
      {
        onSuccess: (attachment) => {
          setUploaded({ uuid: attachment.uuid, fileName: attachment.fileName, sizeBytes: attachment.sizeBytes });
          onChange(attachment.uuid);
          toast({ title: 'File attached' });
        },
        onError: (err: { message?: string }) =>
          toast({ title: 'Upload failed', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const clear = () => {
    setUploaded(null);
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  if (currentUuid) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm truncate">{uploaded?.fileName ?? 'Attached file'}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {uploaded ? formatSize(uploaded.sizeBytes) + ' · ' : ''}{currentUuid.slice(0, 8)}…
            </p>
          </div>
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" onClick={clear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || createAttachment.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || createAttachment.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {createAttachment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Choose file
      </Button>
      <p className="text-xs text-muted-foreground">Up to {formatSize(MAX_BYTES)}.</p>
    </div>
  );
}

export function AttachmentBadge({ uuid }: { uuid: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-[10px]">
      {uuid.slice(0, 8)}…
    </Badge>
  );
}
