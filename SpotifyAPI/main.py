
import os, sys
import base64
from dotenv import load_dotenv
from requests import post, get
import json
import typing
from track_wrapper import *

load_dotenv()  # this should bring the environment variable 

cli_id = os.getenv("CLIENT_ID") # check the variable names in the .env file :D
cli_secret = os.getenv("CLIENT_SECRET") # this just checks the .env file for these 


search_var: str
search_len: int

try:
    search_var = sys.argv[1]
except:
    search_var = "bts" # default search

try:
    search_len = int(sys.argv[2])
except:
    search_len = 3  # default search length


SONG_QUEUE = []


def add_song(song: TrackWrapper):
    """adds a song to queue"""
    SONG_QUEUE.append(song)


def remove_song(queue_pos=0):
    """removes the song at 'queue_pos' in the queue, the playing song is index 0"""
    SONG_QUEUE.pop(queue_pos)

def get_song_queue():
    return SONG_QUEUE

def get_token():
        
    auth_string = cli_id + ":" + cli_secret
    auth_bytes = auth_string.encode("utf-8")
    auth_base64 = str(base64.b64encode(auth_bytes), "utf-8")

    url = "https://accounts.spotify.com/api/token"
    headers = {
        "Authorization": "Basic " + auth_base64,
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}
    result = post(url, headers=headers, data=data)
    json_result = json.loads(result.content)
    token = json_result["access_token"]

    #pusay made an appearance here. pusay is graciously giving you a token. say thank you.
    return token


def get_auth_header(token):
    return {"Authorization": "Bearer " + token}


def search_for_tracks(
        token: str,
        track_name: str,
        search_limit=3
        ) -> typing.Collection:
    """
    returns an array of length 'search_limit' of track objects wrapped in Track
    """

    print(f"Searching for {track_name}")
    url = "https://api.spotify.com/v1/search"
    headers = get_auth_header(token)
    query = f"q={track_name}&type=track&limit={search_limit}"

    query_url = url + "?" + query

    result = get(query_url, headers=headers)
    json_result = json.loads(result.content)["tracks"]["items"]  # an array of all the TrackObject results
    
    if len(json_result) == 0:
        print("No track with this name exists, so sorry.")
        return None
    
    array = []

    for TrackObject in json_result:
        array.append(TrackWrapper(TrackObject))
   
    return array


# get a token for api calls
token = get_token()

result = search_for_tracks(token, search_var, search_len)

for i, value in enumerate(result):
    add_song(value)