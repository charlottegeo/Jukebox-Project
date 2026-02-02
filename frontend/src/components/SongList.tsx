import React, { useState, useEffect } from 'react';
import { Card, CardBody } from 'reactstrap';
import { Song } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface SongListProps {
    songs: Song[];
    onSelect: (song: Song) => void;
    hasSearched?: boolean;
}

const SongList: React.FC<SongListProps> = ({ songs, onSelect, hasSearched = false }) => {
    const { darkMode } = useTheme();
    const [selectedSong, setSelectedSong] = useState<Song | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.song-card')) {
                setSelectedSong(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSongClick = (song: Song) => {
        if (selectedSong && selectedSong.track_id === song.track_id) {
            onSelect(song);
            setSelectedSong(null);
        } else {
            setSelectedSong(song);
        }
    };

    if (songs.length === 0 && hasSearched) {
        return (
            <Card className={`mb-3 ${darkMode ? 'bg-dark text-white' : 'bg-light border-light'}`}>
                <CardBody className="text-center text-muted">
                    <p className="mb-0">No results found. Search for songs to add them to your queue.</p>
                </CardBody>
            </Card>
        );
    }

    if (songs.length === 0) {
        return null;
    }

    return (
        <div className="song-list row row-cols-1 g-3 song-list-cards">
            {songs.map((song, index) => (
                <div key={song.track_id ?? song.id ?? index} className="col song-list-col">
                    <Card 
                        className={`song-card h-100 ${selectedSong?.track_id === song.track_id ? 'song-card-selected' : ''} ${darkMode ? 'bg-dark text-white' : 'bg-light border-light'} ${song.source === 'spotify' ? 'border-left border-success' : 'border-left border-danger'}`}
                        style={{ 
                            borderLeftWidth: '4px', 
                            cursor: 'pointer',
                            borderTop: 'none', 
                            borderRight: 'none', 
                            borderBottom: 'none' 
                        }}
                        onClick={() => handleSongClick(song)}
                    >
                        <CardBody className="d-flex align-items-center p-3">
                            <img 
                                src={song.cover_url} 
                                alt={song.track_name}
                                className="mr-3 rounded flex-shrink-0"
                                style={{ width: '64px', height: '64px', objectFit: 'cover' }}
                            />
                            <div className="flex-grow-1 min-width-0" style={{ overflow: 'hidden' }}>
                                <div className="font-weight-bold text-truncate">{song.track_name}</div>
                                <div className="small text-truncate text-muted">{song.artist_name}</div>
                                <div className="small text-muted">{song.track_length}</div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            ))}
        </div>
    );
};

export default SongList;