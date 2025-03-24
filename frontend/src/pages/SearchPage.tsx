import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { Song } from '../types';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import AdminPanel from '../components/AdminPanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faShieldHalved, faChevronDown, faDrum } from '@fortawesome/free-solid-svg-icons';
import './SearchPage.scss';

const colorOptions = [
  { value: 'White', color: '#ffffff' },
  { value: 'Baby Blue', color: '#89CFF0' },
  { value: 'Blue', color: '#3498db' },
  { value: 'Blue-Gray', color: '#6699CC' },
  { value: 'Bongo', color: '#B0197E' },
  { value: 'Bright Magenta', color: '#FF00FF' },
  { value: 'Indigo', color: '#4B0082' },
  { value: 'Lime', color: '#32CD32' },
  { value: 'Magenta', color: '#E11C52' },
  { value: 'Orange', color: '#e67e22' },
  { value: 'Pink', color: '#e84393' },
  { value: 'Purple', color: '#9b59b6' },
  { value: 'Red', color: '#e74c3c' },
  { value: 'Yellow', color: '#f1c40f' }
];

const SearchPage: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(100);
  const socket = useSocket(import.meta.env.VITE_BACKEND_URL);
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username;
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const colorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/cat-colors.json')
      .then((response) => response.json())
      .then((data) => setColors(data.colors))
      .catch((error) => console.error('Error fetching colors:', error));
  }, []);

  useEffect(() => {
    const savedColor = sessionStorage.getItem('userColor');
    if (savedColor) {
      setSelectedColor(savedColor);
      if (socket && uid) {
        socket.emit('update_user_color', { uid, color: savedColor });
      }
    }
  }, [socket, uid]);
  
  useEffect(() => {
    if (uid) {
      socket?.emit('user_info', { userInfo });
      socket?.emit('getUserQueue', uid);
    }
  
    const handleUpdateQueue = (data: { queue: Song[], uid: string }) => {
      if (data.uid === uid) setQueue(data.queue);
    };
    const handleSearchResults = (data: { results: Song[] }) => setSongs(data.results);
    const handleNextSong = (data: { currentSong: Song }) => setCurrentSong(data.currentSong);
    const handleQueueEmpty = () => setCurrentSong(null);
    const handleUpdateUserColor = (data: { uid: string, color: string }) => {
      if (data.uid === uid) {
        setSelectedColor(data.color);
      }
    };

    socket?.on('updateUserQueue', handleUpdateQueue);
    socket?.on('searchResults', handleSearchResults);
    socket?.on('updateCurrentSong', handleNextSong);
    socket?.on('queue_empty', handleQueueEmpty);
    socket?.on('updateUserCatColor', handleUpdateUserColor);

    return () => {
      socket?.off('updateUserQueue', handleUpdateQueue);
      socket?.off('searchResults', handleSearchResults);
      socket?.off('updateCurrentSong', handleNextSong);
      socket?.off('queue_empty', handleQueueEmpty);
      socket?.off('updateUserCatColor', handleUpdateUserColor);
    };
  }, [socket, userInfo, uid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(event.target as Node)) {
        setIsColorDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (input: string, source: string) => {
    const event = source.endsWith('Link') ? 'addLinkToQueue' : 'searchTracks';
    
    if (event === 'addLinkToQueue') {
        socket?.emit(event, { link: input, uid });
    } else {
        socket?.emit(event, { track_name: input, source, uid });
    }
};

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    socket?.emit('update_user_color', { uid, color });
    sessionStorage.setItem('userColor', color);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    socket?.emit('set_volume', { volume: newVolume });
  };

  return (
    <div className="search-page">
      <header className="top-section">
        <SearchBar onSearch={handleSearch} />

        <div className="color-selector-container" ref={colorDropdownRef}>
          <button
            className="color-selector-button"
            onClick={() => setIsColorDropdownOpen(!isColorDropdownOpen)}
          >
            <FontAwesomeIcon icon={faPalette} />
            <div 
              className="current-color-indicator"
              style={selectedColor !== 'White' ? { backgroundColor: colorOptions.find(c => c.value === selectedColor)?.color } : undefined}
            >
              {selectedColor === 'White' && <FontAwesomeIcon icon={faDrum} />}
            </div>
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
          {isColorDropdownOpen && (
            <div className="color-dropdown">
              {colorOptions.map((option) => (
                <div
                  key={option.value}
                  className={`color-option ${selectedColor === option.value ? 'selected' : ''}`}
                  onClick={() => {
                    handleColorSelect(option.value);
                    setIsColorDropdownOpen(false);
                  }}
                >
                  <div 
                    className="color-indicator"
                    style={option.value !== 'White' ? { backgroundColor: option.color } : undefined}
                  >
                    {option.value === 'White' && <FontAwesomeIcon icon={faDrum} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setAdminPanelOpen(!adminPanelOpen)} className="admin-button">
          <FontAwesomeIcon icon={faShieldHalved} />
          Admin
        </button>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <UserQueue
            queue={queue}
            onClearQueue={() => socket?.emit('clearUserQueue', uid)}
            onRemoveSong={(index) => socket?.emit('removeSongFromQueue', { uid, index })}
            onReorderQueue={(newQueue) => socket?.emit('reorderQueue', { uid, queue: newQueue })}
          />
        </aside>
        <section className="search-results">
          <SongList songs={songs} onSelect={(song) => socket?.emit('addSongToQueue', { uid, song })} />
        </section>
      </div>

      {adminPanelOpen && (
        <AdminPanel 
          onClose={() => setAdminPanelOpen(false)} 
          socket={socket}
          volume={volume}
          onVolumeChange={handleVolumeChange}
        />
      )}
    </div>
  );
};

export default SearchPage;
