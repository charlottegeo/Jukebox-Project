import React from 'react';
import { Song } from '../types';

interface SongListProps {
    songs: Song[];
    onSelect: (song: Song) => void;
}

const SongList: React.FC<SongListProps> = ({ songs, onSelect }) => {
    return (
        <ul>
            {songs.map((song, index) => (
                <li key={index} onClick={() => onSelect(song)}>
                    <div><strong>{song.track_name}</strong> by {song.artist_name}</div>
                    <div>{song.track_length}</div>
                </li>
            ))}
        </ul>
    );
};

export default SongList;