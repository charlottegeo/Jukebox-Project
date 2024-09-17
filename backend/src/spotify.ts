import { SpotifyApi, Market, AudioFeatures } from "@spotify/web-api-ts-sdk";
import dotenv from "dotenv";

dotenv.config();
const clientId = process.env.SPOTIFY_CLIENT_ID as string;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET as string;
const spotifyApi = SpotifyApi.withClientCredentials(clientId, clientSecret);

/**
 * 
 * @param query - Search query
 * @param limit - Maximum number of results 
 * @param types - Types of search results to return 
 * @returns - Search results
 */
export const searchSpotifyTracks = async (
    query: string,
    limit = 5,
    types: ('track' | 'album' | 'artist')[] = ['track']
) => {
    try {
        const searchResult = await spotifyApi.search(query, types, 'US' as Market);

        const trimmedResults = searchResult.tracks?.items.slice(0, limit);

        return trimmedResults?.map((track) => ({
            track_name: track.name,
            artist_name: track.artists.map((artist) => artist.name).join(', '),
            track_length: formatTrackLength(track.duration_ms),
            cover_url: track.album?.images[0]?.url || '',
            track_id: track.id,
        }));
    } catch (error) {
        console.error('Error searching tracks on Spotify:', error);
        return [];
    }
};

/**
 * 
 * @param trackId - Spotify track ID
 * @returns - Audio features
 */
export const getAudioFeaturesForTrack = async (trackId: string) => {
    try {
        const audioFeatures = await spotifyApi.tracks.audioFeatures(trackId);
        return audioFeatures;
    } catch (error) {
        console.error('Error getting audio features for track:', error);
        return null;
    }
};

/**
 * 
 * @param durationMs - Track duration in milliseconds
 * @returns - Formatted track length in minutes and seconds
 */
const formatTrackLength = (durationMs: number): string => {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
};
