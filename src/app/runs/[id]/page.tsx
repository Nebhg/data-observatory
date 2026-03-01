"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, RunDetail } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  Card,
  StatusBadge,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, error, loading } = usePolling<RunDetail>(
    useCallback(() => api.getRun(id), [id]),
    0 // no polling for static log
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;

  const { parsed } = data;
  const totalRecords = parsed.total_records;
  const status =
    parsed.errors.length > 0
      ? "failed"
      : totalRecords > 0
      ? "success"
      : "unknown";

  return (
    <div>
      <PageHeader
        title={`Run ${id}`}
        subtitle={new Date(data.timestamp).toLocaleString()}
        action={
          <Button variant="secondary" onClick={() => router.back()}>
            ← Back
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Status</p>
          <div className="mt-1">
            <StatusBadge status={status} />
          </div>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Tables</p>
          <p className="text-xl font-bold mt-1">{parsed.tables.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Records</p>
          <p className="text-xl font-bold mt-1">
            {totalRecords.toLocaleString()}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Errors</p>
          <p
            className={`text-xl font-bold mt-1 ${
              parsed.errors.length > 0 ? "text-red-400" : ""
            }`}
          >
            {parsed.errors.length}
          </p>
        </Card>
      </div>

      {/* Record counts */}
      {Object.keys(parsed.record_counts).length > 0 && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-2">Records per Table</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {Object.entries(parsed.record_counts).map(([table, count]) => (
              <div
                key={table}
                className="flex justify-between text-xs py-1 px-2 rounded hover:bg-[var(--bg-card-hover)]"
              >
                <span className="font-mono truncate mr-2">{table}</span>
                <span className="font-mono text-[var(--text-muted)]">
                  {count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Errors */}
      {parsed.errors.length > 0 && (
        <Card className="mb-4 border-red-500/30">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Errors</h3>
          <div className="space-y-1">
            {parsed.errors.map((err, i) => (
              <pre
                key={i}
                className="text-xs text-red-300 bg-red-500/5 rounded p-2 overflow-auto"
              >
                {err}
              </pre>
            ))}
          </div>
        </Card>
      )}

      {/* Full log */}
      <Card>
        <h3 className="text-sm font-semibold mb-2">Full Log</h3>
        <pre className="text-xs font-mono text-[var(--text-muted)] overflow-auto max-h-96 whitespace-pre-wrap">
          {data.content}
        </pre>
      </Card>
    </div>
  );
}
