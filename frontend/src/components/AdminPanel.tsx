import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faForward, faPlay, faPause, faSync,
  faVolumeUp, faVolumeDown, faVolumeMute, faClock
} from '@fortawesome/free-solid-svg-icons';
import {
  Modal, ModalHeader, ModalBody,
  Button, Input, FormGroup, Label, Card, CardBody, ListGroup, ListGroupItem
} from 'reactstrap';
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
        <div className="mb-3 d-flex gap-2">
          <Button color="primary" onClick={handlePausePlay}>
            <FontAwesomeIcon icon={!isPlaying ? faPause : faPlay} />
          </Button>
          <Button color="danger" outline onClick={handleForceSkip}>
            <FontAwesomeIcon icon={faForward} />
          </Button>
        </div>

        <FormGroup>
          <Label className="d-flex align-items-center">
            <FontAwesomeIcon icon={getVolumeIcon()} className="mr-2" onClick={handleVolumeIconClick} style={{ cursor: 'pointer' }} />
            Volume: {volume}%
          </Label>
          <Input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            className="form-control-range"
          />
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

        <Card>
          <CardBody>
            <h5 className="card-title">Active Users</h5>
            <ListGroup flush>
              {activeUsers.map((user) => (
                <ListGroupItem key={user.username} className="d-flex align-items-center">
                  <img
                    src={user.profilePicture}
                    alt={user.username}
                    className="rounded mr-2"
                    style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                  />
                  <span>{user.username} · {user.queueCount} {user.queueCount === 1 ? 'song' : 'songs'}</span>
                </ListGroupItem>
              ))}
            </ListGroup>
          </CardBody>
        </Card>
      </ModalBody>
    </Modal>
  );
};

export default AdminPanel;
