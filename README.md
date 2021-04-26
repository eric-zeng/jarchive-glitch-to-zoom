# Glitch J-Archive API to Zoom Jeopardy Clues Converter

I have been playing Michael Frederickson's excellent
(Zoom Jeopardy)[http://www.mfrederickson.com/ZoomJeopardy/] game, which has 
amazing visuals and is incredible to play, but only has clues from games
before 2013. I wanted to run games with more up-to-date cultural references, 
so I made this script to get more recent data from J! Archive!

This script fetches Jeopardy clues from J! Archive, using the
(J! Archive JSON API)[https://jarchive-json.glitch.me/], and then converts
the data to a format usable in Zoom Jeopardy.

## Instructions
1. Download this repository
```sh
git clone https://github.com/eric-zeng/jarchive-glitch-to-zoom.git
```

2. Install deps and compile the script
```sh
npm install
npm run build
```

3. Run the script, passing in the Jeopardy season as an argument. This may take
a while to run!
```sh
# Fetches season 36 clues, puts them in a file in this directory.
node gen/main.js -s 36
```

4. In the Zoom Jeopardy folder, replace `assets/data/jarchive_games.json` with the outputted file (i.e. `jeopardy_season_36.json`).

The script will throw out games where the contestants didn't reveal every clue
because they ran out of time (so that all games are complete).