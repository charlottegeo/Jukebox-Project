import { SpotifyApi, Market } from "@spotify/web-api-ts-sdk";
import { Song } from "./interfaces";
import { v4 as uuidv4 } from 'uuid';
import dotenv from "dotenv";

dotenv.config();
const clientId = process.env.SPOTIFY_CLIENT_ID as string;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET as string;
const spotifyApi = SpotifyApi.withClientCredentials(clientId, clientSecret);

export const searchSpotifyTracks = async (
    query: string,
    limit = 5,
    types: ('track' | 'album' | 'artist')[] = ['track']
): Promise<Song[]> => {
    try {
        const searchResult = await spotifyApi.search(query, types, 'US' as Market);
        const trimmedResults = searchResult.tracks?.items.slice(0, limit);

        return await Promise.all(trimmedResults?.map(async (track) => {
            const audioFeatures = await getAudioFeaturesForTrack(track.id);
            return {
                id: uuidv4(),
                track_name: track.name,
                artist_name: track.artists.map((artist) => artist.name).join(', '),
                track_length: formatTrackLength(track.duration_ms),
                cover_url: track.album?.images[0]?.url || '',
                track_id: track.id,
                bpm: audioFeatures?.tempo || 90,
                uri: track.uri,
                source: 'spotify'
            };
        }) ?? []);
    } catch (error) {
        console.error('Error searching tracks on Spotify:', error);
        return [];
    }
};

export const handleSpotifyLink = async (link: string): Promise<Song[]> => {
    try {
        if (link.includes('/track/')) {
            const trackId = link.split('/track/')[1].split('?')[0];
            const track = await spotifyApi.tracks.get(trackId);
            const audioFeatures = await getAudioFeaturesForTrack(trackId);
            return [{
                id: uuidv4(),
                track_name: track.name,
                artist_name: track.artists.map((artist) => artist.name).join(', '),
                track_length: formatTrackLength(track.duration_ms),
                cover_url: track.album?.images[0]?.url || '',
                track_id: track.id,
                bpm: audioFeatures?.tempo || 90,
                uri: track.uri,
                source: 'spotify'
            }];
        } else if (link.includes('/album/')) {
            const albumId = link.split('/album/')[1].split('?')[0];
            const album = await spotifyApi.albums.get(albumId);
            const tracks = album.tracks.items;
            const albumCoverUrl = album.images[0]?.url || ''; // Get the album cover once

            const songs: Song[] = await Promise.all(tracks.map(async (track) => {
                const audioFeatures = await getAudioFeaturesForTrack(track.id);
                return {
                    id: uuidv4(),
                    track_name: track.name,
                    artist_name: track.artists.map((artist) => artist.name).join(', '),
                    track_length: formatTrackLength(track.duration_ms),
                    cover_url: albumCoverUrl, // Use the same album cover for all tracks
                    track_id: track.id,
                    bpm: audioFeatures?.tempo || 90,
                    uri: track.uri,
                    source: 'spotify'
                };
            }));
            return songs;
        } else if (link.includes('/playlist/')) {
            const playlistId = link.split('/playlist/')[1].split('?')[0];
            const playlist = await spotifyApi.playlists.getPlaylist(playlistId);
            const tracks = playlist.tracks.items;
            const songs: Song[] = await Promise.all(tracks.map(async (item) => {
                const track = item.track;
                const audioFeatures = await getAudioFeaturesForTrack(track.id);
                return {
                    id: uuidv4(),
                    track_name: track.name,
                    artist_name: track.artists.map((artist) => artist.name).join(', '),
                    track_length: formatTrackLength(track.duration_ms),
                    cover_url: track.album?.images[0]?.url || '',
                    track_id: track.id,
                    bpm: audioFeatures?.tempo || 90,
                    uri: track.uri,
                    source: 'spotify'
                };
            }));
            return songs;
        } else {
            throw new Error('Invalid Spotify link');
        }
    } catch (error) {
        console.error('Error handling Spotify link:', error);
        throw error;
    }
};

export const getAudioFeaturesForTrack = async (trackId: string) => {
    try {
      const audioFeatures = await spotifyApi.tracks.audioFeatures(trackId);
      return audioFeatures;
    } catch (error) {
      console.error(`Error getting audio features for track ${trackId}:`, error);
      return { tempo: 90 };
    }
  };
  

const formatTrackLength = (durationMs: number): string => {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
};
