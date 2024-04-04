//script.js
var isPlaying = false;
var isPaused = false;
var animationInterval;
var pingInterval = null;
var typingTimer;
var doneTypingInterval = 500;
var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);
var EmbedController;
socket.on('connect', function() {
    console.log('Socket.IO connected');
    socket.emit('ping');
});

socket.on('message', function(data) {
    console.log('Received:', data);
    //console.log(isPlaying);

    switch(data.action) {
        case 'updateQueue':
            console.log("Updating queue");
            updateQueue(data.queue);
            updateAdminQueue(data.queue);
            break;
        case 'searchResults':
            handleSearchResults(data.results);
            break;
        case 'playSong':
            playSong();
            break;
        case 'updateAdminQueue':
            updateAdminQueue(data);
            break;
        case 'next_song':
            console.log("Next song");
            playSong(data.nextSong);
            break;
            
        case 'queueUpdated':
            if(!isPlaying){
                socket.emit('get_next_song');
            }
            break;
        case 'formattedTime':
            if (window.location.pathname === '/display') {
            document.getElementById('progressTimestamp').innerText = data.time;
            }
            break;
        
        case 'queueLength':
            if (data.length == 1) {
                if(window.location.pathname === '/display'){
                    
                    document.getElementById('playQueue').click();
                    console.log("Playing first song");
                }
            }
            break;
        case 'checkIfPlaying':
            socket.emit('isPlaying', {isPlaying: isPlaying});
            break;
        case 'queue_empty':
            console.log("Queue is empty");
            if (isPlaying) {
                resetPlayerUI();
                defaultFrame();
                clearInterval(animationInterval);
                EmbedController.pause();
            }
            updateQueue(data.queue);
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
            if(window.location.pathname === '/admin'){
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
            if(window.location.pathname === '/admin'){
                document.getElementById('catColorDropdown').value = data.color;
            }
    }
});

socket.on('disconnect', function() {
    console.log("Socket.IO disconnected");
});

socket.on('error', function(error) {
    console.error('Socket.IO Error:', error);
});




/*Code for main/search page*/
window.onload = function () {
    //anything that should happen on page load goes here
    //if the page is the main page, we want to get the queue from the server
    if (window.location.pathname == "/") {
        socket.emit('get_song_queue');
    }
    if(window.location.pathname == "/display"){
        clearQueue();
        defaultFrame();
        socket.emit('get_admin_queue');
    }    

    if(window.location.pathname == "/admin"){
        document.getElementById('pausePlayBtn').addEventListener('click', pausePlay);
    }
};


function updateQueue(queueData) {
    console.log(typeof(queueData));
    console.log(queueData);
    if (window.location.pathname == "/"){
        var queuelist = document.getElementById('queuelist');
        queuelist.innerHTML = '';
        console.log("Queue Data:" + queueData);
        queueData.forEach(song => {
            var img = document.createElement('img');
            img.src = song.cover_url;
            img.style.width = '10%';
            queuelist.appendChild(img);
            console.log(song.track_name);
        });
    }
    if(window.location.pathname == "/display"){
        var queuelist = document.getElementById('song-list');
        queuelist.innerHTML = '';
        queueData.forEach(song => { // Start from the second song
            var img = document.createElement('img');
            img.src = song.cover_url;
            img.style.width = '100px';
            queuelist.appendChild(img);
        });
    }
}
function pausePlay() {
    console.log('pausePlayBtn clicked');
    socket.emit('message', { action: 'togglePlay' }); // Emit 'togglePlay' action
    if(isPaused) {
        document.getElementById('pausePlayBtn').innerHTML = 'Pause';
    } else {
        document.getElementById('pausePlayBtn').innerHTML = 'Play';
    }
}
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname == "/") {
        var searchInput = document.getElementById('searchbar');
        searchInput.textContent = '';
        searchInput.addEventListener('keyup', function(event) {
            clearTimeout(typingTimer); // Clear the previous timer

            if (event.key === "Enter") {
                event.preventDefault();
                searchTracks();
            } else {
                typingTimer = setTimeout(searchTracks, doneTypingInterval);
            }
        });
    }
    if (window.location.pathname == '/display') {
        document.getElementById('playQueue').addEventListener('click', startPlay);
        var startButton = document.getElementById('startButton');
        startButton.addEventListener('click', function() {
            startButton.style.display = 'none';
        });
        
    
    }
    if (window.location.pathname == "/admin") {
        document.getElementById('skipSongBtn').addEventListener('click', function() {
            isPlaying = false;
            socket.emit('skipSong');
        });
        document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
        document.getElementById('pausePlayBtn').addEventListener('click', pausePlay);
        var refreshDisplayBtn = document.getElementById('refreshDisplayBtn');
        refreshDisplayBtn.addEventListener('click', function() {
            socket.emit('refreshDisplay');
        });
        populateCatColorDropdown();
        document.getElementById('catColorDropdown').addEventListener('change', function() {
            var selectedColor = this.value;
            socket.emit('change_cat_color', selectedColor);
        });
    }
});

function populateCatColorDropdown() {
    socket.emit('get_cat_colors');
}
function searchTracks() {
    var searchText = document.getElementById('searchbar').value;
    socket.emit('searchTracks', {
        track_name: searchText
    });
}
//Has been changed to websocket
function handleSearchResults(data) {
    var dropdown = document.getElementById('dropdown');
    dropdown.innerHTML = '';

    data.forEach(track => {
        var item = createTrackItem(track);
        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

//Has been changed to websocket
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

    // Create the artist name element
    var artistName = document.createElement('div');
    artistName.textContent = track.artist_name;

    // Append the track name and artist name to the text wrapper
    textWrapper.appendChild(trackName);
    textWrapper.appendChild(artistName);

    // Create the track length element
    var trackLength = document.createElement('div');
    trackLength.textContent = track.track_length;
    trackLength.style.marginLeft = 'auto'; // Push the track length to the right

    // Append image and text wrapper to the item
    item.appendChild(img);
    item.appendChild(textWrapper);
    item.appendChild(trackLength);

    // Set onclick function for item
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
    /*Print all data in track*/
    var displayStyle = window.getComputedStyle(selectedItem).display;
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
    var btnDisplayStyle = window.getComputedStyle(addButton).display;
    if (btnDisplayStyle == 'none') {
        addButton.style.display = 'block';
    }
}

function submitSong() {
    var selectedItem = document.getElementById('selected-item');
    var track = JSON.parse(selectedItem.dataset.track);
    
    socket.emit('addSongToQueue', {
        track: track
    });
    socket.emit('get_queue_length');
    //Consider removing the result text if the song shows up in the queue right away
    var resultText = document.getElementById('resulttext');
    resultText.textContent = "Song added to queue!";
    setTimeout(function() {
        resultText.textContent = "";
    }, 3000);
    resetSongSelectionUI();
}

socket.on('queueLength', function(data) {
    var queueLength = data.length;
    console.log('Queue length:', queueLength);

    // Check if the queue was previously empty
    if (queueLength === 1) {
        if (!isPlaying) {
            document.getElementById('playQueue').click(); // Automatically click the play queue button
            console.log("Playing first song");
        }
    }
});
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


/*Code for the player and admin panel*/

function startPlay(){
    socket.emit('get_next_song');
    
}


//Has been changed to websocket
function updateAdminQueue(data) {
    var queue = data.queue;
    if (!queue || queue.length === 0) {
        console.log('Queue data is empty or undefined');
        return;
    }
    console.log('Queue data:', queue);
    var queuelist = document.getElementById('song-list');
    queuelist.innerHTML = '';  // clear the queuelist
    queue.forEach(song => {
        var img = document.createElement('img');
        img.src = song.cover_url;
        img.style.width = '10%';
        queuelist.appendChild(img);
    });
}




function clearQueue() {
    socket.emit('clearQueue');
    if (window.location.pathname === '/display') {
        document.getElementById('song-list').innerHTML = '';
        resetPlayerUI();
        EmbedController.pause();
        defaultFrame();
        clearInterval(animationInterval);
    }
}



function playSong(song) {
    if (!song || Object.keys(song).length === 0){
        console.log('Queue is empty');
        resetPlayerUI();
        defaultFrame();
        clearInterval(animationInterval);
        return;
    }

    console.log('Playing:', song.track_name, 'by', song.artist_name);
    

    //check if the website is the display page
    if (window.location.pathname === '/display') {
        EmbedController.uri = song.uri;
        EmbedController.loadUri(song.uri);
        console.log('Playback started');

        // Update the UI with the song details
        setCurrentSongUI(song);
        // Play the song
        EmbedController.play();

        // Listen for playback errors
        EmbedController.on('error', (error) => {
            console.error("Playback error:", error);
        });

        isPlaying = true;
        updatePlayerProgress(song.track_length);
        animateFrames(song.bpm);
    }
}

function setCurrentSongUI(song) {
    document.getElementById("song_title").innerHTML = song.track_name;
    document.getElementById("artist_name").innerHTML = song.artist_name;
    document.getElementById("album-cover").src = song.cover_url;
}

function resetPlayerUI() {
    document.getElementById("song_title").innerHTML = "No song is playing";
    document.getElementById("artist_name").innerHTML = "";
    document.getElementById("album-cover").src = song_placeholder;
}

function updatePlayerProgress(trackLength) {
    document.getElementById('progressBar').max = 100;
    document.getElementById('duration').innerHTML = trackLength;
}

function calculateFrameDuration(bpm) {
    var bps = bpm / 60;
    return 1 / (2 * bps); // Duration of each frame in seconds
}

function animateFrames(bpm) {
    if (animationInterval) {
        clearInterval(animationInterval); // Clear existing interval
    }

    var frames = [frame0, frame1, frame2];
    var frameIndex = 0;
    var frameDuration = calculateFrameDuration(bpm);
    var increment = true; // Variable to track whether to increment or decrement

    animationInterval = setInterval(function() {
        document.getElementById('catjam').src = frames[frameIndex];

        if (increment) {
            frameIndex++;
        } else {
            frameIndex--;
        }

        // If we've reached the end of the array, start decrementing
        if (frameIndex === frames.length - 1) {
            increment = false;
        }

        // If we've reached the start of the array, start incrementing
        if (frameIndex === 0) {
            increment = true;
        }
    }, frameDuration * 1000);
}

function defaultFrame() {
    clearInterval(animationInterval);
    document.getElementById('catjam').src = frame1;
}