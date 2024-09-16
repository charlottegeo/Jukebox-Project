import React from 'react';

interface Song {
    track_name: string;
    artist_name: string;
    track_length: string;
    cover_url: string;
}

interface SongListProps {
    songs: Song[];
    onSelect: (song: Song) => void;
}

const SongList: React.FC<SongListProps> = ({ songs, onSelect }) => {
    return (
        <div>
            {songs.map((song, index) => (
                <div key={index} onClick={() => onSelect(song)}>
                    <img src={song.cover_url} alt={song.track_name} width="50"/>
                    <div>{song.track_name}</div>
                    <div>{song.artist_name}</div>
                    <div>{song.track_length}</div>
                </div>
            ))}
        </div>
    );
};

export default SongList;