var isPlaying = false;
var animationInterval;
var pingInterval = null;
var socket = new WebSocket('ws://' + window.location.host + '/ws/songs/');

socket.onopen = function(e) {
    console.log('WebSocket opened');
    socket.send(JSON.stringify({ action: 'ping' }));
};

socket.onmessage = function(e) {
    const data = JSON.parse(e.data);
    console.log('Received:', data);
        switch(data.action) {
            case 'updateQueue':
                updateQueue(data.queue);
                break;
            case 'searchResults':
                handleSearchResults(data.results);
                break;
            case 'playSong':
                playSong();
                break;
            case 'doneSong':
                doneSong();
                break;
            case 'loginResponse':
                if (data.result == 'success') {
                    window.location.href = '/display/';
                } else {
                    var error = document.getElementById("error");
                    error.style.display = "block";
                    error.textContent = data.result;
                }
        }
};

socket.onerror = function(e) {
    console.error("WebSocket error observed:", e);
};

socket.onclose = function(e) {
    console.log("WebSocket closed:", e);
};

/*Code for main/search page*/
window.onload = function () {
    //setupSocket();
    
    initializeLoginForm();
};

//Has been changed to websocket
function initializeLoginForm() {
    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        $('#loginForm').on('submit', function(e) {
            e.preventDefault();
            var username = $('#username').val();
            var password = $('#password').val();
            verifyLogin(username, password);
        });
    }
}

//Has been changed to websocket
function verifyLogin(username, password) {
    socket.send(JSON.stringify({
        action: 'verifyLogin',
        username: username,
        password: password
    }));
}


function errorGone() {
    document.getElementById("error").style.display = "none";
}

function sidebar_open() {
  document.getElementById("mySidebar").style.display = "block";
}

function sidebar_close() {
  document.getElementById("mySidebar").style.display = "none";
}


function updateQueue(queueData) {
    var queuelist = document.getElementById('queuelist');
    queuelist.innerHTML = '';
    queueData.forEach(song => {
        var img = document.createElement('img');
        img.src = song.cover_url;
        img.style.width = '100px';
        queuelist.appendChild(img);
        console.log(song.track_name);
    });
}

//Has been changed to websocket
function printText(event, input) {
    if (event.keyCode === 13) {
        event.preventDefault();
        var searchText = input.value;
        console.log('Sending search text:', searchText);
        socket.send(JSON.stringify({
            action: 'searchTracks',
            track_name: searchText
        }));
    }
}

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
    console.log(track);
    var displayStyle = window.getComputedStyle(selectedItem).display;
    if (displayStyle == 'none') {
        selectedItem.style.display = 'block';
    }
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
    
    socket.send(JSON.stringify({
        action: 'addSongToQueue',
        track: track
    }));

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
    console.log("Starting play");
    EmbedController.play();
}
function updateAdminQueue() {
    fetch('/get_song_queue/')
        .then(response => response.json())
        .then(queue => {
            console.log(queue);
            var queuelist = document.getElementById('song-list');
            queuelist.innerHTML = '';  // clear the queuelist
            var length = queue.result.length;

            for (var i = 1; i < length; i++) {
                console.log("Adding song to queue")
                var img = document.createElement('img');
                img.src = queue.result[i].cover_url;
                img.style.width = '100px';
                queuelist.appendChild(img);
            }
        });
}

function checkQueue() {
    fetch('/get_song_queue/')
        .then(response => response.json())
        .then(queue => {
            updateAdminQueue();
            if (queue.result.length > 0) {
                // Update the queue on the page
                
                if (!isPlaying) {
                    playSong();
                }
            }
            setTimeout(checkQueue, 5000);
        })
        .catch((error) => {
            console.error('Error:', error);
        });
}
function removeFirstSong() {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/remove_first_song/',
            type: 'POST',
            success: function(response) {
                resolve();
            },
            error: function(error) {
                console.log(error);
                reject();
            }
        });
    });
}

function clearQueue() {
    fetch('/empty_queue/', {
    method: 'POST',  // Use POST as the request method
    })
    .then(response => response.json())
    .then(data => {
    console.log(data);
    document.getElementById('song-list').innerHTML = '';
    });
}
function playSong(){
    /*Get next song from queue*/
    /*Update song title and artist name*/
    /*Update album cover*/
    /*Update spotify player*/
    fetch('/get_first_song/', {
        method: 'GET',
    })
    .then(response => response.json())
    .then(data => {
        if (!data['result'] || data['result'].length == 0) {
            console.log('Queue is empty');
            return;
        } else{
            console.log(data);
            EmbedController.loadUri(data['result']['uri']);
            document.getElementById("song_title").innerHTML = data['result']['track_name'];
            document.getElementById("artist_name").innerHTML = data['result']['artist_name'];
            document.getElementById("album-cover").src = data['result']['cover_url'];
            console.log("BPM: ", data['result']['bpm']);
            console.log(EmbedController);
            console.log(EmbedController.play);

            EmbedController.on('error', (error) => {
                console.error("Playback failed: ", error);
            });
            let iframe = document.getElementById('spotify-player');
            let iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
            let playbtn = iframeDocument.querySelector('[data-testid="play-pause-button"]');
            if (playbtn) {
                playbtn.click();
                console.log("Play button clicked");
            } else {
                console.error("Play button not found");
            }
            document.getElementById("pausePlayBtn").style.display = "block";

            isPlaying = true;
            let trackLength = data['result']['length'];
            console.log("Track length: ", trackLength);
            let [minutes, seconds] = trackLength.split(':').map(Number);
            let totalSeconds = minutes * 60 + seconds;

            document.getElementById('progressBar').max = totalSeconds;
            document.getElementById('duration').innerHTML = trackLength;
            let bpm = data['result']['bpm'];
            animateFrames(bpm);
            checkQueue();
        }
    });
    
}
function doneSong(){
    fetch('/get_song_queue/')
        .then(response => response.json())
        .then(queue => {
            if(queue.result.length > 0){
                console.log("Playing next song");
                playSong();
            } else{
                document.getElementById("song_title").innerHTML = "-";
                document.getElementById("artist_name").innerHTML = "-";
                document.getElementById("album-cover").src = songPlaceholderUrl;
                EmbedController.loadUri(null);
            }
        })
        .catch((error) => {
            console.error('Error:', error);
        });
}

function pausePlay(){
    if (isPlaying){
        isPlaying = false;
        document.getElementById("pausePlayBtn").innerHTML = "Play";
    } else{
        isPlaying = true;
        document.getElementById("pausePlayBtn").innerHTML = "Pause";
    }
    EmbedController.togglePlay();
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