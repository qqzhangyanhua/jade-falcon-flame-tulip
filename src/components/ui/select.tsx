"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function SelectField({
  id,
  label,
  value,
  onValueChange,
  disabled,
  placeholder,
  items,
  className,
}: {
  id?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  items: SelectItem[];
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : null}
      <Select.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
        <Select.Trigger
          id={id}
          className="inline-flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-fg outline-none transition-[border-color,box-shadow] duration-150 ease-smooth hover:shadow-border-hover focus-visible:border-accent disabled:opacity-40"
        >
          <Select.Value placeholder={placeholder} className="min-w-0 truncate" />
          <Select.Icon className="shrink-0">
            <ChevronDown className="size-3.5 text-subtle" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-border"
          >
            <Select.Viewport>
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm text-fg outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-2"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="size-3.5 text-muted" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
