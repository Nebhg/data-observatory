"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

export default function SourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, error, loading } = usePolling(
    useCallback(() => api.getSource(id), [id]),
    60_000
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;

  const config = data.config as Record<string, unknown> | undefined;
  const metadata = (data.metadata as Array<Record<string, unknown>>) || [];
  const bronze = (data.bronze as Array<Record<string, unknown>>) || [];

  return (
    <div>
      <PageHeader
        title={String(data.source_name || id)}
        subtitle={`Config: ${data.file || id}`}
        action={
          <Button variant="secondary" onClick={() => router.back()}>
            ← Back
          </Button>
        }
      />

      {/* Config summary */}
      {config && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-2">Configuration</h3>
          <pre className="text-xs font-mono text-[var(--text-muted)] overflow-auto max-h-48">
            {JSON.stringify(config, null, 2)}
          </pre>
        </Card>
      )}

      {/* Metadata entries */}
      {metadata.length > 0 && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-2">
            Metadata ({metadata.length} entries)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="py-2 px-2">Dataset</th>
                  <th className="py-2 px-2">Series</th>
                  <th className="py-2 px-2">Country</th>
                  <th className="py-2 px-2">Frequency</th>
                  <th className="py-2 px-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {metadata.map((m, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-2 font-mono">
                      {String(m.dataset_name || "—")}
                    </td>
                    <td className="py-1.5 px-2">{String(m.series || "—")}</td>
                    <td className="py-1.5 px-2">{String(m.country || "—")}</td>
                    <td className="py-1.5 px-2">{String(m.frequency || "—")}</td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">
                      {m.updated_at
                        ? new Date(String(m.updated_at)).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Bronze cache entries */}
      {bronze.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-2">
            Bronze Cache ({bronze.length} entries)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="py-2 px-2">Dataset</th>
                  <th className="py-2 px-2">Adapter</th>
                  <th className="py-2 px-2">Fetched</th>
                  <th className="py-2 px-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {bronze.map((b, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-2 font-mono">
                      {String(b.dataset_id || "—")}
                    </td>
                    <td className="py-1.5 px-2">{String(b.adapter || "—")}</td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">
                      {b.fetched_at
                        ? new Date(String(b.fetched_at)).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {b.response_bytes
                        ? `${(Number(b.response_bytes) / 1024).toFixed(1)} KB`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
