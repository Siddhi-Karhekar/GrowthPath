/** Brand mark: a teal avatar circle with the "G" initial, paired with the
 * Literata wordmark and journal tagline - the "Serene Scholar" lockup from
 * the mockups' sidebar/auth screens. */
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 text-on-primary font-display-hero text-headline-md">
        G
      </div>
      {!compact && (
        <div className="leading-none">
          <h1 className="font-display-hero text-headline-md text-primary leading-none">GrowthPath</h1>
          <p className="font-body-md text-caption text-on-surface-variant mt-1">Your Digital Journal</p>
        </div>
      )}
    </div>
  );
}
