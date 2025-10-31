import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useMessage } from '../contexts/MessageContext';
import { Song } from '../types';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import AdminPanel from '../components/AdminPanel';
import PlaybackBanner from '../components/PlaybackBanner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faShieldHalved, faChevronDown, faDrum } from '@fortawesome/free-solid-svg-icons';
import './SearchPage.scss';
import { useAuth } from '../contexts/AuthContext';

const colorOptions = [
  { value: 'White', color: '#F2F2F2' },
  { value: 'Baby Blue', color: '#3299FF' },
  { value: 'Blue', color: '#024CDC' },
  { value: 'Blue-Gray', color: '#A0C9D9' },
  { value: 'Bongo', color: '#B8B8B8' },
  { value: 'Bright Magenta', color: '#D25CE8' },
  { value: 'Indigo', color: '#121CEA' },
  { value: 'Lime', color: '#00FF00' },
  { value: 'Magenta', color: '#9B52A9' },
  { value: 'Orange', color: '#FE7600' },
  { value: 'Pink', color: '#FFBFCD' },
  { value: 'Purple', color: '#7E00F2' },
  { value: 'Red', color: '#F20000' },
  { value: 'Yellow', color: '#FFFF00' }
];

const SearchPage: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(50);
  const [isQueueLocked, setIsQueueLocked] = useState(false);
  const [lockedSongId, setLockedSongId] = useState<string | null>(null);
  const { socket, isConnected } = useSocket();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username;
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const colorDropdownRef = useRef<HTMLDivElement>(null);
  const { showMessage } = useMessage();
  const [songLengthLimit, setSongLengthLimit] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    console.log('Socket connection state:', {
      isConnected,
      socketId: socket?.id,
      uid
    });
  }, [isConnected, socket, uid]);

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
      if (isConnected && socket && uid) {
        socket.emit('update_user_color', { uid, color: savedColor });
      }
    }
  }, [isConnected, socket, uid]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    console.log('Setting up socket event listeners');

    const handleServerStartup = () => {
      console.log('Server startup detected, resetting color state');
      sessionStorage.removeItem('userColor');
      setSelectedColor('White');
    };

    const handleUpdateQueue = (data: { queue: Song[], uid?: string }) => {
      console.log('Received queue update with data:', {
        receivedQueue: data.queue,
        receivedUid: data.uid,
        currentUid: uid,
        currentQueue: queue
      });
      
      if (!data.uid || data.uid === uid) {
        console.log('Updating queue state');
        setQueue(data.queue);
      } else {
        console.log('Not updating queue - UIDs do not match');
      }
    };

    const handleSearchResults = (data: { results: Song[] }) => setSongs(data.results);
    
    const handleNextSong = (data: { currentSong: Song | null, isLoading?: boolean }) => {
      setCurrentSong(data.currentSong);
      setIsPaused(false);
      if (data.isLoading !== undefined) {
        setIsLoading(data.isLoading);
      }
    };
    
    const handleQueueEmpty = () => {
      setCurrentSong(null);
      setIsPaused(false);
    };

    const handlePausePlay = (data: { isPaused: boolean }) => {
      setIsPaused(data.isPaused);
    };

    const handleActiveUsers = (users: any[]) => {
      setActiveUserCount(users.length);
    };

    const handleUpdateUserColor = (data: { uid: string, color: string }) => {
      console.log('Received color update:', data);
      if (data.uid === uid) {
        setSelectedColor(data.color);
        sessionStorage.setItem('userColor', data.color);
      }
    };
    const handleUpdateAdminStatus = (data: { isAdmin: boolean }) => {
      console.log('Received admin status update:', {
        isAdmin: data.isAdmin,
        currentIsAdmin: isAdmin,
        uid: uid
      });
      setIsAdmin(data.isAdmin);
    };

    const handlePreloadedNextSong = (data: { song: Song }) => {
      console.log('Received preloaded next song:', data);
      if (data.song.submittedBy === uid) {
        console.log('Locking first song in queue - it is the next song in rotation');
        setIsQueueLocked(true);
        setLockedSongId(data.song.id);
        showMessage('Your next song is preloaded and ready to play', 'info');
      }
    };

    socket.on('server_startup', handleServerStartup);
    socket.on('updateUserQueue', handleUpdateQueue);
    socket.on('searchResults', handleSearchResults);
    socket.on('updateCurrentSong', handleNextSong);
    socket.on('queue_empty', handleQueueEmpty);
    socket.on('toggle_pause_play', handlePausePlay);
    socket.on('updateActiveUsers', handleActiveUsers);
    socket.on('updateUserCatColor', handleUpdateUserColor);
    socket.on('updateAdminStatus', handleUpdateAdminStatus);
    socket.on('preloaded_next_song', handlePreloadedNextSong);

    socket.on('addSongToQueue', (data: { song: Song, uid: string }) => {
      if (data.uid === uid) {
        setQueue(prev => [...prev, data.song]);
        showMessage(`Added "${data.song.track_name}" to your queue`, 'success');
      }
    });

    socket.on('addPlaylistToQueue', (data: { 
      uid: string, 
      successCount: number, 
      failureCount: number,
      failureReasons: { [key: string]: string }
    }) => {
      if (data.uid === uid) {
        const message = `Added ${data.successCount} song${data.successCount !== 1 ? 's' : ''} from playlist to your queue${
          data.failureCount > 0 ? ` (${data.failureCount} song${data.failureCount !== 1 ? 's' : ''} rejected due to length limit)` : ''
        }`;
        const messageType = data.failureCount > 0 ? 'warning' : 'success';
        showMessage(message, messageType);
      }
    });

    socket.on('addAlbumToQueue', (data: { 
      uid: string, 
      successCount: number, 
      failureCount: number,
      failureReasons: { [key: string]: string }
    }) => {
      if (data.uid === uid) {
        const message = `Added ${data.successCount} song${data.successCount !== 1 ? 's' : ''} from album to your queue${
          data.failureCount > 0 ? ` (${data.failureCount} song${data.failureCount !== 1 ? 's' : ''} rejected due to length limit)` : ''
        }`;
        const messageType = data.failureCount > 0 ? 'warning' : 'success';
        showMessage(message, messageType);
      }
    });

    socket.on('message_box', (data: { type: 'success' | 'error' | 'warning', message: string }) => {
      showMessage(data.message, data.type);
    });

    socket.emit('getSongLengthLimit');

    return () => {
      socket.off('updateUserQueue', handleUpdateQueue);
      socket.off('searchResults', handleSearchResults);
      socket.off('updateCurrentSong', handleNextSong);
      socket.off('queue_empty', handleQueueEmpty);
      socket.off('toggle_pause_play', handlePausePlay);
      socket.off('updateActiveUsers', handleActiveUsers);
      socket.off('updateUserCatColor', handleUpdateUserColor);
      socket.off('updateAdminStatus', handleUpdateAdminStatus);
      socket.off('server_startup', handleServerStartup);
      socket.off('preloaded_next_song', handlePreloadedNextSong);
      socket.off('addSongToQueue');
      socket.off('addPlaylistToQueue');
      socket.off('addAlbumToQueue');
      socket.off('message_box');
      socket.off('updateSongLengthLimit', (data: { limit: number }) => {
        setSongLengthLimit(data.limit);
      });
    };
  }, [socket, isConnected, showMessage, uid]);

  useEffect(() => {
    console.log('Admin status changed:', {
      isAdmin,
      uid
    });
  }, [isAdmin, uid]);

  useEffect(() => {
    if (socket && uid) {
      console.log('Requesting queue for uid:', uid);
      socket.emit('getUserQueue', uid);
    }
  }, [socket, uid]);

  // Debug queue changes
  useEffect(() => {
    console.log('Queue state updated:', queue);
    
    // If queue is empty or song that was locked is no longer in the queue, reset locked status
    if (queue.length === 0 || !queue.some(song => song.id === lockedSongId)) {
      setIsQueueLocked(false);
      setLockedSongId(null);
    }
  }, [queue, lockedSongId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(event.target as Node)) {
        setIsColorDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (socket && isConnected) {
      console.log('Requesting initial data');
      socket.emit('getActiveUsers');
      socket.emit('get_current_song');
    }
  }, [socket, isConnected]);

  useEffect(() => {
    if (socket && isConnected && userInfo) {
      console.log('Sending user info to server');
      socket.emit('user_info', { userInfo });
    }
  }, [socket, isConnected, userInfo]);

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
    console.log('Selecting color:', color);
    if (socket && uid) {
      socket.emit('update_user_color', { uid, color });
      setSelectedColor(color);
      sessionStorage.setItem('userColor', color);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (socket && isConnected) {
      socket.emit('set_volume', { volume: newVolume });
    }
  };

  const handleVoteSkip = () => {
    if (socket && isConnected) {
      socket.emit('vote_skip');
    }
  };

  const handleAddToQueue = (song: Song) => {
    if (socket && isConnected) {
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
            queue={queue}
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
      {user?.isAdmin && (
        <AdminPanel
          onClose={() => setAdminPanelOpen(false)}
          socket={socket}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          currentUser={user.username}
        />
      )}
    </div>
  );
};

export default SearchPage;
