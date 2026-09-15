"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ensureStudioProjectFn,
  getImageStudioStateFn,
  pickProjectImageModelFn,
} from "@/app/actions/studio";
import { imageJobErrorCode, type StudioImageState } from "@/lib/image-jobs";
import { messageForImageJobError } from "@/lib/image-jobs/errors";
import { useStudio } from "@/lib/store";

export function useStudioImageGate(projectId: string | undefined) {
  const [state, setState] = useState<StudioImageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setCurrentImageModel = useStudio((s) => s.setCurrentImageModel);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      await ensureStudioProjectFn({ data: { projectId } });
      const next = await getImageStudioStateFn({ data: { projectId } });
      setState(next);
      setCurrentImageModel(next.currentImageModelId);
      setError(null);
    } catch (err) {
      const code = imageJobErrorCode(err);
      if (
        projectId &&
        (code === "project_deleted" || code === "not_found" || code === "forbidden")
      ) {
        useStudio.getState().removeProject(projectId);
      }
      setError(messageForImageJobError(err));
    }
  }, [projectId, setCurrentImageModel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pick = useCallback(
    async (modelId: string) => {
      if (!projectId) return;
      try {
        await pickProjectImageModelFn({ data: { projectId, modelId } });
        await refresh();
      } catch (err) {
        setError(messageForImageJobError(err));
        throw err;
      }
    },
    [projectId, refresh],
  );

  return { state, error, refresh, pick };
}
