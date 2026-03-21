import { useState } from "react";
import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sun,
  Moon,
  ArrowLeft,
  Camera,
  CalendarDays,
  MapPin,
  User,
  Users,
  Briefcase,
  Clock,
  Building2,
  X,
} from "lucide-react";
import { Link } from "wouter";

/* ─── Navbar ─── */
function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm"
      data-testid="navbar"
    >
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
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
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </nav>
  );
}

/* ─── Worker tag ─── */
function WorkerTag({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
      data-testid={`worker-tag-${name}`}
    >
      {name}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-sm hover:bg-primary/20 p-0.5 transition-colors"
        data-testid={`remove-worker-${name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ─── Photo upload ─── */
function PhotoUpload() {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div
      className="flex flex-col items-center gap-3"
      data-testid="photo-upload-section"
    >
      <button
        onClick={() => {
          // Mock: set a placeholder preview
          setPreview(
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ddd'/%3E%3C/svg%3E"
          );
        }}
        className={`group relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition-all duration-200 ${
          preview
            ? "border-primary/30 bg-card"
            : "border-border hover:border-primary/40 hover:bg-card"
        }`}
        data-testid="button-upload-photo"
      >
        {preview ? (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
            <Camera className="h-6 w-6" />
            <span className="text-xs font-medium">Add Photo</span>
          </div>
        )}
      </button>
      <p className="text-xs text-muted-foreground">Jobsite cover photo</p>
    </div>
  );
}

/* ─── Field wrapper ─── */
function FormField({
  label,
  icon: Icon,
  children,
  testId,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ─── New Project Page ─── */
export default function NewProject() {
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [projectType, setProjectType] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [timeline, setTimeline] = useState("");
  const [siteManager, setSiteManager] = useState("");
  const [workerInput, setWorkerInput] = useState("");
  const [workers, setWorkers] = useState<string[]>([]);

  const addWorker = () => {
    const trimmed = workerInput.trim();
    if (trimmed && !workers.includes(trimmed)) {
      setWorkers((prev) => [...prev, trimmed]);
      setWorkerInput("");
    }
  };

  const removeWorker = (name: string) => {
    setWorkers((prev) => prev.filter((w) => w !== name));
  };

  const handleWorkerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addWorker();
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        {/* Back + heading */}
        <div className="mb-8">
          <Link href="/">
            <button
              className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </button>
          </Link>
          <h1
            className="font-display text-xl font-bold tracking-tight"
            data-testid="heading-new-project"
          >
            Create New Project
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up a new jobsite to start generating reports.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* ── Section 1: Project identity ── */}
          <div className="rounded-md border bg-card p-5 space-y-5" data-testid="section-project-info">
            <h2 className="text-sm font-semibold">Project Details</h2>

            {/* Photo upload centered */}
            <PhotoUpload />

            {/* Project name */}
            <FormField label="Project Name" icon={Briefcase} testId="field-project-name">
              <Input
                placeholder="e.g. Smith Residence Remodel"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                data-testid="input-project-name"
              />
            </FormField>

            {/* Client */}
            <FormField label="Client" icon={User} testId="field-client">
              <Input
                placeholder="e.g. John & Sarah Smith"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                data-testid="input-client"
              />
            </FormField>

            {/* Project type */}
            <FormField label="Type of Project" icon={Building2} testId="field-project-type">
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger data-testid="select-project-type">
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential-new">Residential — New Build</SelectItem>
                  <SelectItem value="residential-remodel">Residential — Remodel</SelectItem>
                  <SelectItem value="commercial-new">Commercial — New Build</SelectItem>
                  <SelectItem value="commercial-renovation">Commercial — Renovation</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* ── Section 2: Location & timeline ── */}
          <div className="rounded-md border bg-card p-5 space-y-5" data-testid="section-location-timeline">
            <h2 className="text-sm font-semibold">Location & Timeline</h2>

            {/* Location */}
            <FormField label="Location" icon={MapPin} testId="field-location">
              <Input
                placeholder="e.g. 1234 Oak St, Detroit, MI 48201"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                data-testid="input-location"
              />
            </FormField>

            {/* Start date + timeline side by side */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Start Date" icon={CalendarDays} testId="field-start-date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </FormField>

              <FormField label="Expected Timeline" icon={Clock} testId="field-timeline">
                <Select value={timeline} onValueChange={setTimeline}>
                  <SelectTrigger data-testid="select-timeline">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2-weeks">1–2 weeks</SelectItem>
                    <SelectItem value="3-4-weeks">3–4 weeks</SelectItem>
                    <SelectItem value="1-3-months">1–3 months</SelectItem>
                    <SelectItem value="3-6-months">3–6 months</SelectItem>
                    <SelectItem value="6-12-months">6–12 months</SelectItem>
                    <SelectItem value="12-plus-months">12+ months</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </div>

          {/* ── Section 3: Team ── */}
          <div className="rounded-md border bg-card p-5 space-y-5" data-testid="section-team">
            <h2 className="text-sm font-semibold">Team</h2>

            {/* Site manager */}
            <FormField label="Site Manager" icon={User} testId="field-site-manager">
              <Input
                placeholder="e.g. Mike Torres"
                value={siteManager}
                onChange={(e) => setSiteManager(e.target.value)}
                data-testid="input-site-manager"
              />
            </FormField>

            {/* Workers */}
            <FormField label="Crew Members" icon={Users} testId="field-workers">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a crew member and press Enter"
                    value={workerInput}
                    onChange={(e) => setWorkerInput(e.target.value)}
                    onKeyDown={handleWorkerKeyDown}
                    data-testid="input-worker"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addWorker}
                    className="shrink-0"
                    data-testid="button-add-worker"
                  >
                    Add
                  </Button>
                </div>
                {workers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="worker-tags">
                    {workers.map((w) => (
                      <WorkerTag key={w} name={w} onRemove={() => removeWorker(w)} />
                    ))}
                  </div>
                )}
              </div>
            </FormField>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center justify-end gap-3 pb-4" data-testid="form-actions">
            <Link href="/">
              <Button
                variant="ghost"
                className="text-muted-foreground"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </Link>
            <Button
              className="gap-2 px-6"
              data-testid="button-create-project"
            >
              Create Project
            </Button>
          </div>
        </div>
      </main>

      <PerplexityAttribution />
    </div>
  );
}
