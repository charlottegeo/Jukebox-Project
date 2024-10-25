import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { Song } from '../types';
import { useOidcAccessToken } from '@axa-fr/react-oidc';
import UserInfo from '../UserInfo';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';

const SearchPage: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const socket = useSocket(import.meta.env.VITE_BACKEND_URL);
  const { accessTokenPayload } = useOidcAccessToken();
  const userInfo = accessTokenPayload as UserInfo;
  const uid = userInfo?.preferred_username;

  useEffect(() => {
    if (uid) {
      socket?.emit('user_info', { userInfo });
      socket?.emit('getUserQueue', uid);
    }

    const handleUpdateQueue = (data: { queue: Song[] }) => {
      setQueue(data.queue);
    };

    const handleSearchResults = (data: { results: Song[] }) => {
      setSongs(data.results);
    };

    const handleNextSong = (data: { currentSong: Song }) => {
      setCurrentSong(data.currentSong);
    };

    const handleQueueEmpty = () => {
      setCurrentSong(null);
    };

    socket?.on('updateUserQueue', handleUpdateQueue);
    socket?.on('searchResults', handleSearchResults);
    socket?.on('updateCurrentSong', handleNextSong);
    socket?.on('queue_empty', handleQueueEmpty);

    return () => {
      socket?.off('updateUserQueue', handleUpdateQueue);
      socket?.off('searchResults', handleSearchResults);
      socket?.off('updateCurrentSong', handleNextSong);
      socket?.off('queue_empty', handleQueueEmpty);
    };
  }, [socket, userInfo, uid]);

  const handleSearch = (input: string, source: string) => {
    if (source === 'spotifyLink' || source === 'youtubeLink') {
      socket?.emit('addLinkToQueue', { link: input, uid });
    } else {
      socket?.emit('searchTracks', { track_name: input, source });
    }
  };

  const handleSelectSong = (song: Song) => {
    socket?.emit('addSongToQueue', { uid, song });
  };

  const handleClearQueue = () => {
    setQueue([]);
    socket?.emit('clearUserQueue', uid);
  };

  const handleRemoveSong = (index: number) => {
    setQueue((prevQueue) => prevQueue.filter((_, i) => i !== index));
    socket?.emit('removeSongFromQueue', { uid, index });
  };

  const handleReorderQueue = (newQueue: Song[]) => {
    setQueue(newQueue);
    socket?.emit('reorderQueue', { uid, queue: newQueue });
  };

  return (
    <div>
      <h1>Search Songs</h1>
      <SearchBar onSearch={handleSearch} />
      <SongList songs={songs} onSelect={handleSelectSong} />
      <UserQueue
        queue={queue}
        onClearQueue={handleClearQueue}
        onRemoveSong={handleRemoveSong}
        onReorderQueue={handleReorderQueue}
      />
    </div>
  );
};

export default SearchPage;