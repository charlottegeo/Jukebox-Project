import os, sys
import base64
from dotenv import load_dotenv
from requests import post, get
import json
import typing
from app.utils.track_wrapper import *
from flask import current_app

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
    search_len = 5  # default search length


class SongQueue:
    queue = []

    def __new__(cls, *args, **kwargs):
        return super().__new__(cls)
    
    
    def __init__(self, queue: list):
        self.queue = queue


    def add_song(self, song: TrackWrapper):
        """
        Adds a song to self.queue
        Song - a TrackWrapper object containing song info 
        """
        self.queue.append(song)
    

    def remove_song(self, index = 0):
        """
        Removes the song at index in the queue; The playing song is index 0
        """
        self.queue.pop(index)


def get_token():
    """
    Gets the API token for a Spotify account(Currently uses Charlotte's account)
    """
    cli_id = os.getenv("CLIENT_ID")
    cli_secret = os.getenv("CLIENT_SECRET")
    
    if not cli_id or not cli_secret:
        current_app.logger.error("CLIENT_ID or CLIENT_SECRET not found in environment variables.")
        return None
    
    auth_string = cli_id + ":" + cli_secret
    auth_bytes = auth_string.encode("utf-8")
    auth_base64 = str(base64.b64encode(auth_bytes), "utf-8")

    url = "https://accounts.spotify.com/api/token"
    headers = {
        "Authorization": "Basic " + auth_base64,
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}
    
    try:
        result = post(url, headers=headers, data=data)
        current_app.logger.debug(f"Spotify API request headers: {headers}")
        current_app.logger.debug(f"Spotify API request payload: {data}")
        current_app.logger.debug(f"Spotify API response status code: {result.status_code}")
        current_app.logger.debug(f"Spotify API response body: {result.text}")

        if result.status_code != 200:
            current_app.logger.error(f"Failed to obtain token: {result.status_code}, {result.text}")
            return None
        
        json_result = json.loads(result.content)
        if "access_token" not in json_result:
            current_app.logger.error(f"Response does not contain access_token: {json_result}")
            return None
        
        token = json_result["access_token"]
        #pusay made an appearance here. pusay is graciously giving you a token. say thank you.

        return token

    except Exception as e:
        current_app.logger.error(f"Exception occurred while getting token: {str(e)}")
        return None


def get_auth_header(token):
    return {"Authorization": "Bearer " + token}


def search_for_tracks(
        token: str,
        track_name: str,
        search_limit=5
        ) -> typing.Collection:
    """
    Returns an array of length 'search_limit' of track objects wrapped in TrackWrapper
    """
    try:
        url = "https://api.spotify.com/v1/search"
        headers = get_auth_header(token)
        query = f"q={track_name}&type=track&limit={search_limit}"

        query_url = url + "?" + query

        result = get(query_url, headers=headers)
        json_result = json.loads(result.content)["tracks"]["items"]  # an array of all the TrackObject results
        
        if len(json_result) == 0:
            return None
        
        array = []

        for TrackObject in json_result:
            array.append(TrackWrapper(TrackObject))
    
        return array
    except Exception as e:
        return None
    
def get_spotify_playlist_tracks(link):
    playlist_id = link.split('/')[-1].split('?')[0]
    token = get_token()
    url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks"
    headers = get_auth_header(token)
    response = requests.get(url, headers=headers)
    tracks = response.json().get('items', [])
    return [TrackWrapper(track['track']).to_dict() for track in tracks]
    
def get_song_queue(queue: SongQueue):
    """
    Returns the song queue
    """
    return queue.queue
def main():
    """
    Function to be run when this file is ran as a program. Makes a call to the Spotify API
    and prints out the results, adding the top results to SONG_QUEUE
    """
    QUEUE = SongQueue([])

    # get a token for api calls
    token = get_token()

    result = search_for_tracks(token, search_var, search_len)

    for i, _TrackWrapper in enumerate(result):
        QUEUE.add_song(_TrackWrapper)


if __name__ == "__main__":
    main()