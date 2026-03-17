import { useState, useEffect } from "react";
import { X, Play, Maximize2 } from "lucide-react";

interface MediaViewerProps {
  src: string;
  alt?: string;
  mediaType?: "photo" | "video";
  proofId?: string;
  videoUrl?: string;
  className?: string;
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export function MediaThumbnail({ src, alt, mediaType, proofId, videoUrl, className }: MediaViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  // Use the direct videoUrl if provided, otherwise try to fetch from server
  const effectiveVideoSrc = videoUrl || videoSrc;

  const openFullscreen = async () => {
    setIsFullscreen(true);
    if (mediaType === "video" && proofId && !effectiveVideoSrc) {
      setLoadingVideo(true);
      try {
        const res = await fetch(`${API_BASE}/api/proofs/${proofId}/video`);
        if (res.ok) {
          const data = await res.json();
          setVideoSrc(data.videoData);
        }
      } catch {}
      setLoadingVideo(false);
    }
  };

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isFullscreen]);

  return (
    <>
      {/* Thumbnail */}
      <div
        className={`relative cursor-pointer group ${className || ""}`}
        onClick={openFullscreen}
        data-testid="media-thumbnail"
      >
        <img src={src} alt={alt || "Media"} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-active:bg-black/20 transition-colors flex items-center justify-center">
          {mediaType === "video" ? (
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center opacity-80">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          ) : (
            <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            className="absolute top-4 right-4 z-[101] w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            onClick={() => setIsFullscreen(false)}
            data-testid="button-close-fullscreen"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {mediaType === "video" && (videoUrl || videoSrc) ? (
            <video
              src={videoUrl || videoSrc!}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-full"
              onClick={(e) => e.stopPropagation()}
              data-testid="video-fullscreen"
            />
          ) : mediaType === "video" && loadingVideo ? (
            <div className="text-white text-sm">Loading video...</div>
          ) : (
            <img
              src={src}
              alt={alt || "Media"}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
              data-testid="img-fullscreen"
            />
          )}
        </div>
      )}
    </>
  );
}
