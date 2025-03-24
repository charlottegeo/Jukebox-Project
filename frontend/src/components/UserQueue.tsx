import React from 'react';
import { ReactSortable } from 'react-sortablejs';
import { Song } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faTrashCan, faMusic } from '@fortawesome/free-solid-svg-icons';

interface UserQueueProps {
    queue: Song[];
    onClearQueue: () => void;
    onRemoveSong: (index: number) => void;
    onReorderQueue: (newQueue: Song[]) => void;
}

const UserQueue: React.FC<UserQueueProps> = ({ queue = [], onClearQueue, onRemoveSong, onReorderQueue }) => {

    const handleReorder = (newQueue: Song[]) => {
        onReorderQueue(newQueue);
    };

    return (
        <div className="user-queue-container">
            <div className="queue-header">
                <h2 className="user-queue-title">Your Queue</h2>
                {queue.length > 0 && (
                    <button onClick={onClearQueue} className="clear-queue-button" title="Clear queue">
                        <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                )}
            </div>
            
            {queue.length === 0 ? (
                <div className="empty-queue">
                    <FontAwesomeIcon icon={faMusic} className="music-icon" />
                    <p>Your Queue is Empty</p>
                    <p className="empty-queue-subtitle">Search for songs above to add them to your queue</p>
                </div>
            ) : (
                <ReactSortable<Song>
                    list={queue}
                    setList={handleReorder}
                    animation={200}
                    handle=".drag-handle"
                    className="sortable-list"
                >
                    {queue.map((song, index) => (
                        <div key={`${song.id}-${index}`} className="queue-item">
                            <div className="order-number">{index + 1}</div>
                            <div className="drag-handle" title="Drag to reorder">
                                <div className="dot"></div>
                                <div className="dot"></div>
                                <div className="dot"></div>
                            </div>
                            <img src={song.cover_url} alt={song.track_name} />
                            <div className="song-info">
                                <div className="track-name">{song.track_name}</div>
                                <div className="artist-name">{song.artist_name}</div>
                                <div className="duration">{song.track_length}</div>
                            </div>
                            <button
                                onClick={() => onRemoveSong(index)}
                                className="remove-song-button"
                                title="Remove song"
                            >
                                <FontAwesomeIcon icon={faTrash} />
                            </button>
                        </div>
                    ))}
                </ReactSortable>
            )}
        </div>
    );
};

export default UserQueue;
