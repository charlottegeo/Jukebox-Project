var isPlaying = false;
var isPaused = false;
var animationInterval;
var pingInterval = null;
var typingTimer;
var socket;
var pendingSong = null;
var currentSong = null;
var player; // Plyr instance for YouTube
var frame0 = "/static/img/cats/White/PusayLeft.png";
var frame1 = "/static/img/cats/White/PusayCenter.png";
var frame2 = "/static/img/cats/White/PusayRight.png";
var song_placeholder = "/static/img/song_placeholder.png";

document.addEventListener('DOMContentLoaded', function () {
    const socketProtocol = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
    socket = io.connect(socketProtocol + window.location.host, {
        transports: ['websocket'],
        pingInterval: 25000,
        pingTimeout: 60000
    });
    const savedColor = sessionStorage.getItem('catColor') || "White";  // Default to White if no color is saved
    updateCatColor(savedColor);
    socket.emit('userColorChange', { color: savedColor });

    const catColorDropdown = document.getElementById('catColorDropdown');
    if (catColorDropdown) {
        catColorDropdown.addEventListener('change', function () {
            var selectedColor = this.value;
            sessionStorage.setItem('catColor', selectedColor); 
            socket.emit('userColorChange', { color: selectedColor });
    
            if (isPlaying) {
                updateCatColor(selectedColor);
            }
        });
    } else {
        console.error('catColorDropdown not found');
    }
    
    
    if(window.location.pathname === '/display') {
        player = new Plyr('#youtube-player', {
            controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
        });
        if (player) {
            player.on('timeupdate', function () {
                const currentTime = player.currentTime;
                const duration = player.duration;
                if (!isNaN(currentTime) && !isNaN(duration)) {
                    document.getElementById('progressBar').value = (currentTime / duration) * 100;
                    document.getElementById('progressTimestamp').textContent = formatTime(currentTime);
                    document.getElementById('duration').textContent = formatTime(duration);
                }
            });
    
            player.on('ended', function () {
                console.log('YouTube video ended');
                isPlaying = false;
                resetPlayerUI();
                socket.emit('get_next_song');
            });
        } else {
            console.error('Player is not initialized');
        }
    }

    socket.on('connect', function () {
        console.log('Socket.IO connected');
        if (window.location.pathname === '/display') {
            socket.emit('join_room', { room: 'music_room' });
            console.log('Display page joined music_room');
            socket.emit('get_current_song');
        }
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
        setTimeout(() => {
            if (socket.connected === false) {
                console.log('Retrying connection...');
                socket.connect();
            }
        }, 1000);
    });

    socket.on('reconnect', function () {
        console.log('Reconnected to the server');
        if (window.location.pathname === '/display') {
            socket.emit('join_room', { room: 'music_room' });
            socket.emit('get_current_song');
        }
    });    

    socket.on('searchResults', function (data) {
        console.log('Received:', data);
        handleSearchResults(data.results);
    });

    socket.on('spawnMessage', function (data) {
        spawnMessage(data.color, data.message);
    });

    socket.on('next_song', function (data) {
        console.log('Received emit:', data);
        console.log('Next song:', data.nextSong);
        isPlaying = true;
        toggleSkipButton();
        if (data.nextSong) {
            playSong(data.nextSong);
        } else {
            console.log('No next song available');
        }
    });

    socket.on('updateSongBpm', function (data) {
        if (currentSong && currentSong.track_id === data.track_id) {
            currentSong.bpm = data.bpm;
            animateFrames(data.bpm);
        }
    });

    socket.on('queueUpdated', function (data) {
        console.log('Queue updated, checking if playback should start.');
        socket.emit('get_user_queue');
        if (!isPlaying) {
            console.log('No song is currently playing, requesting next song.');
            socket.emit('get_next_song');
        }
        if (window.location.pathname === '/' && document.getElementById('user-queue-list')) {
            updateUserQueueDisplay(data.queue);
        }
    });

    socket.on('formattedTime', function (data) {
        if (window.location.pathname === '/display') {
            document.getElementById('progressTimestamp').innerText = data.time;
        }
    });

    socket.on('updateUserCatColor', function(data) {
        const selectedColor = data.color;
        sessionStorage.setItem('catColor', selectedColor);
        updateCatColor(selectedColor);
    });

    socket.on('checkIfPlaying', function (data) {
        socket.emit('isPlaying', { isPlaying: isPlaying });
    });

    socket.on('queue_empty', function (data) {
        console.log("Queue is empty, isPlaying:", isPlaying);
        isPlaying = false;
        toggleSkipButton();
        if (isPlaying) {
            resetPlayerUI();
            defaultFrame();
            clearInterval(animationInterval);
            if (EmbedController) {
                EmbedController.pause();
            }
            isPlaying = false;
        }
    });

    socket.on('togglePlay', function (data) {
        console.log("Toggling play");
        if (isPlaying) {
            EmbedController.pause();
            isPlaying = false;
        } else {
            EmbedController.togglePlay();
            isPlaying = true;
        }
    });

    socket.on('cat_colors', function (data) {
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
    });

    socket.on('color_changed', function (data) {
        if (window.location.pathname === '/admin') {
            document.getElementById('catColorDropdown').value = data.color;
        }
    });

    socket.on('colorChangedForUser', function(data) {
        const uid = data.uid;
        const color = data.color;
    
        if (currentSong && currentSong.uid === uid) {
            updateCatColor(color);
        }
    });

    socket.on('disconnect', function (reason) {
        console.log("Socket.IO disconnected: " + reason);
    });

    socket.on('error', function (error) {
        console.error('Socket.IO Error:', error);
    });

    socket.on('updateCurrentSong', function (data) {
        if (data.currentSong) {
            updateCurrentSong(data.currentSong);
        }
    });

    socket.on('queueLength', function (data) {
        var queueLength = data.length;
        console.log('Queue length:', queueLength);
        if (queueLength === 1) {
            if (!isPlaying && window.location.pathname === '/display') {
                document.getElementById('playQueue').click();
                console.log("Playing first song");
            }
        }
    });

    socket.on('vote_count', function (data) {
        const voteCount = data.votes;
        const voteThreshold = data.threshold;
        console.log(`Vote count: ${voteCount}/${voteThreshold}`);
    });

    socket.on('highlight_next_song', function (data) {
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

    socket.on('updateUserQueue', function (data) {
        updateUserQueueDisplay(data.queue);
    });

    socket.on('cat_colors', function (data) {
        console.log('Received cat colors:', data.colors);
        const dropdown = document.getElementById('catColorDropdown');
        dropdown.innerHTML = '';
        data.colors.forEach(color => {
            var option = document.createElement('option');
            option.value = color;
            option.innerText = color;
            dropdown.appendChild(option);
        });
    });

    socket.on('color_changed', function (data) {
        document.getElementById('catColorDropdown').value = data.color;
    });

    if (window.location.pathname == "/") {
        const searchSourceSelect = document.getElementById('search-source');
        const searchBar = document.getElementById('searchbar');
        const youtubeLinkInput = document.getElementById('youtube-link');
        const youtubeBpmInput = document.getElementById('youtube-bpm');
        let searchSource = localStorage.getItem('searchSource') || 'spotify';
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
        searchSourceSelect.addEventListener('change', function () {
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
        searchBar.addEventListener('keyup', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleInput(searchBar.value, searchSource);
            }
        });

        youtubeLinkInput.addEventListener('keyup', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleInput(youtubeLinkInput.value, searchSource);
            }
        });
        profilePic.addEventListener('click', function () {
            profileDropdown.classList.toggle('show');
        });
        populateCatColorDropdown();
    }

    function toggleSkipButton() {
        const skipButton = document.getElementById('skipSongBtn');
        if (skipButton) {
            skipButton.style.display = isPlaying ? 'block' : 'none';
        } else {
            console.error('Skip button not found in the DOM');
        }
    }


    if (window.location.pathname == "/display") {
        toggleSkipButton();
        const playQueueButton = document.getElementById('playQueue');
        if (playQueueButton) {
            playQueueButton.addEventListener('click', startPlay);
        } else {
            console.error('Play Queue button not found in the DOM');
        }

        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.addEventListener('click', function () {
                startButton.style.display = 'none';
            });
        } else {
            console.error('Start button not found in the DOM');
        }
    }

    if (window.location.pathname == "/admin") {
        const clearAllQueuesBtn = document.getElementById('clearAllQueuesBtn');
        const clearSpecificQueueBtn = document.getElementById('clearSpecificQueueBtn');
        const userIdInput = document.getElementById('user-id-input');

        clearAllQueuesBtn.addEventListener('click', function () {
            socket.emit('clearAllQueues');
        });

        clearSpecificQueueBtn.addEventListener('click', function () {
            const userId = userIdInput.value;
            if (userId) {
                socket.emit('clearSpecificQueue', { uid: userId });
            }
        });

        socket.on('queueUserCount', function (data) {
            const countDisplay = document.getElementById('queue-user-count');
            countDisplay.textContent = `Queues: ${data.queues}, Users: ${data.users}`;
        });

        document.getElementById('pausePlayBtn').addEventListener('click', pausePlay);
        document.getElementById('skipSongBtn').addEventListener('click', function () {
            isPlaying = false;
            socket.emit('skipSong');
        });
        document.getElementById('refreshDisplayBtn').addEventListener('click', function () {
            socket.emit('refreshDisplay');
        });
        document.getElementById('catColorDropdown').addEventListener('change', function () {
            var selectedColor = this.value;
            sessionStorage.setItem('catColor', selectedColor); 
            socket.emit('userColorChange', { color: selectedColor });
        });
        document.getElementById('setVolumeBtn').addEventListener('click', function () {
            var volumeLevel = document.getElementById('volumeSlider').value;
            socket.emit('set_volume', { volume: volumeLevel });
        });
        document.getElementById('setSongLengthBtn').addEventListener('click', function () {
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
            </div>
        `;
        songContainer.appendChild(overlay);
        userQueueList.appendChild(songContainer);

        songContainer.classList.add('added');
        setTimeout(() => songContainer.classList.remove('added'), 500);
    });

    const nextUserId = sessionStorage.getItem('next_user');
    if (nextUserId === sessionStorage.getItem('uid') && userQueueList.children.length > 0) {
        userQueueList.children[0].classList.add('highlight');
    }

    // This lets the user drag and drop the songs in the queue
    new Sortable(userQueueList, {
        onEnd: function (evt) {
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
    console.log('Requesting cat colors from server');
    socket.emit('get_cat_colors');
}

function updateCatColor(color) {
    frame0 = `/static/img/cats/${color}/PusayLeft.png`;
    frame1 = `/static/img/cats/${color}/PusayCenter.png`;
    frame2 = `/static/img/cats/${color}/PusayRight.png`;
    const catjam = document.getElementById('catjam');
    if (catjam) {
        catjam.src = frame1;
    } else {
        console.error('catjam element not found');
    }
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
        socket.emit('addYoutubeLinkToQueue', { youtube_link: input, source: 'youtube', bpm: youtubeBpm });
        document.getElementById('youtube-link').value = '';
        document.getElementById('youtube-bpm').value = '90';
    }
    document.getElementById('searchbar').value = '';
}

function isSpotifyAlbum(link) {
    return link.includes('album');
}

function isSpotifyPlaylist(link) {
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

    item.onclick = function () {
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
    socket.on('songAdded', function (data) {
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
    if (!song) {
        console.log('Queue is empty');
        resetPlayerUI();
        defaultFrame();
        clearInterval(animationInterval);
        return;
    }

    console.log('Playing:', song.track_name, 'by', song.artist_name);

    currentSong = song;

    togglePlayerVisibility(song.source);

    if (song.source === 'spotify') {
        playSpotifySong(song.track_id);
    } else if (song.source === 'youtube') {
        playYouTubeSong(song);
    }

    setCurrentSongUI(song);
    isPlaying = true;
    animateFrames(song.bpm);
}

function togglePlayerVisibility(source) {
    const spotifyPlayerWrapper = document.getElementById('spotify-player-wrapper');
    const youtubePlayerWrapper = document.getElementById('youtube-player-wrapper');

    const isSpotify = source === 'spotify';
    spotifyPlayerWrapper.style.display = isSpotify ? 'block' : 'none';
    youtubePlayerWrapper.style.display = isSpotify ? 'none' : 'block';
}

function playSpotifySong(track_id) {
    const spotifyURI = `spotify:track:${track_id}`;
    if (EmbedController && typeof EmbedController.loadUri === 'function' && typeof EmbedController.play === 'function') {
        EmbedController.loadUri(spotifyURI);
        EmbedController.play(function () {
            console.log('Spotify Playback started');
        });
    } else {
        console.error('EmbedController methods are not available');
    }
}

function playYouTubeSong(song) {
    if (player && validateYouTubeTrackID(song.track_id)) {
        console.log('Playing YouTube video:', song.track_id);
        
        player.source = {
            type: 'video',
            sources: [
                {
                    src: song.track_id,
                    provider: 'youtube'
                }
            ]
        };

        player.on('timeupdate', function () {
            const currentTime = player.currentTime;
            const duration = player.duration;
            if (!isNaN(currentTime) && !isNaN(duration)) {
                document.getElementById('progressBar').value = (currentTime / duration) * 100;
                document.getElementById('progressTimestamp').textContent = formatTime(currentTime);
                document.getElementById('duration').textContent = formatTime(duration);
            }
        });

        player.on('ended', function () {
            console.log('YouTube video ended');
            isPlaying = false;
            resetPlayerUI();
            socket.emit('get_next_song');
        });

        player.play();
    } else {
        console.error('Invalid YouTube track ID:', song.track_id);
    }
}


function validateYouTubeTrackID(track_id) {
    const regex = /^[a-zA-Z0-9_-]{11}$/;
    return regex.test(track_id);
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

    if (songTitleElem) songTitleElem.innerHTML = "No song is playing";
    if (artistNameElem) artistNameElem.innerHTML = "";
    if (albumCoverElem) albumCoverElem.src = song_placeholder;
    if (submitterUidElem) submitterUidElem.innerHTML = "";
}

function updatePlayerProgress(trackLength) {
    const progressBar = document.getElementById('progressBar');
    const progressTimestamp = document.getElementById('progressTimestamp');
    const durationElem = document.getElementById('duration');

    if (player.playing) {
        const currentTime = player.currentTime;
        const duration = player.duration;
        const progress = (currentTime / duration) * 100;

        progressBar.value = progress;
        progressTimestamp.innerHTML = formatTime(currentTime);
        durationElem.innerHTML = formatTime(duration);
    } else {
        progressBar.max = 100;
        progressTimestamp.innerHTML = formatTime(0);
        durationElem.innerHTML = formatTime(trackLength);
    }
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
    animationInterval = setInterval(function () {
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

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}
