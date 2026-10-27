# Run and deploy

Run `python -m marketsim.server` from the project root and open http://localhost:8000. Python 3.11+ is sufficient. The frontend and API share an origin. This is not a static GitHub Pages application; a Python process is required for simulation controls.

For a container: `docker build -t marketsim .`, followed by `docker run --rm -p 8000:8000 marketsim`. The image runs as a non-root user. Set PORT to the host-assigned port when required.

For public hosting, use a container-capable platform and terminate TLS at a reverse proxy. Enforce request-rate, concurrency, body-size and timeout limits at that proxy. The reference API has a 100 KB body limit, 15-second connection timeout and a four-computation semaphore, but its standard-library HTTP server is not a replacement for a hardened public application server. Establish monitoring and load tests before unrestricted traffic. No deployment was performed in this session.

The API contains only synthetic or manual simulated instructions. There are no credentials or brokerage integrations. No private data should be served from the web directory. Experiment records are held in browser-session memory and should be exported before navigating away or refreshing.

CI runs the regression suite on pushes and pull requests. The measured benchmark artifact is bundled; rerunning `python -m marketsim.benchmark` replaces it with measurements from your host. Docker build and hosted deployment require verification in the target environment.
