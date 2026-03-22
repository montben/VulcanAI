import { useState, useEffect, useRef, useCallback } from "react";
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
  Loader2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient, BACKEND_URL } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

/* ─── Navbar ─── */
function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm"
      data-testid="navbar"
    >
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
function PhotoUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BACKEND_URL}/api/uploads/image`, { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      onUploaded(data.url);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3" data-testid="photo-upload-section">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`group relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-md border-2 border-dashed transition-all duration-200 ${
          preview ? "border-primary/30 bg-card" : "border-border hover:border-primary/40 hover:bg-card"
        }`}
        data-testid="button-upload-photo"
      >
        {preview ? (
          <img src={preview} alt="Cover" className="h-full w-full object-cover" />
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

/* ─── Timeline → end date helper ─── */
function computeEndDate(startDate: string, timeline: string): string | null {
  if (!startDate || !timeline) return null;
  const start = new Date(startDate + "T00:00:00");
  const daysMap: Record<string, number> = {
    "1-2-weeks": 14,
    "3-4-weeks": 28,
    "1-3-months": 90,
    "3-6-months": 180,
    "6-12-months": 365,
    "12-plus-months": 547,
  };
  const days = daysMap[timeline];
  if (!days) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return end.toISOString().split("T")[0];
}

/* ─── New Project Page ─── */
export default function NewProject() {
  const [, navigate] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [projectType, setProjectType] = useState("");
  const [location, setLocation] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{
    display_name: string;
    lat: string;
    lon: string;
    address: {
      house_number?: string;
      road?: string;
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      postcode?: string;
    };
  }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const addressRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced Nominatim search
  function formatAddress(a: (typeof addressSuggestions)[0]): string {
    const p = a.address;
    const street = [p.house_number, p.road].filter(Boolean).join(" ");
    const city = p.city || p.town || p.village || "";
    const parts = [street, city, p.state, p.postcode].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : a.display_name;
  }

  const searchAddress = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=us&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setAddressSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setAddressSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addressRef.current && !addressRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [timeline, setTimeline] = useState("");
  const [siteManager, setSiteManager] = useState("");
  const [workerInput, setWorkerInput] = useState("");
  const [workers, setWorkers] = useState<string[]>([]);

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the project
      const res = await apiRequest("POST", "/api/projects", {
        name: projectName,
        client: client || null,
        location_address: location || null,
        location_lat: locationLat,
        location_lng: locationLng,
        project_type: projectType || null,
        start_date: startDate || null,
        expected_end_date: computeEndDate(startDate, timeline),
        profile_image_url: coverPhotoUrl || null,
      });
      const project = await res.json();

      // 2. Create site manager as a member and assign to project
      if (siteManager.trim()) {
        const memberRes = await apiRequest("POST", "/api/members", {
          name: siteManager.trim(),
          role: "Site Manager",
        });
        const member = await memberRes.json();
        await apiRequest("POST", `/api/projects/${project.id}/members`, {
          member_id: member.id,
          role: "site_manager",
        });
      }

      // 3. Create workers as members and assign to project
      for (const workerName of workers) {
        const memberRes = await apiRequest("POST", "/api/members", {
          name: workerName,
          role: "Worker",
        });
        const member = await memberRes.json();
        await apiRequest("POST", `/api/projects/${project.id}/members`, {
          member_id: member.id,
          role: "worker",
        });
      }

      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      navigate("/");
    },
  });

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

  const canSubmit = projectName.trim().length > 0 && !createProjectMutation.isPending;

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
            <PhotoUpload onUploaded={(url) => setCoverPhotoUrl(url)} />

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

            {/* Location with autocomplete */}
            <FormField label="Location" icon={MapPin} testId="field-location">
              <div className="relative" ref={addressRef}>
                <div className="relative">
                  <Input
                    placeholder="Start typing an address..."
                    value={addressQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddressQuery(val);
                      setLocation(val);
                      setLocationLat(null);
                      setLocationLng(null);
                      searchAddress(val);
                    }}
                    onFocus={() => {
                      if (addressSuggestions.length > 0) setShowSuggestions(true);
                    }}
                    data-testid="input-location"
                    autoComplete="off"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
                    data-testid="address-suggestions"
                  >
                    {addressSuggestions.map((s, i) => (
                      <button
                        key={`${s.lat}-${s.lon}-${i}`}
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent first:rounded-t-md last:rounded-b-md"
                        onClick={() => {
                          const formatted = formatAddress(s);
                          setAddressQuery(formatted);
                          setLocation(formatted);
                          setLocationLat(parseFloat(s.lat));
                          setLocationLng(parseFloat(s.lon));
                          setShowSuggestions(false);
                        }}
                        data-testid={`address-option-${i}`}
                      >
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="line-clamp-2">{formatAddress(s)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

          {/* Error message */}
          {createProjectMutation.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {createProjectMutation.error instanceof Error
                ? createProjectMutation.error.message
                : "Failed to create project. Is the backend running?"}
            </div>
          )}

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
              disabled={!canSubmit}
              onClick={() => createProjectMutation.mutate()}
              data-testid="button-create-project"
            >
              {createProjectMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </div>
      </main>

      <PerplexityAttribution />
    </div>
  );
}
