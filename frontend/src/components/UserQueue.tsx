import React from 'react';
import { ReactSortable } from 'react-sortablejs';
import { v4 as uuidv4 } from 'uuid'; // Correct import for v4

import { Song } from '../types';

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
        <div>
            <h2>Your Queue</h2>
            <button onClick={onClearQueue}>Clear My Queue</button>
            
            <ReactSortable<Song>
                list={queue}
                setList={handleReorder}
                animation={200}
            >
                {queue.map((song, index) => (
                    <li key={`${song.id}-${index}`} style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '10px',
                        background: '#333333', //dark gray
                        padding: '10px',
                        borderRadius: '5px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                      }}>
                        <img src={song.cover_url} alt={song.track_name} width="50" style={{ marginRight: '10px' }} />
                        <div>
                            <div><strong>{song.track_name}</strong> by {song.artist_name}</div>
                            <div>{song.track_length}</div>
                        </div>
                        <button
                            onClick={() => onRemoveSong(queue.indexOf(song))}
                            style={{ marginLeft: 'auto', padding: '5px 10px', cursor: 'pointer' }}
                        >
                            Remove
                        </button>
                    </li>
                ))}
            </ReactSortable>
        </div>
    );
};

export default UserQueue;