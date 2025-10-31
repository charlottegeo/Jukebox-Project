import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a music track from either Spotify or YouTube
 */
export interface Song {
    /** Unique identifier for the song */
    id: string;
    /** Display name of the track */
    track_name: string;
    /** Name of the artist */
    artist_name: string;
    /** Formatted duration string (e.g. "3:45") */
    track_length: string;
    /** URL to the album/track artwork */
    cover_url: string;
    /** Platform-specific track ID */
    track_id: string;
    /** Platform-specific URI for playback */
    uri: string;
    /** Source platform of the track */
    source: 'spotify' | 'youtube';
    /** Beats per minute (optional) */
    bpm?: number;
    /** Local audio file path (optional) */
    audioPath?: string;
    /** Username of the person who submitted the track */
    submittedBy: string;
    /** Duration in milliseconds (optional) */
    duration?: number;
}

/**
 * Represents a user's queue of songs
 */
export interface UserQueue {
    /** User's unique identifier */
    uid: string;
    /** Array of songs in the queue */
    queue: Song[];
}

/**
 * Represents an active user in the system
 */
export interface ActiveUser {
    /** User's display name */
    username: string;
    /** Number of songs in user's queue */
    queueCount: number;
    /** URL to user's profile picture */
    profilePicture: string;
    /** User's assigned color theme */
    color: string;
    /** Whether the user has admin privileges */
    isAdmin: boolean;
}

/**
 * Defines the length limits for songs
 */
export interface SongLengthLimits {
    /** Maximum allowed song length in seconds */
    maxLength: number;
    /** Minimum allowed song length in seconds */
    minLength: number;
}
