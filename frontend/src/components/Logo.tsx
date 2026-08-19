/** Simple mark: an upward growth arrow inside a soft teal-to-sky gradient
 * circle, paired with the wordmark. No external icon library needed. */
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shrink-0 shadow-sm shadow-teal-500/30">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M4 17L10 11L14 15L20 8"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M14 8H20V14" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          GrowthPath
        </span>
      )}
    </div>
  );
}
