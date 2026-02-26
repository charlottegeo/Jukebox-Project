import { useTheme } from '../contexts/ThemeContext';
import React, { useEffect, useState } from 'react';
import { Song } from '../types';

    const { darkMode } = useTheme();
interface SongListProps {
  songs: Song[];
  onSelect: (song: Song) => void;
  hasSearched?: boolean;
}

const SongList: React.FC<SongListProps> = ({
  songs,
  onSelect,
  hasSearched = false,
}) => {
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
      <div className="card mb-3">
        <div className="card-body text-center text-muted">
          <p className="mb-0">
            No results found. Search for songs to add them to your queue.
          </p>
        </div>
      </div>
    );
  }

  if (songs.length === 0) {
    return null;
  }

  return (
    <div className="song-list row row-cols-1 g-3 song-list-cards">
      {songs.map((song, index) => {
        const isSelected = selectedSong?.track_id === song.track_id;
        return (
          <div
            key={song.track_id ?? song.id ?? index}
            className="col song-list-col"
          >
            <div
              className={`card song-card h-100 ${isSelected ? 'song-card-selected' : ''} ${song.source === 'spotify' ? 'border-left border-success' : 'border-left border-danger'}`}
              style={{
                borderLeftWidth: '4px',
                cursor: 'pointer',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
              }}
              onClick={() => handleSongClick(song)}
            >
              <div className="card-body d-flex align-items-center p-3">
                <img
                  src={song.cover_url}
                  alt={song.track_name}
                  className="mr-3 rounded flex-shrink-0"
                  style={{ width: '64px', height: '64px', objectFit: 'cover' }}
                />
                <div
                  className="flex-grow-1 min-width-0"
                  style={{ overflow: 'hidden' }}
                >
                  <div className="font-weight-bold text-truncate">
                    {song.track_name}
                  </div>
                  <div className="small text-truncate text-muted">
                    {song.artist_name}
                  </div>
                  <div className="small text-muted">{song.track_length}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SongList;
