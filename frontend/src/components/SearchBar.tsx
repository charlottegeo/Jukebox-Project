import React, { useState } from 'react';

interface SearchBarProps {
    onSearch: (input: string, source: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    const [searchSource, setSearchSource] = useState('spotify');
    const [searchInput, setSearchInput] = useState('');

    const isLink = (input: string) => {
        return input.startsWith('http://') || input.startsWith('https://');
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (isLink(searchInput)) {
            onSearch(searchInput, searchSource + 'Link'); //Pass spotifyLink or youtubeLink
        } else {
            // Treat it as a search request
            onSearch(searchInput, searchSource);
        }
    };

    return (
        <div>
            <div className="search-source">
                <select value={searchSource} onChange={(e) => setSearchSource(e.target.value)}>
                    <option value="spotify">Spotify</option>
                    <option value="youtube">YouTube</option>
                </select>
            </div>
            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={`Search for a song or enter a ${searchSource} link...`}
                />
                <button type="submit">Search/Add</button>
            </form>
        </div>
    );
};

export default SearchBar;
