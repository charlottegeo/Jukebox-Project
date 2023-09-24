import math

def formatTime(time_seconds: int) -> str:
    """returns the time in seconds in the format minutes:seconds"""
    timeString = ""
    minutes = str(math.floor(time_seconds / 60))
    seconds = str(time_seconds % 60)
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
        return formatTime(self
    

    def getTrackID(self) -> str:
        """returns the spotify ID for the song."""
        return self.TrackObject['id']
