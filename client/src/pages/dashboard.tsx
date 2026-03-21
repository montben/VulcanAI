import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sun,
  Moon,
  Plus,
  FolderOpen,
  Clock,
  Camera,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, BACKEND_URL } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ─── Types matching backend ProjectOut schema ─── */
interface ProjectMember {
  id: string;
  name: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  client: string | null;
  location_address: string | null;
  project_type: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  status: string;
  profile_image_url: string | null;
  members: ProjectMember[];
}

/* ─── Fallback images when no profile_image_url is set ─── */
// These images live in frontend/assets/ and are served directly
const FALLBACK_IMAGES = [
  "/assets/project-1-K5HTfrPo.jpg",
  "/assets/project-2-DOz_31jE.jpg",
  "/assets/project-3-CG2mWqkb.jpg",
];

function getFallbackImage(index: number): string {
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];
}

/* ─── Navbar ─── */
function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm"
      data-testid="navbar"
    >
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

/* ─── Create New Project Card ─── */
function CreateProjectCard() {
  return (
    <Link href="/new" className="block">
      <div
        className="group flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-border bg-transparent transition-all duration-200 hover:border-primary/40 hover:bg-card cursor-pointer"
        data-testid="button-create-project"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
          New Project
        </span>
      </div>
    </Link>
  );
}

/* ─── Project Card ─── */
function ProjectCard({
  project,
  index,
}: {
  project: Project;
  index: number;
}) {
  const rawImageUrl = project.profile_image_url || getFallbackImage(index);
  const imageUrl = rawImageUrl?.startsWith("/uploads/") ? `${BACKEND_URL}${rawImageUrl}` : rawImageUrl;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${project.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  // Format the start date nicely
  const dateLabel = project.start_date
    ? new Date(project.start_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link href={`/project/${project.id}`} className="block">
      <div
        className="group relative aspect-square w-full overflow-hidden rounded-md border bg-card text-left transition-all duration-200 hover:border-primary/30 cursor-pointer"
        data-testid={`card-project-${project.id}`}
      >
        {/* Full-bleed image background */}
        <img
          src={imageUrl}
          alt={project.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Menu — top right */}
        <div className="absolute top-2 right-2 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.preventDefault()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60 backdrop-blur-sm"
                data-testid={`menu-project-${project.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate();
                  }
                }}
                data-testid={`delete-project-${project.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Project type badge */}
        {project.project_type && (
          <div className="absolute top-2.5 left-2.5 rounded-sm bg-black/50 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {project.project_type}
          </div>
        )}

        {/* Info overlay — bottom */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <h3 className="text-sm font-semibold leading-snug text-white line-clamp-2">
            {project.name}
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-white/70">
            {project.client && (
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                {project.client}
              </span>
            )}
            {dateLabel && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {dateLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Loading skeleton ─── */
function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <CreateProjectCard />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-md" />
      ))}
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyState() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <CreateProjectCard />
      <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex items-center justify-center rounded-md border border-dashed bg-card p-8">
        <div className="text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No projects yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Create your first project to start generating reports.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard Page ─── */
export default function Dashboard() {
  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Header strip */}
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="font-display text-xl font-bold tracking-tight"
            data-testid="heading-my-projects"
          >
            My Projects
          </h1>
          {projects && (
            <span className="text-xs text-muted-foreground">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="rounded-md border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Could not load projects. Make sure the backend is running on port 8000.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            data-testid="project-grid"
          >
            <CreateProjectCard />
            {projects.map((project, i) => (
              <ProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
