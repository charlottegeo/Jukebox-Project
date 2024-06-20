#app/utils/track_wrapper.py
"""
author: matt marafino(?)
"""

import math
import requests
import app.utils.main as SpotifyAPI
def formatTime(time_seconds: int) -> str:
    """returns the time in seconds in the format minutes:seconds"""
    timeString = ""
    minutes = str(math.floor(time_seconds / 60))
    seconds = str(math.floor(time_seconds % 60))
    if len(minutes) < 2:
        minutes = "0" + minutes
    if len(seconds) < 2:
        seconds = "0" + seconds
    return f"{minutes}:{seconds}"
        

class TrackWrapper:
    """
    wrapper class for getting important stuff from the TrackObject jargain; ~~might not be necessary?
    """
    TrackObject = {}


    def __new__(cls, *args, **kwargs):
        return super().__new__(cls)


    def __init__(self, TrackObject: dict):
        self.TrackObject = TrackObject

    
    def getTrackName(self) -> str:
        """
        returns the string name of the track
        """
        return self.TrackObject['name']
    

    def getArtistNames(self) -> str:
        """
        gets the names of the artist(s) as a string, separated by ', ' if there are more than one
        """
        artists = self.TrackObject['artists']

        final_string = artists[0]['name']  #first artist name in the list


        if len(artists) > 1:
            #if there is more than one artist, add them to the final string
            for i in range(1, len(artists)):
                final_string = final_string + ", " + artists[i]['name']

        return final_string

        
    def getAlbumCoverURL(self) -> str:
        """
        return the URL of the first album cover image
        """
        return self.TrackObject['album']['images'][0]['url'] # the first image url
    

    def getTrackLength(self) -> float:
        """returns the amount of seconds in the song"""
        return self.TrackObject['duration_ms'] / 1000
    
    
    def getFormattedTrackLength(self) -> str:
        """returns the length of the track as a string in the form minutes:seconds"""
        return formatTime(self.getTrackLength())
    

    def getTrackID(self) -> str:
        """returns the spotify ID for the song."""
        return self.TrackObject.get('id', 'unknown_id')
    

    def getURI(self) -> str:
        """returns the URI for a media playing i think?"""
        return self.TrackObject['uri']
    
    def get_audio_features(self, token):
        """Returns the audio features for the song."""
        track_id = self.getTrackID()
        if track_id == 'unknown_id':
            print('Track ID is unknown')
            return None
        try:
            headers = {'Authorization': 'Bearer ' + token}
            url = f'https://api.spotify.com/v1/audio-features/{track_id}'
            response = requests.get(url, headers=headers)
            print(f"Request URL: {url}")
            print(f"Headers: {headers}")
            print(f"Response Status Code: {response.status_code}")
            if response.status_code == 200:
                audio_features = response.json()
                print('Audio features:', audio_features)
                return audio_features
            else:
                print('Error getting audio features:', response.json())
                return None
        except requests.RequestException as e:
            print('Request failed:', e)
            return None

    

    def getBPM(self, token) -> int:
        """returns the BPM of the song"""
        audio_features = self.get_audio_features(token)
        if audio_features is not None:
            return int(audio_features['tempo'])
        else:
            return 95
    
    def to_dict(self):
        return {
            'track_name': self.getTrackName(),
            'artist_name': self.getArtistNames(),
            'cover_url': self.getAlbumCoverURL(),
            'track_length': self.getFormattedTrackLength(),
            'track_id': self.getTrackID(),
            'uri': self.getURI(),
            'bpm': self.getBPM(token=SpotifyAPI.get_token()),
        }