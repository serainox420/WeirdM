# WeirdM (local ffmpeg edition)

WeirdM is a single-page tool for creating "weird" WebM files whose resolution changes while they play. This fork keeps
all processing on your own machine by relying on your local `ffmpeg` and `ffprobe` binaries instead of the
in-browser wasm build.

## Requirements

- PHP 8.1+ with the GD extension (PNG support is required).
- `ffmpeg` and `ffprobe` available on your `PATH` (VP9 encoder recommended for best results).
- A modern browser (Chrome, Firefox, Edge, or Safari).

## Running locally

```bash
php -S localhost:2137
```

Then open <http://localhost:2137> in your browser. The interface runs entirely client-side and posts jobs to
`process.php`, which shells out to `ffmpeg` using the settings you choose.

### Handling large uploads

The bundled `.user.ini` raises PHP's `upload_max_filesize` and `post_max_size` to 256&nbsp;MB so you can work with
longer source videos. If your installation uses a different configuration file, adjust those directives there and
restart the PHP server. WeirdM will warn you in the browser if a chosen file exceeds the PHP upload limit.

## Features

- **Bounce, random, timeline, and trim** animation modes with the same advanced controls as the browser-only version.
- **Keyframe editor** for timeline mode with easing support and automatic ordering.
- **Smart trim** that removes static or transparent borders on every frame before encoding.
- **Output control** over CRF, optional FPS override, and audio passthrough.
- **Quick start panel** for choosing a source video right from the top of the page.

## Usage

1. Launch the PHP server as shown above and open the app in your browser.
2. Choose a source video using the "Quick start" panel.
3. Pick an animation mode and tweak the parameters. Timeline mode lets you add or remove keyframes freely.
4. Adjust the output settings (CRF, FPS override, audio) if needed.
5. Click **Create WebM**. The browser uploads the file to `process.php`, which invokes your local `ffmpeg` build. When the
   job completes the WebM downloads automatically.

All temporary files are stored in your system temporary directory and cleaned up after each render.
