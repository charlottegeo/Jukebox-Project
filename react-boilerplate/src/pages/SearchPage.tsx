import React, { useState, useEffect } from 'react';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import UserQueue from '../components/UserQueue';
import { useSocket } from '../hooks/useSocket';
import { Song } from '../types';

export const isValidYoutubeLink = (link: string): boolean => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/(watch\?v=|embed\/|v\/|.+\?v=|.+&v=|playlist\?list=|.*list=)([a-zA-Z0-9_-]{11}|[a-zA-Z0-9_-]+)/;
    return regex.test(link);
  };
  
const SearchPage: React.FC = () => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [queue, setQueue] = useState<Song[]>([]);
    const socket = useSocket('http://localhost:8080');
    const uid = 'ccyborgg'; // Placeholder for now

    useEffect(() => {
        socket?.emit('getUserQueue', uid);

        const handleUpdateQueue = (data: { queue: Song[] }) => setQueue(data.queue);
        const handleNextSong = (data: { nextSong: Song }) => console.log('Playing next song:', data.nextSong);
        const handleQueueEmpty = () => console.log('Queue is empty');

        socket?.on('updateUserQueue', handleUpdateQueue);
        socket?.on('next_song', handleNextSong);
        socket?.on('queue_empty', handleQueueEmpty);

        return () => {
            socket?.off('updateUserQueue', handleUpdateQueue);
            socket?.off('next_song', handleNextSong);
            socket?.off('queue_empty', handleQueueEmpty);
        };
    }, [socket, uid]);

    const handleSearch = (input: string, source: string) => {
        if (source === 'spotifyLink' || source === 'youtubeLink') {
            socket?.emit('addLinkToQueue', { link: input, uid });
        } else {
            socket?.emit('searchTracks', { track_name: input, source });
            socket?.on('searchResults', (data: { results: Song[] }) => {
                setSongs(data.results);
            });
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
