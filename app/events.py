#app/events.py

from flask_socketio import SocketIO, emit
from app import socketio
from .models import db, Song, Queue
from app.utils.main import get_token, search_for_tracks
from app.utils.track_wrapper import formatTime
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

@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    try:
        token = get_token()
        result_array = search_for_tracks(token, track_name, 3)
        search_results = [track.to_dict() for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

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
        
        queue = get_queue()
        emit('message', {'action': 'updateQueue', 'queue': queue}, broadcast=True)

        # If no song is currently playing, emit the queueUpdated event
        if Queue.query.count() == 0:
            emit('message', {'action': 'queueUpdated', 'queue': queue}, broadcast=True)
    else:
        print('Invalid song data')
        emit('error', {'message': 'Invalid song data.'})


def get_queue():
    queue = Queue.query.all()
    queue_data = [song.song.to_dict() for song in queue]
    return queue_data


def get_next_song():
    next_song = Queue.query.first()
    if next_song:
        return next_song.song.to_dict()
    return None

@socketio.on('get_next_song')
def handle_get_next_song():
    next_song = get_next_song()
    if next_song:
        emit('message', {'action': 'next_song', 'nextSong': next_song}, broadcast=True)
    else:
        emit('message', {'action': 'error', 'error': 'Queue is empty'})


@socketio.on('get_song_queue')
def handle_get_queue():
    result = get_queue()
    emit('message', {'action': 'updateQueue', 'queue': result}, broadcast=True)

@socketio.on('get_admin_queue')
def handle_get_admin_queue():
    result = get_queue()
    emit('message', {'action': 'updateAdminQueue', 'queue': result}, broadcast=True)


@socketio.on('removeFirstSong')
def handle_remove_first_song():
    first_song = Queue.query.first()
    if first_song:
        db.session.delete(first_song)
        db.session.commit()
        queue = get_queue()
        emit('message', {'action': 'updateQueue', 'queue': queue}, broadcast=True)
    else:
        emit('message', {'action': 'error', 'error': 'Queue is empty'})

@socketio.on('clearQueue')
def handle_clear_queue():
    Queue.query.delete()
    db.session.commit()
    emit('message', {'action': 'updateQueue', 'queue': []}, broadcast=True)

@socketio.on('secondsToMinutes')
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, broadcast=True)