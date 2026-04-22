"use client";

import { getBackingStatusLabel, getBackingStatusTone } from "@/lib/backing";
import type { BackingStatus } from "@/lib/types";

type BackingChipProps = {
  status: BackingStatus;
  label?: string;
  onClick?: () => void;
  size?: "default" | "compact";
  emphasis?: "default" | "subtle";
};

export function BackingChip({
  status,
  label,
  onClick,
  size = "default",
  emphasis = "subtle"
}: BackingChipProps) {
  const content = label ?? getBackingStatusLabel(status);
  const classes = `rounded-full border font-semibold uppercase tracking-[0.12em] ${getBackingStatusTone(
    status
  )} ${size === "compact" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} ${
    emphasis === "subtle" ? "opacity-85" : ""
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return <span className={classes}>{content}</span>;
}
