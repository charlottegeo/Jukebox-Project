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
    bpm?: number;
    audioPath?: string;
    submittedBy: string;
    duration?: number;
}

export interface UserQueue {
    uid: string;
    queue: Song[];
}

export interface ActiveUser {
    username: string;
    queueCount: number;
    profilePicture: string;
    color: string;
    isAdmin: boolean;
}

export interface SongLengthLimits {
    maxLength: number;
    minLength: number;
}
