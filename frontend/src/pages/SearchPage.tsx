import React, { useState } from 'react';
import SearchBar from '../components/SearchBar';
import SongList from '../components/SongList';
import { useSocket } from '../hooks/useSocket';
const SearchPage: React.FC = () => {
    const [songs, setSongs] = useState([]);
    const socket = useSocket('http://localhost:3001');

    const handleSearch = (input: string, source: string) => {
        socket?.emit('searchTracks', { track_name: input, source: source });
        socket?.on('searchResults', (data) => {
            setSongs(data.results);
        });
    };

    const handleSelectSong = (song: any) => {
        socket?.emit('addSongToQueue', {track: song});
    };

    return (
        <div>
            <h1>Search Songs</h1>
            <SearchBar onSearch={handleSearch} />
            <SongList songs={songs} onSelect={handleSelectSong} />
        </div>
    );
};

export default SearchPage;