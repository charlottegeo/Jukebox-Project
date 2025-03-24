import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
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
  const [progress, setProgress] = useState<number>(0);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [catColor, setCatColor] = useState<string>('Blue');
  const [userColors, setUserColors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(100);

  const progressIntervalRef = useRef<NodeJS.Timer | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bpmProcessorRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const socket = useSocket(import.meta.env.VITE_BACKEND_URL);
  useEffect(() => {
    if (socket) {
      socket.emit('get_current_song');

      const handleUpdateCurrentSong = (data: { currentSong: Song | null; isLoading?: boolean }) => {
        console.log('Received current song:', data.currentSong);
        if (data.currentSong) {
          setCurrentSong(data.currentSong);
          setPlaybackState('playing');
          const songSubmitterColor = userColors[data.currentSong.submittedBy];
          setCatColor(songSubmitterColor || 'White');
          setIsLoading(Boolean(data.isLoading));

          if (data.currentSong.bpm) {
            animateFrames(data.currentSong.bpm);
          }
        } else {
          console.log('Queue is empty, setting current song to null.');
          setCurrentSong(null);
          setPlaybackState('queue_empty');
          setIsLoading(false);
        }
      };

      socket.on('updateCurrentSong', handleUpdateCurrentSong);
      socket.on('queue_empty', () => {
        console.log('Queue empty event received');
        setPlaybackState('queue_empty');
        setCurrentSong(null);
        setIsLoading(false);
      });
      socket.on('queueUpdated', (data: { queue: Song[] }) => {
        console.log('Queue updated:', data.queue);
        setQueue(data.queue);
        if (playbackState === 'queue_empty' && data.queue.length > 0) {
          playNextSong();
        }
      });
      socket.on('updateUserCatColor', (data: { uid: string; color: string }) => {
        setUserColors((prevColors) => ({
          ...prevColors,
          [data.uid]: data.color,
        }));
        if (currentSong?.submittedBy === data.uid) {
          setCatColor(data.color);
          const imgElement = document.getElementById('pusay') as HTMLImageElement;
          if (imgElement) {
            const currentSrc = imgElement.src;
            const frame = currentSrc.split('/').pop()?.replace('.png', '') || 'PusayCenter';
            imgElement.src = `/images/cats/${data.color}/${frame}.png`;
          }
        }
      });
      socket.on('toggle_pause_play', ({ isPaused }) => {
        console.log('toggle_pause_play', isPaused);
        setIsPlaying(!isPaused);
        if (isPaused) {
          audioRef.current?.pause();
        } else {
          audioRef.current?.play();
        }
      });
      socket.on('refresh_display', () => {
        console.log('refresh_display');
        window.location.reload();
      });
      socket.on('song_bpm_response', (data: { trackId: string; bpm: number | null }) => {
        if (data.bpm) {
          animateFrames(data.bpm);
        } else {
          console.warn('No valid BPM candidates found for track:', data.trackId);
        }
      });
      socket.on('song_download_complete', () => {
        setIsLoading(false);
      });
      socket.on('volume_change', (data: { volume: number }) => {
        console.log('Volume changed:', data.volume);
        setVolume(data.volume);
      });

      return () => {
        socket.off('updateCurrentSong', handleUpdateCurrentSong);
        socket.off('queue_empty');
        socket.off('queueUpdated');
        socket.off('updateUserCatColor');
        socket.off('pause_play');
        socket.off('refresh_display');
        socket.off('song_bpm_response');
        socket.off('song_download_complete');
        socket.off('volume_change');
      };
    }
  }, [socket, userColors]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const resetAndAnimateCat = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as NodeJS.Timeout);
    }
    if (currentSong?.bpm) {
      animateFrames(currentSong.bpm);
    }
  };

  const calculateFrameDuration = (bpm: number): number => {
    const bps = bpm / 60;
    return 1 / (2 * bps);
  };

  const animateFrames = (bpm: number) => {
    let currentFrameIndex = 0;
    let currentIncrement = true;

    if (animationIntervalRef.current) {
      const currentSrc = (document.getElementById('pusay') as HTMLImageElement).src;
      const currentFrame = currentSrc.split('/').pop()?.replace('.png', '');

      if (currentFrame === 'PusayLeft') {
        currentFrameIndex = 0;
        currentIncrement = true;
      } else if (currentFrame === 'PusayCenter') {
        currentFrameIndex = 1;
        const nextFrame = currentIncrement ? 'PusayRight' : 'PusayLeft';
        currentIncrement = nextFrame === 'PusayRight';
      } else if (currentFrame === 'PusayRight') {
        currentFrameIndex = 2;
        currentIncrement = false;
      }

      clearInterval(animationIntervalRef.current as unknown as number);
    }

    const frames = ['PusayLeft', 'PusayCenter', 'PusayRight'];
    let frameIndex = currentFrameIndex;
    let increment = currentIncrement;

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
    (document.getElementById('pusay') as HTMLImageElement).src = imgSrc;
  };

  const resetCatAnimation = () => {
    clearInterval(animationIntervalRef.current as unknown as number);
    setCatImage('PusayCenter');
  };


  const setupBpmAnalyzer = async (audioElement: HTMLAudioElement) => {
    const extendedAudioElement = audioElement as HTMLAudioElementWithSource;
    if (!extendedAudioElement) return;

    try {
      if (extendedAudioElement.mediaSourceNode && audioContextRef.current?.state !== 'closed') {
        console.log('Reusing existing audio context and media source node');
        return;
      }

      if (audioContextRef.current?.state === 'closed' || !audioContextRef.current) {
        console.log('Creating new AudioContext');
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === 'suspended') {
        console.log('Resuming AudioContext');
        await audioContextRef.current.resume();
      }

      console.log('Creating media source node');
      const source = audioContextRef.current.createMediaElementSource(extendedAudioElement);
      extendedAudioElement.mediaSourceNode = source;

      const bpmProcessor = await createRealTimeBpmProcessor(audioContextRef.current, {
        continuousAnalysis: true,
        debug: true,
        muteTimeInIndexes: 10,
        stabilizationTime: 5000,
      });

      const lowpass = getBiquadFilter(audioContextRef.current);

      source.connect(lowpass).connect(bpmProcessor);
      source.connect(audioContextRef.current.destination);

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
          }
        }
      };

      bpmProcessorRef.current = bpmProcessor;
    } catch (error) {
      console.error('Error setting up BPM Analyzer:', error);
    }
  };

  useEffect(() => {
    if (audioRef.current && currentSong?.audioPath) {
      setupBpmAnalyzer(audioRef.current);
    }

    return () => {
      if (audioContextRef.current) {
        console.log('Closing AudioContext during cleanup');
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (audioRef.current) {
        const extendedAudioElement = audioRef.current as HTMLAudioElementWithSource;
        if (extendedAudioElement.mediaSourceNode) {
          console.log('Disconnecting media source node during cleanup');
          extendedAudioElement.mediaSourceNode.disconnect();
          delete extendedAudioElement.mediaSourceNode;
        }
      }

      if (bpmProcessorRef.current) {
        console.log('Disconnecting BPM processor during cleanup');
        bpmProcessorRef.current.disconnect();
      }
    };
  }, [currentSong?.audioPath]);

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

  const handlePlayButtonClick = () => {
    setShowPlayButton(false);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
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

    if (currentSong.audioPath) {
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
                setProgress((currentTime / duration) * 100);
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
      {/* Might not need this
      <h1 className={styles.title}>Now Playing</h1>
      {showPlayButton && (
        <button className={styles.playButton} onClick={handlePlayButtonClick}>
          Play
        </button>
      )}
      */}

      <div className={styles.songInfoContainer}>
        <div className={styles.songInfo}>
          {currentSong ? (
            <>
              <div className={styles.coverImageContainer}>
                <img
                  src={currentSong.cover_url}
                  alt={currentSong.track_name}
                  className={`${styles.coverImage} ${isLoading ? styles.loading : ''}`}
                />
                {isLoading && (
                  <div className={styles.loadingOverlay}>
                    <div className={styles.loadingSpinner}></div>
                    <p>Loading song...</p>
                  </div>
                )}
              </div>
              <h2 className={styles.trackName}>{currentSong.track_name}</h2>
              <p className={styles.artistName}>{currentSong.artist_name}</p>
              <p className={styles.submittedBy}>Submitted by: {currentSong.submittedBy}</p>
              <div className={styles.progressContainer}>
                <progress id="progressBar" value={progress} max="100"></progress>
              </div>
              {!isLoading && renderPlayer()}
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

        <div className={styles.catContainer}>
          <img id="pusay" src={`/images/cats/${catColor}/PusayCenter.png`} alt="Pusay cat" />
        </div>
      </div>
    </div>
  );
};

export default DisplayPage;