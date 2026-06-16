/**
 * YouTube transcript fetcher stub (Feature 022 / F11).
 *
 * v1: Stub — returns no transcript.
 * v1.1: Will use yt-dlp sidecar to fetch YouTube transcripts with timestamps,
 * parse SRT format, and register as Resource with timing metadata.
 *
 * TODO(v1.1): Bundle yt-dlp as Tauri sidecar binary.
 * TODO(v1.1): Implement invoke('fetch_youtube_transcript', { url })
 *             → returns SRT text with timestamps.
 * TODO(v1.1): Parse SRT into timed segments for chunked RAG ingestion.
 */

export interface TranscriptSegment {
  start: number; // seconds
  end: number;
  text: string;
}

export interface TranscriptResult {
  videoId: string;
  title: string;
  segments: TranscriptSegment[];
  error?: string;
}

/**
 * Fetch YouTube video transcript with timestamps.
 * v1: Stub — returns empty segments (not yet implemented).
 */
export async function fetchYoutubeTranscript(_url: string): Promise<TranscriptResult> {
  void _url;
  // v1: Stub
  // v1.1 will use:
  //   const result = await invoke('fetch_youtube_transcript', { url });
  //   → returns SRT text
  //   → parse into timed segments
  throw new Error(
    "YouTube transcript fetching is not available in v1. " +
      "The yt-dlp sidecar integration is planned for v1.1.",
  );
}

/**
 * Check if a URL is a YouTube video.
 */
export function isYoutubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed)/.test(url);
}
