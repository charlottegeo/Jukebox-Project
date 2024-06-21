# CatJam

An online jukebox application for creating a shared/collaborative music queue.
Made with Flask, Python, and HTML/CSS/JS.

Developed by Charlotte George, Matt Marafino, Saavan Tandon, and Jinna Smail as part of the CSHacks and Opcommathon hackathons.

Available at [catjam.cs.house](catjam.cs.house).

## Features
- Search for songs + add songs to queue
- Manage queue in admin panel
- Spotify API integration
- Updates queue in real time for users

## Installation

If you would like to run CatJam locally on your machine, first create a new POSTGRES database - if you are a CSH member, you can do this at deadass.csh.rit.edu.
In your terminal, clone into the repo, set up your virtual environment, and then run `pip install -r requirements.txt`.
Make a new .env file that looks like this:

```
DEBUG=False
SECRET_KEY=""
CATJAM_DATABASE_URL = ""
CLIENT_ID=""
CLIENT_SECRET=""
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""
SSH_HOST=""
SSH_USER=""
SSH_PASSWORD=""
```

Replace the `DATABASE_URL` value with `postgres://username:password@host:port/dbname` and replace the values in the link with the settings from your POSTGRES database.
Example: `postgres://catjam:password@postgres.csh.rit.edu:5432/catjam`

Reach out to an RTP to get OIDC credentials to enable CSH authentication, and either an RTP or a CatJam admin to get SSH creds for the PI hosting the display.

Replace the `CLIENT_ID` and `CLIENT_SECRET` values with your Spotify client ID and secret.

To get your client ID and secret, head to https://developer.spotify.com/dashboard and make a new app. When you're done, go to Settings to find your ID and secret.
**Note: You MUST have a Spotify Premium account to access certain parts of the API that are used here. The current version of catjam uses my client ID + secret as a temporary measure.**

The `ADMIN_ID` and `ADMIN_PW` values will be your admin login for the admin panel, which displays and plays the current song and gives access to certain admin commands such as emptying the queue and skipping songs (still a work-in-progress).  

## Usage

To run the server locally, activate your virtual environment, and go to config.py, comment out `OIDC_REDIRECT_URI = "https://catjam.csh.rit.edu/oidc_callback"`, and uncomment `OIDC_REDIRECT_URI = "http://localhost:8080/oidc_callback"`. Then run `flask run`.

The terminal will spit out a link to a local server that runs the website locally.
