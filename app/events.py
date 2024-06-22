import json
import os
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit, disconnect
from app import socketio
from app.models import Song, UserQueue
from app.utils.main import get_token, search_for_tracks, get_spotify_playlist_tracks
from app.utils.track_wrapper import TrackWrapper, formatTime
from .util import csh_user_auth, decode_token
from flask import session, request, current_app
import paramiko
import re
from bs4 import BeautifulSoup
import requests
import datetime
import time
import threading

load_dotenv()
token = get_token()
isPlaying = False
SSH_HOST = os.getenv('SSH_HOST')
SSH_USER = os.getenv('SSH_USER')
SSH_PASSWORD = os.getenv('SSH_PASSWORD')

#store queues in memory
user_queues = {} #to store user queues
user_order = [] #to store the order of users in the queue

skip_votes = {}

MAX_SONG_LENGTH = 10 * 60  # 10 minutes

QUIET_HOURS = {
    "Sunday": (23, 7),     # 11 PM to 7 AM
    "Monday": (23, 7),
    "Tuesday": (23, 7),
    "Wednesday": (23, 7),
    "Thursday": (23, 7),
    "Friday": (1, 7),      # 1 AM to 7 AM
    "Saturday": (1, 7)
}

EXAM_WEEKS = { # Exam weeks for the next few years
    #ok surely there's a better way to do this but I'm too lazy to figure it out
    2024: [(datetime.date(2024, 12, 11), datetime.date(2024, 12, 18)),
           (datetime.date(2025, 4, 30), datetime.date(2025, 5, 7)),
           (datetime.date(2025, 8, 8), datetime.date(2025, 8, 12))],
    2025: [(datetime.date(2025, 12, 10), datetime.date(2025, 12, 17)),
           (datetime.date(2026, 4, 29), datetime.date(2026, 5, 6)),
           (datetime.date(2026, 8, 7), datetime.date(2026, 8, 11))],
    2026: [(datetime.date(2026, 12, 9), datetime.date(2026, 12, 16)),
           (datetime.date(2027, 4, 28), datetime.date(2027, 5, 5)),
           (datetime.date(2027, 8, 6), datetime.date(2027, 8, 10))]
}


@socketio.on('connect')
def handle_connect():
    token = request.args.get('token')
    if not token or not validate_token(token):
        disconnect()
        return False
    emit('message', {'message': 'Connected to server'})

def validate_token(token):
    user_id = decode_token(token)
    if user_id:
        session['user_id'] = user_id
        return True
    return False

@socketio.on('disconnect')
def handle_disconnect():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        del user_queues[uid]
        if uid in user_order:
            user_order.remove(uid)

@socketio.on('searchTracks')
def handle_search_tracks(data):
    track_name = data.get('track_name')
    source = data.get('source', 'spotify')  # Default to 'spotify' if not provided
    try:
        result_array = search_for_tracks(token, track_name, 5)
        search_results = [track.to_dict(source=source) for track in result_array]
        emit('message', {'action': 'searchResults', 'results': search_results})
    except Exception as e:
        emit('message', {'action': 'error', 'error': str(e)})

@socketio.on('addSongToQueue')
def handle_add_song_to_queue(data):
    track = data.get('track')
    uid = session.get('uid') or session.get('preferred_username')
    if track:
        track_length = track.get('track_length')
        if track_length:
            try:
                track_length = int(track_length)  # Convert track_length to integer
            except ValueError:
                emit('error', {'message': 'Invalid track length'})
                return
            
            if track_length > MAX_SONG_LENGTH:
                emit('error', {'message': f'Track length {track_length} exceeds maximum allowed length {MAX_SONG_LENGTH}'})
                return

            # Ensure 'source' key is present
            track['source'] = data.get('source', 'spotify')  # Default to 'spotify' if not provided
            
            add_song_to_user_queue(uid, track)
            emit('songAdded', {'message': 'Song added to queue', 'track': track})

            # Emit an event to update the user queue
            if uid in user_queues:
                emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)
        else:
            emit('error', {'message': 'Track length not provided'})
    else:
        emit('error', {'message': 'Track data not provided'})

@socketio.on('addPlaylistToQueue')
def handle_add_playlist_to_queue(data):
    link = data.get('link')
    source = data.get('source')
    uid = session.get('uid') or session.get('preferred_username')
    
    if source == 'spotify':
        tracks = get_spotify_playlist_tracks(link)
    elif source == 'youtube':
        tracks = get_youtube_playlist_tracks(link)
    else:
        tracks = []

    for track in tracks:
        add_song_to_user_queue(uid, track)

    emit('queueUpdated', broadcast=True)
    check_and_play_next_song()


@socketio.on('removeSongFromQueue')
def handle_remove_song_from_queue(data):
    song_index = data.get('index')
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        user_queues[uid].remove_song(song_index)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('get_user_queue')
def handle_get_user_queue():
    uid = session.get('uid') or session.get('preferred_username')
    if uid in user_queues:
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()})
    else:
        emit('updateUserQueue', {'queue': []})

@socketio.on('vote_to_skip')
def handle_vote_to_skip():
    uid = session.get('uid') or session.get('preferred_username')
    if uid not in skip_votes:
        skip_votes[uid] = True
        active_users = len(user_queues)
        skip_threshold = active_users // 2 + 1  # Majority vote required to skip

        if len(skip_votes) >= skip_threshold:
            play_next_song()
            skip_votes.clear()
            emit('message', {'action': 'skipSong'}, broadcast=True)
        else:
            emit('vote_count', {'votes': len(skip_votes), 'threshold': skip_threshold}, broadcast=True)

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
        emit('updateUserQueue', {'queue': []}, room=request.sid)
        emit('queueUpdated', broadcast=True)

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

def is_exam_week():
    current_date = datetime.datetime.now().date()
    current_year = current_date.year
    for start_date, end_date in EXAM_WEEKS.get(current_year, []):
        if start_date <= current_date <= end_date:
            return True
    return False

def is_quiet_hours():
    if is_exam_week():
        return True

    current_day = datetime.datetime.now().strftime("%A")
    current_hour = datetime.datetime.now().hour
    start, end = QUIET_HOURS[current_day]

    if start < end:
        return start <= current_hour < end
    else:
        return current_hour >= start or current_hour < end

def set_quiet_hours_volume():
    if is_quiet_hours():
        handle_set_volume({'volume': 60})  #this is a placeholder value
        #TODO: limit max volume during quiet hours

def check_quiet_hours():
    while True:
        set_quiet_hours_volume()
        time.sleep(3600)  # Check every hour

@socketio.on('set_volume')
def handle_set_volume(data):
    volume = sanitize_volume_input(data['volume'])
    if volume is None:
        emit('error', {'message': 'Invalid volume input.'})
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

def sanitize_volume_input(volume):
    try:
        volume = int(volume)
        if 0 <= volume <= 100:
            return volume
        else:
            return None
    except ValueError:
        return None

def add_song_to_user_queue(uid, song):
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

@socketio.on('clearSpecificQueue')
def handle_clear_specific_queue(data):
    uid = data.get('uid')
    if uid in user_queues:
        user_queues[uid].queue = []
        emit('updateUserQueue', {'queue': []}, room=request.sid)
        emit('queueUpdated', broadcast=True)

@socketio.on('clearAllQueues')
def handle_clear_all_queues():
    for uid in user_queues:
        user_queues[uid].queue = []
    emit('queueUpdated', broadcast=True)

@socketio.on('reorderQueue')
def handle_reorder_queue(data):
    old_index = data.get('oldIndex')
    new_index = data.get('newIndex')
    uid = session.get('uid') or session.get('preferred_username')

    if uid in user_queues and old_index is not None and new_index is not None:
        user_queues[uid].reorder_queue(old_index, new_index)
        emit('updateUserQueue', {'queue': user_queues[uid].get_queue()}, room=request.sid)

@socketio.on('getQueueUserCount')
def handle_get_queue_user_count():
    queue_count = len(user_queues)
    user_count = len(set(user_queues.keys()))
    emit('queueUserCount', {'queues': queue_count, 'users': user_count})

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
            video_info = item['playlistVideoRenderer']
            video_id = video_info['videoId']
            track_name = video_info['title']['simpleText']
            artist_name = video_info['shortBylineText']['runs'][0]['text']
            duration_text = video_info['lengthText']['simpleText']
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
        print(f"Error parsing YouTube playlist link: {e}")
        return []
    
def parse_duration(duration_str):
    match = re.match(r'PT(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        minutes = int(match.group(1)) if match.group(1) else 0
        seconds = int(match.group(2)) if match.group(2) else 0
        return f"{minutes}:{seconds:02d}"
    return 'Unknown'

def parse_duration_in_seconds(duration_str):
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
    if match:
        hours = int(match.group(1)) if match.group(1) else 0
        minutes = int(match.group(2)) if match.group(2) else 0
        seconds = int(match.group(3)) if match.group(3) else 0
        return hours * 3600 + minutes * 60 + seconds
    return 0
