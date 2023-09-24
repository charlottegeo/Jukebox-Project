"""
handles all of the requests to the spotify API
"""


import os
import base64
from dotenv import load_dotenv
from requests import post, get
import json

load_dotenv()  # this should bring the environment variable 

cli_id = os.getenv("CLIENT_ID") # check the variable names in the .env file :D
cli_secret = os.getenv("CLIENT_SECRET") # this just checks the .env file for these 

def get_token():
    """
    returns a temporary access token we can give to api calls
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
    return token


def get_auth_header(token):
    return {"Authorization": "Bearer " + token}


# def search_for_artist(token, artist_name):
    
#     #returns the first artist found by searching artist_name
    
#     url = "https://api.spotify.com/v1/search"
#     headers = get_auth_header(token)
#     query = f"q={artist_name}&type=artist&limit=1"

#     query_url = url + "?" + query

#     result = get(query_url, headers=headers)
#     json_result = json.loads(result.content)["artists"]["items"]
    
#     if len(json_result) == 0:
#         print("No artist with this name exists, so sorry.")
#         return None
   
#     return json_result[0]


 
def search_for_tracks(token, track_name):
    url = "https://api.spotify.com/v1/search"
    headers = get_auth_header(token)
    query = f"q={track_name}&type=track&limit=1"

    query_url = url + "?" + query

    result = get(query_url, headers=headers)
    json_result = json.loads(result.content)["tracks"]["items"][0]
    
    if len(json_result) == 0:
        print("No track with this name exists, so sorry.")
        return None
   
    return json_result[0]


token = get_token()

print(search_for_tracks(token, 'baby shark'))
