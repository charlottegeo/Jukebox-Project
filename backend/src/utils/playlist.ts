import * as youtubeSearchApi from "youtube-search-api";

function extractPlaylistId(url: string): string | null {
  if (url.includes("playlist?list=")) {
    return url.split("playlist?list=")[1].split("&")[0].split("#")[0];
  }
  return null;
}

function normalizeYouTubeText(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const runs = value?.runs;
  if (Array.isArray(runs) && runs[0]?.text) return String(runs[0].text);
  return "";
}

export async function getPlaylistSongs(playlistUrl: string): Promise<any[]> {
  try {
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      throw new Error("Invalid playlist URL");
    }
    const { items } = await youtubeSearchApi.GetPlaylistData(playlistId);
    if (!items?.length) {
      throw new Error("No videos found in playlist");
    }
    return items.map((item: any) => {
      const thumbnail = item.thumbnail;
      const coverUrl =
        thumbnail?.url ?? thumbnail?.thumbnails?.[0]?.url ?? "";
      const artist =
        normalizeYouTubeText(item.channelTitle) ||
        normalizeYouTubeText(item.shortBylineText) ||
        "Unknown Artist";
      return {
        track_name: normalizeYouTubeText(item.title) || "Unknown Title",
        artist_name: artist,
        audioPath: `https://www.youtube.com/watch?v=${item.id}`,
        cover_image_url: coverUrl,
        submittedBy: "Playlist Import",
      };
    });
  } catch (error) {
    console.error("Error getting playlist songs:", error);
    throw error;
  }
}
