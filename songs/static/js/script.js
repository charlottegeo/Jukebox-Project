/*Code for main/search page*/
window.onload = function () {
    document.getElementById('searchbar').value = ""
    document.getElementById('username').value = ""
    document.getElementById('password').value = ""
    updateQueue();
    // Call updateQueue() every 5 seconds
    setInterval(updateQueue, 5000);
};
function errorGone() {
    document.getElementById("error").style.display = "none";
}
document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;
    console.log(username);
    fetch('/verify_login/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })
    .then(response => response.text())
    .then(text => {
        console.log(text);  // Log the text
        return JSON.parse(text);  // Parse the text as JSON
    })
    .then(data => {
        var result = data.result;
        if (result == 'success') {
            window.location.href = "/display/";
            console.log("Login successful");
        }
        else {
            document.getElementById("error").style.display = "block";
            console.log("Login failed");
        }
    });
});
function sidebar_open() {
  document.getElementById("mySidebar").style.display = "block";
}

function sidebar_close() {
  document.getElementById("mySidebar").style.display = "none";
}
function updateQueue() {
    fetch('/get_song_queue/')
        .then(response => response.json())
        .then(queue => {
            console.log(queue);
            var queuelist = document.getElementById('queuelist');
            queuelist.innerHTML = '';  // clear the queuelist
            var length = Math.min(5, queue.result.length);

            for (var i = 0; i < length; i++) {
                console.log("Adding song to queue")
                var img = document.createElement('img');
                img.src = queue.result[i].cover_url;
                img.style.width = '100px';
                queuelist.appendChild(img);
            }
        });
}

function printText(input) {
    var resultText = document.getElementById('resulttext');
    resultText.textContent = "";
    if (event.keyCode === 13) {  // 13 is the key code for the Enter key
        event.preventDefault();  // prevent form submission
        var searchText = input.value;  // get the text from the search bar
        fetch('/search_for_tracks/?track_name=' + searchText)
            .then(response => response.json())
            .then(data => {
                var dropdown = document.getElementById('dropdown');
                dropdown.innerHTML = '';  // clear the previous results

                for (var i = 0; i < data.result.length; i++) {
                    var track = data.result[i];

                    // Create a new div for the track
                    var item = document.createElement('div');
                    item.className = 'item';
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';  // new line
                    item.onclick = (function (track) {
                        return function () {
                            console.log('clicked');
                            var selectedItem = document.getElementById('selected-item');
                            selectedItem.dataset.track = JSON.stringify(track);
                            setText();
                        };
                    })(track);
                    var imgTextWrapper = document.createElement('div');
                    imgTextWrapper.style.display = 'flex';
                    var img = document.createElement('img');
                    img.src = track.cover_url;
                    imgTextWrapper.appendChild(img);
                    var textWrapper = document.createElement('div');
                    textWrapper.style.display = 'flex';
                    textWrapper.style.flexDirection = 'column';
                    var trackName = document.createElement('div');
                    trackName.textContent = track.track_name;
                    textWrapper.appendChild(trackName);
                    item.appendChild(textWrapper);
                    var artistName = document.createElement('div');
                    artistName.textContent = track.artist_name;
                    textWrapper.appendChild(artistName);
                    imgTextWrapper.appendChild(textWrapper);
                    item.appendChild(imgTextWrapper);
                    var trackLength = document.createElement('div');
                    trackLength.textContent = track.track_length;
                    item.appendChild(trackLength);
                    dropdown.appendChild(item);
                }
                dropdown.style.display = 'block';
            })
            .catch(error => console.error('Error:', error));
    }
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
    var trackName = track.track_name;
    var artistName = track.artist_name;
    var trackLength = track.track_length;
    var coverUrl = track.cover_url;
    var trackId = track.track_id;
    var uri = track.uri;

    fetch('/add_to_queue/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Include other headers here
        },
        body: JSON.stringify({
            'track_name': trackName,
            'artist_name': artistName,
            'track_length': trackLength,
            'cover_url': coverUrl,
            'track_id': trackId,
            'uri': uri
        })
    })
    .then(response => response.json())
    .then(data => {
        // Handle the response data here
        console.log(data);
        var resultText = document.getElementById('resulttext');
        resultText.textContent = "Song added to queue!";
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
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

/*Code for the player and admin panel*/
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
        // The first queue item is now in 'data'
        document.getElementById("spotify-player").src = "https://open.spotify.com/embed/track/" + data['track_id'];
        document.getElementById("song_title").innerHTML = data['track_name'];
        document.getElementById("artist_name").innerHTML = data['artist_name'];
        document.getElementById("album-cover").src = data['cover_url'];
    });
    
}