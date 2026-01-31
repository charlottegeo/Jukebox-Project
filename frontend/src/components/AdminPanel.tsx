import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faForward, faPlay, faPause, faSync, faTimes, 
  faVolumeUp, faVolumeDown, faVolumeMute, faClock 
} from '@fortawesome/free-solid-svg-icons';
import { ActiveUser } from '../types';

interface AdminPanelProps {
  onClose: () => void;
  socket: any;
  volume: number;
  onVolumeChange: (volume: number) => void;
  currentUser?: string;
  isPaused?: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, socket, volume, onVolumeChange, currentUser, isPaused: serverIsPaused }) => {
  const [isPlaying, setIsPlaying] = useState(!(serverIsPaused ?? false));
  const [previousVolume, setPreviousVolume] = useState<number>(volume);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [songLengthLimit, setSongLengthLimit] = useState<number>(10);

  useEffect(() => {
    if (serverIsPaused !== undefined) {
      setIsPlaying(!serverIsPaused);
    }
  }, [serverIsPaused]);

  useEffect(() => {
    if (!socket) return;

    const handleActiveUsers = (users: ActiveUser[]) => {
      console.log('Received active users update:', users);
      setActiveUsers(users);
    };

    const handleSongLengthLimit = (data: { limit: number }) => {
      console.log('Received song length limit update:', data);
      setSongLengthLimit(data.limit);
    };

    const handlePausePlay = (data: { isPaused: boolean }) => {
      setIsPlaying(!data.isPaused);
    };

    socket.on('updateActiveUsers', handleActiveUsers);
    socket.on('updateSongLengthLimit', handleSongLengthLimit);
    socket.on('toggle_pause_play', handlePausePlay);

    socket.emit('getActiveUsers');
    socket.emit('getSongLengthLimit');

    return () => {
      socket.off('updateActiveUsers', handleActiveUsers);
      socket.off('updateSongLengthLimit', handleSongLengthLimit);
      socket.off('toggle_pause_play', handlePausePlay);
    };
  }, [socket]);

  const handleForceSkip = () => {
    socket?.emit('force_skip');
  };

  const handlePausePlay = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    socket?.emit('pause_play', { isPaused: newState });
  };

  const handleRefreshDisplay = () => {
    socket?.emit('refresh_display');
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    onVolumeChange(newVolume);
  };

  const handleVolumeIconClick = () => {
    if (volume > 0) {
      setPreviousVolume(volume);
      onVolumeChange(0);
    } else {
      onVolumeChange(previousVolume);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return faVolumeMute;
    if (volume < 50) return faVolumeDown;
    return faVolumeUp;
  };

  const handleMaxLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLimit = parseFloat(e.target.value);
    console.log('Setting new song length limit:', newLimit);
    setSongLengthLimit(newLimit);
    socket?.emit('setSongLengthLimit', { limit: newLimit });
  };

  const formatTime = (minutes: number): string => {
    const totalSeconds = Math.round(minutes * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="admin-panel-overlay">
      <div className="admin-panel">
        <button onClick={onClose} className="btn btn-link float-right p-0" style={{ fontSize: '1.5rem' }}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <h2 className="h4 mb-3">Admin Controls</h2>
        
        <div className="admin-controls-group">
          <div className="playback-controls mb-3">
            <button onClick={handlePausePlay} className="btn btn-primary mr-2">
              <FontAwesomeIcon icon={!isPlaying ? faPause : faPlay} />
            </button>
            <button onClick={handleForceSkip} className="btn btn-outline-danger">
              <FontAwesomeIcon icon={faForward} />
            </button>
          </div>

          <div className="volume-control">
            <div className="volume-icon" onClick={handleVolumeIconClick}>
              <FontAwesomeIcon icon={getVolumeIcon()} />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
            <span className="volume-value">{volume}%</span>
          </div>

          <div className="volume-control">
            <div className="volume-icon">
              <FontAwesomeIcon icon={faClock} />
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={songLengthLimit}
              onChange={handleMaxLengthChange}
              className="volume-slider"
            />
            <span className="volume-value">{formatTime(songLengthLimit)}</span>
          </div>

          <button onClick={handleRefreshDisplay} className="btn btn-outline-secondary btn-block">
            <FontAwesomeIcon icon={faSync} className="mr-2" /> Refresh Display
          </button>
        </div>

        <div className="active-users-section">
          <h3>Active Users</h3>
          <div className="active-users-list">
            {activeUsers.map((user) => (
              <div key={user.username} className="active-user">
                <img 
                  src={user.profilePicture} 
                  alt={user.username} 
                  className="user-avatar"
                />
                <div className="user-info">
                  {user.username} | {user.queueCount} {user.queueCount === 1 ? 'song' : 'songs'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
