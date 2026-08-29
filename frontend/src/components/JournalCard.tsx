import type { HTMLAttributes, ReactNode } from "react";

interface JournalCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Set false to keep the resting "journal page" look without the
   * hover lift/border-color/glow - use inside modals or other contexts
   * that shouldn't behave like a clickable card. */
  hoverable?: boolean;
}

/** The app's one card shape: white "journal page" with a 24px radius and
 * a warm-gray border that glows teal on hover. Every card-like surface in
 * the redesign should be built from this rather than a one-off div. */
export default function JournalCard({ children, hoverable = true, className = "", ...rest }: JournalCardProps) {
  return (
    <div className={`journal-card${hoverable ? "" : " static-card"} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
