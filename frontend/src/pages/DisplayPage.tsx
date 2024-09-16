import React, { useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
interface Song {
    track_name: string;
    artist_name: string;
    cover_url: string;
}

const DisplayPage: React.FC = () => {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const socket = useSocket('http://localhost:3001');

    useEffect(() => {
        socket?.emit('get_current_song');
        socket?.on('updateCurrentSong', (data) => {
            setCurrentSong(data.currentSong);
        });

        return () => {
            socket?.disconnect();
        };
    }, [socket]);

    return (
        <div>
            <h1>Now Playing</h1>
            {currentSong ? (
                <div>
                    <img src={currentSong.cover_url} alt={currentSong.track_name}/>
                    <h2>{currentSong.track_name}</h2>
                    <p>{currentSong.artist_name}</p>
                </div>
            ) : (
                <div>No song playing</div>
            )}
        </div>
    );
};

export default DisplayPage;