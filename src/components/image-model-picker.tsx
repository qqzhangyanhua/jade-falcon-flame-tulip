import type { PickerImageModel, StudioImageState } from "@/lib/image-jobs";
import { SelectField } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ImageModelPicker({
  state,
  disabled,
  onPick,
  className,
}: {
  state: StudioImageState | null;
  disabled?: boolean;
  onPick: (modelId: string) => void;
  className?: string;
}) {
  if (!state) {
    return (
      <span className={cn("inline-flex h-11 items-center text-xs text-subtle", className)}>模型加载中</span>
    );
  }

  if (state.imagesUnavailable) {
    return <p className={cn("text-sm text-danger", className)}>出图暂不可用</p>;
  }

  const items = [
    ...(state.modelDisabled && state.currentImageModelId
      ? [
          {
            value: state.currentImageModelId,
            label: state.currentDisplayName ?? "已停用的模型",
            disabled: true,
          },
        ]
      : []),
    ...state.picker.map((model: PickerImageModel) => ({
      value: model.id,
      label: model.displayName,
    })),
  ];

  return (
    <div className={cn("min-w-0", className)}>
      <SelectField
        id="image-model-picker"
        label="出图模型"
        value={state.currentImageModelId}
        disabled={disabled}
        items={items}
        onValueChange={onPick}
      />
      {state.modelDisabled ? (
        <p className="mt-1 text-xs text-danger">当前模型已停用，请另选模型</p>
      ) : null}
    </div>
  );
}
