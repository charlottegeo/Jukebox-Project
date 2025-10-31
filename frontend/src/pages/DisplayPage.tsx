import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';
import styles from './DisplayPage.module.css';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';

interface Song {
  id: string;
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

//1024×600
const DisplayPage: React.FC = () => {
  type PlaybackState = 'playing' | 'paused' | 'stopped' | 'queue_empty';
  const [playbackState, setPlaybackState] = useState<PlaybackState>('queue_empty');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [catColor, setCatColor] = useState<string>('Orange');
  const [userColors, setUserColors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(100);

  const progressIntervalRef = useRef<NodeJS.Timer | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bpmProcessorRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const { socket, isConnected } = useSocket(import.meta.env.VITE_BACKEND_URL);

  useEffect(() => {
    console.log('DisplayPage mounted');
  }, []);

  useEffect(() => {
    console.log('Socket state changed:', { 
      isConnected,
      socketId: socket?.id
    });

    if (isConnected && socket) {
      console.log('Socket connected, requesting initial data');
      socket.emit('get_current_song');
      socket.emit('get_user_queue');
    }
  }, [isConnected, socket]);

  useEffect(() => {
    if (!socket) return;

    console.log('Setting up socket listeners');

    const handleServerStartup = () => {
      setCatColor('Orange');
      const imgElement = document.getElementById('pusay') as HTMLImageElement;
      if (imgElement) {
        const currentSrc = imgElement.src;
        const frame = currentSrc.split('/').pop()?.replace('.png', '') || 'PusayCenter';
        imgElement.src = `/images/cats/Orange/${frame}.png`;
      }
    };

    const handleUpdateCurrentSong = (data: { currentSong: Song | null; isLoading?: boolean }) => {
      console.log('Received updateCurrentSong event:', data);
      if (data.currentSong) {
        setProgress(0);
        setCurrentSong(data.currentSong);
        setPlaybackState('playing');
        setIsPlaying(true);
        
        const songSubmitterColor = userColors[data.currentSong.submittedBy] || 'Orange';
        console.log('Setting cat color for song:', { 
          submitter: data.currentSong.submittedBy, 
          color: songSubmitterColor 
        });
        
        setCatColor(songSubmitterColor);
        const imgElement = document.getElementById('pusay') as HTMLImageElement;
        if (imgElement) {
          const currentSrc = imgElement.src;
          const frame = currentSrc.split('/').pop()?.replace('.png', '') || 'PusayCenter';
          imgElement.src = `/images/cats/${songSubmitterColor}/${frame}.png`;
        }
        
        setIsLoading(Boolean(data.isLoading));

        if (data.currentSong.bpm && !isPlaying) {
          animateFrames(data.currentSong.bpm, songSubmitterColor);
        }
      } else {
        console.log('Queue is empty, setting current song to null.');
        setCurrentSong(null);
        setPlaybackState('queue_empty');
        setIsLoading(false);
        setProgress(0);
        
        if (audioRef.current) {
          audioRef.current.src = '';
          audioRef.current.load();
        }

        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current as unknown as number);
          animationIntervalRef.current = null;
        }
        setCatImage('PusayCenter');
      }
    };

    const handlePreloadedNextSong = (data: { song: Song }) => {
      console.log('Received preloaded next song, beginning audio preload:', data.song);
      
      if (data.song.audioPath) {
        const preloadAudio = new Audio();
        
        preloadAudio.onerror = (e) => {
          console.error('Error preloading audio file, likely 404 not found:', data.song.audioPath, e);
          
          socket?.emit('preload_failed', { 
            songId: data.song.id || data.song.track_id || '', 
            errorType: 'file_not_found',
            path: data.song.audioPath || ''
          });
        };
        
        fetch(data.song.audioPath, { method: 'HEAD' })
          .then(response => {
            if (response.ok) {
              preloadAudio.src = data.song.audioPath || '';
              preloadAudio.preload = 'auto';
              preloadAudio.load();
              preloadAudio.volume = 0;
              
              preloadAudio.play().then(() => {
                setTimeout(() => {
                  preloadAudio.pause();
                  preloadAudio.currentTime = 0;
                  console.log('Preloaded next song audio:', data.song.track_name);
                }, 1000);
              }).catch(err => {
                console.error('Error playing preloaded song:', err);
              });
            } else {
              console.error('File not found or not accessible:', data.song.audioPath);
              socket?.emit('preload_failed', { 
                songId: data.song.id || data.song.track_id || '', 
                errorType: 'file_not_found',
                status: response.status
              });
            }
          })
          .catch(error => {
            console.error('Error checking file existence:', error);
          });
      } else {
        console.warn('No audio path provided for preloaded song:', data.song.track_name);
      }
    };

    socket.on('updateCurrentSong', handleUpdateCurrentSong);
    socket.on('queue_empty', () => {
      console.log('Queue empty event received');
      setPlaybackState('queue_empty');
      setCurrentSong(null);
      setIsLoading(false);
    });
    socket.on('updateUserQueue', (data: { queue: Song[], uid?: string }) => {
      console.log('Received updateUserQueue event:', data);
      setQueue(prevQueue => {
        if (!data.uid) {
          console.log('Replacing entire queue:', data.queue);
          return data.queue;
        }
        
        console.log('Updating queue for user:', data.uid);
        const otherUsersQueue = prevQueue.filter(song => song.submittedBy !== data.uid);
        const newQueue = [...otherUsersQueue, ...data.queue];
        console.log('New queue state:', newQueue);
        return newQueue;
      });
      
      if (playbackState === 'queue_empty' && data.queue.length > 0) {
        console.log('Queue was empty and new songs added, requesting next song');
        playNextSong();
      }
    });
    socket.on('updateUserCatColor', (data: { uid: string | null; color: string }) => {
      console.log('Received color update:', data);
      
      if (data.uid === null) {
        console.log('Server-wide color reset to:', data.color);
        setCatColor(data.color);
        const imgElement = document.getElementById('pusay') as HTMLImageElement;
        if (imgElement) {
          const currentSrc = imgElement.src;
          const frame = currentSrc.split('/').pop()?.replace('.png', '') || 'PusayCenter';
          imgElement.src = `/images/cats/${data.color}/${frame}.png`;
        }
        setUserColors({});
        return;
      }
      const uid: string = data.uid;
      setUserColors((prevColors) => ({
        ...prevColors,
        [uid]: data.color,
      }));

      if (currentSong?.submittedBy === uid) {
        console.log('Updating current cat color to:', data.color);
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
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current as unknown as number);
          animationIntervalRef.current = null;
        }
      } else {
        audioRef.current?.play();
        if (currentSong?.bpm) {
          animateFrames(currentSong.bpm, catColor);
        }
      }
    });
    socket.on('preloaded_next_song', handlePreloadedNextSong);
    socket.on('refresh_display', () => {
      console.log('refresh_display');
      window.location.reload();
    });
    socket.on('server_startup', handleServerStartup);
    socket.on('song_bpm_response', (data: { trackId: string; bpm: number | null }) => {
      if (data.bpm) {
        animateFrames(data.bpm, catColor);
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
    ``
    return () => {
      console.log('Cleaning up socket listeners');
      socket.off('updateCurrentSong', handleUpdateCurrentSong);
      socket.off('queue_empty');
      socket.off('updateUserQueue');
      socket.off('updateUserCatColor');
      socket.off('pause_play');
      socket.off('refresh_display');
      socket.off('song_bpm_response');
      socket.off('song_download_complete');
      socket.off('volume_change');
      socket.off('server_startup', handleServerStartup);
      socket.off('preloaded_next_song', handlePreloadedNextSong);
    };
  }, [socket]);


  useEffect(() => {
    console.log('State updated:', {
      playbackState,
      currentSong,
      queueLength: queue.length,
      isPlaying,
      isLoading
    });
  }, [playbackState, currentSong, queue, isPlaying, isLoading]);

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
      animateFrames(currentSong.bpm, catColor);
    }
  };

  const calculateFrameDuration = (bpm: number): number => {
    const bps = bpm / 60;
    return 1 / (2 * bps);
  };

  const animateFrames = (bpm: number, colorOverride?: string) => {
    let currentFrameIndex = 0;
    let currentIncrement = true;
    const currentColor = colorOverride ?? catColor;
    const imgElement = document.getElementById('pusay') as HTMLImageElement;
    if (imgElement) {
      const currentSrc = imgElement.src;
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
    }

    if (animationIntervalRef.current && currentSong?.bpm !== bpm) {
      clearInterval(animationIntervalRef.current as unknown as number);
    }

    const frames = ['PusayLeft', 'PusayCenter', 'PusayRight'];
    let frameIndex = currentFrameIndex;
    let increment = currentIncrement;

    const frameDuration = calculateFrameDuration(bpm);

    animationIntervalRef.current = setInterval(() => {
      const imgElement = document.getElementById('pusay') as HTMLImageElement;
      if (imgElement) {
        const frame = frames[frameIndex];
        const imgSrc = `/images/cats/${currentColor}/${frame}.png`;
        imgElement.src = imgSrc;
      }

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

  useEffect(() => {
    console.log('Cat color changed to:', catColor);
    if (!animationIntervalRef.current) {
      const imgElement = document.getElementById('pusay') as HTMLImageElement;
      if (imgElement) {
        const currentSrc = imgElement.src;
        const frame = currentSrc.split('/').pop()?.replace('.png', '') || 'PusayCenter';
        imgElement.src = `/images/cats/${catColor}/${frame}.png`;
      }
    }
  }, [catColor]);

  const setCatImage = (frame: string, colorOverride?: string) => {
    const imgElement = document.getElementById('pusay') as HTMLImageElement;
    if (imgElement) {
      const color = colorOverride ?? catColor;
      const imgSrc = `/images/cats/${color}/${frame}.png`;
      imgElement.src = imgSrc;
    }
  };  

  const resetCatAnimation = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as number);
      animationIntervalRef.current = null;
    }
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
            animateFrames(newBpm, catColor);
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
    
    if (audioRef.current) {
      audioRef.current.src = '';
      audioRef.current.load();
    }
    
    setIsPlaying(false);
    setProgress(0);
    setPlaybackState('queue_empty');
    setCurrentSong(null);
    
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current as unknown as number);
      animationIntervalRef.current = null;
    }
    setCatImage('PusayCenter');
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
        <div className={styles.songInfoContainer}>
          <div className={styles.songInfo}>
            <div className={styles.placeholder}>
              <img src="/images/placeholder.png" alt="No song playing" className={styles.placeholderImage} />
              <p>No song playing</p>
            </div>
          </div>
          <div className={styles.catContainer}>
            <img id="pusay" src={`/images/cats/${catColor}/PusayCenter.png`} alt="Pusay" />
          </div>
        </div>
      );
    }

    return (
      <>
        {currentSong.audioPath && (
          <audio
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
            autoPlay
            crossOrigin="anonymous"
            style={{ display: 'none' }}
          >
            <source src={currentSong.audioPath} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        )}
        <div className={styles.songInfoContainer}>
          <div className={styles.songInfo}>
            <div className={styles.coverImageContainer}>
              <img
                src={currentSong.cover_url}
                alt={currentSong.track_name}
                className={`${styles.coverImage} ${isLoading ? styles.loading : ''}`}
              />
              {isLoading && (
                <div className={styles.loadingOverlay}>
                  <div className={styles.loadingSpinner} />
                  <span>Loading...</span>
                </div>
              )}
            </div>
            <div className={styles.trackName}>{currentSong.track_name}</div>
            <div className={styles.artistName}>{currentSong.artist_name}</div>
            <div className={styles.submittedBy}>Added by {currentSong.submittedBy}</div>
            <div className={styles.progressContainer}>
              <progress 
                className={`${styles.progressBar} ${isLoading ? styles.hidden : ''}`}
                value={progress} 
                max="100"
              />
              <div className={`${styles.loadingBar} ${isLoading ? styles.visible : ''}`} />
            </div>
          </div>
          <div className={styles.catContainer}>
            <img id="pusay" src={`/images/cats/${catColor}/PusayCenter.png`} alt="Dancing Cat" />
          </div>
        </div>
      </>
    );
  };

  const audioElement = audioRef.current;
  if (audioElement) {
    audioElement.onplaying = () => {
      console.log('Audio playback has started, requesting next song preload');
      socket?.emit('ready_for_preload');
    };
  }

  return (
    <div className={styles.container}>
      {renderPlayer()}
    </div>
  );
};

export default DisplayPage;