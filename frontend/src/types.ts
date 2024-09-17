import { v4 as uuidv4 } from 'uuid';

export interface Song {
    track_name: string;
    artist_name: string;
    track_length: string;
    cover_url: string;
    track_id: string;
    id: string;
}

export interface UserQueue {
    uid: string;
    queue: Song[];
}
