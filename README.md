# CatJam

An online jukebox application for creating a shared/collaborative music queue.
Made with Flask, Python, and HTML/CSS/JS.

Developed by Charlotte George, Matt Marafino, Saavan Tandon, and Jinna Smail as part of the CSHacks and Opcommathon hackathons.

Available at [catjam.csh.rit.edu](catjam.csh.rit.edu).

## Features
- Search for songs + add songs and playlists to a personal queue
- Round-robin queue system
- Manage queues in admin panel
- Spotify API and YouTube API integration
- Updates queue in real time for users

## Installation

In your terminal, clone into the repo, set up your virtual environment, and then run `pip install -r requirements.txt`.
Make a new .env file that looks like this:

```
DEBUG=False
SECRET_KEY=""
CLIENT_ID=""
CLIENT_SECRET=""
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""
SSH_HOST=""
SSH_USER=""
SSH_PASSWORD=::
```

Reach out to an RTP to get OIDC credentials to enable CSH authentication, and either an RTP or a CatJam admin to get SSH creds for the PI hosting the display.

Replace the `CLIENT_ID` and `CLIENT_SECRET` values with your Spotify client ID and secret.

`SECRET_KEY` is just a Flask secret key.

To get your client ID and secret, head to https://developer.spotify.com/dashboard and make a new app. When you're done, go to Settings to find your ID and secret.
**Note: You MUST have a Spotify Premium account to access certain parts of the API that are used here. The current version of catjam uses my client ID + secret as a temporary measure.**


## Usage

To run the server locally, activate your virtual environment, and run `flask run`.

The terminal will spit out a link to a local server that runs the website locally.
