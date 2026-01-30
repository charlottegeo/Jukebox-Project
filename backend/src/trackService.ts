import { Song } from "./interfaces";
import { SpotifyApi, Market } from "@spotify/web-api-ts-sdk";
import { exec } from "child_process";
import * as youtubeSearchApi from "youtube-search-api";
import * as ytdl from "ytdl-core";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const clientId = process.env.SPOTIFY_CLIENT_ID as string;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET as string;
const spotifyApi = SpotifyApi.withClientCredentials(clientId, clientSecret);

export const downloadSpotifyAudio = async (
  track_id: string,
): Promise<string> => {
  try {
    const track = await spotifyApi.tracks.get(track_id);
    const isrc = track.external_ids?.isrc;
    const trackName = track.name;
    const artistName = track.artists[0]?.name || "";
    const expectedDurationSec = Math.floor(track.duration_ms / 1000);

    const finalOutputPath = `/app/downloads/${track_id}.mp3`;
    const clean = (q: string) => q.replace(/'/g, "");

    const searchQueries = [
      isrc ? `${isrc}` : null,
      `"${clean(artistName)}" "${clean(trackName)}" official audio`,
    ].filter(Boolean) as string[];

    let targetVideoId: string | null = null;

    for (const query of searchQueries) {
      console.log(`[SEARCH] Query: ${query}`);
      const searchResult = await youtubeSearchApi.GetListByKeyword(
        query!,
        false,
        5,
        [{ type: "video" }],
      );

      for (const video of searchResult.items) {
        const videoDurationSec = parseYouTubeDurationToSeconds(
          video.length?.simpleText || "0:00",
        );
        const diff = Math.abs(videoDurationSec - expectedDurationSec);
        const title = video.title.toLowerCase();
        const artistMatch = title.includes(artistName.toLowerCase());

        console.log(
          `[CHECK] "${video.title}" | Dur: ${videoDurationSec}s | Diff: ${diff}s | Artist Match: ${artistMatch}`,
        );
        if (
          videoDurationSec > 0 &&
          (diff <= 20 || (diff <= 50 && artistMatch))
        ) {
          targetVideoId = video.id;
          break;
        }
      }
      if (targetVideoId) break;
    }

    if (!targetVideoId) {
      throw new Error(
        `No accurate YouTube match found for: ${trackName} (${artistName})`,
      );
    }

    console.log(
      `[MATCH FOUND] Choosing: ${targetVideoId}. Starting download...`,
    );

    await new Promise<void>((resolve, reject) => {
      const url = `https://www.youtube.com/watch?v=${targetVideoId}`;
      const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist --no-cache-dir --no-part --force-overwrites -o "${finalOutputPath.replace(".mp3", ".%(ext)s")}" "${url}"`;

      exec(command, (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr));
        resolve();
      });
    });

    return `/downloads/${track_id}.mp3`;
  } catch (error) {
    console.error("Spotify download failed:", error);
    throw error;
  }
};

const runDownload = (videoId: string, outputPath: string) => {
  return new Promise<void>((resolve, reject) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const command = `yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist --no-cache-dir --no-part --force-overwrites -o "${outputPath.replace(".mp3", ".%(ext)s")}" "${url}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr));
      resolve();
    });
  });
};

export const downloadYouTubeAudio = (youtubeUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const command = `yt-dlp --extract-audio --audio-format mp3 -o "/app/downloads/%(id)s.%(ext)s" ${youtubeUrl}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error downloading YouTube audio: ${stderr}`);
        return reject(error);
      }
      const youtubeId = youtubeUrl.split("v=")[1];
      const audioPath = `/downloads/${youtubeId}.mp3`;
      resolve(audioPath);
    });
  });
};

export const searchYouTube = async (
  query: string,
  limit = 5,
): Promise<Song[]> => {
  try {
    const result = await youtubeSearchApi.GetListByKeyword(
      query,
      false,
      limit,
      [{ type: "video" }],
    );
    const videos = result.items.map((item: any) => ({
      track_name: item.title,
      artist_name: item.channelTitle || "Unknown",
      track_length: item.length?.simpleText || "Unknown",
      cover_url: item.thumbnail.thumbnails[0].url,
      track_id: item.id,
      uri: `https://www.youtube.com/watch?v=${item.id}`,
      source: "youtube" as const,
      id: uuidv4(),
      bpm: null,
      submittedBy: "Unknown",
    }));

    return videos;
  } catch (error) {
    console.error("Error fetching YouTube search results:", error);
    return [];
  }
};

export const handleYouTubeLink = async (link: string): Promise<Song[]> => {
  try {
    let videoId: string | null = null;

    if (link.includes("watch?v=")) {
      videoId = link.split("watch?v=")[1].split("&")[0];
    } else if (link.includes("youtu.be/")) {
      videoId = link.split("youtu.be/")[1].split("?")[0];
    }

    if (videoId) {
      const videoDetails = await youtubeSearchApi.GetVideoDetails(videoId);
      console.log("Video details:", videoDetails);
      const videoInfo = await ytdl.getInfo(videoId);
      const duration = videoInfo.videoDetails.lengthSeconds;
      const formattedDuration = formatYouTubeDuration(duration);
      return [
        {
          id: uuidv4(),
          track_name: videoDetails.title || "Unknown Title",
          artist_name:
            videoDetails.channel ||
            videoDetails.shortBylineText ||
            "Unknown Artist",
          track_length: formattedDuration,
          cover_url: videoDetails.thumbnail.url,
          track_id: videoDetails.id,
          uri: `https://www.youtube.com/watch?v=${videoDetails.id}`,
          source: "youtube",
          bpm: null,
          submittedBy: "Unknown",
        },
      ];
    } else if (link.includes("playlist?list=")) {
      const playlistId = link.split("playlist?list=")[1].split("&")[0];
      const playlistData = await youtubeSearchApi.GetPlaylistData(playlistId);
      const videos = playlistData.items;

      const songs: Song[] = await Promise.all(
        videos.map(async (item: any) => {
          const videoDetails = await youtubeSearchApi.GetVideoDetails(item.id);
          const videoInfo = await ytdl.getInfo(item.id);
          const duration = videoInfo.videoDetails.lengthSeconds;
          const formattedDuration = formatYouTubeDuration(duration);

          return {
            id: uuidv4(),
            track_name: item.title || "Unknown Title",
            artist_name:
              videoDetails.channel || item.shortBylineText || "Unknown Artist",
            track_length: formattedDuration,
            cover_url: item.thumbnail.url || "",
            track_id: item.id,
            uri: `https://www.youtube.com/watch?v=${item.id}`,
            source: "youtube",
            bpm: null,
            submittedBy: "Unknown",
          };
        }),
      );

      return songs;
    } else {
      throw new Error("Invalid YouTube link");
    }
  } catch (error) {
    console.error("Error handling YouTube link:", error);
    throw error;
  }
};

export const searchSpotifyTracks = async (
  query: string,
  limit = 5,
  types: ("track" | "album" | "artist")[] = ["track"],
  submittedBy: string,
): Promise<Song[]> => {
  try {
    const searchResult = await spotifyApi.search(query, types, "US" as Market);
    const trimmedResults = searchResult.tracks?.items.slice(0, limit);

    return await Promise.all(
      trimmedResults?.map(async (track) => {
        return {
          id: uuidv4(),
          track_name: track.name,
          artist_name: track.artists.map((artist) => artist.name).join(", "),
          track_length: formatTrackLength(track.duration_ms),
          cover_url: track.album?.images[0]?.url || "",
          track_id: track.id,
          uri: track.uri,
          source: "spotify",
          submittedBy,
        };
      }) ?? [],
    );
  } catch (error) {
    console.error("Error searching tracks on Spotify:", error);
    return [];
  }
};

export const handleSpotifyLink = async (
  link: string,
  submittedBy: string,
): Promise<Song[]> => {
  try {
    const url = new URL(link);
    const pathParts = url.pathname.split("/");
    const linkType = pathParts[1];
    const itemId = pathParts[2];
    console.log("Handling Spotify link:", link);
    console.log("Link type:", linkType);
    console.log("Item ID:", itemId);

    if (!itemId) {
      throw new Error("No ID found in the provided Spotify link");
    }

    if (linkType === "track") {
      const track = await spotifyApi.tracks.get(itemId);
      return [
        {
          id: uuidv4(),
          track_name: track.name,
          artist_name: track.artists.map((artist) => artist.name).join(", "),
          track_length: formatTrackLength(track.duration_ms),
          cover_url: track.album?.images[0]?.url || "",
          track_id: track.id,
          uri: track.uri,
          source: "spotify",
          submittedBy,
        },
      ];
    } else if (linkType === "album") {
      const album = await spotifyApi.albums.get(itemId);
      const tracks = album.tracks.items;
      const albumCoverUrl = album.images[0]?.url || "";

      const songs: Song[] = tracks.map((track) => {
        return {
          id: uuidv4(),
          track_name: track.name,
          artist_name: track.artists.map((artist) => artist.name).join(", "),
          track_length: formatTrackLength(track.duration_ms),
          cover_url: albumCoverUrl,
          track_id: track.id,
          uri: track.uri,
          source: "spotify",
          submittedBy,
        };
      });
      return songs;
    } else if (linkType === "playlist") {
      const playlist = await spotifyApi.playlists.getPlaylist(itemId);
      const tracks = playlist.tracks.items;
      const songs: Song[] = tracks.map((item) => {
        const track = item.track;
        return {
          id: uuidv4(),
          track_name: track.name,
          artist_name: track.artists.map((artist) => artist.name).join(", "),
          track_length: formatTrackLength(track.duration_ms),
          cover_url: track.album?.images[0]?.url || "",
          track_id: track.id,
          uri: track.uri,
          source: "spotify",
          submittedBy,
        };
      });
      return songs;
    } else {
      throw new Error("Invalid Spotify link type");
    }
  } catch (error) {
    console.error("Error handling Spotify link:", error);
    throw error;
  }
};

const formatTrackLength = (durationMs: number): string => {
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatYouTubeDuration = (duration: string): string => {
  const seconds = parseInt(duration, 10);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const parseYouTubeDurationToSeconds = (durationStr: string): number => {
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};
