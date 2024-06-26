var isPlaying = false;
var isPaused = false;
var animationInterval;
var typingTimer;
var doneTypingInterval = 500;
var socket;
var ytPlayerReady = false;
var ytPlayer;
var pendingSong = null;
var tempSongData = null;

var frame0 = "/static/img/cats/White/PusayLeft.png";
var frame1 = "/static/img/cats/White/PusayCenter.png";
var frame2 = "/static/img/cats/White/PusayRight.png";
var song_placeholder = "/static/img/song_placeholder.png";

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '0',
        width: '0',
        videoId: '',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    ytPlayerReady = true;
    console.log('YouTube Player Ready');
    if (pendingSong) {
        playSong(pendingSong);
        pendingSong = null;
    } else {
        playSong();
    }
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.ENDED) {
        console.log('YouTube video ended');
        isPlaying = false;
        defaultFrame();
        clearInterval(animationInterval);
        resetPlayerUI();
        socket.emit('removeFirstSong');
        socket.emit('get_next_song');
        socket.emit('get_user_queue');
    } else if (event.data == YT.PlayerState.PLAYING) {
        updateYouTubeProgress();
        setInterval(updateYouTubeProgress, 1000);
    }
}

function validateYouTubeTrackID(track_id) {
    const regex = /^[a-zA-Z0-9_-]{11}$/;
    return regex.test(track_id);
}

function updateYouTubeProgress() {
    if (ytPlayerReady && ytPlayer.getPlayerState() == YT.PlayerState.PLAYING) {
        var duration = ytPlayer.getDuration();
        var currentTime = ytPlayer.getCurrentTime();
        var progress = (currentTime / duration) * 100;
        document.getElementById('progressBar').value = progress;
        document.getElementById('duration').innerHTML = formatTime(duration);
        document.getElementById('progressTimestamp').innerHTML = formatTime(currentTime);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', function() {
        console.log('Socket.IO connected');
        if (window.location.pathname === '/') {
            socket.emit('get_user_queue');
            socket.emit('get_current_song');
        }
        if (window.location.pathname === '/display') {
            socket.emit('get_code_interval');
            socket.emit('get_new_code');
        }
    });

    socket.on('update_code', function(data) {
        if (window.location.pathname === '/display') {
            console.log('update_code event received:', data);
            let codeElement = document.getElementById('current-code');
            let timerElement = document.getElementById('code-timer');
            if (codeElement) {
                codeElement.textContent = data.code;
                console.log('Current Code updated:', data.code);
            } else {
                console.error('Element with ID current-code not found');
            }
            if (timerElement) {
                timerElement.textContent = data.remaining_time;
            } else {
                console.error('Element with ID code-timer not found');
            }
        }
    });

    socket.on('update_timer', function(data) {
        if (window.location.pathname === '/display') {
            let timerElement = document.getElementById('code-timer');
            if (timerElement) {
                timerElement.textContent = data.remaining_time;
            } else {
                console.error('Element with ID code-timer not found');
            }
        }
    });

    socket.on('check_validation_response', function(data) {
        console.log('check_validation_response event received:', data);
        if (data.needsValidation) {
            promptForCode();
        } else {
            if (tempSongData) {
                socket.emit('addSongToQueue', {
                    track: tempSongData
                });
                socket.emit('get_queue_length');
                var resultText = document.getElementById('resulttext');
                resultText.textContent = "Song added to queue!";
                setTimeout(function() {
                    resultText.textContent = "";
                }, 3000);
            }
        }
    });

    socket.on('code_validation', function(data) {
        console.log('code_validation event received:', data);
        if (data.success) {
            document.getElementById('code-prompt').style.display = 'none';
            document.getElementById('code-error').style.display = 'none';
            if (tempSongData) {
                socket.emit('addSongToQueue', { track: tempSongData });
                tempSongData = null;
                socket.emit('get_queue_length');
                var resultText = document.getElementById('resulttext');
                resultText.textContent = "Song added to queue!";
                setTimeout(function() {
                    resultText.textContent = "";
                }, 3000);
            }
        } else {
            document.getElementById('code-error').style.display = 'block';
        }
    });

    socket.on('disconnect', function() {
        console.log("Socket.IO disconnected");
    });

    socket.on('error', function(error) {
        console.error('Socket.IO Error:', error);
    });

    socket.on('updateUserQueue', function(data) {
        console.log('User queue updated:', data.queue);
        updateUserQueueDisplay(data.queue);
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

    socket.on('updateCurrentSong', function(data) {
        if (window.location.pathname === '/') {
            if (data.currentSong) {
                updateCurrentSong(data.currentSong);
            } else {
                resetPlayerUI();
            }
        }
    });

    socket.on('message', function(data) {
        console.log('Received:', data);
        switch(data.action) {
            case 'searchResults':
                handleSearchResults(data.results);
                break;
            case 'next_song':
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
                if (window.location.pathname === '/') {
                    updateCurrentSong(data.nextSong);
                } else {
                    setCurrentSongUI(data.nextSong);
                }
                break;
            case 'queueUpdated':
                console.log('Queue updated, checking if playback should start.');
                if (!isPlaying) {
                    console.log('No song is currently playing, requesting next song.');
                    socket.emit('get_next_song');
                }
                if (window.location.pathname === '/' && document.getElementById('user-queue-list')) {
                    console.log('User queue updated:', data.queue);
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
                youtubeLinkInput.value = '';
        
                document.getElementById('dropdown').innerHTML = '';
                document.getElementById('selected-song').style.display = 'none';
                document.getElementById('info-text').textContent = '';
                document.getElementById('add-button').style.display = 'none';
        
            } else {
                searchBar.style.display = 'block';
                youtubeLinkInput.style.display = 'none';
                youtubeLinkInput.value = '';
        
                document.getElementById('add-button').style.display = 'block';
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

        window.addEventListener('beforeunload', function() {
            socket.emit('stop_code_generation');
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
            </div>
        `;
        songContainer.appendChild(overlay);
        userQueueList.appendChild(songContainer);

        songContainer.classList.add('added');
        setTimeout(() => songContainer.classList.remove('added'), 500);
    });

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
            socket.emit('get_user_queue');
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
        selectedItem.dataset.track = JSON.stringify(track); // Store the track data
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

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
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
    var track = JSON.parse(selectedItem.dataset.track); // Retrieves track data

    track.track_length = parseInt(track.track_length, 10);
    if (isNaN(track.track_length)) {
        console.error('Track length not provided or invalid');
        alert('Track length is missing or invalid. Please try again.');
        return;
    }

    tempSongData = track; // Stores song data temporarily

    socket.emit('check_validation', {}); // Emit validation check
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
            });
        });
    } else if (song.source === 'youtube') {
        if (!ytPlayerReady) {
            pendingSong = song;
            console.log('YouTube player is not ready, storing the song to play later');
            return;
        }

        if (EmbedController) {
            EmbedController.pause();
        }
        if (spotifyPlayerWrapper) spotifyPlayerWrapper.style.display = 'none';
        if (youtubePlayerWrapper) youtubePlayerWrapper.style.display = 'block';

        if (validateYouTubeTrackID(song.track_id)) {
            ytPlayer.loadVideoById(song.track_id);
            ytPlayer.playVideo();
        } else {
            console.error('Invalid YouTube track ID:', song.track_id);
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
    } else {
        document.getElementById('progressBar').max = 100;
        document.getElementById('duration').innerHTML = formatTime(trackLength);
        document.getElementById('progressTimestamp').innerHTML = formatTime(0);
    }
}

function voteToSkip() {
    socket.emit('vote_to_skip');
}

function promptForCode() {
    document.getElementById('code-prompt').style.display = 'block';
}

function submitCode() {
    var code = document.getElementById('code-input').value;
    console.log('Submitting code:', code);  // Debug statement
    socket.emit('validate_code', { code: code });
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