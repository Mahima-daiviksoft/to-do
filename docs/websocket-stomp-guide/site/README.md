# Interactive edition

`websocket-stomp-book.html` is the interactive, single-page edition of the book: chapter-at-a-time reading with
progress tracking, full-text search, light/dark themes, a hands-on Lab (handshake calculator, frame inspector,
STOMP frame builder, heart-beat negotiator, close-code explorer, Spring message-flow animation, reconnect-storm
simulator) and interview flashcards generated from Chapter 12.

It's built from the Markdown chapters:

```bash
cd docs/websocket-stomp-guide/site
npm install
npm run build        # regenerates websocket-stomp-book.html
```

The output is page content meant to be published as a claude.ai Artifact (the host adds the `<html>`/`<head>` wrapper).
