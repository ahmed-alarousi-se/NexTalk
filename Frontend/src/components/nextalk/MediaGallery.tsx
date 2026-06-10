import { ArrowLeft } from "lucide-react";
import { API_URL } from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import { useChat } from "@/lib/use-chat";
import type { MediaItem } from "@/lib/types";

type Props = {
  onBack: () => void;
};

export function MediaGallery({ onBack }: Props) {
  const { mediaItems, mediaLoading, hasMoreMedia, loadMoreMedia } = useChat();

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to details
      </button>

      {mediaLoading && mediaItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading media…</p>
      ) : mediaItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No shared images yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {mediaItems.map((item) => (
              <MediaThumb key={item.id} item={item} />
            ))}
          </div>
          {hasMoreMedia && (
            <button
              onClick={() => void loadMoreMedia()}
              className="w-full rounded-lg border border-white/10 py-2 text-xs text-primary hover:bg-primary/5"
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}

function MediaThumb({ item }: { item: MediaItem }) {
  const src = mediaUrl(item.image_url, API_URL);
  if (!src) return null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2"
      title={`${item.sender.username} · ${new Date(item.created_at).toLocaleDateString()}`}
    >
      <img src={src} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
    </a>
  );
}
