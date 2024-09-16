import React, { useState } from 'react';

interface SearchBarProps {
    onSearch: (input: string, source: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    const [searchSource, setSearchSource] = useState('spotify');
    const [searchInput, setSearchInput] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(searchInput, searchSource);
    }

    return (
        <div>
            <div className="search-source">
                <select value={searchSource} onChange={(e) => setSearchSource(e.target.value)}>
                    <option value="spotify">Spotify</option>
                    <option value="youtube">Youtube</option>
                </select>
            </div>
            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={`Search for a song on ${searchSource}...`}
                />
                <button type="submit">Search</button>
            </form>
        </div>
    );
};

export default SearchBar;