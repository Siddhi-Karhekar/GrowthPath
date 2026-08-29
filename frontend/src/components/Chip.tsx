import type { ReactNode } from "react";

type Tone = "primary" | "secondary" | "tertiary" | "neutral" | "error";

const TONE_STYLES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-secondary-container/30 text-on-secondary-container border-secondary-container/50",
  tertiary: "bg-tertiary-container/25 text-on-tertiary-container border-tertiary-container/50",
  neutral: "bg-surface-container-high text-on-surface-variant border-outline-variant",
  error: "bg-error-container/60 text-on-error-container border-error-container",
};

// A few slightly-irregular corner-radius presets, cycled deterministically
// per label, for the "organic blob" chip shape from DESIGN.md - avoids
// perfectly circular pill chips while staying stable across re-renders.
const RADII = ["12px 20px 10px 16px", "16px 10px 20px 12px", "14px 18px 12px 16px", "18px 12px 16px 10px"];

function radiusFor(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return RADII[hash % RADII.length];
}

interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}

/** Small tag/status/pill label using the design system's "blob" shape -
 * a translucent fill of its semantic color with a slightly irregular
 * border radius rather than a perfect rounded-full pill. */
export default function Chip({ children, tone = "neutral", icon, className = "" }: ChipProps) {
  const label = typeof children === "string" ? children : "chip";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-caption text-caption px-3 py-1 whitespace-nowrap ${TONE_STYLES[tone]} ${className}`.trim()}
      style={{ borderRadius: radiusFor(label) }}
    >
      {icon}
      {children}
    </span>
  );
}
