//app/static/js/script.js
var isPlaying = false;
var animationInterval;
var pingInterval = null;

var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);

socket.on('connect', function() {
    console.log('Socket.IO connected');
    socket.emit('ping');
});

socket.on('message', function(data) {
    console.log('Received:', data);
    switch(data.action) {
        case 'updateQueue':
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
                console.log("Playing next song");
            }
            break;
        case 'formattedTime':
            document.getElementById('progressTimestamp').innerText = data.time;
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
        
        socket.emit('get_admin_queue');
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
            img.style.width = '100px';
            queuelist.appendChild(img);
            console.log(song.track_name);
        });
    }
    if(window.location.pathname == "/display"){
        var queuelist = document.getElementById('song-list');
        queuelist.innerHTML = '';
        queueData = queueData.slice(1);
        queueData.forEach(song => {
            var img = document.createElement('img');
            img.src = song.cover_url;
            img.style.width = '100px';
            queuelist.appendChild(img);
            console.log(song.track_name);
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname == "/") {
        var searchInput = document.getElementById('searchbar');
        searchInput.addEventListener('keyup', function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                var searchText = searchInput.value;
                socket.emit('searchTracks', {
                    track_name: searchText
                });
            }
        });
    }
});
//Has been changed to websocket
function handleSearchResults(data) {
    console.log('Received search results:', data);
    console.log('Search results:', data);
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

    //Consider removing the result text if the song shows up in the queue right away
    var resultText = document.getElementById('resulttext');
    resultText.textContent = "Song added to queue!";

    resetSongSelectionUI();
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


/*Code for the player and admin panel*/

function startPlay(){
    socket.emit('get_next_song');
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('playQueue').addEventListener('click', startPlay);
});
//Has been changed to websocket
function updateAdminQueue(data) {
    var queue = data.queue;
    var queuelist = document.getElementById('song-list');
    if(queue.length > 1){
        var upcomingSongs = queue.slice(1); 
        queuelist.innerHTML = '';  // clear the queuelist
        upcomingSongs.forEach(song => {
            var img = document.createElement('img');
            img.src = song.cover_url;
            img.style.width = '100px';
            queuelist.appendChild(img);
        });
}
}


function clearQueue() {
    socket.emit('clearQueue');
    document.getElementById('song-list').innerHTML = '';
}



function playSong(song) {
    if (!song) {
        console.log('Queue is empty');
        // Optionally, reset the player UI to indicate no song is playing
        resetPlayerUI();
        return;
    }

    // If there is a song, load it into the EmbedController and play it
    console.log('Playing:', song.track_name, 'by', song.artist_name);
    EmbedController.uri = song.uri;
    EmbedController.loadUri(song.uri);
    console.log('Playback started');
    // Update the UI with the song details
    document.getElementById("song_title").innerHTML = song.track_name;
    document.getElementById("artist_name").innerHTML = song.artist_name;
    document.getElementById("album-cover").src = song.cover_url;
    document.getElementById("pausePlayBtn").style.display = "block";
    EmbedController.play();

    // Listen for playback finish event
    EmbedController.on('finish', () => {
        console.log('Playback finished');
        socket.emit('removeFirstSong');
        socket.emit('get_next_song');
    });

    // Listen for playback errors
    EmbedController.on('error', (error) => {
        console.error("Playback error:", error);
    });

    isPlaying = true;
    updatePlayerProgress(song.track_length);
    animateFrames(song.bpm);
}


function resetPlayerUI() {
    document.getElementById("song_title").innerHTML = "No song is playing";
    document.getElementById("artist_name").innerHTML = "";
    document.getElementById("album-cover").src = ""; // Path to a placeholder image or leave it blank
    document.getElementById("pausePlayBtn").style.display = "none";
}

function updatePlayerProgress(trackLength) {
    let [minutes, seconds] = trackLength.split(':').map(Number);
    let totalSeconds = minutes * 60 + seconds;
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

    var frames = [frame1, frame2];
    var frameIndex = 0;
    var frameDuration = calculateFrameDuration(bpm);

    animationInterval = setInterval(function() {
        document.getElementById('catjam').src = frames[frameIndex];
        frameIndex = (frameIndex + 1) % frames.length;
    }, frameDuration * 1000);
}