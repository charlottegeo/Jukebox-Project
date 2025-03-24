import React from 'react';
import { Song } from '../types';

interface SongListProps {
    songs: Song[];
    onSelect: (song: Song) => void;
}

const SongList: React.FC<SongListProps> = ({ songs, onSelect }) => {
    return (
        <div className="song-list">
            {songs.map((song, index) => (
                <div key={index} onClick={() => onSelect(song)} className="song-item">
                    <img src={song.cover_url} alt={song.track_name} />
                    <div className="song-info">
                        <div className="track-name">{song.track_name}</div>
                        <div className="artist-name">{song.artist_name}</div>
                        <div className="duration">{song.track_length}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SongList;
