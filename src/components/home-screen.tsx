"use client";

import { useEffect, useState } from "react";
import { BriefView } from "@/components/brief-view";
import { DirectionView } from "@/components/direction-view";
import { StudioView } from "@/components/studio-view";
import { useStudio } from "@/lib/store";

export function HomeScreen() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const project = useStudio((s) => s.current());

  if (!mounted || !project) return <BriefView />;
  if (project.phase === "studio") return <StudioView />;
  if (project.phase === "direction") return <DirectionView />;
  return <BriefView />;
}
