import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import styles from './DisplayPage.module.css';

interface Song {
  track_name: string;
  artist_name: string;
  cover_url: string;
  track_id: string;
  source: 'spotify' | 'youtube';
}

declare global {
  interface Window {
    onSpotifyIframeApiReady: any;
    onYouTubeIframeAPIReady: any;
    YT: any;
  }
}

const DisplayPage: React.FC = () => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const socket = useSocket(import.meta.env.VITE_BACKEND_URL);
  const [spotifyApiLoaded, setSpotifyApiLoaded] = useState(false);
  const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null);
  const [youtubeApiLoaded, setYouTubeApiLoaded] = useState(false);
  const [youtubePlayer, setYouTubePlayer] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [showPlayButton, setShowPlayButton] = useState(true);

  const spotifyPlayerRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<HTMLDivElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timer | null>(null);

  useEffect(() => {
    if (socket) {
      socket.emit('get_current_song');
      socket.on('updateCurrentSong', (data: { currentSong: Song }) => {
        console.log('Received current song:', data.currentSong);
        setCurrentSong(data.currentSong);
      });

      return () => {
        socket.off('updateCurrentSong');
      };
    }
  }, [socket]);

  useEffect(() => {
    if (!document.getElementById('spotify-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'spotify-iframe-api';
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.onload = () => setSpotifyApiLoaded(true);
      document.body.appendChild(script);
    } else {
      setSpotifyApiLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!spotifyApiLoaded || !spotifyPlayerRef.current || showPlayButton) return;

    const element = spotifyPlayerRef.current;

    window.onSpotifyIframeApiReady = (IFrameAPI: any) => {
      if (element) {
        const options = {
          uri: currentSong ? `spotify:track:${currentSong.track_id}` : '',
        };

        const callback = (controller: any) => {
          setSpotifyPlayer(controller);

          controller.addListener('playback_update', (e: any) => {
            const { position, duration } = e.data;
            if (duration > 0) {
              setProgress((position / duration) * 100);
            }

            if (position >= duration && duration !== 0) {
              console.log('Spotify song ended');
              playNextSong();
            }
          });

          if (currentSong) {
            controller.play(); // Automatically start playing
          }
        };

        IFrameAPI.createController(element, options, callback);
      } else {
        console.error('Spotify player element not found.');
      }
    };
  }, [currentSong, spotifyApiLoaded, showPlayButton]);

  useEffect(() => {
    if (!document.getElementById('youtube-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.onload = () => setYouTubeApiLoaded(true);
      document.body.appendChild(script);
    } else {
      setYouTubeApiLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!youtubeApiLoaded || !youtubePlayerRef.current) return;

    window.onYouTubeIframeAPIReady = () => {
      const element = youtubePlayerRef.current;

      if (element) {
        const player = new window.YT.Player(element, {
          videoId: currentSong?.track_id || '',
          events: {
            'onReady': (event: any) => {
              setYouTubePlayer(player);
              if (currentSong?.source === 'youtube') {
                event.target.playVideo(); // Automatically start playing
                console.log('YouTube player started');
              }
            },
            'onStateChange': (event: any) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                playNextSong();
              }
              if (event.data === window.YT.PlayerState.PLAYING) {
                trackYouTubeProgress(event.target);
              }
            },
          },
        });

        setYouTubePlayer(player);
      } else {
        console.error('YouTube player element not found.');
      }
    };
  }, [youtubeApiLoaded, currentSong]);

  const trackYouTubeProgress = (player: any) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current as unknown as number);
    }
  
    progressIntervalRef.current = setInterval(() => {
      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      if (duration > 0) {
        setProgress((currentTime / duration) * 100);
      }
  
      if (player.getPlayerState() !== window.YT.PlayerState.PLAYING) {
        clearInterval(progressIntervalRef.current as unknown as number);
      }
    }, 1000);
  };

  useEffect(() => {
    if (currentSong?.source === 'spotify' && spotifyPlayer) {
      spotifyPlayer.loadUri(`spotify:track:${currentSong.track_id}`);
      spotifyPlayer.play(); // Automatically play
      setProgress(0);
    }

    if (currentSong?.source === 'youtube' && youtubePlayer) {
      youtubePlayer.loadVideoById(currentSong.track_id);
      youtubePlayer.playVideo(); // Automatically play
      setProgress(0);
    }
  }, [currentSong, spotifyPlayer, youtubePlayer]);

  // Function to play the next song
  const playNextSong = () => {
    console.log('Fetching the next song...');
    socket?.emit('get_next_song');
  };

  const handlePlayButtonClick = () => {
    setShowPlayButton(false);
  };

  const renderPlayer = () => {
    if (!currentSong) return <div>No player available</div>;

    if (currentSong.source === 'spotify') {
      return (
        <div id="spotify-player-wrapper">
          <div id="spotify-player" ref={spotifyPlayerRef}></div>
        </div>
      );
    }

    if (currentSong.source === 'youtube') {
      return (
        <div id="youtube-player-wrapper">
          <div id="youtube-player" ref={youtubePlayerRef}></div>
        </div>
      );
    }

    return <div>No player available</div>;
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Now Playing</h1>
      {showPlayButton && (
        <button className={styles.playButton} onClick={handlePlayButtonClick}>
          Play
        </button>
      )}
      {currentSong ? (
        <div className={styles.songInfo}>
          <img
            src={currentSong.cover_url}
            alt={currentSong.track_name}
            className={styles.coverImage}
          />
          <h2 className={styles.trackName}>{currentSong.track_name}</h2>
          <p className={styles.artistName}>{currentSong.artist_name}</p>
          <div className={styles.progressContainer}>
            <progress id="progressBar" value={progress} max="100"></progress>
            <div className={styles.progressText}>{progress.toFixed(2)}%</div>
          </div>
          {renderPlayer()}
        </div>
      ) : (
        <div className={styles.noSong}>No song playing</div>
      )}
    </div>
  );
};

export default DisplayPage;
