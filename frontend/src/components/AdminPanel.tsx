import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faForward, faPlay, faPause, faSync,
  faVolumeUp, faVolumeDown, faVolumeMute, faClock
} from '@fortawesome/free-solid-svg-icons';
import {
  Modal, ModalHeader, ModalBody,
  Button, Input, FormGroup, Label, Card, CardBody
} from 'reactstrap';
import { ActiveUser } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface AdminPanelProps {
  onClose: () => void;
  socket: any;
  volume: number;
  onVolumeChange: (volume: number) => void;
  currentUser?: string;
  isPaused?: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, socket, volume, onVolumeChange, currentUser, isPaused: serverIsPaused }) => {
  const { darkMode } = useTheme();
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
    onVolumeChange(parseInt(e.target.value, 10));
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
    <Modal isOpen toggle={onClose} size="lg">
      <ModalHeader toggle={onClose}>Admin Controls</ModalHeader>
      <ModalBody>
        <div className="mb-3 d-flex gap-3 flex-wrap admin-panel-actions">
          <Button color="primary" onClick={handlePausePlay}>
            <FontAwesomeIcon icon={!isPlaying ? faPause : faPlay} className="mr-1" />
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button color="danger" onClick={handleForceSkip} className="font-weight-bold">
            <FontAwesomeIcon icon={faForward} className="mr-1" />
            Force Skip
          </Button>
        </div>

        <FormGroup className="admin-volume-group">
          <Label className="d-flex align-items-center mb-2">
            <FontAwesomeIcon icon={getVolumeIcon()} className="mr-2" onClick={handleVolumeIconClick} style={{ cursor: 'pointer' }} />
            Volume: {volume}%
          </Label>
          <div className="admin-volume-slider-wrap">
            <Input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="form-control-range admin-volume-slider"
            />
          </div>
        </FormGroup>

        <FormGroup>
          <Label>
            <FontAwesomeIcon icon={faClock} className="mr-2" />
            Max song length: {formatTime(songLengthLimit)}
          </Label>
          <Input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={songLengthLimit}
            onChange={handleMaxLengthChange}
            className="form-control-range"
          />
        </FormGroup>

        <Button color="secondary" outline block onClick={handleRefreshDisplay} className="mb-3">
          <FontAwesomeIcon icon={faSync} className="mr-2" /> Refresh Display
        </Button>

        <h5 className="mb-2">Active Users</h5>
        <div className="d-flex flex-wrap gap-2">
          {activeUsers.map((user) => (
            <Card key={user.username} className={`mb-0 ${darkMode ? 'bg-dark text-white border-secondary' : 'bg-light border-light'}`} style={{ minWidth: '200px' }}>
              <CardBody className="d-flex align-items-center py-2 px-3">
                <img
                  src={user.profilePicture}
                  alt={user.username}
                  className="rounded mr-2 flex-shrink-0"
                  style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                />
                <div className="min-width-0">
                  <div className="font-weight-bold text-truncate">{user.username}</div>
                  <div className="small text-muted">{user.queueCount} {user.queueCount === 1 ? 'song' : 'songs'}</div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
};

export default AdminPanel;
