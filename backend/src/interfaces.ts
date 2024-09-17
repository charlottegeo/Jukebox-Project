/**
 * Represents a song.
 */
export interface Song {
    track_name: string;
    artist_name: string;
    track_length: string;
    cover_url: string;
    track_id: string;
    id: string;
}

/**
 * Represents a user's queue.
 */
export interface UserQueue {
    uid: string;
    queue: Song[];
}
