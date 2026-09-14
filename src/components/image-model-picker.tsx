import type { PickerImageModel, StudioImageState } from "@/lib/image-jobs";

export function ImageModelPicker({
  state,
  disabled,
  onPick,
}: {
  state: StudioImageState | null;
  disabled?: boolean;
  onPick: (modelId: string) => void;
}) {
  if (!state) {
    return (
      <span className="text-xs text-subtle">模型加载中</span>
    );
  }

  if (state.imagesUnavailable) {
    return (
      <p className="text-sm text-danger">出图暂不可用</p>
    );
  }

  return (
    <div className="min-w-0">
      <label className="sr-only" htmlFor="image-model-picker">
        出图模型
      </label>
      <select
        id="image-model-picker"
        className="h-9 max-w-full rounded-md border border-border bg-surface px-2 text-sm text-fg"
        value={state.currentImageModelId}
        disabled={disabled}
        onChange={(event) => onPick(event.target.value)}
      >
        {state.modelDisabled && state.currentImageModelId ? (
          <option value={state.currentImageModelId} disabled>
            {state.currentDisplayName ?? "已停用的模型"}
          </option>
        ) : null}
        {state.picker.map((model: PickerImageModel) => (
          <option key={model.id} value={model.id}>
            {model.displayName}
          </option>
        ))}
      </select>
      {state.modelDisabled ? (
        <p className="mt-1 text-xs text-danger">当前模型已停用，请另选模型</p>
      ) : null}
    </div>
  );
}
