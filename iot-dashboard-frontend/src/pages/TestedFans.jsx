import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const PAGE_SIZE = 20;

export default function TestedFans() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecords() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_URL}/api/tested-fans?page=${page}&limit=${PAGE_SIZE}`,
          { signal: controller.signal },
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load tested fans");
        }

        setRecords(data.records || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 0);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Failed to load tested fans");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadRecords();
    return () => controller.abort();
  }, [page, refreshKey]);

  const getReportName = (reportPath) =>
    String(reportPath || "").split(/[\\/]/).pop() || "—";

  return (
    <main className="min-h-screen px-4 py-6 bg-slate-950 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/")}
              aria-label="Back to dashboard"
              className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Tested Fans</h1>
              <p className="text-xs text-slate-400">
                Fan tray test history stored in the database
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        <section className="overflow-hidden border rounded-xl border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium">Test records</h2>
            <span className="text-xs text-slate-400">{total} total</span>
          </div>

          {error ? (
            <div className="p-6 text-sm text-red-400">{error}</div>
          ) : loading ? (
            <div className="p-6 text-sm text-slate-400">Loading fan test records...</div>
          ) : records.length === 0 ? (
            <div className="p-6 text-sm text-slate-400">
              No fan test records have been saved yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fan Tray No.</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Fans Passed</th>
                    <th className="px-4 py-3 font-medium">Report No.</th>
                    <th className="px-4 py-3 font-medium">Report</th>
                    <th className="px-4 py-3 font-medium">Tested By</th>
                    <th className="px-4 py-3 font-medium">Tested At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {records.map((record) => (
                    <tr key={record._id} className="text-slate-300">
                      <td className="px-4 py-3 font-medium text-white">
                        {record.fanTrayNo}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            record.status === "Passed"
                              ? "rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-400"
                              : "rounded-full bg-red-500/10 px-2 py-1 text-red-400"
                          }
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {record.summary?.passed ?? 0}/{record.summary?.total ?? 0}
                      </td>
                      <td className="px-4 py-3">{record.reportNo || "—"}</td>
                      <td className="max-w-[220px] truncate px-4 py-3" title={record.reportPath}>
                        {getReportName(record.reportPath)}
                      </td>
                      <td className="px-4 py-3">{record.testedBy || "ATS Operator"}</td>
                      <td className="px-4 py-3">
                        {record.testedAt
                          ? new Date(record.testedAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalPages > 1 && (
            <footer className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="border-slate-700 bg-slate-900 text-slate-300"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="border-slate-700 bg-slate-900 text-slate-300"
                >
                  Next
                </Button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </main>
  );
}
