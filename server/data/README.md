# MusicOnline Database

`database.json` **is the project database**. It is committed to git on purpose,
so anyone who `git pull`s gets the same songs, playlists and artists.

## How to add a song

1. Put files in the project (these get pushed to GitHub too):

   ```
   public/covers/after-hours.jpg     ← cover image
   public/audio/blinding-lights.mp3  ← song file
   ```

2. Add an entry to `database.json` → `songs`:

   ```json
   {
     "id": "t13",
     "title": "My Song",
     "artist": "Some Artist",
     "album": "Some Album",
     "duration": 210,
     "gradient": "from-emerald-500 to-teal-700",
     "emoji": "🎵",
     "explicit": false,
     "coverUrl": "/covers/after-hours.jpg",
     "audioUrl": "/audio/blinding-lights.mp3"
   }
   ```

   > `coverUrl` / `audioUrl` are paths under `public/` (starting with `/covers/` or `/audio/`).
   > Leave them `null` to show the emoji gradient placeholder instead.

3. To put it in a playlist, add its `id` to that playlist's `trackIds` array.

4. Restart the server (`npm run server`) and refresh the app.

## API endpoints (read-only)

| Endpoint | Returns |
|---|---|
| `GET /api/songs` | all songs |
| `GET /api/songs/:id` | one song |
| `GET /api/playlists` | playlists with `tracks` resolved from `trackIds` |
| `GET /api/playlists/:id` | one playlist with tracks |
| `GET /api/artists` | all artists |
| `GET /api/health` | counts + status |

## Why JSON instead of a real DB?

- Trivially shared through GitHub — no server to set up for your friend.
- Perfect for a small team / school project.
- Later you can swap to SQLite, Supabase, etc. — the Angular code only talks to
  the HTTP API, so the frontend won't need to change.
