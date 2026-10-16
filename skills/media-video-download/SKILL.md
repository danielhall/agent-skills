---
name: media-video-download
description: Downloads video or audio from YouTube and other sites with yt-dlp, including choosing format and resolution, merging video and audio, audio-only, subtitles, clips and playlists. Use whenever the user asks to download, grab, save or rip a video or its audio from a URL.
---

# Video download (yt-dlp)

Downloads video or audio from YouTube and around 1,800 other sites.

Only download for the user's own use. Don't help redistribute other people's copyrighted work.

## Defaults

- **Save location:** `~/Movies` for video and `~/Music` for audio, unless the user names another folder. On Linux, use `~/Videos`.
- **Format:** MP4 with H.264 video and AAC audio, unless asked otherwise. QuickTime, Final Cut, Premiere and iOS all play this without converting it. AV1 and VP9 files are much smaller, but QuickTime Player often won't open them.
- **Resolution:** 1080p when none is given.
- **Extras:** embed the metadata, thumbnail and chapters.

## Preflight

```bash
yt-dlp --version             # an old version is the most common cause of YouTube failures
ffmpeg -version | head -1    # must actually run, not just exist
ffprobe -version | head -1   # yt-dlp needs this too, and it's often the one missing
```

Don't check with `which ffmpeg`. It only reports the first match on `PATH`, which may be the wrong binary. On Apple Silicon Macs, a leftover Intel build in `/usr/local/bin` can come before the Homebrew build in `/opt/homebrew/bin`. yt-dlp then downloads everything, fails at the merge step with `bad CPU type in executable` or `ffmpeg not found`, and still exits with status 0. So check the output for `ERROR` rather than trusting the exit code.

On Apple Silicon, pass the right path explicitly:

```bash
yt-dlp --ffmpeg-location /opt/homebrew/bin ...
```

If a merge does fail, the separate video and audio files (`.fNNN`) are left on disk. Combine them with ffmpeg as described in [Merge leftover streams](#merge-leftover-streams), with no need to download again.

Before starting, check what you're about to download:

```bash
yt-dlp --print "%(title)s | %(duration_string)s | %(uploader)s" "URL"
yt-dlp -F "URL"              # every available format
df -h ~/Movies | tail -1     # free space
```

Tell the user the title, length and rough size before starting anything over about 1 GB.

## The main command

```bash
cd ~/Movies && yt-dlp \
  -f "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]" \
  --merge-output-format mp4 \
  --embed-metadata --embed-thumbnail --embed-chapters \
  -o "%(title)s [%(id)s].%(ext)s" \
  --newline \
  "URL"
```

Add `--ffmpeg-location /opt/homebrew/bin` on Apple Silicon Macs.

The format string is a list of fallbacks, tried from left to right:

1. `bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]`: the best H.264 video up to 1080p plus the best M4A audio. This is the most compatible option.
2. `bv*[height<=1080]+ba`: any codec, for sites with no H.264 at that height.
3. `b[height<=1080]`: a single file with video and audio already combined, for sites that don't serve them separately.

Change `1080` to `720`, `1440` or `2160` for other resolutions, or remove the height filter for the best available.

`--newline` prints each progress update on its own line, which keeps logs readable.

The `[%(id)s]` in the file name stops re-uploads with the same title overwriting each other and records where the file came from. Add `--restrict-filenames` if slashes or emoji in titles cause problems.

## Long downloads

Run anything over a few hundred MB in the background, and tell the user the title and expected size rather than waiting.

Don't pipe a background download through `tail` or `head`. That buffers the output, so the log stays empty until the download finishes. To check progress, compare the growing `.part` file with the size from `-F`:

```bash
ls -la ~/Movies/*.part
```

To resume an interrupted download, run the same command again. yt-dlp carries on from the `.part` file.

## Variations

**Audio only (MP3):**

```bash
cd ~/Music && yt-dlp -x --audio-format mp3 --audio-quality 0 \
  --embed-metadata --embed-thumbnail -o "%(title)s.%(ext)s" "URL"
```

Use `--audio-format m4a` to keep YouTube's original AAC audio. It's faster and doesn't lose quality to re-encoding.

**Best quality in any codec:**

```bash
yt-dlp -f "bv*+ba/b" --merge-output-format mkv "URL"
```

MKV holds any combination of codecs. Warn the user that QuickTime may not open it.

**Subtitles:**

```bash
yt-dlp --write-subs --write-auto-subs --sub-langs "en.*" --embed-subs "URL"
```

`--write-auto-subs` includes YouTube's automatic captions. Add `--skip-download` to get only the transcript.

**Part of a video:**

```bash
yt-dlp --download-sections "*00:10:00-00:15:30" "URL"
```

**Playlist or channel:**

```bash
yt-dlp -o "%(playlist)s/%(playlist_index)03d - %(title)s.%(ext)s" "URL"
```

Add `--playlist-items 1-10` for part of a playlist. Add `--download-archive archive.txt` so running it again skips what's already downloaded, which is useful for anything you'll update later.

**Dry run:** `--simulate` works out formats and file names without downloading anything.

## Merge leftover streams

If the merge step failed, combine the separate files without downloading again:

```bash
ffmpeg -i "NAME.f137.mp4" -i "NAME.f140.m4a" -c copy -movflags +faststart "NAME.mp4"
```

`-c copy` joins the streams without re-encoding, so it's quick and loses no quality. `+faststart` moves the index to the start of the file so it can be played before it has fully loaded. Delete the `.fNNN` files once the result plays.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `Requested format is not available` | Run `-F` and pick from the real list. The site may not offer that resolution or codec. |
| HTTP 403, "unable to extract" or signature errors | yt-dlp is out of date. Update it (`brew upgrade yt-dlp` or `pip install -U yt-dlp`). Check this first for any YouTube failure. |
| "Sign in to confirm you're not a bot" | Add `--cookies-from-browser chrome` (or `safari`, `firefox`). Quit the browser first, because Chrome locks its cookie database. |
| `ffmpeg not found` after a full download | ffmpeg is missing or is the wrong architecture. See [Preflight](#preflight), then merge the leftover files instead of downloading again. |
| `bad CPU type in executable` | An Intel binary is being used instead of the Apple Silicon one. Pass `--ffmpeg-location /opt/homebrew/bin`. |
| Merge fails or there's no audio | ffmpeg is too old or ffprobe is missing. Reinstall ffmpeg. |
| Download is very slow | Add `--concurrent-fragments 4`. |
| Age-restricted or private video | Use `--cookies-from-browser` with a browser that's logged in. |
