# hashcards-docker

A Docker image for running [hashcards] on a home server.

![example](.github/readme-video.avif)

Hashcards is a command-line tool that serves a web interface for drilling
flashcards. It works great for studying on your computer, but my goal is to be
able to quickly open it on my phone on the go (e.g., during a commute).

Since hashcards starts a web server, you can run it on a home server and access
it remotely. However, it is not really designed to run 24/7. It exits after each
session.

This is where this project comes in. Instead of running hashcards all the time,
it runs a minimal landing page with a "Start" button that launches hashcards on
demand. When the session ends and hashcards exits, the landing page is back,
ready for next time.

## Usage

For example with docker compose:

```yaml
# compose.yml
services:
  hashcards:
    image: ghcr.io/bastian/hashcards-docker:latest
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/cards:/data
    # environment:
    #   - HASHCARDS_ARGS=--card-limit 50 --from-deck Japanese
    restart: unless-stopped
```

Then:

```sh
docker compose up -d
```

## Configuration

Optional environment variables:

| Variable         | Default | Description                                      |
| ---------------- | ------- | ------------------------------------------------ |
| `HASHCARDS_ARGS` |         | Extra arguments passed to `hashcards drill`      |
| `PORT`           | `3000`  | Port for the web server                          |
| `COLLECTION_DIR` | `/data` | Path to the card collection inside the container |

## License

MIT

[hashcards]: https://github.com/eudoxia0/hashcards
