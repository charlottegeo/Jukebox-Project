import React from 'react';
import { ReactSortable } from 'react-sortablejs';
import { Card, CardHeader, CardBody, ListGroup, ListGroupItem, Button } from 'reactstrap';
import { Song } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faTrashCan, faMusic, faGripVertical } from '@fortawesome/free-solid-svg-icons';

interface UserQueueProps {
    queue: Song[];
    onClearQueue: () => void;
    onRemoveSong: (index: number) => void;
    onReorderQueue: (newQueue: Song[]) => void;
}

const UserQueue: React.FC<UserQueueProps> = ({
    queue = [],
    onClearQueue,
    onRemoveSong,
    onReorderQueue,
}) => {
    const handleReorder = (newQueue: Song[]) => {
        onReorderQueue(newQueue);
    };

    const reorderableQueue = queue.map((song, index) => ({
        ...song,
        id: `${song.id}-${index}`
    }));

    return (
        <Card className="h-100">
            <CardHeader className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Your Queue</h5>
                {queue.length > 0 && (
                    <Button 
                        color="link" 
                        size="sm"
                        onClick={onClearQueue} 
                        title="Clear queue"
                        className="p-0"
                    >
                        <FontAwesomeIcon icon={faTrashCan} />
                    </Button>
                )}
            </CardHeader>
            <CardBody className="p-0">
                {queue.length === 0 ? (
                    <div className="text-center text-muted p-5 d-flex flex-column align-items-center">
                        <FontAwesomeIcon icon={faMusic} size="3x" className="mb-3" />
                        <p className="mb-1">Your Queue is Empty</p>
                        <p className="small mb-0">Search for songs above to add them to your queue</p>
                    </div>
                ) : (
                    <ReactSortable<Song>
                        list={reorderableQueue}
                        setList={handleReorder}
                        animation={200}
                        handle=".drag-handle"
                        disabled={queue.length <= 1}
                    >
                        <ListGroup flush>
                            {queue.map((song, index) => (
                                <ListGroupItem
                                    key={`${song.id}-${index}`}
                                    className={`d-flex align-items-center ${song.source === 'spotify' ? 'border-left border-success' : 'border-left border-danger'}`}
                                    style={{ borderLeftWidth: '4px' }}
                                >
                                    <span className="text-muted small mr-2" style={{ minWidth: '24px' }}>
                                        {index + 1}
                                    </span>

                                    <div
                                        className="drag-handle mr-2"
                                        title="Drag to reorder"
                                        style={{ cursor: queue.length > 1 ? 'grab' : 'default' }}
                                    >
                                        <FontAwesomeIcon icon={faGripVertical} className="text-muted" />
                                    </div>

                                    <img 
                                        src={song.cover_url} 
                                        alt={song.track_name}
                                        className="mr-3 rounded"
                                        style={{ width: '48px', height: '48px', objectFit: 'cover', flexShrink: 0 }}
                                    />

                                    <div className="flex-grow-1" style={{ minWidth: 0, overflow: 'hidden' }}>
                                        <div className="font-weight-bold text-truncate">{song.track_name}</div>
                                        <div className="text-muted small text-truncate">{song.artist_name}</div>
                                        <div className="text-muted small">{song.track_length}</div>
                                    </div>

                                    <Button
                                        color="link"
                                        size="sm"
                                        onClick={() => onRemoveSong(index)}
                                        title="Remove song"
                                        className="text-danger p-0 ml-2"
                                    >
                                        <FontAwesomeIcon icon={faTrash} />
                                    </Button>
                                </ListGroupItem>
                            ))}
                        </ListGroup>
                    </ReactSortable>
                )}
            </CardBody>
        </Card>
    );
};

export default UserQueue;
