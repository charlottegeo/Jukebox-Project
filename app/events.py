from flask_socketio import SocketIO, emit
from app import socketio
from .models import db, Song, Queue
from app.utils.main import get_token, search_for_tracks
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('message', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('ping')
def handle_ping():
    print('Ping received')
    emit('pong')

# Handle login verification
@socketio.on('verifyLogin')
def handle_verify_login(data):
    username = data.get('username')
    password = data.get('password')
    # Add your authentication logic here
    # If login is successful:
    emit('message', {'action': 'loginResponse', 'result': 'success'})
    # Else:
    # emit('message', {'action': 'loginResponse', 'result': 'failure'})

# Handle search tracks
@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    
    # Assuming get_token() and search_for_tracks() are synchronous or have synchronous equivalents
    try:
        token = get_token()  # Fetch Spotify API token
        result_array = search_for_tracks(token, track_name, 3)  # Perform the search
        
        # Prepare the response
        search_results = [track.to_dict() for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

# Handle adding song to queue
@socketio.on('addSongToQueue')
def handle_add_song_to_queue(data):
    track_data = data.get('track')
    if track_data:
        track_name = track_data.get('track_name', '')
        artist_name = track_data.get('artist_name', '')
        cover_url = track_data.get('cover_url', '')
        track_length = track_data.get('track_length', '')
        track_id = track_data.get('track_id', '')
        uri = track_data.get('uri', '')
        bpm = track_data.get('bpm', 0)

        song = Song(track_name=track_name, artist_name=artist_name, track_length=track_length, 
                    cover_url=cover_url, track_id=track_id, uri=uri, bpm=bpm)
        db.session.add(song)
        db.session.commit()

        queue_item = Queue(song=song)
        db.session.add(queue_item)
        db.session.commit()
        emit('queue_update', {'message': 'Song added to queue successfully.'})
    else:
        emit('error', {'message': 'Invalid song data.'})

# Handle getting the queue
@socketio.on('get_song_queue')
def handle_get_queue():
    queue = Queue.query.all()
    result = [song.song.to_dict() for song in queue]
    emit('update_queue', {'queue': result})  # Send updated queue to the client
# Example: Removing the first song
@socketio.on('removeFirstSong')
def handle_remove_first_song():
    # Logic to remove the first song from the queue
    # Notify all clients about the updated queue
    socketio.emit('message', {'action': 'updateQueue', 'queue': 'Updated queue after removal'})

# Example: Clearing the queue
@socketio.on('clearQueue')
def handle_clear_queue():
    # Logic to clear the queue
    # Notify all clients about the cleared queue
    socketio.emit('message', {'action': 'updateQueue', 'queue': 'Queue cleared'})
