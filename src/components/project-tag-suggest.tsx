"use client";

import { useEffect, useId, useRef, useState } from "react";
import { listUsedProjectTagsFn } from "@/app/actions/studio";
import { Input } from "@/components/ui/input";
import { PROJECT_TAG_MAX_LENGTH } from "@/lib/project/schema";
import { cn } from "@/lib/utils";

type ProjectTagSuggestInputProps = {
  label: string;
  placeholder: string;
  exclude?: readonly string[];
  disabled?: boolean;
  onCommit: (tag: string) => void;
  onOpenChange?: (open: boolean) => void;
};

export function ProjectTagSuggestInput({
  label,
  placeholder,
  exclude = [],
  disabled,
  onCommit,
  onOpenChange,
}: ProjectTagSuggestInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const request = useRef(0);
  const skipped = exclude.join("\u0000");

  useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    const handle = window.setTimeout(() => {
      void listUsedProjectTagsFn({ data: { prefix: value } })
        .then((tags) => {
          if (request.current !== id) return;
          const skip = new Set(skipped.split("\u0000").filter(Boolean));
          setSuggestions(tags.filter((tag) => !skip.has(tag)));
        })
        .catch(() => {
          if (request.current !== id) return;
          setSuggestions([]);
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, skipped, value]);

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    onCommit(tag);
    setValue("");
    setActive(-1);
    setOpen(false);
  }

  const shown = open && suggestions.length > 0;

  useEffect(() => {
    onOpenChange?.(shown);
  }, [onOpenChange, shown]);

  return (
    <div className="relative min-w-0">
      <Input
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        maxLength={PROJECT_TAG_MAX_LENGTH}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setValue(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (index + 1) % suggestions.length);
            return;
          }
          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const picked = active >= 0 ? suggestions[active] : undefined;
            commit(picked ?? value);
            return;
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {shown ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-border"
        >
          {suggestions.map((tag, index) => (
            <li key={tag} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={cn(
                  "flex min-h-11 w-full items-center px-3 text-left text-sm text-fg",
                  index === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(tag);
                }}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
