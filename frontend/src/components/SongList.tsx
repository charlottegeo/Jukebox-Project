import React, { useState, useEffect } from 'react';
import { Song } from '../types';

interface SongListProps {
    songs: Song[];
    onSelect: (song: Song) => void;
}

const SongList: React.FC<SongListProps> = ({ songs, onSelect }) => {
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.song-item')) {
                setSelectedSong(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSongClick = (song: Song) => {

        //double click to add to queue
        if (selectedSong && selectedSong.track_id === song.track_id) {
            onSelect(song);
            setSelectedSong(null);
        } else {
            setSelectedSong(song);
        }
    };

    return (
        <div className="song-list">
            {songs.map((song, index) => (
                <div 
                    key={index} 
                    onClick={() => handleSongClick(song)} 
                    className={`song-item ${song.source} ${selectedSong?.track_id === song.track_id ? 'selected' : ''}`}
                >
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
