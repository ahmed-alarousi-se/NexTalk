import { avatarColor, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
  ring?: boolean;
};

export function Avatar({ name, src, size = 40, online, className, ring }: Props) {
  const bg = avatarColor(name);
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full text-white font-semibold select-none overflow-hidden", ring && "ring-2 ring-primary/60", className)}
      style={{ width: size, height: size, background: src ? undefined : `linear-gradient(135deg, ${bg}, ${bg}dd)`, fontSize: size * 0.4 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : <span>{initials(name)}</span>}
      {online && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-online ring-2 ring-background" />
      )}
    </div>
  );
}
