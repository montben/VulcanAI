import React, { useState, useRef, useEffect } from "react";
import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sun,
  Moon,
  ArrowLeft,
  Plus,
  FileText,
  ChevronLeft,
  ChevronRight,
  Camera,
  CheckCircle2,
  Calendar,
  Clock,
  Download,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, BACKEND_URL } from "@/lib/queryClient";

/* ─── Types ─── */
interface ProjectOut {
  id: string;
  name: string;
  client: string | null;
  start_date: string | null;
  status: string;
  members: { id: string; name: string; role: string }[];
}

interface ReportOut {
  id: string;
  report_date: string;
  status: string;
  photo_count: number;
  has_generated_report: boolean;
  updated_at: string | null;
}

/* ─── Date helpers ─── */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFullDate(d: Date) {
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${dayName}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function generateDateRange(startStr: string | null): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from project start date, or 30 days ago if not set
  const start = startStr ? new Date(startStr + "T00:00:00") : new Date(today.getTime() - 30 * 86400000);
  start.setHours(0, 0, 0, 0);

  // End: today + 14 days
  const end = new Date(today.getTime() + 14 * 86400000);

  const dates: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/* ─── Navbar ─── */
function Navbar() {
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm" data-testid="navbar">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5" data-testid="logo">
          <VulcanLogo size={24} className="text-primary" />
          <span className="font-display text-base font-bold tracking-tight">
            Vulcan<span className="ml-1 text-xs font-medium text-muted-foreground">AI</span>
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle" aria-label="Toggle dark mode" className="h-9 w-9">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </nav>
  );
}

/* ─── Timeline date cell ─── */
const DateCell = React.forwardRef<HTMLButtonElement, {
  date: Date;
  isSelected: boolean;
  hasReport: boolean;
  isToday: boolean;
  isWeekend: boolean;
  onClick: () => void;
}>(function DateCell({ date, isSelected, hasReport, isToday, isWeekend, onClick }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-md px-3 py-2.5 transition-all duration-150 shrink-0 min-w-[60px] ${
        isSelected ? "bg-primary text-primary-foreground shadow-sm"
        : isWeekend ? "text-muted-foreground/60 hover:bg-muted/50"
        : "hover:bg-muted"
      }`}
      data-testid={`date-cell-${dateKey(date)}`}
    >
      <span className={`text-[11px] font-medium ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {DAY_NAMES[date.getDay()]}
      </span>
      <span className="text-lg font-semibold tabular-nums">{date.getDate()}</span>
      <div className="flex h-2 items-center justify-center">
        {hasReport && !isSelected && (
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "hsl(var(--success))" }} />
        )}
        {isToday && !isSelected && !hasReport && (
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </div>
    </button>
  );
});

/* ─── Report card ─── */
function ReportCard({ report, projectId, onDelete }: { report: ReportOut; projectId: string; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submittedAt = report.updated_at
    ? new Date(report.updated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="rounded-md border bg-card p-5 space-y-4" data-testid="report-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Daily Report</h3>
          {submittedAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Submitted at {submittedAt}
            </p>
          )}
        </div>
        <Badge
          className="shrink-0 gap-1 text-xs font-medium"
          style={{ backgroundColor: "hsl(var(--success) / 0.1)", color: "hsl(var(--success))", borderColor: "transparent" }}
          data-testid="badge-report-status"
        >
          <CheckCircle2 className="h-3 w-3" />
          {report.status === "complete" ? "Complete" : report.status}
        </Badge>
      </div>

      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          {report.photo_count} photo{report.photo_count !== 1 ? "s" : ""}
        </span>
      </div>

      {report.has_generated_report && (
        <div className="rounded-md overflow-hidden border" data-testid="pdf-viewer">
          <iframe
            src={`${BACKEND_URL}/api/projects/${projectId}/reports/${report.id}/pdf#toolbar=0&navpanes=0&view=FitH`}
            className="w-full"
            style={{ height: "600px" }}
            title="Daily Report PDF"
          />
        </div>
      )}

      <div className="flex gap-2 justify-between items-center">
        <div className="flex gap-2">
          {report.has_generated_report && (
            <Button size="sm" variant="outline" className="gap-1.5" asChild data-testid="button-download-pdf">
              <a href={`${BACKEND_URL}/api/projects/${projectId}/reports/${report.id}/pdf`} download>
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {confirmDelete ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={onDelete}>Confirm Delete</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-report">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyDay({ isFuture, projectId }: { date: Date; isFuture: boolean; projectId: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border bg-card py-12 px-6 text-center" data-testid="empty-day">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {isFuture ? <Calendar className="h-5 w-5 text-muted-foreground" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div>
        <p className="text-sm font-medium">{isFuture ? "Upcoming" : "No report for this day"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isFuture ? "This date hasn't arrived yet." : "Create a report to document what happened on site."}
        </p>
      </div>
      {!isFuture && (
        <Link href={`/project/${projectId}/report/new`}>
          <Button className="gap-1.5" data-testid="button-create-report">
            <Plus className="h-4 w-4" />
            Create Report
          </Button>
        </Link>
      )}
    </div>
  );
}

/* ─── Project Page ─── */
export default function Project() {
  const { id: projectId = "" } = useParams<{ id: string }>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);

  const { data: project, isLoading: loadingProject } = useQuery<ProjectOut>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: !!projectId,
  });

  const { data: reports = [] } = useQuery<ReportOut[]>({
    queryKey: [`/api/projects/${projectId}/reports`],
    enabled: !!projectId,
    staleTime: 0,
  });

  const qc = useQueryClient();
  const deleteReport = useMutation({
    mutationFn: (reportId: string) =>
      apiRequest("DELETE", `/api/projects/${projectId}/reports/${reportId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/projects/${projectId}/reports`] }),
  });

  // Build date range from project start → today + 14 days
  const allDates = generateDateRange(project?.start_date ?? null);

  // Index reports by date key for O(1) lookup
  const reportsByDate = Object.fromEntries(reports.map((r) => [r.report_date, r]));

  // Default selected date to today (or last date in range)
  const todayIdx = allDates.findIndex((d) => dateKey(d) === todayKey);
  const initialIdx = todayIdx >= 0 ? todayIdx : allDates.length - 1;
  const [selectedIdx, setSelectedIdx] = useState(initialIdx);

  // Re-sync when dates load
  useEffect(() => {
    const idx = allDates.findIndex((d) => dateKey(d) === todayKey);
    if (idx >= 0) setSelectedIdx(idx);
  }, [allDates.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const el = cellRefs.current[selectedIdx];
    if (!el) return;
    const doScroll = () => {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: isFirstRender.current ? "instant" : "smooth" });
      isFirstRender.current = false;
    };
    isFirstRender.current ? requestAnimationFrame(() => requestAnimationFrame(doScroll)) : doScroll();
  }, [selectedIdx]);

  const scrollTimeline = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  const selectedDate = allDates[selectedIdx] ?? today;
  const selectedKey = dateKey(selectedDate);
  const report = reportsByDate[selectedKey];
  const isToday = selectedKey === todayKey;
  const isFuture = selectedKey > todayKey;

  const startDate = project?.start_date ? new Date(project.start_date + "T00:00:00") : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Back + project name */}
        <div className="mb-6">
          <Link href="/">
            <button className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              {loadingProject ? (
                <>
                  <Skeleton className="h-6 w-48 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </>
              ) : (
                <>
                  <h1 className="font-display text-xl font-bold tracking-tight" data-testid="heading-project-name">
                    {project?.name ?? "Project"}
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {project?.client && <>{project.client} &middot; </>}
                    {reports.length} report{reports.length !== 1 ? "s" : ""}
                    {startDate && <> &middot; Started {MONTH_NAMES[startDate.getMonth()]} {startDate.getDate()}, {startDate.getFullYear()}</>}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-6 rounded-md border bg-card p-3" data-testid="timeline-container">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">
              {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollTimeline("left")} data-testid="button-scroll-left">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollTimeline("right")} data-testid="button-scroll-right">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }} data-testid="timeline-scroll">
            <div className="shrink-0" style={{ width: "calc(50% - 30px)" }} />
            {allDates.map((d, idx) => {
              const key = dateKey(d);
              return (
                <DateCell
                  key={key}
                  ref={(el) => { cellRefs.current[idx] = el; }}
                  date={d}
                  isSelected={idx === selectedIdx}
                  hasReport={!!reportsByDate[key]}
                  isToday={key === todayKey}
                  isWeekend={d.getDay() === 0 || d.getDay() === 6}
                  onClick={() => setSelectedIdx(idx)}
                />
              );
            })}
            <div className="shrink-0" style={{ width: "calc(50% - 30px)" }} />
          </div>

          <div className="mt-2 flex items-center gap-4 px-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "hsl(var(--success))" }} />
              Complete
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              To Do
            </span>
          </div>
        </div>

        {/* Selected date heading */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold" data-testid="heading-selected-date">
            {formatFullDate(selectedDate)}
            {isToday && <span className="ml-2 text-xs font-normal text-muted-foreground">(Today)</span>}
          </h2>
        </div>

        {report ? (
          <ReportCard report={report} projectId={projectId} onDelete={() => deleteReport.mutate(report.id)} />
        ) : (
          <EmptyDay date={selectedDate} isFuture={isFuture} projectId={projectId} />
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
