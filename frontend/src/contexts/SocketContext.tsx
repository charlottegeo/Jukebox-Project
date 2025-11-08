import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Song, ActiveUser } from '../types';
import { useAuth } from './AuthContext';
import { useMessage } from './MessageContext';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;

  myQueue: Song[];
  myColor: string | null;
  isAdmin: boolean;
  isQueueLocked: boolean;
  lockedSongId: string | null;

  allQueues: Song[];
  userColors: { [key: string]: string };
  currentCatColor: string;
  volume: number;

  currentSong: Song | null;
  isLoading: boolean;
  isPaused: boolean;
  activeUserCount: number;
  songLengthLimit: number;

  setMyColor: (color: string) => void;
  setVolume: (volume: number) => void;
  
  isAdminPanelOpen: boolean;
  toggleAdminPanel: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [myQueue, setMyQueue] = useState<Song[]>([]);
  const [myColor, setMyColor] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isQueueLocked, setIsQueueLocked] = useState(false);
  const [lockedSongId, setLockedSongId] = useState<string | null>(null);
  
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [allQueues, setAllQueues] = useState<Song[]>([]);
  const [userColors, setUserColors] = useState<{ [key: string]: string }>({});
  const [currentCatColor, setCurrentCatColor] = useState<string>('White');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [songLengthLimit, setSongLengthLimit] = useState<number>(10);
  const [volume, setVolume] = useState<number>(50);

  const { user } = useAuth();
  const { showMessage } = useMessage();
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username;

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_BACKEND_URL);
    setSocket(newSocket);
    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));
    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
    if (uid && userInfo) {
      socket.emit('user_info', { userInfo });
      socket.emit('getUserQueue', uid);
      const savedColor = sessionStorage.getItem('userColor');
      if (savedColor) {
        setMyColor(savedColor);
        socket.emit('update_user_color', { uid, color: savedColor });
      }
    }
    socket.emit('get_user_queue');
    socket.emit('getActiveUsers');
    socket.emit('get_current_song');
    socket.emit('getSongLengthLimit');

    const handleServerStartup = () => {
      sessionStorage.removeItem('userColor');
      setMyColor('White');
      setUserColors({});
      setCurrentCatColor('White');
    };

    const handleUpdateQueue = (data: { queue: Song[]; uid?: string }) => {
      if (!data.uid) {
        setAllQueues(data.queue);
      } else if (data.uid === uid) {
        setMyQueue(data.queue);
        if (data.queue.length === 0 || !data.queue.some(song => song.id === lockedSongId)) {
          setIsQueueLocked(false);
          setLockedSongId(null);
        }
      }
    };

    const handleUpdateCurrentSong = (data: { currentSong: Song | null; isLoading?: boolean }) => {
      setCurrentSong(data.currentSong);
      setIsPaused(false);
      if (data.isLoading !== undefined) setIsLoading(data.isLoading);
      if (!data.currentSong) setCurrentCatColor('White');
    };

    const handleQueueEmpty = () => {
      setCurrentSong(null);
      setIsPaused(false);
      setIsLoading(false);
      setCurrentCatColor('White');
    };

    const handlePausePlay = (data: { isPaused: boolean }) => setIsPaused(data.isPaused);
    const handleActiveUsers = (users: ActiveUser[]) => setActiveUserCount(users.length);
    const handleUpdateAdminStatus = (data: { isAdmin: boolean }) => setIsAdmin(data.isAdmin);
    const handleSongLengthLimit = (data: { limit: number }) => setSongLengthLimit(data.limit);
    const handleVolumeChange = (data: { volume: number }) => setVolume(data.volume);
    const handleSongDownloaded = () => setIsLoading(false);
    const handleRefresh = () => window.location.reload();

    const handleUpdateUserColor = (data: { uid: string | null; color: string }) => {
      if (data.uid === null) {
        setUserColors({});
        setCurrentCatColor(data.color);
        return;
      }
      setUserColors(prev => ({ ...prev, [data.uid!]: data.color }));
      if (data.uid === uid) {
        setMyColor(data.color);
        sessionStorage.setItem('userColor', data.color);
      }
    };

    const handlePreloadedNextSong = (data: { song: Song }) => {
      if (data.song.submittedBy === uid) {
        setIsQueueLocked(true);
        setLockedSongId(data.song.id);
        showMessage('Your next song is preloaded and ready to play', 'info');
      }
    };

    const handleMessageBox = (data: { type: 'success' | 'error' | 'warning'; message: string }) => showMessage(data.message, data.type);
    const handleAddSong = (data: { song: Song, uid: string }) => { if (data.uid === uid) showMessage(`Added "${data.song.track_name}"`, 'success'); };
    const handleAddPlaylist = (data: { uid: string; successCount: number; failureCount: number }) => { if (data.uid === uid) showMessage(`Added ${data.successCount} songs from playlist`, 'success'); };
    const handleAddAlbum = (data: { uid: string; successCount: number; failureCount: number }) => { if (data.uid === uid) showMessage(`Added ${data.successCount} songs from album`, 'success'); };

    socket.on('server_startup', handleServerStartup);
    socket.on('updateUserQueue', handleUpdateQueue);
    socket.on('updateCurrentSong', handleUpdateCurrentSong);
    socket.on('queue_empty', handleQueueEmpty);
    socket.on('toggle_pause_play', handlePausePlay);
    socket.on('updateActiveUsers', handleActiveUsers);
    socket.on('updateUserCatColor', handleUpdateUserColor);
    socket.on('updateAdminStatus', handleUpdateAdminStatus);
    socket.on('preloaded_next_song', handlePreloadedNextSong);
    socket.on('updateSongLengthLimit', handleSongLengthLimit);
    socket.on('volume_change', handleVolumeChange);
    socket.on('song_download_complete', handleSongDownloaded);
    socket.on('refresh_display', handleRefresh);
    socket.on('message_box', handleMessageBox);
    socket.on('addSongToQueue', handleAddSong);
    socket.on('addPlaylistToQueue', handleAddPlaylist);
    socket.on('addAlbumToQueue', handleAddAlbum);

    return () => {
      socket.off('server_startup');
      socket.off('updateUserQueue');
      socket.off('updateCurrentSong');
      socket.off('queue_empty');
      socket.off('toggle_pause_play');
      socket.off('updateActiveUsers');
      socket.off('updateUserCatColor');
      socket.off('updateAdminStatus');
      socket.off('preloaded_next_song');
      socket.off('updateSongLengthLimit');
      socket.off('volume_change');
      socket.off('song_download_complete');
      socket.off('refresh_display');
      socket.off('message_box');
      socket.off('addSongToQueue');
      socket.off('addPlaylistToQueue');
      socket.off('addAlbumToQueue');
    };
  }, [socket, isConnected, uid, userInfo, showMessage, lockedSongId]);

  useEffect(() => {
    if (currentSong && userColors[currentSong.submittedBy]) {
      setCurrentCatColor(userColors[currentSong.submittedBy]);
    } else if (!currentSong) {
      setCurrentCatColor('White');
    }
  }, [currentSong, userColors]);

  const handleSetMyColor = (color: string) => {
    if (socket && uid) {
      socket.emit('update_user_color', { uid, color });
    }
  };

  const handleSetVolume = (newVolume: number) => {
    if (socket) {
      socket.emit('set_volume', { volume: newVolume });
    }
  };

  const toggleAdminPanel = () => setIsAdminPanelOpen(prev => !prev);
  const value: SocketContextType = {
    socket,
    isConnected,
    myQueue,
    myColor,
    isAdmin,
    isQueueLocked,
    lockedSongId,
    allQueues,
    userColors,
    currentCatColor,
    volume,
    currentSong,
    isLoading,
    isPaused,
    activeUserCount,
    songLengthLimit,
    setMyColor: handleSetMyColor,
    setVolume: handleSetVolume,
    isAdminPanelOpen,
    toggleAdminPanel,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};