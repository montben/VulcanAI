import React, { useState, useRef, useEffect } from "react";
import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sun,
  Moon,
  ArrowLeft,
  Plus,
  FileText,
  ChevronLeft,
  ChevronRight,
  Camera,
  Clock,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Link, useParams } from "wouter";

/* ─── Generate dates from project start ─── */
function generateDates(startStr: string, count: number) {
  const dates: Date[] = [];
  const start = new Date(startStr);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatFullDate(d: Date) {
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${dayName}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ─── Mock data ─── */
interface DayReport {
  title: string;
  photoCount: number;
  crewSize: number;
  time: string;
}

// Simulate reports for some dates
const MOCK_REPORTS: Record<string, DayReport> = {
  "2026-03-05": {
    title: "Foundation pour — east wing",
    photoCount: 14,
    crewSize: 8,
    time: "4:32 PM",
  },
  "2026-03-06": {
    title: "Foundation curing & formwork removal",
    photoCount: 8,
    crewSize: 5,
    time: "3:15 PM",
  },
  "2026-03-07": {
    title: "Framing — first floor walls",
    photoCount: 22,
    crewSize: 10,
    time: "5:01 PM",
  },
  "2026-03-10": {
    title: "Framing — second floor joists",
    photoCount: 18,
    crewSize: 9,
    time: "4:48 PM",
  },
  "2026-03-11": {
    title: "Electrical rough-in started",
    photoCount: 11,
    crewSize: 7,
    time: "5:22 PM",
  },
  "2026-03-12": {
    title: "Plumbing rough-in & HVAC",
    photoCount: 15,
    crewSize: 8,
    time: "4:10 PM",
  },
  "2026-03-13": {
    title: "Framing inspection passed",
    photoCount: 9,
    crewSize: 6,
    time: "2:45 PM",
  },
  "2026-03-14": {
    title: "Exterior sheathing",
    photoCount: 20,
    crewSize: 10,
    time: "5:15 PM",
  },
  "2026-03-17": {
    title: "Window & door frames installed",
    photoCount: 16,
    crewSize: 7,
    time: "4:30 PM",
  },
  "2026-03-18": {
    title: "Roofing — trusses set",
    photoCount: 25,
    crewSize: 12,
    time: "5:45 PM",
  },
  "2026-03-19": {
    title: "Roofing — sheathing & felt paper",
    photoCount: 13,
    crewSize: 8,
    time: "3:50 PM",
  },
  "2026-03-20": {
    title: "Roofing — shingle install day 1",
    photoCount: 19,
    crewSize: 9,
    time: "4:55 PM",
  },
};

const PROJECT_START = "2026-03-04";
const ALL_DATES = generateDates(PROJECT_START, 30);

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
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          aria-label="Toggle dark mode"
          className="h-9 w-9"
        >
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
  report?: DayReport;
  isToday: boolean;
  isWeekend: boolean;
  onClick: () => void;
}>(function DateCell({
  date,
  isSelected,
  report,
  isToday,
  isWeekend,
  onClick,
}, ref) {
  const hasReport = !!report;

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-md px-3 py-2.5 transition-all duration-150 shrink-0 min-w-[60px] ${
        isSelected
          ? "bg-primary text-primary-foreground shadow-sm"
          : isWeekend
          ? "text-muted-foreground/60 hover:bg-muted/50"
          : "hover:bg-muted"
      }`}
      data-testid={`date-cell-${dateKey(date)}`}
    >
      <span className={`text-[11px] font-medium ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {DAY_NAMES[date.getDay()]}
      </span>
      <span className={`text-lg font-semibold tabular-nums`}>
        {date.getDate()}
      </span>
      {/* Status dot */}
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

/* ─── Report card (when a report exists for the selected date) ─── */
function ReportCard({ report }: { report: DayReport }) {
  return (
    <div className="rounded-md border bg-card p-5 space-y-4" data-testid="report-card">
      {/* Title + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{report.title}</h3>
          <p className="text-xs text-muted-foreground">
            Submitted at {report.time}
          </p>
        </div>
        <Badge
          className="shrink-0 gap-1 text-xs font-medium"
          style={{
            backgroundColor: "hsl(var(--success) / 0.1)",
            color: "hsl(var(--success))",
            borderColor: "transparent",
          }}
          data-testid="badge-report-status"
        >
          <CheckCircle2 className="h-3 w-3" />
          Complete
        </Badge>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          {report.photoCount} photos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{report.crewSize}</span> crew
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" data-testid="button-view-report">
          <FileText className="h-3.5 w-3.5" />
          View Report
        </Button>
      </div>
    </div>
  );
}

/* ─── Empty state (no report for selected date) ─── */
function EmptyDay({ date, isFuture, projectId }: { date: Date; isFuture: boolean; projectId: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border bg-card py-12 px-6 text-center" data-testid="empty-day">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {isFuture ? (
          <Calendar className="h-5 w-5 text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium">
          {isFuture ? "Upcoming" : "No report for this day"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isFuture
            ? "This date hasn't arrived yet."
            : "Create a report to document what happened on site."}
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

  // Find today's index in the dates array, or default to last date with a report
  const todayIdx = ALL_DATES.findIndex((d) => dateKey(d) === dateKey(today));
  const initialIdx = todayIdx >= 0 ? todayIdx : ALL_DATES.length - 1;

  const [selectedIdx, setSelectedIdx] = useState(initialIdx);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDate = ALL_DATES[selectedIdx];
  const selectedKey = dateKey(selectedDate);
  const report = MOCK_REPORTS[selectedKey];
  const todayKey = dateKey(today);
  const isToday = selectedKey === todayKey;
  const isFuture = selectedKey > todayKey;

  const isFirstRender = useRef(true);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll timeline to center the selected date
  useEffect(() => {
    const el = cellRefs.current[selectedIdx];
    if (!el) return;

    const doScroll = () => {
      el.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: isFirstRender.current ? "instant" : "smooth",
      });
      isFirstRender.current = false;
    };

    if (isFirstRender.current) {
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    } else {
      doScroll();
    }
  }, [selectedIdx]);

  const scrollTimeline = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -amount : amount,
        behavior: "smooth",
      });
    }
  };

  // Count reports
  const totalReports = Object.keys(MOCK_REPORTS).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Back + project name */}
        <div className="mb-6">
          <Link href="/">
            <button
              className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight" data-testid="heading-project-name">
                Smith Residence Remodel
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ABC Construction &middot; {totalReports} reports &middot; Started {MONTH_NAMES[new Date(PROJECT_START).getMonth()]} {new Date(PROJECT_START).getDate()}, {new Date(PROJECT_START).getFullYear()}
              </p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mb-6 rounded-md border bg-card p-3" data-testid="timeline-container">
          {/* Month label + arrows */}
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">
              {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => scrollTimeline("left")}
                data-testid="button-scroll-left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => scrollTimeline("right")}
                data-testid="button-scroll-right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable date strip */}
          <div
            ref={scrollRef}
            className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            data-testid="timeline-scroll"
          >
            {/* Spacer so first dates can be centered */}
            <div className="shrink-0" style={{ width: "calc(50% - 30px)" }} />
            {ALL_DATES.map((d, idx) => {
              const key = dateKey(d);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <DateCell
                  key={key}
                  ref={(el) => { cellRefs.current[idx] = el; }}
                  date={d}
                  isSelected={idx === selectedIdx}
                  report={MOCK_REPORTS[key]}
                  isToday={key === todayKey}
                  isWeekend={isWeekend}
                  onClick={() => setSelectedIdx(idx)}
                />
              );
            })}
            {/* Spacer so last dates can be centered */}
            <div className="shrink-0" style={{ width: "calc(50% - 30px)" }} />
          </div>

          {/* Legend */}
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
            {isToday && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(Today)</span>
            )}
          </h2>
        </div>

        {/* Content: report card or empty state */}
        {report ? (
          <ReportCard report={report} />
        ) : (
          <EmptyDay date={selectedDate} isFuture={isFuture} projectId={projectId} />
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
