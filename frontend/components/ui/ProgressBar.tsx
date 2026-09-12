import { cx } from "@/lib/format";

export function ProgressBar({
  value,
  color,
  className,
  height = "h-2",
}: {
  /** 0-100 */
  value: number;
  color?: string;
  className?: string;
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("w-full overflow-hidden rounded-pill bg-sage-deep/60", height, className)}>
      <div
        className="h-full rounded-pill transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: color ?? "#4A8F5F" }}
      />
    </div>
  );
}
