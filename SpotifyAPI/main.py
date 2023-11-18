
import os, sys
import base64
from dotenv import load_dotenv
from requests import post, get
import json
import typing
from SpotifyAPI.track_wrapper import *

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
    Gets the API token for a spotify account(Currently uses Charlotte's account)
    """
        
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
    Returns an array of length 'search_limit' of track objects wrapped in TrackWrapper
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
        print(_TrackWrapper.getTrackName())

    print(QUEUE.queue)


if __name__ == "__main__":
    main()