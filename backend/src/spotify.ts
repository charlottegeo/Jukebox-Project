import { SpotifyApi, Market } from "@spotify/web-api-ts-sdk";
import dotenv from "dotenv";

dotenv.config();
console.log("Client ID: ", process.env.SPOTIFY_CLIENT_ID);
console.log("Client Secret: ", process.env.SPOTIFY_CLIENT_SECRET);
const clientId = process.env.SPOTIFY_CLIENT_ID as string;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET as string;

const spotifyApi = SpotifyApi.withClientCredentials(clientId, clientSecret);

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

const formatTrackLength = (durationMs: number): string => {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
};
