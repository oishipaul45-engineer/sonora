
const CLIENT_ID = import.meta.env.VITE_JAMENDO_CLIENT_ID;

const API_URL = "https://api.jamendo.com/v3.0";

export interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  image: string;
  audio: string;
  duration: number;
}

interface JamendoResponse {
  headers: {
    status: string;
    code: number;
    error_message?: string;
  };
  results: JamendoTrack[];
}

export async function getTracks(
  search = "",
  limit = 20
): Promise<JamendoTrack[]> {
  if (!CLIENT_ID) {
    throw new Error("Jamendo Client ID is missing from .env");
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    format: "json",
    limit: String(limit),
    include: "musicinfo",
    audioformat: "mp32",
  });

  if (search.trim()) {
    params.set("search", search.trim());
  } else {
    params.set("order", "popularity_total");
  }

  const response = await fetch(
    `${API_URL}/tracks/?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      `Jamendo request failed: ${response.status}`
    );
  }

  const data: JamendoResponse = await response.json();

  if (data.headers.code !== 0) {
    throw new Error(
      data.headers.error_message || "Jamendo API error"
    );
  }

  return data.results.filter((track) => Boolean(track.audio));
}
