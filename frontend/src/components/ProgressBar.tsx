interface ProgressBarProps {
  /** 0-100 */
  value: number;
  className?: string;
  fillClassName?: string;
}

/** Thin rounded progress track used for test-completion, mastery, and
 * study-guide-importance bars across the app. */
export default function ProgressBar({ value, className = "", fillClassName = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`w-full h-2 bg-surface-container-high rounded-full overflow-hidden ${className}`.trim()}>
      <div
        className={`h-full bg-primary rounded-full transition-[width] duration-300 ease-out ${fillClassName}`.trim()}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
