import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit
from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime
from .util import csh_user_auth, decode_token
from flask import session, request, current_app
import paramiko
import re
from bs4 import BeautifulSoup
import requests

load_dotenv()
token = get_token()
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')

#store queues in memory
user_queues = {} #to store user queues
user_order = [] #to store the order of users in the queue

song_length_limit = None

@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
    if not token or not validate_token(token):
        return False
    
    emit('message', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        del user_queues[uid]
        if uid in user_order:
            user_order.remove(uid)

@socketio.on('ping')
def handle_ping():
    emit('pong')


def validate_token(token):
    user_id = decode_token(token)
    if user_id:
        session['user_id'] = user_id
        return True
    return False

@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict() for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

@socketio.on('addSongToQueue')
def handle_add_song_to_queue(data):
    track_data = data.get('track')
    uid = session.get('uid') or session.get('preferred_username')
    if track_data and uid:
        add_song_to_user_queue(uid, track_data)
        emit('queueUpdated', broadcast=True)
        check_and_play_next_song()
    else:
        emit('error', {'message': 'Invalid song data.'})

@socketio.on('get_user_queue')
def handle_get_user_queue():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()})

@socketio.on('isPlaying')
def handle_is_playing(data):
    global isPlaying
    isPlaying = data.get('isPlaying')
    print('Is playing:', isPlaying)
    if not isPlaying:
        print('Playing next song')
        play_next_song()


@socketio.on('get_next_song')
def handle_get_next_song():
    play_next_song()


@socketio.on('clearQueue')
def handle_clear_queue():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('message', {'action': 'updateQueue', 'queue': []}, broadcast=True)

@socketio.on('secondsToMinutes')
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, broadcast=True)

@socketio.on('skipSong')
def handle_skip_song():
    play_next_song()

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
    volume = data.get('volume')

    if not isinstance(volume, int) or not (0 <= volume <= 100):
        emit('error', {'message': 'Invalid volume level.'})
        return

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

def add_song_to_user_queue(uid, song):
    global song_length_limit
    if song_length_limit is not None and parse_duration_in_seconds(song['track_length']) > parse_duration_in_seconds(song_length_limit):
        emit('error', {'message': 'Song length exceeds the limit.'})
        return
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
        user_order.append(uid)
    user_queues[uid].add_song(Song(
        track_name=song['track_name'],
        artist_name=song['artist_name'],
        track_length=song['track_length'],
        cover_url=song['cover_url'],
        track_id=song['track_id'],
        uri=song['uri'],
        bpm=song['bpm'],
        uid=uid,
        source=song['source']
    ))


def clear_user_queue(uid):
    if uid in user_queues:
        user_queues[uid].queue = []


def get_next_user():
    if user_order:
        user_order.append(user_order.pop(0))
        return user_order[0]
    return None

def play_next_song():
    global isPlaying
    next_user = get_next_user()
    if next_user and user_queues[next_user].queue:
        next_song = user_queues[next_user].remove_song()
        emit('message', {'action': 'next_song', 'nextSong': next_song.to_dict()}, broadcast=True)
        isPlaying = True
    else:
        emit('message', {'action': 'queue_empty'}, broadcast=True)
        isPlaying = False

def check_and_play_next_song():
    if not isPlaying:
        play_next_song()

@socketio.on('set_song_length_limit')
def handle_set_song_length_limit(data):
    global song_length_limit
    song_length_limit = data['length']
    emit('song_length_limit_set', {'length': song_length_limit}, broadcast=True)

@socketio.on('addYoutubeLinkToQueue')
def handle_add_youtube_link_to_queue(data):
    youtube_link = data.get('youtube_link')
    uid = session.get('uid') or session.get('preferred_username')
    if youtube_link and uid:
        track_data = parse_youtube_link(youtube_link)
        if track_data:
            add_song_to_user_queue(uid, track_data)
            emit('queueUpdated', broadcast=True)
            check_and_play_next_song()
        else:
            emit('error', {'message': 'Failed to parse YouTube link.'})
    else:
        emit('error', {'message': 'Invalid YouTube link or user not authenticated.'})

def parse_youtube_link(youtube_link):
    try:
        response = requests.get(youtube_link)
        soup = BeautifulSoup(response.text, 'html.parser')

        title_tag = soup.find('meta', {'name': 'title'})
        track_name = title_tag['content'] if title_tag else 'YouTube Video'

        channel_tag = soup.find('link', {'itemprop': 'name'})
        artist_name = channel_tag['content'] if channel_tag else 'Unknown Artist'

        duration_tag = soup.find('meta', {'itemprop': 'duration'})
        track_length = parse_duration(duration_tag['content']) if duration_tag else 'Unknown'

        video_id = youtube_link.split('v=')[1].split('&')[0]

        return {
            'track_name': track_name,
            'artist_name': artist_name,
            'track_length': track_length,
            'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
            'track_id': video_id,
            'uri': youtube_link,
            'bpm': 'Unknown',
            'source': 'youtube'
        }
    except Exception as e:
        print(f"Error parsing YouTube link: {e}")
        return None
    
def parse_duration(duration_str):
    match = re.match(r'PT(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        minutes = int(match.group(1)) if match.group(1) else 0
        seconds = int(match.group(2)) if match.group(2) else 0
        return f"{minutes}:{seconds:02d}"
    return 'Unknown'

def parse_duration_in_seconds(duration_str):
    import re
    pattern = re.compile(r'(?:(\d+):)?(\d+):(\d+)')
    match = pattern.match(duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2))
        seconds = int(match.group(3))
        return hours * 3600 + minutes * 60 + seconds
    pattern = re.compile(r'(\d+):(\d+)')
    match = pattern.match(duration_str)
    if match:
        minutes = int(match.group(1))
        seconds = int(match.group(2))
        return minutes * 60 + seconds
    return 0