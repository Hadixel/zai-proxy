# zai-proxy

OpenAI- and Anthropic-compatible local API proxy for **chat.z.ai** — run Z.AI's GLM
models (`glm-5.3`, `glm-5.2`, `GLM-5-Turbo`, `glm-4.7`, …) through any OpenAI client,
coding agent, or router.

Built on [jubinjacob03/glm-proxy](https://github.com/jubinjacob03/glm-proxy) with
local fixes:

- **socks5 support in the upstream dialer** — `HTTPS_PROXY`/`ALL_PROXY` may now be a
  `socks5://` URL for the chat.z.ai connection (previously only HTTP CONNECT worked)
- **`ALIYUN_PROXY` (optional)** — Aliyun's captcha endpoints are behind a regional WAF
  that blocks some ISP ranges. If captcha generation fails from your IP, point only the
  captcha hop at a proxy without tunneling your chat traffic. Leave it unset and
  everything goes direct.
- **retry-once on connection errors** — idle pooled connections dying behind a local
  socks proxy surface as `EOF` on first write; one retry turns the flake into latency

## How it works

```
your client ──► zai-proxy ──► chat.z.ai  (GLM models)
                  │
                  └──► aliyun captcha (one verification per request)
```

The proxy translates OpenAI/Anthropic requests to Z.AI's web-chat backend, runs one
Aliyun captcha verification per completion, and streams the answer back in
OpenAI (or Anthropic) format. Tool calling works (`--agent-mode`).

Two credential layers — keep them straight:

| Env var | What it is | Who uses it |
|---|---|---|
| `ZAI_TOKEN` | your **chat.z.ai account JWT** (browser → F12 → Application → Local Storage → `token`) | the proxy, server-side. Unlocks all models incl. vision; without it the proxy runs as a guest (`glm-4.7`/`x-preview-l` only) |
| `AUTH_TOKEN` | any string **you invent** | your clients send it as `Authorization: Bearer …` |

## Build

Go 1.22+:

```bash
go build -o zai-api .
```

## Run (out of the box)

```bash
AUTH_TOKEN=my-secret-key ./zai-api --agent-mode
```

That's it — listens on `127.0.0.1:3007`, guest models work immediately.

With your account token:

```bash
ZAI_TOKEN="eyJ…" AUTH_TOKEN=my-secret-key ./zai-api --agent-mode
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3007` | listen port |
| `HOST` | all interfaces | set `127.0.0.1` for local-only |
| `AUTH_TOKEN` | built-in dev key | client-side bearer; **set your own** |
| `ZAI_TOKEN` | unset (guest) | your chat.z.ai account JWT |
| `AGENT_MODE` | on with `--agent-mode` | tool-calling translation |
| `LOG_LEVEL` | `info` | `debug` for request dumps |
| `HTTPS_PROXY` / `ALL_PROXY` | unset | **optional** — tunnel chat.z.ai traffic (http or socks5) |
| `ALIYUN_PROXY` | unset | **optional** — tunnel only the Aliyun captcha hop (http or socks5) |

**On proxies:** out of the box none are used — direct connections. Set them only if
your network needs them:

- chat.z.ai unreachable/blocked → set `HTTPS_PROXY`
- captcha verification fails with WAF/EOF errors → set `ALIYUN_PROXY`
- both accept `http://`, `https://`, and `socks5://` URLs

## systemd user service (auto-start, survives reboot)

`~/.config/systemd/user/zai-proxy.service`:

```ini
[Unit]
Description=Z.AI GLM OpenAI-compatible proxy
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/zai-proxy
Environment=PORT=3007
Environment=HOST=127.0.0.1
Environment=AUTH_TOKEN=change-me
# Environment=ZAI_TOKEN=eyJ…        # optional: your account token
# Environment=ALIYUN_PROXY=socks5://127.0.0.1:10808
ExecStart=%h/zai-proxy/zai-api --agent-mode
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now zai-proxy
loginctl enable-linger        # keep it running when you log out
```

## Use it

```yaml
base_url: http://localhost:3007/v1
api_key:  <your AUTH_TOKEN>
models:   glm-5.3, glm-5.2, GLM-5-Turbo, GLM-5v-Turbo, glm-4.7, x-preview-l
```

Quick check:

```bash
curl -s http://localhost:3007/v1/chat/completions \
  -H "Authorization: Bearer $AUTH_TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"glm-4.7","messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
```

Anthropic-style clients: `POST /v1/messages` works the same way.

## Keeping the device-token stock topped up

Every completion spends one Aliyun device token, and tokens expire after a few
days — when the stock empties, completions fail with captcha errors. No collector
or farming involved: the tokens come from your own logged-in browser session.

1. Open `https://chat.z.ai`, log in, send one message (loads the captcha SDK).
2. Paste [`feed-tokens.js`](feed-tokens.js) into the browser console (F12).
3. It mints tokens via the same Aliyun SDK the site itself uses and POSTs them
   to `POST /admin/tokens` (Bearer = your `AUTH_TOKEN`). Refresh the tab to stop.
4. Check stock: `curl -s http://localhost:3007/admin/tokens -H "Authorization: Bearer $AUTH_TOKEN"`

The proxy claims newest tokens first, dedupes, and caps the store at 512.

## Notes & risks

- **`AUTH_TOKEN` matters.** Without it (or with the dev default) anyone who can reach
  the port uses your Z.AI account. Bind to `127.0.0.1` and set a strong key.
- This drives the web-chat backend, not an official API. Heavy use can get the
  account or IP flagged by Z.AI — that risk is inherent to this approach.
- Each completion runs one Aliyun captcha verification; the endpoints and the keys in
  `internal/zbridge/config.go` are the same public constants the chat.z.ai frontend
  ships to every browser.
- No device-token farming, no guest-identity pools: one account, one token, normal
  request cadence.
