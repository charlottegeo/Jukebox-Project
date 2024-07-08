var isPlaying = false;
var isPaused = false;
var isLoading = false;
var animationInterval;
var pingInterval = null;
var typingTimer;
var socket;
var ytPlayerReady = false;
var ytPlayer;
var pendingSong = null;

var frame0 = "/static/img/cats/White/PusayLeft.png";
var frame1 = "/static/img/cats/White/PusayCenter.png";
var frame2 = "/static/img/cats/White/PusayRight.png";
var song_placeholder = "/static/img/song_placeholder.png";

function validateYouTubeTrackID(track_id) {
    const regex = /^[a-zA-Z0-9_-]{11}$/;
    return regex.test(track_id);
}

function isValidYouTubeLink(link) {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/(watch\?v=|embed\/|v\/|.+\?v=|.+&v=|playlist\?list=|.*list=)([a-zA-Z0-9_-]{11}|[a-zA-Z0-9_-]+)/;
    return regex.test(link);
}

document.addEventListener('DOMContentLoaded', function() {
    const socketProtocol = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
    socket = io.connect(socketProtocol + window.location.host, {
        transports: ['websocket'],
        upgrade: false,
        pingInterval: 25000,
        pingTimeout: 60000
    });

    socket.on('connect', function() {
        console.log('Socket.IO connected');
        if (window.location.pathname === '/') {
            socket.emit('get_user_queue');
            socket.emit('get_current_song');
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
        if (pendingSong && ytPlayerReady) {
            try {
                if (validateYouTubeTrackID(pendingSong.track_id)) {
                    ytPlayer.loadVideoById(pendingSong.track_id);
                    ytPlayer.playVideo();
                    pendingSong = null;
                } else {
                    console.error('Invalid YouTube track ID:', pendingSong.track_id);
                }
            } catch (error) {
                console.error('Failed to load YouTube video:', error);
            }
        }
    });

    socket.on('message', function(data) {
        console.log('Received:', data);
        switch(data.action) {
            case 'searchResults':
                handleSearchResults(data.results);
                break;
            case 'spawnMessage':
                spawnMessage(data.color, data.message);
            case 'next_song':
                if (isLoading) {
                    console.log('Already loading a song, ignoring next song request.');
                    return;
                }
                if (data.nextSong) {
                    if (data.nextSong.source === 'spotify') {
                        let track_id = data.nextSong.track_id;
                        if (track_id) {
                            const spotifyWrapper = document.getElementById('spotify-player-wrapper');
                            if (spotifyWrapper) {
                                const spotifyURI = `spotify:track:${track_id}`;
                                if (EmbedController && typeof EmbedController.loadUri === 'function' && typeof EmbedController.play === 'function') {
                                    EmbedController.loadUri(spotifyURI);
                                    EmbedController.play();
                                    spotifyWrapper.style.display = 'block';
                                } else {
                                    console.error('EmbedController methods are not available');
                                }
                            } else {
                                console.error('Spotify player wrapper not found');
                            }
                        } else {
                            console.error('Invalid Spotify track ID');
                        }
                    } else if (data.nextSong.source === 'youtube') {
                        if (ytPlayerReady) {
                            try {
                                if (validateYouTubeTrackID(data.nextSong.track_id)) {
                                    ytPlayer.loadVideoById(data.nextSong.track_id);
                                    ytPlayer.playVideo();
                                } else {
                                    console.error('Invalid YouTube track ID:', data.nextSong.track_id);
                                }
                            } catch (error) {
                                console.error('Failed to load YouTube video:', error);
                            }
                        } else {
                            pendingSong = data.nextSong;
                            console.log('YouTube player is not ready, storing the song to play later');
                        }
                    }
                    playSong(data.nextSong);
                } else {
                    console.log('No next song available');
                }
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

    socket.on('updateCurrentSong', function(data) {
        if (data.currentSong) {
            updateCurrentSong(data.currentSong);
        }
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

    socket.on('highlight_next_song', function(data) {
        const nextUserId = data.next_user;
        const nextSong = data.next_song;
        if (window.location.pathname === '/' && sessionStorage.getItem('uid') === nextUserId) {
            const userQueueList = document.getElementById('user-queue-list');
            if (userQueueList) {
                const songContainers = userQueueList.getElementsByClassName('song-container');
                for (let container of songContainers) {
                    container.classList.remove('highlight');
                }
                if (songContainers.length > 0) {
                    songContainers[0].classList.add('highlight');
                }
            }
        }
    });
    
    socket.on('updateUserQueue', function(data) {
        updateUserQueueDisplay(data.queue);
    });

    if (window.location.pathname == "/") {
        const searchSourceSelect = document.getElementById('search-source');
        const searchBar = document.getElementById('searchbar');
        const youtubeLinkInput = document.getElementById('youtube-link');
        const youtubeBpmInput = document.getElementById('youtube-bpm');
        let searchSource = localStorage.getItem('searchSource') || 'spotify'; // Default to 'spotify'
        const profilePic = document.getElementById('profile-pic');
        const profileDropdown = document.querySelector('.profile-dropdown');
        searchBar.value = "";
        youtubeLinkInput.value = "";
        youtubeBpmInput.value = "90";
        searchSourceSelect.value = searchSource;
        if (searchSource === 'youtube') {
            searchBar.style.display = 'none';
            youtubeLinkInput.style.display = 'block';
            youtubeBpmInput.style.display = 'block';
        }
        searchSourceSelect.addEventListener('change', function() {
            searchSource = this.value;
            localStorage.setItem('searchSource', searchSource);
            if (this.value === 'youtube') {
                searchBar.style.display = 'none';
                searchBar.value = '';
                youtubeLinkInput.style.display = 'block';
                youtubeBpmInput.style.display = 'block';
            } else {
                searchBar.style.display = 'block';
                youtubeLinkInput.style.display = 'none';
                youtubeBpmInput.style.display = 'none';
                youtubeLinkInput.value = '';
                youtubeBpmInput.value = '90';
            }
    
            const dropdown = document.getElementById('dropdown');
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            resetSongSelectionUI();
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
});

function defaultFrame() {
    clearInterval(animationInterval);
    document.getElementById('catjam').src = frame1;
}

function updateCurrentSong(song) {
    const currentAlbumCover = document.getElementById('current-album-cover');
    const currentArtistName = document.getElementById('current-artist-name');
    const currentSongTitle = document.getElementById('current-song-title');

    if (currentAlbumCover) currentAlbumCover.src = song.cover_url;
    if (currentArtistName) currentArtistName.textContent = song.artist_name;
    if (currentSongTitle) currentSongTitle.textContent = song.track_name;
}

function updateUserQueueDisplay(queue) {
    var userQueueList = document.getElementById('user-queue-list');
    if (!userQueueList) return;

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
                <br>
                BPM: ${
                    song.source === 'youtube' ? 
                    `<input type="number" class="bpm-input" value="${song.bpm || 90}" onchange="updateSongBpm(${index}, this.value)">` :
                    `${song.bpm}`
                }
            </div>
        `;
        songContainer.appendChild(overlay);
        userQueueList.appendChild(songContainer);

        songContainer.classList.add('added');
        setTimeout(() => songContainer.classList.remove('added'), 500);
    });

    // Highlight the first song if the next user in the round robin system
    const nextUserId = sessionStorage.getItem('next_user');
    if (nextUserId === sessionStorage.getItem('uid') && userQueueList.children.length > 0) {
        userQueueList.children[0].classList.add('highlight');
    }

    // This lets the user drag and drop the songs in the queue
    new Sortable(userQueueList, {
        onEnd: function(evt) {
            let oldIndex = evt.oldIndex;
            let newIndex = evt.newIndex;
            socket.emit('reorderQueue', { oldIndex: oldIndex, newIndex: newIndex });
        }
    });
}


function updateSongBpm(index, bpm) {
    console.log('Updating BPM for song at index:', index, 'to BPM:', bpm);
    socket.emit('updateSongBpm', { index: index, bpm: bpm });
}

function removeSongFromQueue(index) {
    console.log('Removing song at index:', index);
    const songContainer = document.querySelector(`.song-container[data-index='${index}']`);
    if (songContainer) {
        songContainer.classList.add('removed');
        setTimeout(() => {
            socket.emit('removeSongFromQueue', { index: index });
            socket.emit('get_user_queue');
        }, 500);
    }
}

function populateCatColorDropdown() {
    socket.emit('get_cat_colors');
}

function spawnMessage(color, message) {
    const container = document.getElementById('message-container');

    const messageBox = document.createElement('div');
    messageBox.className = `message-box ${color}`;
    messageBox.innerHTML = `
        <span>${message}</span>
        <span class="close-btn" onclick="closeMessage(this)">×</span>
    `;
    container.appendChild(messageBox);

    // Remove the message box after 5 seconds
    setTimeout(() => {
        messageBox.style.animation = 'fadeOut 0.5s';
        setTimeout(() => {
            container.removeChild(messageBox);
        }, 500); // Wait for the animation to finish
    }, 5000);
}

// Close the message box when the close button is clicked
function closeMessage(closeBtn) {
    const messageBox = closeBtn.parentElement;
    messageBox.style.animation = 'fadeOut 0.5s';
    setTimeout(() => {
        messageBox.remove();
    }, 500); // Wait for the animation to finish
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
        const youtubeBpm = document.getElementById('youtube-bpm').value;
        if (isValidYouTubeLink(input)) {
            if (isYouTubePlaylist(input)) {
                socket.emit('addPlaylistToQueue', { link: input, source: 'youtube', bpm: youtubeBpm });
            } else {
                socket.emit('addYoutubeLinkToQueue', { youtube_link: input, source: 'youtube', bpm: youtubeBpm });
            }
            document.getElementById('youtube-link').value = '';
            document.getElementById('youtube-bpm').value = '90';
        } else {
            spawnMessage('red', 'Invalid YouTube link');
        }
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

function handleSearchResults(data) {
    var dropdown = document.getElementById('dropdown');
    dropdown.innerHTML = '';
    data.forEach(track => {
        var item = createTrackItem(track);
        dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
}

function setText() {
    var selectedItem = document.getElementById('selected-item');
    var track = JSON.parse(selectedItem.dataset.track);
    selectedItem.style.display = 'block';
    var infoText = document.getElementById('info-text');
    infoText.textContent = "Selected Song:";
    var selectedSong = document.getElementById('selected-song');
    selectedSong.style.display = 'flex';
    selectedSong.style.justifyContent = 'space-between';
    var sImg = document.getElementById('selected-img');
    var sTrackName = document.getElementById('selected-track-name');
    var sArtistName = document.getElementById('selected-artist-name');
    var sTrackLength = document.getElementById('selected-track-length');
    sImg.src = track.cover_url;
    sTrackName.textContent = track.track_name;
    sArtistName.textContent = track.artist_name;
    sTrackLength.textContent = track.track_length;
    var addButton = document.getElementById('add-button');
    addButton.style.display = 'block';
}

function submitSong() {
    var selectedItem = document.getElementById('selected-item');
    var track = JSON.parse(selectedItem.dataset.track);

    track.track_length = parseInt(track.track_length, 10);
    if (isNaN(track.track_length)) {
        console.error('Track length not provided or invalid');
        alert('Track length is missing or invalid. Please try again.');
        return;
    }

    socket.emit('addSongToQueue', {
        track: track
    });
    socket.emit('get_queue_length');

    socket.on('songAdded', function(data) {
        socket.emit('get_user_queue');
    });
}

function getQueueUserCount() {
    socket.emit('getQueueUserCount');
}

function resetSongSelectionUI() {
    var selectedSong = document.getElementById('selected-song');
    selectedSong.style.display = 'none';
    var infoText = document.getElementById('info-text');
    infoText.textContent = '';
    var addButton = document.getElementById('add-button');
    addButton.style.display = 'none';
    var searchbar = document.getElementById('searchbar');
    searchbar.value = '';
    var youtubeLinkInput = document.getElementById('youtube-link');
    youtubeLinkInput.value = '';
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

function playSong(song = null) {
    if (isLoading) {
        console.log('Another song is currently loading, ignoring request to play:', song.track_name);
        return;
    }

    if (!song) {
        console.log('Queue is empty');
        resetPlayerUI();
        defaultFrame();
        clearInterval(animationInterval);
        return;
    }

    console.log('Playing:', song.track_name, 'by', song.artist_name);
    isLoading = true;

    const spotifyPlayerWrapper = document.getElementById('spotify-player-wrapper');
    const youtubePlayerWrapper = document.getElementById('youtube-player-wrapper');

    if (song.source === 'spotify') {
        if (ytPlayerReady && ytPlayer) {
            ytPlayer.stopVideo();
        }

        if (spotifyPlayerWrapper) spotifyPlayerWrapper.style.display = 'block';
        if (youtubePlayerWrapper) youtubePlayerWrapper.style.display = 'none';

        const spotifyURI = `spotify:track:${song.track_id}`;
        EmbedController.loadUri(spotifyURI, function() {
            EmbedController.play(function() {
                console.log('Spotify Playback started');
                isLoading = false;
            });
        });
    } else if (song.source === 'youtube') {
        if (EmbedController) {
            EmbedController.pause();
        }

        if (spotifyPlayerWrapper) spotifyPlayerWrapper.style.display = 'none';
        if (youtubePlayerWrapper) youtubePlayerWrapper.style.display = 'block';

        if (validateYouTubeTrackID(song.track_id)) {
            ytPlayer.loadVideoById(song.track_id);
            ytPlayer.playVideo();
            isLoading = false;
        } else {
            console.error('Invalid YouTube track ID:', song.track_id);
            isLoading = false;
        }
    }

    const songTitleElem = document.getElementById("song_title");
    const artistNameElem = document.getElementById("artist_name");
    const albumCoverElem = document.getElementById("album-cover");
    const submitterUidElem = document.getElementById("submitter_uid");

    if (songTitleElem) songTitleElem.innerHTML = song.track_name;
    if (artistNameElem) artistNameElem.innerHTML = song.artist_name;
    if (albumCoverElem) albumCoverElem.src = song.cover_url;
    if (submitterUidElem) submitterUidElem.innerHTML = "Submitted By: " + song.uid;

    isPlaying = true;
    bpm = song.bpm;
    animateFrames(song.bpm);
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
    isLoading = false;
}

function updatePlayerProgress(trackLength) {
    if (ytPlayerReady && ytPlayer.getPlayerState() == YT.PlayerState.PLAYING) {
        var duration = ytPlayer.getDuration();
        var currentTime = ytPlayer.getCurrentTime();
        var progress = (currentTime / duration) * 100;
        document.getElementById('progressBar').value = progress;
        document.getElementById('duration').innerHTML = formatTime(duration);
        document.getElementById('progressTimestamp').innerHTML = formatTime(currentTime);
    } else {
        document.getElementById('progressBar').max = 100;
        document.getElementById('duration').innerHTML = formatTime(trackLength);
        document.getElementById('progressTimestamp').innerHTML = formatTime(0);
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

document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/display') {
        const startButton = document.getElementById('startButton');
        startButton.addEventListener('click', function() {
            startButton.style.display = 'none';
        });
    }
});
