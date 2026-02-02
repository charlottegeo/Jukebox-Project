import React, { useState, useRef } from 'react';
import { ReactSortable } from 'react-sortablejs';
import { Card, CardHeader, CardBody, Button } from 'reactstrap';
import { Song } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faTrashCan, faMusic, faGripVertical, faArrowUp, faArrowDown } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../contexts/ThemeContext';

type SortableSong = Song & { id: string; _originalId: string };

interface UserQueueProps {
    queue: Song[];
    onClearQueue: () => void;
    onRemoveSong: (index: number) => void;
    onReorderQueue: (newQueue: Song[]) => void;
    wrapInCard?: boolean;
}

const UserQueue: React.FC<UserQueueProps> = ({
    queue = [],
    onClearQueue,
    onRemoveSong,
    onReorderQueue,
    wrapInCard = true,
}) => {
    const { darkMode } = useTheme();
    const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
    const animTimeoutRef = useRef<number | null>(null);

    const reorderableQueue: SortableSong[] = queue.map((song, index) => ({
        ...song,
        id: `${song.id}-${index}`,
        _originalId: song.id,
    }));

    const handleReorder = (newList: SortableSong[]) => {
        onReorderQueue(newList.map(({ id: _sortId, _originalId, ...song }) => ({ ...song, id: _originalId })));
    };

    const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
        if (toIndex < 0 || toIndex >= queue.length) return;
        const idA = queue[fromIndex].id;
        const idB = queue[toIndex].id;
        const next = [...queue];
        [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
        onReorderQueue(next);
        if (animTimeoutRef.current !== null) window.clearTimeout(animTimeoutRef.current);
        setAnimatingIds(new Set([idA, idB]));
        animTimeoutRef.current = window.setTimeout(() => {
            setAnimatingIds(new Set());
            animTimeoutRef.current = null;
        }, 320);
    };

    const header = (
        <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">Your Queue</h5>
            {queue.length > 0 && (
                <Button
                    color="link"
                    size="lg"
                    onClick={onClearQueue}
                    title="Clear queue"
                    className="p-0 text-primary"
                >
                    <FontAwesomeIcon icon={faTrashCan} />
                </Button>
            )}
        </div>
    );

    const listContent = (
        <>
            {queue.length === 0 ? (
                <div className="text-center text-muted p-5 d-flex flex-column align-items-center">
                    <FontAwesomeIcon icon={faMusic} size="3x" className="mb-3" />
                    <p className="mb-1">Your Queue is Empty</p>
                    <p className="small mb-0">Search for songs to add them to your queue</p>
                </div>
            ) : (
                <ReactSortable<SortableSong>
                    list={reorderableQueue}
                    setList={handleReorder}
                    animation={200}
                    handle=".drag-handle"
                    disabled={queue.length <= 1}
                    className="list-unstyled mb-0 user-queue-sortable"
                >
            {reorderableQueue.map((song, index) => {
                const isAnimating = animatingIds.has(song._originalId);
                return (
                    <Card
                        key={song.id}
                        className={`mb-2 user-queue-item ${isAnimating ? 'user-queue-item-animate' : ''} ${darkMode ? 'bg-dark text-white' : 'bg-white'} ${song.source === 'spotify' ? 'border-left border-success' : 'border-left border-danger'}`}
                        style={{ borderLeftWidth: '4px', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                    >
                                <CardBody className="d-flex align-items-center py-2 px-3">
                                    <span className="text-muted small mr-2" style={{ minWidth: '24px' }}>
                                        {index + 1}
                                    </span>
                                    <div
                                        className="drag-handle mr-2"
                                        title="Drag to reorder"
                                        style={{ cursor: reorderableQueue.length > 1 ? 'grab' : 'default' }}
                                    >
                                        <FontAwesomeIcon icon={faGripVertical} className="text-muted" />
                                    </div>
                                    <img
                                        src={song.cover_url}
                                        alt={song.track_name}
                                        className="mr-3 rounded flex-shrink-0"
                                        style={{ width: '48px', height: '48px', objectFit: 'cover' }}
                                    />
                                    <div className="flex-grow-1 min-width-0" style={{ overflow: 'hidden' }}>
                                        <div className="font-weight-bold text-truncate">{song.track_name}</div>
                                        <div className="text-muted small text-truncate">{song.artist_name}</div>
                                        <div className="text-muted small">{song.track_length}</div>
                                    </div>
                                    {reorderableQueue.length > 1 && (
                                        <div className="d-flex align-items-center flex-shrink-0 queue-move-buttons">
                                            <Button
                                                color="primary"
                                                size="sm"
                                                className="queue-move-btn"
                                                onClick={() => moveItem(index, 'up')}
                                                disabled={index === 0}
                                                title="Move up"
                                                aria-label="Move up"
                                            >
                                                <FontAwesomeIcon icon={faArrowUp} />
                                            </Button>
                                            <Button
                                                color="primary"
                                                size="sm"
                                                className="queue-move-btn"
                                                onClick={() => moveItem(index, 'down')}
                                                disabled={index === reorderableQueue.length - 1}
                                                title="Move down"
                                                aria-label="Move down"
                                            >
                                                <FontAwesomeIcon icon={faArrowDown} />
                                            </Button>
                                        </div>
                                    )}
                                    <Button
                                        color="link"
                                        size="sm"
                                        onClick={() => onRemoveSong(index)}
                                        title="Remove song"
                                        className="p-0 ml-1 flex-shrink-0"
                                    >
                                        <FontAwesomeIcon icon={faTrash} />
                                    </Button>
                            </CardBody>
                        </Card>
                    );
                })}
                </ReactSortable>
            )}
        </>
    );

    return (
        <Card className={`h-100 ${darkMode ? 'bg-dark text-white' : 'bg-light border-light'}`}>
            <CardBody className="p-3">
                 {header}
                {listContent}
            </CardBody>
        </Card>
    );
};

export default UserQueue;