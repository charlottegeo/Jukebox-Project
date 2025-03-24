import { v4 as uuidv4 } from 'uuid';

export interface Song {
    id: string;
    track_name: string;
    artist_name: string;
    track_length: string;
    cover_url: string;
    track_id: string;
    uri: string;
    source: 'spotify' | 'youtube';
    audioPath?: string;
    submittedBy: string;
}

export interface UserQueue {
    uid: string;
    queue: Song[];
}
