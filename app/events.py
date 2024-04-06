#app/events.py

import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit
from app import socketio
from .models import db, Song, Queue
from app.utils.main import get_token, search_for_tracks
from app.utils.track_wrapper import TrackWrapper
from .util import csh_user_auth
from flask import session
import paramiko

load_dotenv()
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')

@socketio.on('connect')
def handle_connect():
    emit('message', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    pass
@socketio.on('ping')
def handle_ping():
    emit('pong')

@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    try:
        token = get_token()
        result_array = search_for_tracks(token, track_name, 5)
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

        token = get_token()
        track_wrapper = TrackWrapper(track_data)
        bpm = track_wrapper.getBPM(token)
        uid = session.get('uid') or session.get('preferred_username')
        song = Song(track_name=track_name, artist_name=artist_name, track_length=track_length, 
                    cover_url=cover_url, track_id=track_id, uri=uri, bpm=bpm, uid=uid)
        db.session.add(song)
        db.session.commit()
        
        queue_item = Queue(song=song)
        db.session.add(queue_item)
        db.session.commit()
        
        queue_length = len(get_queue())
        emit('queueLength', {'length': queue_length}, broadcast=True)
        emit('queueUpdated', broadcast=True)
        emit('message', {'action': 'updateQueue', 'queue': get_queue()}, broadcast=True)   

        if queue_length == 1 and not isPlaying:
            emit('playQueue', broadcast=True)
    else:
        print('Invalid song data')
        emit('error', {'message': 'Invalid song data.'})

@socketio.on('isPlaying')
def handle_is_playing(data):
    global isPlaying
    isPlaying = data.get('isPlaying')
    print('Is playing:', isPlaying)
    if not isPlaying:
        print('Playing next song')
        
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
        remove_first_song()
    else:
        emit('message', {'action': 'queue_empty'}, broadcast=True)


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

def remove_first_song():
    first_song = Queue.query.first()
    if first_song:
        db.session.delete(first_song)
        db.session.commit()
        
@socketio.on('clearQueue')
def handle_clear_queue():
    Queue.query.delete()
    db.session.commit()
    emit('message', {'action': 'updateQueue', 'queue': []}, broadcast=True)

@socketio.on('get_queue_length')
def handle_get_queue_length():
    queue = get_queue()
    return {'length': len(queue)}

@socketio.on('secondsToMinutes')
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, broadcast=True)

@socketio.on('skipSong')
def handle_skip_song():
    next_song = get_next_song()
    if next_song:
        remove_first_song()
        emit('message', {'action': 'next_song', 'nextSong': next_song}, broadcast=True)
        
    else:
        emit('message', {'action': 'queue_empty'}, broadcast=True)
        global isPlaying
        isPlaying = False

@socketio.on('refreshDisplay')
def handle_refresh_display():
    emit('reloadPage', broadcast=True)

def get_cat_colors():
    base_path = os.path.join('app', 'static', 'img', 'cats')
    if not os.path.exists(base_path):
        return []
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    return dirs


@socketio.on('get_cat_colors')
def handle_get_cat_colors():
    colors = get_cat_colors()
    emit('message', {'action': 'cat_colors', 'colors': colors}, broadcast=True)

selected_color = "White"  # Default color

@socketio.on('change_cat_color')
def handle_change_cat_color(color):
    global selected_color
    selected_color = color
    emit('color_changed', {'color': color}, broadcast=True)


@socketio.on('set_volume')
def handle_set_volume(data):
    volume = data['volume']

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
        ssh_stdin, ssh_stdout, ssh_stderr = ssh.exec_command(f'amixer set Master {volume}%')
        ssh.close()
        emit('volume_set', {'volume': volume}, broadcast=True)
    except Exception as e:
        print(f"Error setting volume: {str(e)}")
        emit('error', {'message': 'Failed to set volume.'})