import React, { useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import styles from './DisplayPage.module.css';

interface Song {
  track_name: string;
  artist_name: string;
  cover_url: string;
  track_id: string;
  source: 'spotify' | 'youtube';
}

const DisplayPage: React.FC = () => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const socket = useSocket('http://localhost:3001');

  useEffect(() => {
    console.log('Requesting current song...');
    socket?.emit('get_current_song');

    socket?.on('updateCurrentSong', (data) => {
      console.log('Received current song:', data.currentSong);
      setCurrentSong(data.currentSong);
    });

    return () => {
      console.log('Cleaning up socket connection...');
      socket?.off('updateCurrentSong');
      socket?.disconnect();
    };
  }, [socket]);

  const handleYouTubeEnd = () => {
    console.log('YouTube song ended. Requesting next song...');
    socket?.emit('removeFirstSong');
    socket?.emit('get_next_song');
  };

  const renderPlayer = () => {
    if (!currentSong) {
      console.log('No song currently available to play.');
      return <div>No player available</div>;
    }

    console.log('Rendering player for song:', currentSong.track_name);

    if (currentSong.source === 'spotify') {
      return (
        <iframe
          src={`https://open.spotify.com/embed/track/${currentSong.track_id}`}
          width="300"
          height="80"
          frameBorder="0"
          allow="encrypted-media"
          title="Spotify Player"
        />
      );
    }

    if (currentSong.source === 'youtube') {
      return (
        <iframe
          width="640"
          height="390"
          src={`https://www.youtube.com/embed/${currentSong.track_id}?autoplay=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onEnded={handleYouTubeEnd}
        ></iframe>
      );
    }

    return <div>No player available</div>;
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Now Playing</h1>
      {currentSong ? (
        <div className={styles.songInfo}>
          <img src={currentSong.cover_url} alt={currentSong.track_name} className={styles.coverImage} />
          <h2 className={styles.trackName}>{currentSong.track_name}</h2>
          <p className={styles.artistName}>{currentSong.artist_name}</p>
          {renderPlayer()}
        </div>
      ) : (
        <div className={styles.noSong}>No song playing</div>
      )}
    </div>
  );
};

export default DisplayPage;
