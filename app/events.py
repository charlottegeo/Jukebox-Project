import json
import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit, disconnect
from flask import session, request
import paramiko
import re
from bs4 import BeautifulSoup
import requests
import datetime
import threading

from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks, get_spotify_playlist_tracks, get_spotify_album_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime
from .util import csh_user_auth

# Load environment variables
load_dotenv()
token = get_token()

# Configuration variables
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')
MAX_SONG_LENGTH = 10 * 60  # 10 minutes

# In-memory storage
user_queues = {}
user_order = []
skip_votes = {}
selected_color = "White"  # Default color
currentPlayingSong = None

# Decorator to ensure the user is authenticated
def authenticated_only(f):
    def wrapped(*args, **kwargs):
        if 'uid' not in session:
            disconnect()
        else:
            return f(*args, **kwargs)
    return wrapped

# Event handlers
@socketio.on('connect')
@authenticated_only
def handle_connect():
    uid = session.get('uid')
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
        user_order.append(uid)
    emit('message', {'message': 'Connected to server'}, room=request.sid)
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('disconnect')
@authenticated_only
def handle_disconnect():
    uid = session.get('uid')
    if uid in user_order:
        user_order.remove(uid)

@socketio.on('searchTracks')
@authenticated_only
def handle_search_tracks(data):
    track_name = data.get('track_name')
    source = data.get('source', 'spotify')
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict(source=source) for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results}, room=request.sid)
    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': str(e)}, room=request.sid)

@socketio.on('addSongToQueue')
@authenticated_only
def handle_add_song_to_queue(data):
    track = data.get('track')
    uid = session.get('uid')
    if track:
        track_length = track.get('track_length')
        if track_length is not None:
            try:
                track_length = int(track_length)
            except ValueError:
                emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid track length'}, room=request.sid)
                return
            
            if track_length > MAX_SONG_LENGTH:
                emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Track length {track_length} exceeds maximum allowed length {MAX_SONG_LENGTH}'}, room=request.sid)
                return

            track['source'] = data.get('source', 'spotify')
            add_song_to_user_queue(uid, track)
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song added to queue'}, room=request.sid)

            if uid in user_queues:
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
            
            if not isPlaying:
                check_and_play_next_song()
        else:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track length not provided'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Track data not provided'}, room=request.sid)


@socketio.on('youtubePlayerReady')
@authenticated_only
def handle_youtube_player_ready():
    emit('youtubePlayerIsReady', room=request.sid)

@socketio.on('addPlaylistToQueue')
@authenticated_only
def handle_add_playlist_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    
    if source == 'spotify':
        tracks = get_spotify_playlist_tracks(link)
    elif source == 'youtube':
        tracks = get_youtube_playlist_tracks(link)
    else:
        tracks = []

    for track in tracks:
        add_song_to_user_queue(uid, track)

    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    check_and_play_next_song()

@socketio.on('addAlbumToQueue')
@authenticated_only
def handle_add_album_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid')
    
    if source == 'spotify':
        tracks = get_spotify_album_tracks(link)
    else:
        tracks = []

    for track in tracks:
        add_song_to_user_queue(uid, track)

    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    check_and_play_next_song()

@socketio.on('removeSongFromQueue')
@authenticated_only
def handle_remove_song_from_queue(data):
    song_index = data.get('index')
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].remove_song(song_index)
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song removed from queue'}, room=request.sid)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

@socketio.on('get_user_queue')
@authenticated_only
def handle_get_user_queue():
    uid = session.get('uid')
    if uid in user_queues:
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
    else:
        emit('updateUserQueue', {'queue': []}, room=request.sid)

@socketio.on('vote_to_skip')
@authenticated_only
def handle_vote_to_skip():
    uid = session.get('uid')
    if uid not in skip_votes:
        skip_votes[uid] = True
        active_users = len(user_queues)
        skip_threshold = max(2, active_users // 2 + 1)  #Ensures that at least 50% of users must vote to skip

        emit('vote_count', {'votes': len(skip_votes), 'threshold': skip_threshold}, broadcast=True)

        if len(skip_votes) >= skip_threshold:
            play_next_song()
            skip_votes.clear()
            emit('message', {'action': 'skipSong'}, broadcast=True)

@socketio.on('isPlaying')
@authenticated_only
def handle_is_playing(data):
    global isPlaying
    isPlaying = data.get('isPlaying')
    if not isPlaying:
        play_next_song()

@socketio.on('get_next_song')
@authenticated_only
def handle_get_next_song():
    play_next_song()

@socketio.on('get_current_song')
@authenticated_only
def handle_get_current_song():
    uid = session.get('uid')
    if currentPlayingSong:
        emit('updateCurrentSong', {'currentSong': currentPlayingSong}, room=request.sid)
    else:
        emit('updateCurrentSong', {'currentSong': None}, room=request.sid)

@socketio.on('clearQueueForUser')
@authenticated_only
def handle_clear_queue_for_user():
    uid = session.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Queue cleared.'}, room=request.sid)
        emit('updateUserQueue', {'queue': []}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

@socketio.on('secondsToMinutes')
@authenticated_only
def handle_seconds_to_minutes(data):
    formatted_time = formatTime(data.get('seconds'))
    emit('message', {'action': 'formattedTime', 'time': formatted_time}, room=request.sid)

@socketio.on('skipSong')
@authenticated_only
def handle_skip_song():
    play_next_song()

@socketio.on('refreshDisplay')
@authenticated_only
def handle_refresh_display():
    emit('reloadPage', room=request.sid)

@socketio.on('get_cat_colors')
@authenticated_only
def handle_get_cat_colors():
    colors = get_cat_colors()
    emit('message', {'action': 'cat_colors', 'colors': colors}, room=request.sid)

@socketio.on('change_cat_color')
@authenticated_only
def handle_change_cat_color(color):
    global selected_color
    selected_color = color
    emit('color_changed', {'color': color}, room=request.sid)

@socketio.on('set_volume')
@authenticated_only
def handle_set_volume(data):
    volume = sanitize_volume_input(data['volume'])
    if volume is None:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid volume input.'}, room=request.sid)
        return

    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
        ssh_stdin, ssh_stdout, ssh_stderr = ssh.exec_command(f'amixer set Master {volume}%')
        ssh.close()
        emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': f'Volume set to {volume}%'}, room=request.sid)
    except Exception as e:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Failed to set volume.'}, room=request.sid)

@socketio.on('clearSpecificQueue')
@authenticated_only
def handle_clear_specific_queue(data):
    uid = data.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('updateUserQueue', {'queue': []}, room=request.sid)
        emit('queueUpdated', room=request.sid)

@socketio.on('clearAllQueues')
@authenticated_only
def handle_clear_all_queues():
    for uid in user_queues:
        user_queues[uid].queue = []
    emit('queueUpdated', broadcast=True)

@socketio.on('updateSongBpm')
@authenticated_only
def handle_update_song_bpm(data):
    song_index = data.get('index')
    new_bpm = data.get('bpm')
    uid = session.get('uid')
    if uid in user_queues:
        try:
            new_bpm = int(new_bpm)
            if new_bpm <= 0:
                raise ValueError("BPM must be a positive integer.")
        except ValueError as e:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': str(e)}, room=request.sid)
            return
        
        user_queue = user_queues[uid]
        if 0 <= song_index < len(user_queue.queue):
            user_queue.queue[song_index].bpm = new_bpm
            emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'Song BPM updated.'}, room=request.sid)
            emit('updateUserQueue', {'queue': user_queue.get_queue()}, room=request.sid)
        else:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid song index.'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'User not authenticated or queue not found.'}, room=request.sid)

@socketio.on('reorderQueue')
@authenticated_only
def handle_reorder_queue(data):
    old_index = data.get('oldIndex')
    new_index = data.get('newIndex')
    uid = session.get('uid')

    if uid in user_queues and old_index is not None and new_index is not None:
        user_queues[uid].reorder_queue(old_index, new_index)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('getQueueUserCount')
@authenticated_only
def handle_get_queue_user_count():
    queue_count = len(user_queues)
    user_count = len(set(user_queues.keys()))
    emit('queueUserCount', {'queues': queue_count, 'users': user_count}, room=request.sid)

@socketio.on('set_song_length_limit')
@authenticated_only
def handle_set_song_length_limit(data):
    global song_length_limit
    song_length_limit = data['length']
    emit('song_length_limit_set', {'length': song_length_limit}, room=request.sid)

@socketio.on('addYoutubeLinkToQueue')
@authenticated_only
def handle_add_youtube_link_to_queue(data):
    youtube_link = data.get('youtube_link')
    youtube_bpm = data.get('bpm')
    uid = session.get('uid')
    if youtube_link and uid:
        if not is_valid_youtube_link(youtube_link):
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid YouTube link format.'}, room=request.sid)
            return
        try:
            if youtube_bpm is not None:
                try:
                    youtube_bpm = int(youtube_bpm)
                    if youtube_bpm < 1:
                        raise ValueError("BPM must be at least 1.")
                except ValueError as e:
                    emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': str(e)}, room=request.sid)
                    return
            track_data = parse_youtube_link(youtube_link, emit, request.sid)
            if track_data:
                track_data['bpm'] = youtube_bpm if youtube_bpm else '90'  # Default to 90 if no BPM is provided
                add_song_to_user_queue(uid, track_data)
                emit('message', {'action': 'spawnMessage', 'color': 'green', 'message': 'YouTube link added to queue'}, room=request.sid)
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
                check_and_play_next_song()
        except Exception as e:
            emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': f'Failed to process YouTube link: {str(e)}'}, room=request.sid)
    else:
        emit('message', {'action': 'spawnMessage', 'color': 'red', 'message': 'Invalid YouTube link or user not authenticated.'}, room=request.sid)

# Helper functions

def add_song_to_user_queue(uid, song):
    if uid not in user_queues:
        user_queues[uid] = UserQueue(uid)
    if uid not in user_order:
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
    emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

def get_next_user():
    if user_order:
        user_order.append(user_order.pop(0))
        return user_order[0]
    return None

def check_and_play_next_song():
    global isPlaying
    if not isPlaying:
        play_next_song()

def play_next_song():
    global isPlaying, currentPlayingSong
    next_user = get_next_user()
    if next_user and next_user in user_queues:
        user_queue = user_queues[next_user]
        if user_queue.queue:
            next_song = user_queue.remove_song()
            currentPlayingSong = next_song.to_dict()  # Store the current playing song
            emit('message', {'action': 'next_song', 'nextSong': currentPlayingSong}, broadcast=True)
            emit('updateCurrentSong', {'currentSong': currentPlayingSong}, broadcast=True)  # Broadcast the current song to all clients
            isPlaying = True
        else:
            currentPlayingSong = None
            emit('message', {'action': 'queue_empty'}, room=request.sid)
            isPlaying = False
    else:
        currentPlayingSong = None
        emit('message', {'action': 'queue_empty'}, room=request.sid)
        isPlaying = False

def get_cat_colors():
    base_path = os.path.join('app', 'static', 'img', 'cats')
    if not os.path.exists(base_path):
        return []
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    return dirs

def sanitize_volume_input(volume):
    try:
        volume = int(volume)
        if 0 <= volume <= 100:
            return volume
        else:
            return None
    except ValueError:
        return None

def is_valid_youtube_link(link):
    regex = re.compile(r'^(https?://)?(www\.)?(youtube\.com|youtu\.?be)/(watch\?v=|embed/|v/|.+\?v=|.+&v=|playlist\?list=|.*list=)([a-zA-Z0-9_-]{11}|[a-zA-Z0-9_-]+)')
    return bool(regex.match(link))

def parse_youtube_link(youtube_link, emit_func, sid):
    try:
        response = requests.get(youtube_link)
        if response.status_code != 200:
            return None
        soup = BeautifulSoup(response.text, 'html.parser')

        title_tag = soup.find('meta', {'name': 'title'})
        track_name = title_tag['content'] if title_tag else 'YouTube Video'
        channel_tag = soup.find('link', {'itemprop': 'name'})
        artist_name = channel_tag['content'] if channel_tag else 'Unknown Artist'
        duration_tag = soup.find('meta', {'itemprop': 'duration'})
        track_length = parse_duration(duration_tag['content']) if duration_tag else 'Unknown'

        video_id = youtube_link.split('v=')[1].split('&')[0]

        track_data = {
            'track_name': track_name,
            'artist_name': artist_name,
            'track_length': track_length,
            'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
            'track_id': video_id,
            'uri': youtube_link,
            'bpm': 'Unknown',
            'source': 'youtube'
        }

        return track_data
    except Exception as e:
        return None

def get_youtube_playlist_tracks(link):
    try:
        response = requests.get(link)
        soup = BeautifulSoup(response.text, 'html.parser')
        scripts = soup.find_all('script')

        tracks = []
        for script in scripts:
            if 'ytInitialData' in script.text:
                initial_data = script.string
                break
        else:
            raise ValueError("ytInitialData not found in page scripts")

        playlist_info = re.search(r'ytInitialData\s*=\s*(\{.*?\});', initial_data)
        if not playlist_info:
            raise ValueError("Playlist info not found in ytInitialData")

        playlist_json = json.loads(playlist_info.group(1))
        playlist_items = playlist_json['contents']['twoColumnBrowseResultsRenderer']['tabs'][0]['tabRenderer']['content']['sectionListRenderer']['contents'][0]['itemSectionRenderer']['contents'][0]['playlistVideoListRenderer']['contents']

        for item in playlist_items:
            video_info = item.get('playlistVideoRenderer', {})
            video_id = video_info.get('videoId')
            track_name = video_info.get('title', {}).get('runs', [{}])[0].get('text', 'Unknown Title')
            artist_name = video_info.get('shortBylineText', {}).get('runs', [{}])[0].get('text', 'Unknown Artist')
            duration_text = video_info.get('lengthText', {}).get('simpleText', '0:00')
            track_length = parse_duration_in_seconds(duration_text)

            tracks.append({
                'track_name': track_name,
                'artist_name': artist_name,
                'track_length': track_length,
                'cover_url': f'https://img.youtube.com/vi/{video_id}/0.jpg',
                'track_id': video_id,
                'uri': f'https://www.youtube.com/watch?v={video_id}',
                'bpm': 'Unknown',
                'source': 'youtube'
            })

        return tracks

    except Exception as e:
        return []

def parse_duration(duration_str):
    match = re.match(r'PT(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        minutes = int(match.group(1)) if match.group(1) else 0
        seconds = int(match.group(2)) if match.group(2) else 0
        return f"{minutes}:{seconds:02d}"
    return 'Unknown'

def parse_duration_in_seconds(duration_str):
    match = re.match(r'(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2)) if match.group(2) else 0
        seconds = int(match.group(3)) if match.group(3) else 0
        return hours * 3600 + minutes * 60 + seconds
    return 0
