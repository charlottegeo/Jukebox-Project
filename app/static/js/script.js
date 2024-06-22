var isPlaying = false;
var isPaused = false;
var animationInterval;
var pingInterval = null;
var typingTimer;
var doneTypingInterval = 500;
var EmbedController;
var bpm;
var authToken;
var socket;
var ytPlayerReady = false;
var ytPlayer;
var pendingSong = null;

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    ytPlayerReady = true;
    console.log('YouTube Player Ready');
    socket.emit('youtubePlayerReady'); // Emit event to the server
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log('Video ended');
        isPlaying = false;
        defaultFrame();
        clearInterval(animationInterval);
        resetPlayerUI();
        socket.emit('removeFirstSong');
        socket.emit('get_next_song');
        document.getElementById('playQueue').click();
    }
}



document.addEventListener('DOMContentLoaded', function() {
    authToken = localStorage.getItem('authToken');

    if (!authToken) {
        console.error('Auth token is missing');
        alert('Authentication token is missing. Please login again.');
        window.location.href = '/';
    } else {
        socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port, {
            query: { token: authToken }
        });

        socket.on('connect', function() {
            console.log('Socket.IO connected');
            if (window.location.pathname === '/') {
                socket.emit('get_user_queue');
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error);
            if (error.message === 'jwt expired' || error.message === 'invalid token') {
                alert('Session expired or invalid token. Please login again.');
                window.location.href = '/';
            }
        });

        socket.on('youtubePlayerIsReady', function() {
            if (pendingSong) {
                ytPlayer.loadVideoById(pendingSong.track_id);
                ytPlayer.playVideo();
                pendingSong = null;
            }
        });
        
        socket.on('message', function(data) {
            console.log('Received:', data);
            switch(data.action) {
                case 'searchResults':
                    handleSearchResults(data.results);
                    break;
                case 'next_song':
                    console.log('Playing next song:', data.nextSong);
                    playSong(data.nextSong);
                    break;
                case 'queueUpdated':
                    console.log('Queue updated, checking if playback should start.');
                    if (!isPlaying) {
                        console.log('No song is currently playing, requesting next song.');
                        socket.emit('get_next_song');
                    }
                    if (window.location.pathname === '/' && document.getElementById('user-queue-list')) {
                        updateUserQueueDisplay(data.queue);
                    }
                    break;
                case 'formattedTime':
                    if (window.location.pathname === '/display') {
                        document.getElementById('progressTimestamp').innerText = data.time;
                    }
                    break;
                case 'queueLength':
                    if (data.length == 1) {
                        if (window.location.pathname === '/display') {
                            document.getElementById('playQueue').click();
                            console.log("Playing first song");
                        }
                    }
                    break;
                case 'checkIfPlaying':
                    socket.emit('isPlaying', { isPlaying: isPlaying });
                    break;
                case 'queue_empty':
                    console.log("Queue is empty, isPlaying:", isPlaying);
                    if (isPlaying) {
                        resetPlayerUI();
                        defaultFrame();
                        clearInterval(animationInterval);
                        if (EmbedController) {
                            EmbedController.pause();
                        }
                        if (ytPlayerReady && ytPlayer) {
                            ytPlayer.stopVideo();
                        }
                        isPlaying = false;
                    }
                    break;
                    
                case 'togglePlay':
                    console.log("Toggling play");
                    if (isPlaying) {
                        EmbedController.pause();
                        isPlaying = false;
                    } else {
                        EmbedController.togglePlay();
                        isPlaying = true;
                    }
                    break;
                case 'cat_colors':
                    if (window.location.pathname === '/admin') {
                        var dropdown = document.getElementById('catColorDropdown');
                        dropdown.innerHTML = '';
                        data.colors.forEach(color => {
                            var option = document.createElement('option');
                            option.value = color;
                            option.innerText = color;
                            dropdown.appendChild(option);
                        });
                    }
                    break;
                case 'color_changed':
                    if (window.location.pathname === '/admin') {
                        document.getElementById('catColorDropdown').value = data.color;
                    }
                    break;
                case 'addYouTubeLinkToQueue':
                    console.log('Adding YouTube link to queue');
                    break;
            }
        });

        socket.on('disconnect', function() {
            console.log("Socket.IO disconnected");
        });

        socket.on('error', function(error) {
            console.error('Socket.IO Error:', error);
        });

        socket.on('updateCurrentSong', function(song) {
            const currentAlbumCover = document.getElementById('current-album-cover');
            const currentArtistName = document.getElementById('current-artist-name');
            const currentSongTitle = document.getElementById('current-song-title');

            currentAlbumCover.src = song.cover_url;
            currentArtistName.textContent = song.artist_name;
            currentSongTitle.textContent = song.track_name;
        });

        socket.on('queueLength', function(data) {
            var queueLength = data.length;
            console.log('Queue length:', queueLength);
            if (queueLength === 1) {
                if (!isPlaying) {
                    document.getElementById('playQueue').click();
                    console.log("Playing first song");
                }
            }
        });
        
        socket.on('vote_count', function(data) {
            const voteCount = data.votes;
            const voteThreshold = data.threshold;
            console.log(`Vote count: ${voteCount}/${voteThreshold}`);
        });

        socket.on('updateUserQueue', function(data) {
            if (window.location.pathname === '/' && document.getElementById('user-queue-list')) {
                updateUserQueueDisplay(data.queue);
            }
        });
        

        
        
        


        if (window.location.pathname == "/") {
            const searchSourceSelect = document.getElementById('search-source');
            const searchBar = document.getElementById('searchbar');
            const youtubeLinkInput = document.getElementById('youtube-link');
            let searchSource = localStorage.getItem('searchSource') || 'spotify'; // Default to 'spotify'
            const profilePic = document.getElementById('profile-pic');
            const profileDropdown = document.querySelector('.profile-dropdown');
            searchBar.value = "";
            youtubeLinkInput.value = "";
            searchSourceSelect.value = searchSource;
            if (searchSource === 'youtube') {
                searchBar.style.display = 'none';
                youtubeLinkInput.style.display = 'block';
            }
            searchSourceSelect.addEventListener('change', function() {
                searchSource = this.value;
                localStorage.setItem('searchSource', searchSource);
                if (this.value === 'youtube') {
                    searchBar.style.display = 'none';
                    searchBar.value = '';
                    youtubeLinkInput.style.display = 'block';
                } else {
                    searchBar.style.display = 'block';
                    youtubeLinkInput.style.display = 'none';
                    youtubeLinkInput.value = '';
                }
            });
            searchBar.addEventListener('keyup', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleInput(searchBar.value, searchSource);
                }
            });
        
            youtubeLinkInput.addEventListener('keyup', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleInput(youtubeLinkInput.value, searchSource);
                }
            });
            profilePic.addEventListener('click', function() {
                profileDropdown.classList.toggle('show');
            });

        }

        if (window.location.pathname == "/display") {
            document.getElementById('playQueue').addEventListener('click', startPlay);
            var startButton = document.getElementById('startButton');
            startButton.addEventListener('click', function() {
                startButton.style.display = 'none';
            });
        }

        if (window.location.pathname == "/admin") {
            const clearAllQueuesBtn = document.getElementById('clearAllQueuesBtn');
            const clearSpecificQueueBtn = document.getElementById('clearSpecificQueueBtn');
            const userIdInput = document.getElementById('user-id-input');

            clearAllQueuesBtn.addEventListener('click', function() {
                socket.emit('clearAllQueues');
            });

            clearSpecificQueueBtn.addEventListener('click', function() {
                const userId = userIdInput.value;
                if (userId) {
                    socket.emit('clearSpecificQueue', { uid: userId });
                }
            });

            socket.on('queueUserCount', function(data) {
                const countDisplay = document.getElementById('queue-user-count');
                countDisplay.textContent = `Queues: ${data.queues}, Users: ${data.users}`;
            });

            document.getElementById('pausePlayBtn').addEventListener('click', pausePlay);
            document.getElementById('skipSongBtn').addEventListener('click', function() {
                isPlaying = false;
                socket.emit('skipSong');
            });
            document.getElementById('refreshDisplayBtn').addEventListener('click', function() {
                socket.emit('refreshDisplay');
            });
            populateCatColorDropdown();
            document.getElementById('catColorDropdown').addEventListener('change', function() {
                var selectedColor = this.value;
                socket.emit('change_cat_color', selectedColor);
            });
            document.getElementById('setVolumeBtn').addEventListener('click', function() {
                var volumeLevel = document.getElementById('volumeSlider').value;
                socket.emit('set_volume', { volume: volumeLevel });
            });
            document.getElementById('setSongLengthBtn').addEventListener('click', function() {
                var songLengthLimit = document.getElementById('songLengthInput').value;
                socket.emit('set_song_length_limit', { length: songLengthLimit });
            });
        }
    }
});


function updateUserQueueDisplay(queue) {
    var userQueueList = document.getElementById('user-queue-list');
    userQueueList.innerHTML = '';

    queue.forEach((song, index) => {
        var songContainer = document.createElement('div');
        songContainer.className = 'song-container';
        songContainer.setAttribute('data-index', index);

        var img = document.createElement('img');
        img.src = song.cover_url;
        songContainer.appendChild(img);

        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.innerHTML = `
            <div class="song-info">
                ${song.track_name}<br>
                By: ${song.artist_name}<br>
                <button onclick="removeSongFromQueue(${index})">Remove</button>
            </div>
        `;
        songContainer.appendChild(overlay);
        userQueueList.appendChild(songContainer);

        songContainer.classList.add('added');
        setTimeout(() => songContainer.classList.remove('added'), 500);
    });

    //This lets the user drag and drop the songs in the queue
    new Sortable(userQueueList, {
        onEnd: function(evt) {
            let oldIndex = evt.oldIndex;
            let newIndex = evt.newIndex;
            socket.emit('reorderQueue', { oldIndex: oldIndex, newIndex: newIndex });
        }
    });
}


function removeSongFromQueue(index) {
    console.log('Removing song at index:', index);
    const songContainer = document.querySelector(`.song-container[data-index='${index}']`);
    if (songContainer) {
        songContainer.classList.add('removed');
        setTimeout(() => {
            socket.emit('removeSongFromQueue', { index: index });
        }, 500);
    }
}

function populateCatColorDropdown() {
    socket.emit('get_cat_colors');
}

function handleInput(input, source) {
    if (source === 'spotify') {
        if (isSpotifyPlaylist(input)) {
            socket.emit('addPlaylistToQueue', { link: input, source: 'spotify' });
            document.getElementById('searchbar').value = '';
        } else if (isSpotifyAlbum(input)) {
            socket.emit('addAlbumToQueue', { link: input, source: 'spotify' });
            document.getElementById('searchbar').value = '';
        } else {
            socket.emit('searchTracks', { track_name: input, source: 'spotify' });
            return;
        }
    } else if (source === 'youtube') {
        if (isYouTubePlaylist(input)) {
            socket.emit('addPlaylistToQueue', { link: input, source: 'youtube' });
        } else {
            socket.emit('addYoutubeLinkToQueue', { youtube_link: input, source: 'youtube' });
        }
        document.getElementById('youtube-link').value = '';
    }
    document.getElementById('searchbar').value = '';
}

function isSpotifyAlbum(link) {
    return link.includes('album');
}

function isSpotifyPlaylist(link) {
    return link.includes('playlist');
}

function isYouTubePlaylist(link) {
    return link.includes('playlist');
}


function searchTracks() {
    var searchText = document.getElementById('searchbar').value;
    var source = document.getElementById('search-source').value;
    var data = {
        track_name: searchText,
        source: source
    };
    socket.emit('searchTracks', data);
}

function submitYouTubeLink() {
    var youtubeLink = document.getElementById('youtube-link').value;
    var data = {
        youtube_link: youtubeLink
    };
    
    socket.emit('addYouTubeLinkToQueue', data);
    document.getElementById('youtube-link').value = '';
}



function handleSearchResults(data) {
    var dropdown = document.getElementById('dropdown');
    dropdown.innerHTML = '';
    data.forEach(track => {
        var item = createTrackItem(track);
        dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
}

function submitSong() {
    const track = JSON.parse(document.getElementById('selected-item').dataset.track);
    socket.emit('addSongToQueue', { track: track });
}



function createTrackItem(track) {
    var item = document.createElement('div');
    item.className = 'item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    var img = document.createElement('img');
    img.src = track.cover_url;
    img.style.width = '50px';
    img.style.height = '50px';
    img.style.marginRight = '10px';
    var textWrapper = document.createElement('div');
    textWrapper.style.display = 'flex';
    textWrapper.style.flexDirection = 'column';
    textWrapper.style.justifyContent = 'center';
    var trackName = document.createElement('div');
    trackName.textContent = track.track_name;
    trackName.style.fontWeight = 'bold';

    var artistName = document.createElement('div');
    artistName.textContent = track.artist_name;

    textWrapper.appendChild(trackName);
    textWrapper.appendChild(artistName);

    var trackLength = document.createElement('div');
    trackLength.textContent = track.track_length;
    trackLength.style.marginLeft = 'auto';

    item.appendChild(img);
    item.appendChild(textWrapper);
    item.appendChild(trackLength);

    item.onclick = function() {
        console.log('Track clicked:', track.track_name);
        var selectedItem = document.getElementById('selected-item');
        selectedItem.dataset.track = JSON.stringify(track);
        setText();
    };
    return item;
}

function setText() {
    var selectedItem = document.getElementById('selected-item');
    var track = JSON.parse(selectedItem.dataset.track);
    selectedItem.style.display = 'block';
    var infoText = document.getElementById('info-text');
    if (infoText.value == null) {
        infoText.textContent = "Selected Song:";
    }
    selectedItem.style.display = 'flex';
    selectedItem.justifyContent = 'space-between';
    var sImg = document.getElementById('selected-img');
    var sTrackName = document.getElementById('selected-track-name');
    var sArtistName = document.getElementById('selected-artist-name');
    var sTrackLength = document.getElementById('selected-track-length');
    sImg.src = track.cover_url;
    sTrackName.textContent = track.track_name;
    sArtistName.textContent = track.artist_name;
    sTrackLength.textContent = track.track_length;
    var addButton = document.getElementById('add-button');
    if (window.getComputedStyle(addButton).display == 'none') {
        addButton.style.display = 'block';
    }
}

function submitSong() {
    var selectedItem = document.getElementById('selected-item');
    var track = JSON.parse(selectedItem.dataset.track);
    track.track_length = parseInt(track.track_length);
    socket.emit('addSongToQueue', {
        track: track
    });
    socket.emit('get_queue_length');
    var resultText = document.getElementById('resulttext');
    resultText.textContent = "Song added to queue!";
    setTimeout(function() {
        resultText.textContent = "";
    }, 3000);
}




function getQueueUserCount() {
    socket.emit('getQueueUserCount');
}

function resetSongSelectionUI() {
    var dropdown = document.getElementById('dropdown');
    dropdown.innerHTML = '';
    var selectedSong = document.getElementById('selected-song');
    selectedSong.style.display = 'none';
    var infoText = document.getElementById('info-text');
    infoText.textContent = '';
    var addButton = document.getElementById('add-button');
    addButton.style.display = 'none';
    var searchbar = document.getElementById('searchbar');
    searchbar.value = '';
}

function startPlay() {
    socket.emit('get_next_song');
}

function updateAdminQueue(data) {
    var queue = data.queue;
    if (!queue || queue.length === 0) {
        console.log('Queue data is empty or undefined');
        return;
    }
    console.log('Queue data:', queue);
}

function clearQueue() {
    socket.emit('clearQueueForUser');
}

function playSong(song) {
    if (!song || Object.keys(song).length === 0) {
        console.log('Queue is empty');
        resetPlayerUI();
        defaultFrame();
        clearInterval(animationInterval);
        return;
    }

    console.log('Playing:', song.track_name, 'by', song.artist_name);

    const spotifyPlayer = document.getElementById('spotify-player');
    const youtubePlayer = document.getElementById('youtube-player');

    if (window.location.pathname === '/display') {
        if (song.source == 'spotify') {
            if (EmbedController) {
                EmbedController.pause();
                EmbedController.uri = song.uri;
                EmbedController.loadUri(song.uri);
                console.log('Playback started');
                EmbedController.play();
                EmbedController.on('error', (error) => {
                    console.error("Playback error:", error);
                });
            }
            if (spotifyPlayer) spotifyPlayer.style.display = 'block';
            if (youtubePlayer) youtubePlayer.style.display = 'none';
        } else if (song.source == 'youtube') {
            if (EmbedController) {
                EmbedController.pause();
            }
            if (spotifyPlayer) spotifyPlayer.style.display = 'none';
            if (youtubePlayer) {
                youtubePlayer.style.display = 'block';
                if (ytPlayerReady) {
                    ytPlayer.loadVideoById(song.track_id);
                    ytPlayer.playVideo();
                } else {
                    console.error("YouTube player is not ready, storing the song to play later");
                    pendingSong = song;
                }
            }
        }

        // Update the UI elements if they exist
        const songTitleElem = document.getElementById("song_title");
        const artistNameElem = document.getElementById("artist_name");
        const albumCoverElem = document.getElementById("album-cover");
        const submitterUidElem = document.getElementById("submitter_uid");

        if (songTitleElem) songTitleElem.innerHTML = song.track_name;
        if (artistNameElem) artistNameElem.innerHTML = song.artist_name;
        if (albumCoverElem) albumCoverElem.src = song.cover_url;
        if (submitterUidElem) submitterUidElem.innerHTML = "Submitted By: " + song.uid;

        isPlaying = true;
        updatePlayerProgress(song.track_length);
        bpm = song.bpm;
        animateFrames(song.bpm);
    }
}

function setCurrentSongUI(song) {
    document.getElementById("song_title").innerHTML = song.track_name;
    document.getElementById("artist_name").innerHTML = song.artist_name;
    document.getElementById("album-cover").src = song.cover_url;
    document.getElementById("submitter_uid").innerHTML = "Submitted By: " + song.uid;
}

function resetPlayerUI() {
    const songTitleElem = document.getElementById("song_title");
    const artistNameElem = document.getElementById("artist_name");
    const albumCoverElem = document.getElementById("album-cover");
    const submitterUidElem = document.getElementById("submitter_uid");
    const spotifyPlayer = document.getElementById('spotify-player');
    const youtubePlayer = document.getElementById('youtube-player');

    if (songTitleElem) songTitleElem.innerHTML = "No song is playing";
    if (artistNameElem) artistNameElem.innerHTML = "";
    if (albumCoverElem) albumCoverElem.src = song_placeholder;
    if (submitterUidElem) submitterUidElem.innerHTML = "";

    if (EmbedController) {
        EmbedController.pause();
        if (spotifyPlayer) spotifyPlayer.style.display = 'none';
    }

    if (ytPlayerReady && youtubePlayer) {
        ytPlayer.stopVideo();
        youtubePlayer.style.display = 'none';
    }
}

function updatePlayerProgress(trackLength) {
    if (ytPlayerReady && ytPlayer.getPlayerState() == YT.PlayerState.PLAYING) {
        var duration = ytPlayer.getDuration();
        var currentTime = ytPlayer.getCurrentTime();
        var progress = (currentTime / duration) * 100;
        document.getElementById('progressBar').value = progress;
        document.getElementById('duration').innerHTML = formatTime(duration);
        document.getElementById('progressTimestamp').innerHTML = formatTime(currentTime);
    } else if (EmbedController) {
        // Handle Spotify progress if needed
    } else {
        document.getElementById('progressBar').max = 100;
        document.getElementById('duration').innerHTML = trackLength;
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}


function voteToSkip() {
    socket.emit('vote_to_skip');
}

function calculateFrameDuration(bpm) {
    var bps = bpm / 60;
    return 1 / (2 * bps);
}

function animateFrames(bpm) {
    if (animationInterval) {
        clearInterval(animationInterval);
    }
    var frames = [frame0, frame1, frame2];
    var frameIndex = 0;
    var frameDuration = calculateFrameDuration(bpm);
    var increment = true;
    animationInterval = setInterval(function() {
        document.getElementById('catjam').src = frames[frameIndex];
        if (increment) {
            frameIndex++;
        } else {
            frameIndex--;
        }
        if (frameIndex === frames.length - 1) {
            increment = false;
        }
        if (frameIndex === 0) {
            increment = true;
        }
    }, frameDuration * 1000);
}

function defaultFrame() {
    clearInterval(animationInterval);
    document.getElementById('catjam').src = frame1;
}

function adjustOverlayTextSize() {
    const overlays = document.querySelectorAll('.overlay');
    overlays.forEach(overlay => {
        let fontSize = parseInt(window.getComputedStyle(overlay).fontSize);
        while (overlay.scrollHeight > overlay.clientHeight && fontSize > 10) {
            fontSize--;
            overlay.style.fontSize = `${fontSize}px`;
        }
    });
}

window.addEventListener('resize', adjustOverlayTextSize);
