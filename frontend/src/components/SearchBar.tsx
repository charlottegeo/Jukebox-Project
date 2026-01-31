import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { faSpotify, faYoutube } from '@fortawesome/free-brands-svg-icons';

interface SearchBarProps {
    onSearch: (input: string, source: string) => void;
    onSearchStateChange?: (hasSearched: boolean) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, onSearchStateChange }) => {
    const [searchSource, setSearchSource] = useState('spotify');
    const [searchInput, setSearchInput] = useState('');

    const isLink = (input: string) => {
        try {
            const url = new URL(input);
            return url.hostname.includes('spotify.com') || url.hostname.includes('youtube.com');
        } catch (error) {
            return false;
        }
    };    

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
    
        const trimmedInput = searchInput.trim();
        console.log("Search input:", trimmedInput);
        console.log("Search source:", searchSource);
    
        if (!trimmedInput) {
            console.error("Search input is empty. Please enter a valid search term or link.");
            return;
        }
    
        if (isLink(trimmedInput)) {
            onSearch(trimmedInput, searchSource + 'Link');
        } else {
            onSearch(trimmedInput, searchSource);
        }
    
        setSearchInput('');
        if (onSearchStateChange) {
            onSearchStateChange(true);
        }
    };
    
    return (
        <div className="search-container">
            <div className="btn-group mb-2" role="group">
                <button
                    type="button"
                    className={`btn ${searchSource === 'spotify' ? 'btn-success' : 'btn-outline-secondary'}`}
                    onClick={() => setSearchSource('spotify')}
                    title="Search on Spotify"
                >
                    <FontAwesomeIcon icon={faSpotify} />
                </button>
                <button
                    type="button"
                    className={`btn ${searchSource === 'youtube' ? 'btn-danger' : 'btn-outline-secondary'}`}
                    onClick={() => setSearchSource('youtube')}
                    title="Search on YouTube"
                >
                    <FontAwesomeIcon icon={faYoutube} />
                </button>
            </div>
            <form onSubmit={handleSearch} className="d-flex">
                <input
                    type="text"
                    className="form-control mr-2"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={`Search for a song or enter a ${searchSource} link...`}
                />
                <button type="submit" className="btn btn-primary">
                    <FontAwesomeIcon icon={faSearch} />
                </button>
            </form>
        </div>
    );
};

export default SearchBar;
