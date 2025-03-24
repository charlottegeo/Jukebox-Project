export interface Song {
    id: string;
    track_name: string;
    artist_name: string;
    track_length: string;
    cover_url: string;
    track_id: string;
    uri: string;
    source: 'spotify' | 'youtube';
    bpm?: number | null;
    submittedBy: string;
    audioPath?: string;
}

export interface UserQueue {
    uid: string;
    queue: Song[];
}
