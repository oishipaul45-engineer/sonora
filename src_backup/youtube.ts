
const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

export interface YouTubeTrack {
  id: string;
  title: string;
  artist: string;
  image: string;
  videoId: string;
  source: "youtube";
}

interface YouTubeSearchResponse {
  items?: Array<{
    id: {
      videoId?: string;
    };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }>;
  error?: {
    message: string;
  };
}

export async function searchYouTube(
  query: string,
  limit = 20
): Promise<YouTubeTrack[]> {
  if (!API_KEY) {
    throw new Error("YouTube API key is missing from .env");
  }

  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    q: query,
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: String(Math.min(limit, 50)),
  });

  const response = await fetch(
    `${YOUTUBE_API}/search?${params.toString()}`
  );

  const data: YouTubeSearchResponse = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "YouTube search failed"
    );
  }

  return (data.items || [])
    .filter((item) => Boolean(item.id.videoId))
    .map((item) => ({
      id: `youtube-${item.id.videoId}`,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      image:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        "",
      videoId: item.id.videoId!,
      source: "youtube" as const,
    }));
}
