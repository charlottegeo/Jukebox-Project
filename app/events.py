from flask_socketio import SocketIO, emit
from app import socketio
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
    track = data.get('track')
    # Logic to add track to queue
    # After adding, emit an update to all clients
    socketio.emit('message', {'action': 'updateQueue', 'queue': 'Updated queue data'})

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
