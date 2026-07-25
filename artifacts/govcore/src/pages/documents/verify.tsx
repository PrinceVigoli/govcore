import { useRoute } from 'wouter';
import { useVerifyDocument, getVerifyDocumentQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Public verification page (Book 09 §10). Deliberately shows only issuance
 * metadata — never the document body — because anyone holding a QR code can
 * reach it. What it proves is that a document with this UUID was issued, is
 * still valid, and who signed it.
 */
export default function DocumentVerify() {
  const [, params] = useRoute('/verify/:uuid');
  const uuid = params?.uuid ?? '';

  const { data, isLoading } = useVerifyDocument(uuid, {
    query: { enabled: !!uuid, queryKey: getVerifyDocumentQueryKey(uuid) },
  });

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-6">
      <div className="w-full max-w-lg space-y-6 pt-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Document verification</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono break-all">{uuid}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Could not check this document</CardTitle>
              <CardDescription>Try again, or contact the issuing office.</CardDescription>
            </CardHeader>
          </Card>
        ) : data.valid && data.document ? (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2 text-primary" />
                This document was issued
              </CardTitle>
              <CardDescription>The details below match the issuing office's records.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Title</dt>
                  <dd className="text-sm">{data.document.title}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reference</dt>
                  <dd className="text-sm font-mono">{data.document.referenceNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Type</dt>
                  <dd className="text-sm">{data.document.documentType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd><Badge variant="default">{data.document.status}</Badge></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Issued</dt>
                  <dd className="text-sm">{data.document.issuedAt ? format(new Date(data.document.issuedAt), 'PPp') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Version</dt>
                  <dd className="text-sm">v{data.document.version}</dd>
                </div>
              </dl>

              {data.signatures && data.signatures.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-2">Signed by</p>
                  <div className="space-y-2">
                    {data.signatures.map((s, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{s.signerName}</span>
                        {s.signerRole && <span className="text-muted-foreground"> · {s.signerRole}</span>}
                        {s.signedAt && <span className="text-xs text-muted-foreground block">{format(new Date(s.signedAt), 'PPp')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <ShieldX className="h-5 w-5 mr-2 text-destructive" />
                This document could not be verified
              </CardTitle>
              <CardDescription>{data.reason ?? 'No matching record was found.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If you were given this document by an office, contact them directly to confirm it.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
