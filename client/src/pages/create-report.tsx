import { useState, useCallback, useEffect, useRef } from "react";
import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Moon,
  ArrowLeft,
  Camera,
  X,
  ImagePlus,
  ArrowRight,
  Phone,
  PhoneOff,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type Step = "photos" | "call" | "generating" | "done";

/* ─── Navbar ─── */
function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm" data-testid="navbar">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2.5" data-testid="logo">
          <VulcanLogo size={24} className="text-primary" />
          <span className="font-display text-base font-bold tracking-tight">
            Vulcan<span className="ml-1 text-xs font-medium text-muted-foreground">AI</span>
          </span>
        </a>
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

/* ─── Photo type ─── */
interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/* ─── Voice call transcript data ─── */
const TRANSCRIPT = [
  {
    role: "ai" as const,
    text: "Hey, I'm looking at your 5 photos from today. Looks like framing work — can you tell me what got done?",
  },
  {
    role: "worker" as const,
    text: "Yeah, we finished the second floor wall framing today. Got all the exterior walls up.",
  },
  {
    role: "ai" as const,
    text: "Got it. How many guys on site today, and what trades?",
  },
  {
    role: "worker" as const,
    text: "Six total. Three framers, two electricians starting rough-in, and a plumber.",
  },
  {
    role: "ai" as const,
    text: "Any deliveries arrive today?",
  },
  {
    role: "worker" as const,
    text: "Lumber delivery came in around 10. We also got the electrical panels.",
  },
  {
    role: "ai" as const,
    text: "Any safety concerns or issues I should note?",
  },
  {
    role: "worker" as const,
    text: "The temp railing on the stairwell opening needs to be secured. I flagged it with the foreman.",
  },
  {
    role: "ai" as const,
    text: "Got it — I'll flag that in the report. Anything planned for tomorrow?",
  },
  {
    role: "worker" as const,
    text: "Roof trusses getting delivered in the morning. Crane should be here by 7.",
  },
  {
    role: "ai" as const,
    text: "Perfect. I have everything I need. Generating your report now.",
  },
];

/* ─── Photo thumbnail ─── */
function PhotoThumb({
  photo,
  onRemove,
  onCaptionChange,
}: {
  photo: PhotoEntry;
  onRemove: () => void;
  onCaptionChange: (caption: string) => void;
}) {
  return (
    <div className="group flex flex-col gap-1.5" data-testid={`photo-thumb-${photo.id}`}>
      <div className="relative aspect-square overflow-hidden rounded-md">
        <img
          src={photo.previewUrl}
          alt={photo.file.name}
          className="h-full w-full object-cover"
        />
        <button
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
          data-testid={`remove-photo-${photo.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
          <p className="truncate text-[11px] font-medium text-white">{photo.file.name}</p>
        </div>
      </div>
      <input
        type="text"
        placeholder="Add caption..."
        value={photo.caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none transition-colors"
        data-testid={`caption-${photo.id}`}
      />
    </div>
  );
}

/* ─── Step 1: Photos ─── */
function PhotosStep({
  photos,
  setPhotos,
  onNext,
  isUploading,
  uploadProgress,
  projectId,
}: {
  photos: PhotoEntry[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoEntry[]>>;
  onNext: () => void;
  isUploading: boolean;
  uploadProgress: string;
  projectId: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newPhotos: PhotoEntry[] = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .map((file) => ({
          id: generateId(),
          file,
          previewUrl: URL.createObjectURL(file),
          caption: "",
        }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    },
    [setPhotos]
  );

  const removePhoto = useCallback(
    (id: string) => {
      setPhotos((prev) => {
        const photo = prev.find((p) => p.id === id);
        if (photo) URL.revokeObjectURL(photo.previewUrl);
        return prev.filter((p) => p.id !== id);
      });
    },
    [setPhotos]
  );

  const updateCaption = useCallback(
    (id: string, caption: string) =>
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p))),
    [setPhotos]
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Jobsite Photos</h2>
          {photos.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </span>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          data-testid="file-input"
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={`group flex cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed px-6 py-10 transition-all duration-200 ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-card"
          }`}
          data-testid="upload-zone"
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              isDragging
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
            }`}
          >
            <ImagePlus className="h-5 w-5" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              {photos.length === 0 ? "Add jobsite photos" : "Add more photos"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Drag and drop images, or tap to select
            </p>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-grid">
            {photos.map((photo) => (
              <PhotoThumb
                key={photo.id}
                photo={photo}
                onRemove={() => removePhoto(photo.id)}
                onCaptionChange={(caption) => updateCaption(photo.id, caption)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <Link href={`/project/${projectId}`}>
          <Button variant="ghost" className="text-muted-foreground" disabled={isUploading} data-testid="button-cancel">
            Cancel
          </Button>
        </Link>
        <Button
          className="gap-2 px-6"
          disabled={photos.length === 0 || isUploading}
          onClick={onNext}
          data-testid="button-next"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {uploadProgress}
            </>
          ) : (
            <>
              Next
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </>
  );
}

/* ─── Step 2: Voice Call ─── */
function CallStep({ onFinish }: { onFinish: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [messages, setMessages] = useState<typeof TRANSCRIPT>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Progressive transcript
  useEffect(() => {
    const delays = [800, 3500, 6500, 9000, 12000, 14500, 17500, 20000, 23000, 25500, 28000];
    const timers = TRANSCRIPT.map((msg, i) =>
      setTimeout(() => {
        setMessages((prev) => [...prev, msg]);
      }, delays[i])
    );

    // After last message, finish
    const finishTimer = setTimeout(() => {
      onFinish();
    }, 30000);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  // Auto-scroll
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="step-enter flex flex-col items-center gap-6 pt-8 pb-8">
      {/* Pulsing animation */}
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring" />
        <div
          className="absolute inset-0 rounded-full bg-primary/5 animate-pulse-ring-slow"
          style={{ animationDelay: "0.5s" }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Phone className="h-6 w-6" />
        </div>
      </div>

      {/* Timer */}
      <div className="text-center">
        <p className="font-mono text-lg font-semibold tabular-nums" data-testid="text-call-timer">
          {formatTime(seconds)}
        </p>
        <p className="text-xs text-muted-foreground">Voice intake in progress</p>
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        className="w-full max-w-lg space-y-3 overflow-y-auto rounded-md border bg-card p-4"
        style={{ maxHeight: 340 }}
        data-testid="transcript-area"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`animate-fade-in-up flex ${
              msg.role === "worker" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                msg.role === "worker"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`message-${msg.role}-${i}`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* End call */}
      <Button
        variant="destructive"
        size="sm"
        className="gap-2"
        onClick={onFinish}
        data-testid="button-end-call"
      >
        <PhoneOff className="h-3.5 w-3.5" />
        End Call
      </Button>
    </div>
  );
}

/* ─── Step 3: Generating ─── */
function GeneratingStep({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Transcribing voice notes...",
    "Analyzing photo 1 of 5...",
    "Analyzing photo 2 of 5...",
    "Analyzing photo 3 of 5...",
    "Analyzing photo 4 of 5...",
    "Analyzing photo 5 of 5...",
    "Synthesizing report...",
    "Generating PDF...",
  ];

  useEffect(() => {
    const totalDuration = 6000;
    const stepInterval = totalDuration / steps.length;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) return prev + 1;
        return prev;
      });
    }, stepInterval);

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, totalDuration / 50);

    const doneTimer = setTimeout(() => {
      onDone();
    }, totalDuration + 500);

    return () => {
      clearInterval(timer);
      clearInterval(progressTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, steps.length]);

  return (
    <div className="step-enter flex flex-col items-center gap-8 pt-16 pb-8">
      {/* Spinner */}
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg className="h-20 w-20 animate-spin" viewBox="0 0 80 80" style={{ animationDuration: "2s" }}>
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="4"
            className="stroke-muted"
          />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray="160"
            strokeDashoffset="100"
          />
        </svg>
        <FileText className="absolute h-6 w-6 text-primary" />
      </div>

      {/* Status text */}
      <div className="text-center">
        <h2 className="font-display text-lg font-bold" data-testid="heading-generating">
          Generating Report
        </h2>
        <p className="mt-1 text-sm text-muted-foreground animate-fade-in-up" key={currentStep}>
          {steps[currentStep]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: "hsl(var(--primary))",
            }}
            data-testid="progress-bar"
          />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground tabular-nums">
          {Math.min(progress, 100)}%
        </p>
      </div>

      {/* Step list */}
      <div className="w-full max-w-sm space-y-2">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs transition-all duration-300 ${
              i < currentStep
                ? "text-foreground"
                : i === currentStep
                ? "text-foreground font-medium"
                : "text-muted-foreground/40"
            }`}
          >
            {i < currentStep ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--success))" }} />
            ) : i === currentStep ? (
              <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary animate-pulse" />
            ) : (
              <div className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-muted" />
            )}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Done ─── */
function DoneStep({ projectId }: { projectId: string }) {
  return (
    <div className="step-enter flex flex-col items-center gap-6 pt-12 pb-8">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: "hsl(var(--success) / 0.12)" }}
      >
        <CheckCircle2 className="h-7 w-7" style={{ color: "hsl(var(--success))" }} />
      </div>

      <div className="text-center">
        <h2 className="font-display text-lg font-bold" data-testid="heading-done">
          Report Generated
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Smith Residence Remodel &middot; March 21, 2026
        </p>
      </div>

      {/* Summary card */}
      <div className="w-full max-w-md rounded-md border bg-card p-4 space-y-3" data-testid="report-summary">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Photos analyzed</span>
          <span className="font-medium">5</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Work items documented</span>
          <span className="font-medium">4</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Safety observations</span>
          <span className="font-medium">1 flagged</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Crew size</span>
          <span className="font-medium">6 workers</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button className="w-full gap-2 sm:w-auto" data-testid="button-download-pdf">
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
        <Link href={`/project/${projectId}`}>
          <Button variant="secondary" className="w-full gap-2 sm:w-auto" data-testid="button-back-to-project">
            <ArrowLeft className="h-4 w-4" />
            Back to Project
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* ─── Create Report Page ─── */
export default function CreateReport() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? "";

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const handleNextToCall = useCallback(async () => {
    setIsUploading(true);
    try {
      // 1. Create the daily report record
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const reportRes = await apiRequest("POST", `/api/projects/${projectId}/reports`, {
        report_date: today,
      });
      const report = await reportRes.json();
      setReportId(report.id);

      // 2. Upload each photo with its caption
      for (let i = 0; i < photos.length; i++) {
        setUploadProgress(`Uploading ${i + 1}/${photos.length}...`);
        const formData = new FormData();
        formData.append("photo", photos[i].file);
        formData.append("caption", photos[i].caption);
        await apiRequest("POST", `/api/projects/${projectId}/reports/${report.id}/photos`, formData);
      }

      setIsUploading(false);
      setStep("call");
    } catch (err) {
      setIsUploading(false);
      console.error("Upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed. Is the backend running?");
    }
  }, [photos, projectId]);

  const handleCallFinish = useCallback(() => setStep("generating"), []);
  const handleGeneratingDone = useCallback(() => setStep("done"), []);

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Header — only show on photos step */}
        {step === "photos" && (
          <div className="mb-6">
            <Link href={`/project/${projectId}`}>
              <button
                className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Project
              </button>
            </Link>
            <h1 className="font-display text-xl font-bold tracking-tight" data-testid="heading-create-report">
              Create Report
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todayFormatted}
            </p>
          </div>
        )}

        {step === "photos" && (
          <PhotosStep
            photos={photos}
            setPhotos={setPhotos}
            onNext={handleNextToCall}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            projectId={projectId}
          />
        )}
        {step === "call" && <CallStep onFinish={handleCallFinish} />}
        {step === "generating" && <GeneratingStep onDone={handleGeneratingDone} />}
        {step === "done" && <DoneStep projectId={projectId} />}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
