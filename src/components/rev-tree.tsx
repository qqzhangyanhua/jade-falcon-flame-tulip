import { Check } from "lucide-react";
import type { ImageRev } from "@/lib/types";
import { revTree, type RevTreeNode } from "@/lib/project/ops";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<ImageRev["action"], string> = {
  generate: "出图",
  tune: "微调",
  compose: "换构图",
};

export function RevTree({
  revs,
  adoptedId,
  inspectingId,
  onInspect,
  onAdopt,
}: {
  revs: ImageRev[];
  adoptedId: string | null | undefined;
  inspectingId: string | null;
  onInspect: (imageId: string | null) => void;
  onAdopt: (imageId: string) => void;
}) {
  if (!revs.length) {
    return <p className="px-3 py-8 text-center text-sm text-subtle">这个槽还没有图版本</p>;
  }

  const tree = revTree({
    slot: "slot",
    adoptedId: adoptedId ?? null,
    revs,
  });

  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <ul className="flex w-max min-w-full flex-col gap-3 p-2">
        {tree.map((node) => (
          <RevBranch
            key={node.rev.id}
            node={node}
            adoptedId={adoptedId}
            inspectingId={inspectingId}
            onInspect={onInspect}
            onAdopt={onAdopt}
          />
        ))}
      </ul>
    </div>
  );
}

function RevBranch({
  node,
  adoptedId,
  inspectingId,
  onInspect,
  onAdopt,
}: {
  node: RevTreeNode;
  adoptedId: string | null | undefined;
  inspectingId: string | null;
  onInspect: (imageId: string | null) => void;
  onAdopt: (imageId: string) => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <RevNode
        node={node}
        adopted={adoptedId === node.rev.id}
        inspecting={inspectingId === node.rev.id}
        onInspect={onInspect}
        onAdopt={onAdopt}
      />
      {node.children.length > 0 ? (
        <ul className="flex flex-col gap-3 border-l border-border pl-3">
          {node.children.map((child) => (
            <RevBranch
              key={child.rev.id}
              node={child}
              adoptedId={adoptedId}
              inspectingId={inspectingId}
              onInspect={onInspect}
              onAdopt={onAdopt}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RevNode({
  node,
  adopted,
  inspecting,
  onInspect,
  onAdopt,
}: {
  node: RevTreeNode;
  adopted: boolean;
  inspecting: boolean;
  onInspect: (imageId: string | null) => void;
  onAdopt: (imageId: string) => void;
}) {
  const { rev } = node;
  const action = ACTION_LABEL[rev.action];
  return (
    <div
      className={cn(
        "w-36 shrink-0 rounded-md p-1",
        inspecting ? "bg-surface-2" : "bg-surface",
        adopted && "shadow-border",
      )}
    >
      <button
        type="button"
        className="flex min-h-11 w-full flex-col rounded-md text-left"
        aria-pressed={inspecting}
        aria-label={`${action}，rev${rev.styleRev}${adopted ? "，已采用" : ""}`}
        onClick={() => onInspect(inspecting ? null : rev.id)}
      >
        <img src={rev.url} alt="" className="frame h-20 w-full rounded-sm object-cover" />
        <span className="px-1 pt-1 text-xs text-fg">{action}</span>
        <span className="px-1 pb-1 text-xs text-subtle">rev{rev.styleRev}</span>
        {adopted ? (
          <span className="flex items-center justify-center gap-1 bg-accent px-2 py-1 text-xs text-accent-fg">
            <Check className="size-3" aria-hidden="true" />
            采用
          </span>
        ) : null}
      </button>
      {adopted ? null : (
        <button
          type="button"
          className="mt-1 min-h-11 w-full rounded-md text-sm text-fg transition-colors duration-150 hover:bg-surface-2"
          onClick={() => onAdopt(rev.id)}
        >
          采用
        </button>
      )}
    </div>
  );
}
