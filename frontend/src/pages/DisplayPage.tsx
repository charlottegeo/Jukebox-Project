import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import styles from './DisplayPage.module.css';
import { createRealTimeBpmProcessor, getBiquadFilter } from 'realtime-bpm-analyzer';
import { Song } from '../types';

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
  const {
    socket,
    currentSong,
    currentCatColor,
    isLoading,
    isPaused,
    volume,
  } = useSocket();

  const [progress, setProgress] = useState<number>(0);
  const animationIntervalRef = useRef<NodeJS.Timer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bpmProcessorRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      if (isPaused) {
        audioRef.current.pause();
      } else if (currentSong) {
        audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      }
    }
  }, [isPaused, currentSong]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  useEffect(() => {
    if (currentSong && currentSong.audioPath) {
      console.log('New song detected:', currentSong.track_name);
      if (audioRef.current) {
        audioRef.current.src = currentSong.audioPath;
        audioRef.current.load();
        if (!isPaused) {
          audioRef.current.play().catch(e => {
            if (e.name === 'NotAllowedError') {
              console.warn('Playback blocked by browser. Audio will start on user interaction.');
            } else {
              console.error('Error playing audio:', e);
            }
          });
        }
        setupBpmAnalyzer(audioRef.current);
      }
      setProgress(0);
    } else {
      if (audioRef.current) {
        audioRef.current.src = '';
        audioRef.current.load();
      }
      setProgress(0);
      resetCatAnimation();
    }
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
        audioContextRef.current = null;
      }
    };
  }, [currentSong]);

  useEffect(() => {
    if (!isPaused && currentSong?.bpm) {
      animateFrames(currentSong.bpm, currentCatColor);
    } else {
      resetCatAnimation();
    }

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current as unknown as number);
        animationIntervalRef.current = null;
      }
    };
  }, [isPaused, currentSong?.bpm, currentCatColor]);

  useEffect(() => {
    if (!animationIntervalRef.current) {
      setCatImage('PusayCenter', currentCatColor);
    }
  }, [currentCatColor]);
  
  useEffect(() => {
    if (!socket) return;
    
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
        preloadAudio.src = data.song.audioPath;
        preloadAudio.preload = 'auto';
      } else {
        console.warn('No audio path provided for preloaded song:', data.song.track_name);
      }
    };
    
    socket.on('preloaded_next_song', handlePreloadedNextSong);
    return () => { socket.off('preloaded_next_song', handlePreloadedNextSong); };
  }, [socket]);


  const calculateFrameDuration = (bpm: number): number => {
    const bps = bpm / 60;
    return 1 / (2 * bps);
  };

  const animateFrames = (bpm: number, colorOverride?: string) => {
    let currentFrameIndex = 0;
    let currentIncrement = true;
    const currentColor = colorOverride ?? currentCatColor;
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

  const setCatImage = (frame: string, colorOverride?: string) => {
    const imgElement = document.getElementById('pusay') as HTMLImageElement;
    if (imgElement) {
      const color = colorOverride ?? currentCatColor;
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
            animateFrames(newBpm, currentCatColor);
          }
        }
      };

      bpmProcessorRef.current = bpmProcessor;
    } catch (error) {
      console.error('Error setting up BPM Analyzer:', error);
    }
  };

  const handleAudioEnded = () => {
    console.log('Audio finished playing');
    setProgress(0);
    resetCatAnimation();
    socket?.emit('song_finished');
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
            <img id="pusay" src={`/images/cats/${currentCatColor}/PusayCenter.png`} alt="Pusay" />
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
            <img id="pusay" src={`/images/cats/${currentCatColor}/PusayCenter.png`} alt="Dancing Cat" />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={styles.container}>
      {renderPlayer()}
    </div>
  );
};

export default DisplayPage;