import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Song } from '../types';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import AdminPanel from '../components/AdminPanel';
import PlaybackBanner from '../components/PlaybackBanner';
import './SearchPage.scss';
import { AdminPanelProps } from '../App';

const SearchPage: React.FC<AdminPanelProps> = ({ adminPanelOpen, setAdminPanelOpen }) => {

  const {
    socket,
    isConnected,
    myQueue,
    currentSong,
    isLoading,
    isPaused,
    activeUserCount,
    isAdmin,
    isQueueLocked,
    lockedSongId,
    songLengthLimit,
    volume,
    setMyColor,
    setVolume,
  } = useSocket();

  const [songs, setSongs] = useState<Song[]>([]);

  const { user } = useAuth();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username || user?.username;
  
  useEffect(() => {
    if (!socket || !isConnected) return;
    
    const handleSearchResults = (data: { results: Song[] }) => setSongs(data.results);
    socket.on('searchResults', handleSearchResults);

    return () => {
      socket.off('searchResults', handleSearchResults);
    };
  }, [socket, isConnected]);

  const handleSearch = (input: string, source: string) => {
    if (!socket || !isConnected) {
      console.log('Socket not connected, cannot search');
      return;
    }

    const event = source.endsWith('Link') ? 'addLinkToQueue' : 'searchTracks';
    
    if (event === 'addLinkToQueue') {
      socket.emit(event, { link: input, uid });
    } else {
      socket.emit(event, { track_name: input, source, uid });
    }
  };

  const handleColorSelect = (color: string) => {
    setMyColor(color);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleVoteSkip = () => {
    if (socket && isConnected) {
      socket.emit('force_skip');
    }
  };

  const handleAddToQueue = (song: Song) => {
    if (socket && isConnected) {
      if (!uid) {
        console.log('User ID not found, cannot add song to queue');
        return;
      }
      socket.emit('addSongToQueue', { song, uid: uid });
    }
  };

  return (
    <div className="search-page">
      <div className="app-container">
        <div className="banner">
          <PlaybackBanner
            currentSong={currentSong}
            isPaused={isPaused}
            activeUserCount={activeUserCount}
            onVoteSkip={handleVoteSkip}
            songLengthLimit={songLengthLimit}
            isLoading={isLoading}
          />
        </div>
        <div className="queue">
          <UserQueue
            queue={myQueue}
            onClearQueue={() => socket?.emit('clearUserQueue', uid)}
            onRemoveSong={(index) => socket?.emit('removeSongFromQueue', { uid, index })}
            onReorderQueue={(newQueue) => socket?.emit('reorderQueue', { queue: newQueue, uid })}
            isLocked={isQueueLocked}
            lockedSongId={lockedSongId}
          />
        </div>
        <div className="search">
          <SearchBar onSearch={handleSearch} />
          <SongList
            songs={songs}
            onSelect={handleAddToQueue}
          />
        </div>
      </div>
      {isAdmin && adminPanelOpen && (
        <AdminPanel
          onClose={() => setAdminPanelOpen(false)}
          socket={socket}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          currentUser={uid}
        />
      )}
    </div>
  );
};

export default SearchPage;