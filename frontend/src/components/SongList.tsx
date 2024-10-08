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
                <li key={index} onClick={() => onSelect(song)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '10px',
                    background: '#2c2c2c',
                    padding: '10px',
                    borderRadius: '5px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                }}>
                    <img src={song.cover_url} alt={song.track_name} width="50" style={{ marginRight: '10px', borderRadius: '5px' }} />
                    <div>
                        <div style={{ color: '#fff' }}><strong>{song.track_name}</strong> by {song.artist_name}</div>
                        <div style={{ color: '#bbb' }}>{song.track_length}</div>
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default SongList;
