"use client";

import { useState, useEffect, useCallback } from "react";
import { api, DbtResults, DbtEntry, DbtCommandResult } from "@/lib/api";
import {
  PageHeader,
  Card,
  MetricCard,
  StatusBadge,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

export default function DbtPage() {
  const [results, setResults] = useState<DbtResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Command execution state
  const [running, setRunning] = useState(false);
  const [commandOutput, setCommandOutput] = useState<DbtCommandResult | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const res = await api.getDbtResults();
      setResults(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dbt results");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const runCommand = async (cmd: "run" | "test") => {
    setRunning(true);
    setCommandOutput(null);
    setError(null);
    try {
      const res = await api.runDbt(cmd);
      setCommandOutput(res);
      // Reload results after command completes
      await loadResults();
    } catch (e: unknown) {
      setCommandOutput({
        command: cmd,
        returncode: -1,
        stdout: "",
        stderr: e instanceof Error ? e.message : "Failed to execute dbt command",
        success: false,
      });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="dbt Transforms"
        subtitle="Model runs, tests, and command output"
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => runCommand("run")}
              disabled={running}
            >
              {running ? "Running…" : "▶ dbt run"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runCommand("test")}
              disabled={running}
            >
              {running ? "Running…" : "✓ dbt test"}
            </Button>
          </div>
        }
      />

      {error && <ErrorMessage message={error} />}

      {/* Command Output Panel — always show when there's output */}
      {commandOutput && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span className="font-mono">dbt {commandOutput.command}</span>
              <StatusBadge
                status={commandOutput.success ? "pass" : "error"}
              />
              <span className="text-xs text-[var(--text-muted)] font-normal">
                exit code {commandOutput.returncode}
              </span>
            </h3>
          </div>

          {/* stdout */}
          {commandOutput.stdout && (
            <div className="mb-3">
              <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1">
                stdout
              </div>
              <pre className="bg-[var(--bg)] p-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {commandOutput.stdout}
              </pre>
            </div>
          )}

          {/* stderr */}
          {commandOutput.stderr && (
            <div>
              <div className="text-[10px] uppercase text-red-400 mb-1">
                stderr
              </div>
              <pre className="bg-red-950/30 border border-red-900/50 p-3 rounded text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap text-red-300 leading-relaxed">
                {commandOutput.stderr}
              </pre>
            </div>
          )}

          {/* No output at all */}
          {!commandOutput.stdout && !commandOutput.stderr && (
            <p className="text-xs text-[var(--text-muted)]">
              Command completed with no output.
            </p>
          )}
        </Card>
      )}

      {/* Last run summary */}
      {results?.has_results && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <MetricCard
              label="Total"
              value={results.summary.total || 0}
            />
            <MetricCard
              label="Pass"
              value={results.summary.pass || 0}
              status="healthy"
            />
            <MetricCard
              label="Error"
              value={results.summary.error || 0}
              status={results.summary.error ? "error" : "healthy"}
            />
            <MetricCard
              label="Fail"
              value={results.summary.fail || 0}
              status={results.summary.fail ? "error" : "healthy"}
            />
            <MetricCard
              label="Warn"
              value={results.summary.warn || 0}
              status={results.summary.warn ? "degraded" : "healthy"}
            />
            <MetricCard
              label="Skip"
              value={results.summary.skip || 0}
            />
          </div>

          {results.elapsed_time && (
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Last run: {results.elapsed_time.toFixed(2)}s
              {results.metadata?.generated_at && (
                <> · {new Date(results.metadata.generated_at).toLocaleString()}</>
              )}
            </p>
          )}

          {/* Models */}
          {results.models.length > 0 && (
            <Card className="mb-4">
              <h3 className="text-sm font-semibold mb-3">
                Models ({results.models.length})
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] uppercase border-b border-[var(--border)]">
                    <th className="py-1.5 px-2">Status</th>
                    <th className="py-1.5 px-2">Model</th>
                    <th className="py-1.5 px-2">Message</th>
                    <th className="py-1.5 px-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {results.models.map((m, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-card-hover)]">
                      <td className="py-1.5 px-2">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="py-1.5 px-2 font-mono">
                        {m.unique_id.replace("model.macro_data_pipeline.", "")}
                      </td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)]">
                        {m.message}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {m.execution_time?.toFixed(2)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Tests */}
          {results.tests.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-3">
                Tests ({results.tests.length})
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] uppercase border-b border-[var(--border)]">
                    <th className="py-1.5 px-2">Status</th>
                    <th className="py-1.5 px-2">Test</th>
                    <th className="py-1.5 px-2">Message</th>
                    <th className="py-1.5 px-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {results.tests.map((t, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-card-hover)]">
                      <td className="py-1.5 px-2">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="py-1.5 px-2 font-mono">
                        {t.unique_id.replace("test.macro_data_pipeline.", "")}
                      </td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)]">
                        {t.message}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {t.execution_time?.toFixed(2)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* No results yet */}
      {!results?.has_results && !commandOutput && (
        <Card>
          <div className="text-center py-8 text-[var(--text-muted)]">
            <p className="text-sm mb-2">No dbt results found</p>
            <p className="text-xs">
              Click &quot;dbt run&quot; to build models or &quot;dbt test&quot;
              to run tests.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
