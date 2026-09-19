/**
 * ULTRON core — pure CSS/SVG animated reactor visual. No canvas, no JS cost.
 */
export function Orb({ className = "" }: { className?: string }) {
  return (
    <div className={`orb-stage ${className}`} aria-hidden="true">
      <div className="orb-halo" />
      <div className="orb-ring r3" />
      <div className="orb-ring r2" />
      <div className="orb-ring r1" />
      <div className="orb-ticks" />
      <div className="orb-core" />
    </div>
  );
}
