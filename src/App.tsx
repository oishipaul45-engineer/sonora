import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Compass,
  Search,
  Library,
  Heart,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Disc3,
  Menu,
  X,
  Plus,
  Trash2,
  ListMusic,
  LoaderCircle,
  RefreshCw,
  Clock3,
  ListPlus,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Music2,
  Sparkles,
  Radio,
} from "lucide-react";
import { motion } from "framer-motion";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { getTracks, type JamendoTrack } from "./jamendo";
import { searchYouTube } from "./youtube";

import "./App.css";

type Track = JamendoTrack & { source?: "youtube" | "jamendo"; videoId?: string };

function fromYouTube(items: Awaited<ReturnType<typeof searchYouTube>>): Track[] {
  return items.map(item => ({
    id: item.id, name: item.title, artist_name: item.artist,
    album_name: "YouTube", image: item.image, audio: "", duration: 0,
    source: "youtube", videoId: item.videoId,
  }));
}

interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}

const FAVORITES_KEY = "sonora-liked-v1";
const PLAYLISTS_KEY = "sonora-playlists-v1";
const TRACKS_KEY = "sonora-saved-tracks-v1";
const HISTORY_KEY = "sonora-history-v1";
const SEARCHES_KEY = "sonora-searches-v1";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestIdRef = useRef(0);
  const playRequestRef = useRef(0);
  const autoPlayRef = useRef(false);
  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);

  const [activePage, setActivePage] = useState("Discover");
  const [menuOpen, setMenuOpen] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [savedTracks, setSavedTracks] = useState<Track[]>(() =>
    readStorage(TRACKS_KEY, [])
  );

  const [liked, setLiked] = useState<string[]>(() =>
    readStorage(FAVORITES_KEY, [])
  );

  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    readStorage(PLAYLISTS_KEY, [])
  );

  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(
    null
  );

  const [playlistName, setPlaylistName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playerError, setPlayerError] = useState("");
  const [upNext, setUpNext] = useState<Track[]>([]);
  const [history, setHistory] = useState<string[]>(() => readStorage(HISTORY_KEY, []));
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readStorage(SEARCHES_KEY, []));
  const [fullPlayer, setFullPlayer] = useState(false);
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<Track[]>([]);

  const navigation = [
    { name: "Discover", icon: Compass },
    { name: "Search", icon: Search },
    { name: "Your Library", icon: Library },
    { name: "Liked Songs", icon: Heart },
    { name: "Recently Played", icon: Clock3 },
    { name: "Up Next", icon: ListMusic },
  ];

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(liked));
  }, [liked]);

  useEffect(() => {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem(TRACKS_KEY, JSON.stringify(savedTracks));
  }, [savedTracks]);

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(SEARCHES_KEY, JSON.stringify(recentSearches)); }, [recentSearches]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (activePage !== "Search" || query.length < 2) {
      setSuggestions([]);
      setSuggestionLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      try {
        const result = fromYouTube(await searchYouTube(query, 6));
        if (!cancelled) setSuggestions(result);
      } catch { if (!cancelled) setSuggestions([]); }
      finally { if (!cancelled) setSuggestionLoading(false); }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, activePage]);

  useEffect(() => {
    const keywords = [...liked, ...history].length > 0
      ? savedTracks.filter(song => liked.includes(song.id) || history.includes(song.id))
      : [];
    const term = keywords[0]?.artist_name || "";
    if (!term) { setRecommendations([]); return; }
    let cancelled = false;
    searchYouTube(term, 12).then(results => {
      const items = fromYouTube(results);
      if (!cancelled) setRecommendations(items.filter(item => !liked.includes(item.id) && !history.includes(item.id)));
    }).catch(() => { if (!cancelled) setRecommendations([]); });
    return () => { cancelled = true; };
  }, [liked, history, savedTracks]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  const loadTracks = useCallback(async (query = "") => {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");

    try {
      const results = query.trim()
        ? fromYouTube(await searchYouTube(query, 24))
        : await getTracks("", 24);

      if (requestId !== requestIdRef.current) return;

      setTracks(results);

      if (results.length === 0) {
        setError("No tracks found. Try another search.");
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const message =
        err instanceof Error ? err.message : "Unknown error";

      setError(`Could not load music: ${message}`);
      setTracks([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const rememberTracks = useCallback((songs: Track[]) => {
    setSavedTracks((previous) => {
      const map = new Map(previous.map((song) => [song.id, song]));

      songs.forEach((song) => map.set(song.id, song));

      return Array.from(map.values());
    });
  }, []);

  const beginPlayback = useCallback(async () => {
    if (currentTrackRef.current?.source === "youtube") return;
    const audio = audioRef.current;
    if (!audio) return;

    const request = ++playRequestRef.current;
    setPlayerError("");

    try {
      await audio.play();
    } catch (err) {
      if (request !== playRequestRef.current) return;

      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }

      setPlayerError(
        "This track could not be played. Try another song."
      );
      setPlaying(false);
      console.error("SONORA playback error:", err);
    }
  }, []);

  useEffect(() => {
    if (!currentTrack) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack.source === "youtube") {
      audio.pause();
      setPlaying(false);
      autoPlayRef.current = false;
      return;
    }
    audio.load();

    if (autoPlayRef.current) {
      autoPlayRef.current = false;
      void beginPlayback();
    }
  }, [currentTrack, beginPlayback]);

  function addToQueue(song: Track) {
    rememberTracks([song]);
    setUpNext(previous => [...previous, song]);
  }

  function moveQueueItem(index: number, direction: number) {
    setUpNext(previous => {
      const next = [...previous];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function playFromQueue(song: Track, index: number) {
    setUpNext(previous => previous.filter((_, i) => i !== index));
    autoPlayRef.current = true;
    currentTrackRef.current = song;
    setCurrentTrack(song);
    setFullPlayer(false);
    if (song.source === "youtube") setHistory(previous => [song.id, ...previous.filter(id => id !== song.id)].slice(0, 50));
    setCurrentTime(0);
    setDuration(0);
    rememberTracks([song]);
  }

  function selectTrack(song: Track, queue: Track[]) {
    queueRef.current = queue;
    rememberTracks([song]);

    if (currentTrackRef.current?.id === song.id) {
      if (song.source === "youtube") { setFullPlayer(true); return; }
      const audio = audioRef.current;

      if (audio?.paused) {
        void beginPlayback();
      } else {
        audio?.pause();
      }

      return;
    }

    autoPlayRef.current = true;
    currentTrackRef.current = song;
    setCurrentTrack(song);
    setFullPlayer(false);
    if (song.source === "youtube") setHistory(previous => [song.id, ...previous.filter(id => id !== song.id)].slice(0, 50));
    setCurrentTime(0);
    setDuration(0);
    setPlayerError("");
  }

  function togglePlayback() {
    const audio = audioRef.current;

    if (!currentTrackRef.current) {
      const first = tracks[0] || savedTracks[0];

      if (first) selectTrack(first, tracks.length ? tracks : savedTracks);
      return;
    }

    if (currentTrackRef.current?.source === "youtube") { setFullPlayer(true); return; }
    if (!audio) return;

    if (audio.paused) {
      void beginPlayback();
    } else {
      ++playRequestRef.current;
      audio.pause();
    }
  }

  function changeTrack(direction: number) {
    const queue = queueRef.current.length
      ? queueRef.current
      : tracks;

    if (!queue.length) return;

    const index = queue.findIndex(
      (song) => song.id === currentTrackRef.current?.id
    );

    const nextIndex =
      (index + direction + queue.length) % queue.length;

    const nextSong = queue[nextIndex];

    autoPlayRef.current = true;
    currentTrackRef.current = nextSong;
    setCurrentTrack(nextSong);
    setCurrentTime(0);
    setDuration(0);
    rememberTracks([nextSong]);
  }

  function nextTrack() {
    if (upNext.length > 0) {
      playFromQueue(upNext[0], 0);
      return;
    }
    changeTrack(1);
  }

  function previousTrack() {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    changeTrack(-1);
  }

  function seekTo(value: number) {
    const audio = audioRef.current;
    if (currentTrackRef.current?.source === "youtube" || !audio || !Number.isFinite(duration) || duration <= 0) return;

    audio.currentTime = (value / 100) * duration;
    setCurrentTime(audio.currentTime);
  }

  function toggleLike(song: Track) {
    rememberTracks([song]);

    setLiked((previous) =>
      previous.includes(song.id)
        ? previous.filter((id) => id !== song.id)
        : [...previous, song.id]
    );
  }

  function createPlaylist() {
    const name = playlistName.trim();
    if (!name) return;

    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: [],
    };

    setPlaylists((previous) => [...previous, playlist]);
    setSelectedPlaylist(playlist.id);
    setPlaylistName("");
  }

  function deletePlaylist(id: string) {
    setPlaylists((previous) =>
      previous.filter((playlist) => playlist.id !== id)
    );

    if (selectedPlaylist === id) {
      setSelectedPlaylist(null);
    }
  }

  function togglePlaylistTrack(playlistId: string, song: Track) {
    rememberTracks([song]);

    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;

        const exists = playlist.trackIds.includes(song.id);

        return {
          ...playlist,
          trackIds: exists
            ? playlist.trackIds.filter((id) => id !== song.id)
            : [...playlist.trackIds, song.id],
        };
      })
    );
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();
    setSubmittedSearch(query);
    if (query) setRecentSearches(previous => [query, ...previous.filter(x => x !== query)].slice(0, 8));
    setSuggestions([]);
    void loadTracks(query);
  }

  function navigate(page: string) {
    setActivePage(page);
    setMenuOpen(false);

    if (page === "Discover") {
      setSubmittedSearch("");
      setSearchQuery("");
      void loadTracks();
    }
  }

  const savedMap = new Map(
    [...savedTracks, ...tracks].map((song) => [song.id, song])
  );

  const likedTracks = liked
    .map((id) => savedMap.get(id))
    .filter((song): song is Track => Boolean(song));

  const activePlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylist
  );

  const playlistTracks = activePlaylist
    ? activePlaylist.trackIds
        .map((id) => savedMap.get(id))
        .filter((song): song is Track => Boolean(song))
    : [];

  const historyTracks = history.map(id => savedMap.get(id)).filter((song): song is Track => Boolean(song));
  const progress =
    duration > 0 ? (currentTime / duration) * 100 : 0;

  function renderTrackGrid(songs: Track[]) {
    return (
      <div className="track-grid">
        {songs.map((song, index) => (
          <motion.div
            className="track-card"
            key={song.id}
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.035, 0.35) }}
          >
            <button
              className="track-image"
              onClick={() => selectTrack(song, songs)}
              aria-label={`Play ${song.name}`}
              style={{
                display: "block",
                width: "100%",
                padding: 0,
                border: 0,
                cursor: "pointer",
              }}
            >
              <img
                src={song.image || "/vite.svg"}
                alt={song.name}
                loading="lazy"
              />

              <div className="track-play">
                {playing && currentTrack?.id === song.id ? (
                  <Pause size={22} fill="currentColor" />
                ) : (
                  <Play size={22} fill="currentColor" />
                )}
              </div>
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.name}
                </h3>
                <p>{song.artist_name}</p>
              </div>

              <button
                onClick={() => toggleLike(song)}
                aria-label={
                  liked.includes(song.id)
                    ? "Unlike song"
                    : "Like song"
                }
                style={{
                  background: "transparent",
                  border: 0,
                  color: liked.includes(song.id)
                    ? "#c5a3ff"
                    : "#938a9d",
                  marginTop: 13,
                  padding: 3,
                  flexShrink: 0,
                }}
              >
                <Heart
                  size={17}
                  fill={
                    liked.includes(song.id)
                      ? "currentColor"
                      : "none"
                  }
                />
              </button>
            </div>

            {playlists.length > 0 && (
              <select
                aria-label={`Add ${song.name} to playlist`}
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    togglePlaylistTrack(event.target.value, song);
                    event.target.value = "";
                  }
                }}
                style={{
                  width: "100%",
                  marginTop: 12,
                  background: "#211b2b",
                  color: "#c8b9d9",
                  border: "1px solid #4b3b5a",
                  borderRadius: 7,
                  padding: "8px 10px",
                  fontSize: 11,
                }}
              >
                <option value="">+ Add/remove from playlist</option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            )}
            <button className="sonora-queue-add" onClick={() => addToQueue(song)} title="Play later">
              <ListPlus size={15} /> Add to queue
            </button>
          </motion.div>
        ))}
      </div>
    );
  }

  function renderStatus() {
    if (loading) {
      return (
        <div className="sonora-loading" role="status" aria-live="polite" aria-label="Loading songs">
          <div className="sonora-loading-heading"><LoaderCircle size={19} className="sonora-loading-spinner" /> TUNING INTO YOUR NEXT OBSESSION...</div>
          <div className="sonora-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="sonora-skeleton-card" key={index}>
                <div className="sonora-skeleton-cover" />
                <div className="sonora-skeleton-line" />
                <div className="sonora-skeleton-line short" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="sonora-state-panel" role="alert">
          <Radio size={31} />
          <span className="sonora-state-kicker">SIGNAL INTERRUPTED / 404</span>
          <h3>THE BEAT DROPPED.</h3>
          <p>{error}</p>
          <button className="primary-button" onClick={() => void loadTracks(submittedSearch)}>
            <RefreshCw size={16} /> TRY AGAIN ↗
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="sonora-app">
      <audio
        ref={audioRef}
        src={currentTrack?.source === "youtube" ? undefined : currentTrack?.audio || undefined}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          const song = currentTrackRef.current;
          if (song) setHistory(previous => [song.id, ...previous.filter(id => id !== song.id)].slice(0, 50));
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onLoadedMetadata={(event) =>
          setDuration(event.currentTarget.duration)
        }
        onDurationChange={(event) =>
          setDuration(event.currentTarget.duration)
        }
        onEnded={nextTrack}
        onError={() => {
          if (currentTrackRef.current) {
            setPlayerError(
              "Audio unavailable for this track. Try another song."
            );
            setPlaying(false);
          }
        }}
      />

      <button
        className="mobile-menu"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        {menuOpen ? <X /> : <Menu />}
      </button>

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-symbol">
            <AudioLines size={25} />
          </div>
          <span>
            sonora<span className="logo-dot">.</span>
          </span>
        </div>

        <p className="sidebar-label">YOUR SOUND UNIVERSE</p>

        <nav className="navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-link ${name === "Up Next" ? "sonora-queue-upgrade" : ""} ${
                activePage === name ? "active" : ""
              }`}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Up Next" && <span className="sonora-queue-count">{upNext.length || "↗"}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="fusion-sidebar-note"><span className="fusion-live-dot"/> NO SKIPS. JUST HITS. <Sparkles size={13}/></div>
          <div className="sonora-feel-upgrade">
            <div className="sonora-vinyl" aria-hidden="true" />
            <h3 className="sonora-feel-title">Feel<br />everything.</h3>
            <p className="sonora-feel-description">Every mood has a soundtrack.<br />Find yours.</p>
            <div className="sonora-feel-decoration">THE SONORA EXPERIENCE ↗</div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="fusion-top-search" onClick={() => navigate("Search")} role="button" tabIndex={0} onKeyDown={event => { if(event.key === "Enter") navigate("Search"); }}><Search size={17}/><span>Find your next obsession...</span><span className="fusion-search-key">GO ↗</span></div>
          <div className="fusion-top-actions">
  <span className="fusion-online">
    <span className="fusion-live-dot" />
    ALWAYS IN TUNE
  </span>

  <Show when="signed-out">
    <SignInButton mode="modal">
      <button
        type="button"
        className="profile-avatar"
        title="Sign in"
        aria-label="Sign in"
      >
        S
      </button>
    </SignInButton>
  </Show>

  <Show when="signed-in">
    <UserButton />
  </Show>
</div>
        </header>

        {activePage === "Discover" && (
          <>
            <motion.section
              className="hero"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="hero-content">
                <span className="eyebrow">
                  ISSUE NO. 001  /  TURN IT UP
                </span>

                <h1>
                  GOOD MUSIC.
                  <br />
                  <em>LOUD FEELINGS.</em>
                </h1>

                <p>
                  For the songs you play on repeat, the ones you discover by accident, and everything in between. Your sound. Your rules.
                </p>

                <button
                  className="primary-button"
                  onClick={togglePlayback}
                >
                  {playing ? (
                    <Pause size={18} />
                  ) : (
                    <Play size={18} />
                  )}
                  {playing ? "Pause experience" : "Start listening"}
                </button>
              </div>

              <div className="hero-visual">
                <div className="fusion-planet" />
                <div className="fusion-halo" />
                <span className="fusion-hero-star fusion-star-a">✦</span>
                <span className="fusion-hero-star fusion-star-b">✧</span>
                <span className="fusion-hero-star fusion-star-c">✦</span>
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />

                <div
                  className={`vinyl ${playing ? "spinning" : ""}`}
                >
                  <div className="vinyl-center">
                    <AudioLines size={35} />
                    <span>SONORA</span>
                  </div>
                </div>
              </div>
              <div className="fusion-hero-footer"><span><Radio size={14}/> MADE TO BE PLAYED LOUD</span><span>01 / ∞</span></div>
            </motion.section>

            <div className="fusion-discovery-strip"><div><Sparkles size={17}/><span>A DIFFERENT KIND OF LISTENING</span></div><div><span>DISCOVER</span><span className="fusion-strip-line"/><span>PLAY</span><span className="fusion-strip-line"/><span>REPEAT</span></div></div>

            <section className="music-section">
              <div className="section-heading">
                <div>
                  <span className="section-label">
                    CURATED FOR YOU
                  </span>
                  <h2>
                    YOUR DAILY <em>ROTATION.</em>
                  </h2>
                </div>
                <span className="section-number">
                  {tracks.length} TRACKS
                </span>
              </div>

              {renderStatus()}
              {!loading && !error && (tracks.length ? renderTrackGrid(tracks) : <div className="sonora-state-panel"><Search size={30}/><span className="sonora-state-kicker">NOTHING ON THIS FREQUENCY</span><h3>NO TRACKS FOUND.</h3><p>Try another artist, song, or mood.</p><button className="primary-button" onClick={() => navigate("Discover")}>EXPLORE MUSIC ↗</button></div>)}
            </section>

            <section className="music-section mood-section">
              <div className="section-heading">
                <div>
                  <span className="section-label">
                    FIND YOUR FREQUENCY
                  </span>
                  <h2>
                    PICK A <em>FEELING.</em>
                  </h2>
                </div>
              </div>

              <div className="mood-grid">
                {[
                  {
                    name: "Late Night",
                    description: "For the hours after midnight",
                    className: "mood-purple",
                    symbol: "☾",
                    query: "ambient",
                  },
                  {
                    name: "Soft Focus",
                    description: "Slow down. Breathe in.",
                    className: "mood-orange",
                    symbol: "✳",
                    query: "acoustic",
                  },
                  {
                    name: "High Energy",
                    description: "Turn everything up",
                    className: "mood-pink",
                    symbol: "⚡",
                    query: "electronic",
                  },
                  {
                    name: "Dream State",
                    description: "Get lost in the sound",
                    className: "mood-blue",
                    symbol: "✦",
                    query: "chill",
                  },
                ].map((mood) => (
                  <button
                    key={mood.name}
                    className={`mood-card ${mood.className}`}
                    style={{
                      border: 0,
                      textAlign: "left",
                      color: "white",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setSearchQuery(mood.query);
                      setSubmittedSearch(mood.query);
                      setActivePage("Search");
                      void loadTracks(mood.query);
                    }}
                  >
                    <span>{mood.symbol}</span>
                    <h3>{mood.name}</h3>
                    <p>{mood.description}</p>
                  </button>
                ))}
              </div>
            </section>
            {recommendations.length > 0 && (
              <section className="music-section">
                <div className="section-heading"><div><span className="section-label">INSPIRED BY YOUR LISTENING</span><h2>For your <em>ears.</em></h2></div></div>
                {renderTrackGrid(recommendations)}
              </section>
            )}
          </>
        )}

        {activePage === "Search" && (
          <section className="music-section">
            <div className="section-heading">
              <div>
                <span className="section-label">
                  EXPLORE THE UNEXPECTED
                </span>
                <h2>
                  Find your <em>sound.</em>
                </h2>
              </div>
            </div>

            <form
              onSubmit={submitSearch}
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 32,
              }}
            >
              <input
                type="search"
                placeholder="Search songs, artists, moods..."
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "16px 18px",
                  background: "#211b2b",
                  color: "white",
                  border: "1px solid #51405f",
                  borderRadius: 12,
                  outline: "none",
                }}
              />

              <button className="primary-button" type="submit">
                <Search size={18} />
                Search
              </button>
            </form>

            {searchQuery.trim().length >= 2 && (
              <div className="sonora-suggestions">
                <span className="section-label">LIVE SUGGESTIONS {suggestionLoading ? "· searching..." : ""}</span>
                {suggestions.map(song => (
                  <button key={song.id} onClick={() => selectTrack(song, suggestions)}>
                    <img src={song.image || "/vite.svg"} alt="" />
                    <span><strong>{song.name}</strong><small>{song.artist_name}</small></span>
                    <Play size={16}/>
                  </button>
                ))}
              </div>
            )}
            {recentSearches.length > 0 && !submittedSearch && (
              <div className="sonora-search-history"><span className="section-label">RECENT SEARCHES</span>
                {recentSearches.map(query => <button key={query} onClick={() => { setSearchQuery(query); setSubmittedSearch(query); void loadTracks(query); }}>{query}</button>)}
              </div>
            )}
            {submittedSearch && (
              <p style={{ color: "#a99bb7", marginBottom: 24 }}>
                Results for "{submittedSearch}"
              </p>
            )}

            {renderStatus()}
            {!loading && !error && (tracks.length ? renderTrackGrid(tracks) : <div className="sonora-state-panel"><Search size={30}/><span className="sonora-state-kicker">NOTHING ON THIS FREQUENCY</span><h3>NO TRACKS FOUND.</h3><p>Try another artist, song, or mood.</p><button className="primary-button" onClick={() => navigate("Discover")}>EXPLORE MUSIC ↗</button></div>)}
          </section>
        )}

        {activePage === "Liked Songs" && (
          <section className="music-section">
            <div className="section-heading">
              <div>
                <span className="section-label">
                  THE SONGS YOU LOVE
                </span>
                <h2>
                  Your <em>favorites.</em>
                </h2>
              </div>
              <span className="section-number">
                {likedTracks.length} SONGS
              </span>
            </div>

            {likedTracks.length ? (
              renderTrackGrid(likedTracks)
            ) : (
              <p style={{ color: "#a99bb7", lineHeight: 1.8 }}>
                No favorites yet. Explore Discover and tap the
                heart beside a track to save it here.
              </p>
            )}
          </section>
        )}

        {activePage === "Recently Played" && (
          <section className="music-section">
            <div className="section-heading"><div><span className="section-label">YOUR LISTENING JOURNEY</span><h2>Recently <em>played.</em></h2></div>
              <button className="sonora-text-action" onClick={() => setHistory([])}>Clear history</button>
            </div>
            {historyTracks.length ? renderTrackGrid(historyTracks) : <div className="sonora-state-panel"><Clock3 size={30}/><span className="sonora-state-kicker">YOUR SOUNDTRACK STARTS HERE</span><h3>NO REPLAYS YET.</h3><p>Play a song and your listening history will show up here.</p><button className="primary-button" onClick={() => navigate("Discover")}>FIND A SONG ↗</button></div>}
          </section>
        )}

        {activePage === "Up Next" && (
          <section className="music-section">
            <div className="section-heading"><div><span className="section-label">YOUR PERSONAL LINEUP</span><h2>Up <em>next.</em></h2></div>
              <button className="sonora-text-action" onClick={() => setUpNext([])}>Clear queue</button>
            </div>
            {upNext.length ? upNext.map((song, index) => (
              <div className="sonora-queue-row" key={`${song.id}-${index}`}>
                <button className="sonora-queue-song" onClick={() => playFromQueue(song, index)}>
                  <img src={song.image || "/vite.svg"} alt=""/><span><strong>{song.name}</strong><small>{song.artist_name}</small></span>
                </button>
                <button title="Move up" disabled={index === 0} onClick={() => moveQueueItem(index,-1)}><ArrowUp size={17}/></button>
                <button title="Move down" disabled={index === upNext.length-1} onClick={() => moveQueueItem(index,1)}><ArrowDown size={17}/></button>
                <button title="Remove" onClick={() => setUpNext(previous => previous.filter((_, i) => i !== index))}><X size={17}/></button>
              </div>
            )) : <div className="sonora-state-panel"><ListMusic size={30}/><span className="sonora-state-kicker">YOUR NEXT TRACK AWAITS</span><h3>THE QUEUE IS QUIET.</h3><p>Add songs using “Add to queue” beneath any track.</p><button className="primary-button" onClick={() => navigate("Discover")}>DISCOVER TRACKS ↗</button></div>}
          </section>
        )}

        {activePage === "Your Library" && (
          <section className="music-section">
            <div className="section-heading">
              <div>
                <span className="section-label">
                  YOUR PERSONAL COLLECTION
                </span>
                <h2>
                  Your <em>library.</em>
                </h2>
              </div>
            </div>

            <div
              style={{
                background: "#1b1624",
                border: "1px solid #443450",
                borderRadius: 16,
                padding: 24,
                marginBottom: 30,
              }}
            >
              <h3
                style={{
                  fontFamily: "Outfit, sans-serif",
                  marginTop: 0,
                }}
              >
                Create a playlist
              </h3>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  createPlaylist();
                }}
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <input
                  value={playlistName}
                  onChange={(event) =>
                    setPlaylistName(event.target.value)
                  }
                  placeholder="My late night playlist..."
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: "#292134",
                    border: "1px solid #544361",
                    borderRadius: 10,
                    padding: 14,
                    color: "white",
                  }}
                />

                <button className="primary-button" type="submit">
                  <Plus size={17} />
                  Create
                </button>
              </form>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
                marginBottom: 35,
              }}
            >
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  style={{
                    padding: 20,
                    background:
                      selectedPlaylist === playlist.id
                        ? "#352443"
                        : "#201a29",
                    border: "1px solid #4d3b5c",
                    borderRadius: 12,
                  }}
                >
                  <button
                    onClick={() =>
                      setSelectedPlaylist(playlist.id)
                    }
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "white",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <ListMusic
                      size={27}
                      color="#c5a3ff"
                      style={{ marginBottom: 14 }}
                    />

                    <h3 style={{ margin: "0 0 8px" }}>
                      {playlist.name}
                    </h3>

                    <p
                      style={{
                        color: "#a99bb7",
                        fontSize: 12,
                        margin: 0,
                      }}
                    >
                      {playlist.trackIds.length} songs
                    </p>
                  </button>

                  <button
                    onClick={() => deletePlaylist(playlist.id)}
                    aria-label={`Delete ${playlist.name}`}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "#b7a0bd",
                      marginTop: 16,
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>

            {activePlaylist && (
              <>
                <div className="section-heading">
                  <div>
                    <span className="section-label">
                      SELECTED PLAYLIST
                    </span>
                    <h2>{activePlaylist.name}</h2>
                  </div>
                </div>

                {playlistTracks.length ? (
                  renderTrackGrid(playlistTracks)
                ) : (
                  <p style={{ color: "#a99bb7" }}>
                    This playlist is empty. Go to Discover or Search
                    and use the playlist selector under a song.
                  </p>
                )}
              </>
            )}

            {!playlists.length && (
              <p style={{ color: "#a99bb7" }}>
                Your playlists will appear here.
              </p>
            )}
          </section>
        )}
      </main>

      {currentTrack?.source === "youtube" && currentTrack.videoId && (
        <div className={`sonora-youtube-panel ${fullPlayer ? "sonora-youtube-expanded" : ""}`}>
          <div className="sonora-youtube-header">
            <span>SONORA · YOUTUBE VIDEO PLAYER</span>
            <div>
              <button onClick={() => setFullPlayer(value => !value)} aria-label="Toggle video size">
                {fullPlayer ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
              </button>
              <button onClick={() => { setCurrentTrack(null); setFullPlayer(false); }} aria-label="Close video"><X size={18}/></button>
            </div>
          </div>
          <iframe
            key={currentTrack.videoId}
            src={`https://www.youtube.com/embed/${encodeURIComponent(currentTrack.videoId)}?autoplay=1&playsinline=1`}
            title={`${currentTrack.name} — YouTube player`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p>Use the YouTube player's controls to play, pause, seek, or adjust volume.</p>
        </div>
      )}

      {fullPlayer && currentTrack?.source !== "youtube" && (
        <div className="sonora-fullscreen" role="dialog" aria-modal="true" aria-label="Full screen player">
          <button className="sonora-full-close" onClick={() => setFullPlayer(false)}><Minimize2 size={20}/> Minimize</button>
          <div className="sonora-full-art">
            {currentTrack?.image ? <img src={currentTrack.image} alt={currentTrack.name} /> : <Music2 size={90}/>}
          </div>
          <span className="section-label">NOW PLAYING ON SONORA</span>
          <h2>{currentTrack?.name || "Nothing playing"}</h2>
          <p>{currentTrack?.artist_name || "Choose a track to begin"}</p>
          <div className="sonora-full-controls">
            <button onClick={previousTrack} aria-label="Previous"><SkipBack/></button>
            <button onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={30}/> : <Play size={30}/>}</button>
            <button onClick={nextTrack} aria-label="Next"><SkipForward/></button>
          </div>
          <input type="range" min="0" max="100" value={progress} onChange={event => seekTo(Number(event.target.value))} aria-label="Seek"/>
          <div className="sonora-full-times"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
          <p className="sonora-lyrics-note">Lyrics aren't available yet. They require a licensed lyrics provider.</p>
        </div>
      )}

      <footer className={`music-player ${currentTrack ? "sonora-player-active" : ""}`} aria-label="Music player">
        <div className="now-playing">
          <span className="sonora-now-playing-label">{currentTrack ? "● NOW PLAYING" : "○ READY WHEN YOU ARE"}</span>
          {currentTrack?.image ? (
            <img
              src={currentTrack.image}
              alt={currentTrack.name}
            />
          ) : (
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 7,
                background: "#352443",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Disc3 size={25} color="#c5a3ff" />
            </div>
          )}

          <div style={{ minWidth: 0 }}>
            <h4 aria-live="polite"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentTrack?.name || "Nothing playing"}
            </h4>
            <p>{currentTrack?.artist_name || "Choose a song"}</p>
          </div>

          {currentTrack && (
            <button
              onClick={() => toggleLike(currentTrack)}
              aria-label="Like current song"
              style={{
                background: "transparent",
                border: 0,
                color: liked.includes(currentTrack.id)
                  ? "#c5a3ff"
                  : "#938a9d",
                marginLeft: 12,
              }}
            >
              <Heart
                size={18}
                fill={
                  liked.includes(currentTrack.id)
                    ? "currentColor"
                    : "none"
                }
              />
            </button>
          )}
        </div>

        <div className="player-center">
          {currentTrack?.source === "youtube" ? (
            <button className="sonora-youtube-open" onClick={() => setFullPlayer(value => !value)}>
              <Play size={17}/> {fullPlayer ? "Minimize YouTube player" : "Watch / control YouTube video"}
            </button>
          ) : <>
          <div className="player-controls">
            <button onClick={previousTrack} aria-label="Previous">
              <SkipBack size={19} fill="currentColor" />
            </button>

            <button
              className="play-button"
              onClick={togglePlayback}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause size={19} fill="currentColor" />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>

            <button onClick={nextTrack} aria-label="Next">
              <SkipForward size={19} fill="currentColor" />
            </button>
          </div>

          <div className="progress-bar">
            <span>{formatTime(currentTime)}</span>

            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={(event) =>
                seekTo(Number(event.target.value))
              }
              aria-label="Seek audio"
              style={{
                flex: 1,
                minWidth: 0,
                accentColor: "#c2a0ff",
                cursor: "pointer",
              }}
            />

            <span>{formatTime(duration)}</span>
          </div>

          {playerError && (
            <span
              style={{
                color: "#f3a6b6",
                fontSize: 10,
                textAlign: "center",
              }}
            >
              {playerError}
            </span>
          )}
        </>}
        </div>

        <div className="volume-control">
          <button className="sonora-player-extra" onClick={() => {setActivePage("Up Next"); }} title="View queue"><ListMusic size={19}/></button>
          <button className="sonora-player-extra" onClick={() => setFullPlayer(true)} title="Full screen player"><Maximize2 size={19}/></button>
          {currentTrack?.source !== "youtube" && <button
            onClick={() =>
              setVolume((previous) => (previous > 0 ? 0 : 0.7))
            }
            aria-label="Toggle mute"
            style={{
              background: "transparent",
              border: 0,
              color: "#a49aaf",
            }}
          >
            {volume === 0 ? (
              <VolumeX size={20} />
            ) : (
              <Volume2 size={20} />
            )}
          </button>}

          {currentTrack?.source !== "youtube" && <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) =>
              setVolume(Number(event.target.value))
            }
            aria-label="Volume"
            style={{
              width: 100,
              accentColor: "#c2a0ff",
              cursor: "pointer",
            }}
          />}
        </div>
      </footer>
    </div>
  );
}

export default App;
