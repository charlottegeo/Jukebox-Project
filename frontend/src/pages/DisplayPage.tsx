import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import styles from './DisplayPage.module.css';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

interface Song {
  track_name: string;
  artist_name: string;
  cover_url: string;
  track_id: string;
  source: 'spotify' | 'youtube';
  bpm?: number;
  audioPath?: string;
  submittedBy: string;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady: any;
    onYouTubeIframeAPIReady: any;
    YT: any;
  }
}
interface HTMLAudioElementWithSource extends HTMLAudioElement {
  mediaSourceNode?: MediaElementAudioSourceNode;
}

const DisplayPage: React.FC = () => {
  type PlaybackState = 'playing' | 'paused' | 'stopped' | 'queue_empty';
  const [playbackState, setPlaybackState] = useState<PlaybackState>('queue_empty');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const socket = useSocket(import.meta.env.VITE_BACKEND_URL);
  const [spotifyApiLoaded, setSpotifyApiLoaded] = useState(false);
  const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [catColor, setCatColor] = useState<string>('Blue');
  const progressIntervalRef = useRef<NodeJS.Timer | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bpmProcessorRef = useRef<AudioWorkletNode | null>(null);
  const spotifyPlayerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (socket) {
      socket.emit('get_current_song');
      
      socket.on('updateCurrentSong', (data: { currentSong: Song }) => {
        console.log('Received current song:', data.currentSong);
        setCurrentSong(data.currentSong);
        setPlaybackState('playing'); 
        if (data.currentSong && data.currentSong.bpm) {
          animateFrames(data.currentSong.bpm);
        }
      });
      
      socket.on('queue_empty', () => {
        console.log('Queue empty event received');
        setPlaybackState('queue_empty');
        setCurrentSong(null);
      });

      socket.on('queueUpdated', (data: { queue: Song[] }) => {
        console.log('Queue updated:', data.queue);
        setQueue(data.queue);
        if (playbackState === 'queue_empty' && data.queue.length > 0) {
          playNextSong();
        }
      });

      return () => {
        socket.off('updateCurrentSong');
        socket.off('queue_empty');
        socket.off('queueUpdated');
      };
    }
  }, [socket, playbackState]);
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
              handleAudioEnded();
            }
          });
        
          if (currentSong?.track_id) {
            controller.loadUri(`spotify:track:${currentSong.track_id}`);
            controller.play();
          }
        };        

        IFrameAPI.createController(element, options, callback);
      } else {
        console.error('Spotify player element not found.');
      }
    };
  }, [currentSong, spotifyApiLoaded, showPlayButton]);
  const setupBpmAnalyzer = async (audioElement: HTMLAudioElement) => {
    const extendedAudioElement = audioElement as HTMLAudioElementWithSource;
  
    if (!extendedAudioElement) return;
  
    try {
      if (extendedAudioElement.mediaSourceNode) {
        console.log("Disconnecting previous media source node");
        extendedAudioElement.mediaSourceNode.disconnect();
        delete extendedAudioElement.mediaSourceNode;
      }
  
      if (audioContextRef.current) {
        console.log("Closing previous AudioContext");
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }
  
      console.log("Creating new AudioContext");
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
  
      if (audioContext.state === 'suspended') {
        console.log("Resuming AudioContext");
        await audioContext.resume();
      }
  
      console.log("Creating media source node");
      const source = audioContext.createMediaElementSource(extendedAudioElement);
      extendedAudioElement.mediaSourceNode = source;
  
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 3;
  
      const bpmProcessor = await createRealTimeBpmProcessor(audioContext, {
        continuousAnalysis: true,
        debug: true,
        muteTimeInIndexes: 10,
        stabilizationTime: 5000,
      });
  
      const lowpass = getBiquadFilter(audioContext);
  
      source.connect(gainNode).connect(lowpass).connect(bpmProcessor);
      source.connect(audioContext.destination);
  
      bpmProcessor.port.onmessage = (event) => {
        if (event.data.message === 'BPM_STABLE') {
          const bpmCandidates = event.data.data.bpm;
  
          if (bpmCandidates.length > 0) {
            const bestBpmCandidate = bpmCandidates.reduce(
              (prev: { count: number }, current: { count: number }) =>
                prev.count > current.count ? prev : current
            );
  
            const newBpm = bestBpmCandidate.tempo;
            console.log('Updating BPM:', newBpm);
            animateFrames(newBpm);
          } else {
            console.warn('No valid BPM candidates found.');
          }
        }
      };
  
      bpmProcessorRef.current = bpmProcessor;
  
    } catch (error) {
      console.error("Error setting up BPM Analyzer:", error);
    }
  };
  useEffect(() => {
    if (currentSong?.source === 'youtube' && audioRef.current) {
      setupBpmAnalyzer(audioRef.current);
    }

    return () => {
      if (audioContextRef.current) {
        console.log("Closing AudioContext during cleanup");
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (audioRef.current) {
        const extendedAudioElement = audioRef.current as HTMLAudioElementWithSource;
        if (extendedAudioElement.mediaSourceNode) {
          console.log("Disconnecting media source node during cleanup");
          extendedAudioElement.mediaSourceNode.disconnect();
          delete extendedAudioElement.mediaSourceNode;
        }
      }

      if (bpmProcessorRef.current) {
        console.log("Disconnecting BPM processor during cleanup");
        bpmProcessorRef.current.disconnect();
      }
    };
  }, [currentSong]);

  useEffect(() => {
    console.log('Current Song Changed:', currentSong);
    
    if (currentSong) {
      if (currentSong.source === 'spotify' && spotifyPlayer) {
        spotifyPlayer.loadUri(`spotify:track:${currentSong.track_id}`);
        setPlaybackState('playing');
        spotifyPlayer.play();
      }
      if (currentSong.source === 'youtube' && audioRef.current) {
        audioRef.current.src = currentSong.audioPath as string;
        audioRef.current.load();
        audioRef.current.play().catch(error => {
          console.error("Audio play failed:", error);
        });
      }
      setProgress(0);
      setIsPlaying(true);
    } else {
      setPlaybackState('queue_empty');
    }
  }, [currentSong, spotifyPlayer]);
  

  const handleAudioEnded = () => {
    console.log('Audio finished playing');
    setIsPlaying(false);
    resetCatAnimation();
    socket?.emit('song_finished');
  };
  

  const playNextSong = () => {
    socket?.emit('get_next_song');
    setPlaybackState('playing');
  };

  const calculateFrameDuration = (bpm: number): number => {
    const bps = bpm / 60;
    return 1 / (2 * bps);
  };

  const animateFrames = (bpm: number) => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as number);
    }

    const frames = ['PusayLeft', 'PusayCenter', 'PusayRight'];
    let frameIndex = 0;
    let increment = true;

    const frameDuration = calculateFrameDuration(bpm);

    animationIntervalRef.current = setInterval(() => {
      setCatImage(frames[frameIndex]);
      if (increment) {
        frameIndex++;
      } else {
        frameIndex--;
      }
      if (frameIndex === frames.length - 1) {
        increment = false;
      }
      if (frameIndex === 0) {
        increment = true;
      }
    }, frameDuration * 1000);
  };

  const setCatImage = (frame: string) => {
    const imgSrc = `/images/cats/${catColor}/${frame}.png`;
    (document.getElementById('catjam') as HTMLImageElement).src = imgSrc;
  };

  const resetCatAnimation = () => {
    clearInterval(animationIntervalRef.current as unknown as number);
    setCatImage('PusayCenter');
  };

  const handlePlayButtonClick = () => {
    setShowPlayButton(false);
  };

  const renderPlayer = () => {
    if (!currentSong) {
      return (
        <div className={styles.placeholder}>
          <img
            src="/images/song_placeholder.png"
            alt="No song playing"
            className={styles.placeholderImage}
          />
          <p>No song is currently playing.</p>
        </div>
      );
    }

    if (currentSong.source === 'spotify') {
      return (
        <div id="spotify-player-wrapper">
          <div id="spotify-player" ref={spotifyPlayerRef}></div>
        </div>
      );
    }

    if (currentSong.source === 'youtube' && currentSong.audioPath) {
      return (
        <audio
          controls
          autoPlay
          ref={audioRef}
          onEnded={handleAudioEnded}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const duration = audioRef.current.duration || 0;
              const currentTime = audioRef.current.currentTime || 0;

              if (duration > 0) {
                const progress = (currentTime / duration) * 100;
                setProgress(progress);
              } else {
                setProgress(0);
              }
            }
          }}
          crossOrigin="anonymous"
        >
          <source src={currentSong.audioPath} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
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

      <label htmlFor="catColorSelect">Choose Cat Color: </label>
      <select id="catColorSelect" value={catColor} onChange={(e) => setCatColor(e.target.value)}>
        <option value="Blue">Blue</option>
        <option value="White">White</option>
        <option value="Orange">Orange</option>
        <option value="Red">Red</option>
      </select>

      <div className={styles.songInfoContainer}>
        {/* Song Info */}
        <div className={styles.songInfo}>
          {currentSong ? (
            <>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className={styles.coverImage}
              />
              <h2 className={styles.trackName}>{currentSong.track_name}</h2>
              <p className={styles.artistName}>{currentSong.artist_name}</p>
              <p className={styles.submittedBy}>Submitted by: {currentSong.submittedBy}</p> {/* Display submittedBy */}
              <div className={styles.progressContainer}>
                <progress id="progressBar" value={progress} max="100"></progress>
              </div>
              {renderPlayer()}
            </>
          ) : (
            <div className={styles.placeholder}>
              <img
                src="/images/song_placeholder.png"
                alt="No song playing"
                className={styles.placeholderImage}
              />
              <p>No song is currently playing.</p>
            </div>
          )}
        </div>

        {/* Cat Animation */}
        <div className={styles.catContainer}>
          <img id="catjam" src={`/images/cats/${catColor}/PusayCenter.png`} alt="Cat Jam" />
        </div>
      </div>
    </div>
  );
};


export default DisplayPage;