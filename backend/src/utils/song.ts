import * as youtubeSearchApi from "youtube-search-api";

function extractYouTubeVideoId(url: string): string | null {
  if (url.includes("watch?v=")) {
    return url.split("watch?v=")[1].split("&")[0].split("#")[0];
  }
  if (url.includes("youtu.be/")) {
    return url.split("youtu.be/")[1].split("?")[0].split("&")[0].split("#")[0];
  }
  return null;
}

function parseDurationToSeconds(durationStr: string): number {
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export async function getSongDuration(audioPath: string): Promise<number> {
  try {
    if (audioPath.includes("youtube.com") || audioPath.includes("youtu.be")) {
      const videoId = extractYouTubeVideoId(audioPath);
      if (!videoId) return 0;
      const result = await youtubeSearchApi.GetListByKeyword(
        videoId,
        false,
        5,
        [{ type: "video" }],
      );
      const match = result.items?.find((item: any) => item.id === videoId);
      const raw = match?.length;
      const durationStr =
        typeof raw === "string"
          ? raw
          : raw?.simpleText ?? raw?.runs?.[0]?.text ?? "0:00";
      return parseDurationToSeconds(durationStr);
    }

    if (audioPath.includes("spotify")) {
      const lengthParts = audioPath.split(":");
      if (lengthParts.length === 2) {
        const minutes = parseInt(lengthParts[0], 10);
        const seconds = parseInt(lengthParts[1], 10);
        return minutes * 60 + seconds;
      }
    }
    return 0;
  } catch (error) {
    console.error("Error getting song duration:", error);
    throw error;
  }
}
