import { useState } from "react";
import { VulcanLogo } from "@/components/VulcanLogo";
import { useTheme } from "@/components/ThemeProvider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Moon,
  Plus,
  FolderOpen,
  Clock,
  Camera,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

import project1 from "@assets/project-1.jpg";
import project2 from "@assets/project-2.jpg";
import project3 from "@assets/project-3.jpg";

/* ─── Mock project data ─── */
const PROJECTS = [
  {
    id: "p1",
    name: "Smith Residence Remodel",
    company: "ABC Construction",
    image: project1,
    lastReport: "March 20, 2026",
    reportCount: 12,
    photoCount: 87,
  },
  {
    id: "p2",
    name: "Downtown Office Complex",
    company: "ABC Construction",
    image: project2,
    lastReport: "March 19, 2026",
    reportCount: 34,
    photoCount: 215,
  },
  {
    id: "p3",
    name: "Riverside Townhomes",
    company: "ABC Construction",
    image: project3,
    lastReport: "March 18, 2026",
    reportCount: 8,
    photoCount: 52,
  },
];

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
}: {
  project: (typeof PROJECTS)[0];
}) {
  return (
    <Link href={`/project/${project.id}`} className="block">
    <div
      className="group relative aspect-square w-full overflow-hidden rounded-md border bg-card text-left transition-all duration-200 hover:border-primary/30 cursor-pointer"
      data-testid={`card-project-${project.id}`}
    >
      {/* Full-bleed image background */}
      <img
        src={project.image}
        alt={project.name}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />

      {/* Gradient overlay — heavier at bottom for text */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Photo count badge — top right */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-sm bg-black/50 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
        <Camera className="h-3 w-3" />
        {project.photoCount}
      </div>

      {/* Info overlay — bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
        <h3 className="text-sm font-semibold leading-snug text-white line-clamp-2">
          {project.name}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-white/70">
          <span className="flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {project.reportCount} reports
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {project.lastReport}
          </span>
        </div>
      </div>
    </div>
    </Link>
  );
}

/* ─── Dashboard Page ─── */
export default function Dashboard() {
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
          <span className="text-xs text-muted-foreground">
            {PROJECTS.length} projects
          </span>
        </div>

        {/* Project grid */}
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="project-grid"
        >
          {/* Create new — always first */}
          <CreateProjectCard />

          {/* Existing projects */}
          {PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </main>

      <PerplexityAttribution />
    </div>
  );
}
