# talktome mediasoup bridge

The optional `mediasoup_bridge` module connects a SIP call handled by baresip
to a talktome conference through talktome's Bridge Plain-RTP API. The app is
the control plane; baresip and the C module are the audio/RTP data plane.

The feature is off by default. Both supported baresip Dockerfiles build the
patched baresip core and `mediasoup_bridge.so` together, but the static baresip
configuration never loads the module. When `TALKTOME_BRIDGE_ENABLED=true`, the
app plugin loads it at runtime with baresip's `insmod` command. On a false
startup the app does zero bridge configuration or network work, leaves mapped
audio-device settings unchanged, and does not load the module. A module that
was dynamically loaded before the flag changed remains in the old baresip
process until that process exits; follow
[Disabling and hard-off](#disabling-and-hard-off). Runtime `rmmod` is rejected
for this module; normal process shutdown removes it.

## Prerequisites

- A reachable talktome deployment with the Bridge Plain-RTP API enabled.
- Permission to create the dedicated talktome users and configure their
  allowed trigger targets. A token matching this bridge can assign those users
  as endpoints on its own bridge.
- A dedicated talktome user for each SIP account that will be bridged. Use a
  user endpoint, not a feed endpoint, because feeds are send-only.
- Opus enabled on the SIP/baresip side.
- Bidirectional UDP reachability between the talktome server and the Docker
  host.
- A firewall/NAT plan for both port ranges described below.

Plain RTP is not encrypted. Use a trusted network, private interconnect, or
VPN where appropriate. Use HTTPS for the Bridge API.

## Build and deploy

The two supported baresip image paths build the same patched core/module
compatibility unit:

- `baresip/Dockerfile` is the default patched source build.
- `baresip/Dockerfile.build-from-source` registers
  `mediasoup_bridge` through upstream baresip's `EXTRA_MODULES` mechanism and
  builds it together with the patched baresip core.

An upstream or packaged baresip binary with an externally compiled bridge
module is not supported. It lacks call-aware device identities and cannot
safely pair concurrent calls. The original public `audio_alloc` ABI remains
available for other modules, while baresip call control uses the patched
call-aware core path.

Use the published images:

```sh
docker compose pull
docker compose up -d
```

Or build baresip from source:

```sh
docker compose -f compose.build-from-source.yaml build
docker compose -f compose.build-from-source.yaml up -d
```

To confirm that an image contains the module without loading it:

```sh
docker compose exec baresip sh -c \
  'for f in /usr/lib/*/baresip/modules/mediasoup_bridge.so; do
     [ -s "$f" ] && echo "$f"
   done'
```

Do not add `module mediasoup_bridge.so` or
`module_app mediasoup_bridge.so` to `baresip/config/config`. Static loading
would bypass the global feature gate. The app owns dynamic loading.

## App environment

Only the `app` service receives talktome connection settings and secrets. The
`baresip` service receives the non-secret `TALKTOME_BRIDGE_ENABLED` value only
as a Compose recreation marker; the baresip process does not consume it and
receives no API credentials.

| Variable | Default | Required when enabled | Purpose |
|---|---:|---:|---|
| `TALKTOME_BRIDGE_ENABLED` | `false` | Yes | Global hard gate. Set exactly `true` to enable. Compose also passes this non-secret value to baresip as a recreation marker. |
| `NUXT_PUBLIC_TALKTOME_BRIDGE_ENABLED` | server gate value | Yes | Browser runtime gate. Compose derives it from `TALKTOME_BRIDGE_ENABLED`; it contains no secret. |
| `TALKTOME_BASE_URL` | empty | Yes | talktome origin/base URL. Prefer HTTPS and do not embed credentials in it. |
| `TALKTOME_BRIDGE_ID` | empty | Yes | Stable ID of this bridge registration. |
| `TALKTOME_BRIDGE_TOKEN` | empty | Yes | Bridge bearer token or suitably scoped API credential. |
| `TALKTOME_MEDIA_ANNOUNCE_IP` | empty | Yes | Address through which talktome can reach the Docker host's published bridge RTP ports. |
| `TALKTOME_BRIDGE_CONFIG_PATH` | `/config/talktome-bridge.json` | No | Persistent per-account mapping file. Keep it on the mounted config volume. |
| `TALKTOME_BRIDGE_NAME` | `baresipui` | No | Human-readable bridge name sent during announcement. |
| `TALKTOME_BRIDGE_AUTH_MODE` | `bearer` | No | Authentication header mode: `bearer` or `api-key`. |
| `TALKTOME_BRIDGE_AUTO_PROVISION` | `true` | No | Assign or update matching user endpoints on this bridge. Set `false` to require an existing exact endpoint configuration. |
| `TALKTOME_BRIDGE_COMMAND_TIMEOUT_MS` | `5000` | No | ctrl_tcp module-command timeout in milliseconds; valid range is `100`–`120000`. |
| `TALKTOME_DEFAULT_AUDIO_SOURCE` | empty | No | Source restored if an account has no recorded previous non-bridge source. |
| `TALKTOME_DEFAULT_AUDIO_PLAYER` | empty | No | Player restored if an account has no recorded previous non-bridge player. |

The compose files pass every connection setting and secret only to `app` and
explicitly default the global gate to `false`. They derive the browser-safe
`NUXT_PUBLIC_TALKTOME_BRIDGE_ENABLED` override from that same value and pass
only the non-secret gate to `baresip`, solely so Compose detects gate changes
and recreates the process that may contain a dynamically loaded module.
Configure the four required connection values before setting the gate to
`true`. A partially configured enabled deployment fails the bridge plugin
closed.

Nuxt public runtime configuration is separate from the server setting: a
runtime browser override must use the `NUXT_PUBLIC_*` name. Changing only a
built image's environment does not rewrite its client bundle, so the explicit
public override is required to keep the UI gate aligned. Environment values
are read at app startup. After changing the global gate, recreate both
containers with:

```sh
docker compose up -d --force-recreate app baresip
```

Use the corresponding `-f compose.build-from-source.yaml` option for the
source-build deployment. Never create a public runtime variable for the token.

Never commit a real token. Supply credentials from the deployment platform's
secret manager or another protected runtime environment. Docker Compose
environment values can be visible through container inspection, so use a
platform-supported secret injection mechanism for production where possible.
Do not place the token in the bridge JSON, the baresip config, UI fields, logs,
screenshots, or support bundles.

### Security boundaries

- The app's dashboard, Socket.IO connection, command endpoints, and bridge
  configuration endpoints have no built-in user authentication. Restrict
  port 3000 with firewall rules or an authenticated TLS reverse proxy.
- Baresip `ctrl_tcp` has no authentication. Compose no longer publishes port
  4444 on the host; the app reaches `baresip:4444` on the Docker network.
  Other containers on that network can still reach it.
- Plain RTP is not encrypted. Keep media on a trusted network, private
  interconnect, or VPN.
- The bridge token is server-only. A matching bridge bearer token can assign
  and update user endpoints on its own bridge; it is not a global
  administrator token and cannot administer another bridge. `api-key` mode
  has only the permissions granted to that key.
- The mapping JSON contains identifiers and device settings, not the token,
  but it can still affect call routing and should retain restrictive
  permissions.

For a short local ctrl_tcp diagnostic, use a temporary Compose override with
`127.0.0.1:4444:4444/tcp`, as shown in `README.docker.md`. Never publish it on
`0.0.0.0` or a non-loopback host address, and remove the override afterward.

## Provision talktome

1. Configure the talktome mediasoup worker's `RTC_PORT_RANGE` and
   `announcedIp`. Open that UDP range on the talktome server.
2. Create a stable bridge ID and announce/register the bridge through the
   Bridge API.
3. Store the resulting matching bridge token securely for the app service.
4. Create one dedicated talktome user per bridged SIP account.
5. Assign each user as a `user` endpoint of the bridge. With
   `TALKTOME_BRIDGE_AUTO_PROVISION=true`, the matching bridge token can assign
   or update user endpoints on this bridge; it does not need global
   administrative permission. With auto-provision disabled, create the exact
   endpoint and trigger configuration before enabling the account.
6. Permit the intended conference in that endpoint's trigger targets.
7. Add the per-account mapping in the baresip UI.

The bridge ID and endpoint user IDs are identifiers, not passwords. The bridge
token is a secret.

## Two independent UDP ranges

Do not use one range as the value for the other. They live on different hosts
and serve different sockets.

### talktome server: `RTC_PORT_RANGE`

This is the mediasoup worker's global `rtcMinPort` through `rtcMaxPort` range.
It is shared by browser clients, bridges, conferences, and other transports
on the talktome server. talktome's plain send and consumer transports listen
or originate there. Configure the server's public/routable `announcedIp` and
allow this range through the talktome host firewall.

The baresip module sends its producer RTP to ports from this server range. The
value is configured on the talktome host and is not inherited by baresipui.

### baresip side: bridge receive range

The module owns fixed local sockets from:

```text
mediasoup_bridge_rtp_ports    40000-40199
mediasoup_bridge_bind_addr    0.0.0.0
```

These values are present in `baresip/config/config`, but are inert until the
module is dynamically loaded. Both compose files publish the identical,
inclusive range:

```yaml
- "40000-40199:40000-40199/udp"
```

The range is separate from baresip's SIP media range
`10000-10500/udp`; both mappings are required.

The module allocates even receive ports. The default 40000-40199 range
therefore provides 100 receive socket slots. Each consumed remote audio
producer uses exactly one receive port/socket because RTCP is muxed; allocation
is per producer, not per account or SIP call. Account transmit sockets always
use kernel-assigned ephemeral ports and never consume this receive pool.
Estimate peak receive demand as:

```text
sum of remote producers consumed by all active bridged accounts
```

Leave headroom for conference joins and overlapping calls. If changing the
client range, change the module configuration and both sides of the compose
port mapping together. Publishing a larger range than the module uses does
not increase module capacity.

## NAT and comedia

Both plain-RTP directions use comedia and RTCP mux, but only incoming
conference audio needs a published fixed port:

1. For each remote producer, the module binds a fixed receive port from
   40000-40199.
2. It sends three RTCP receiver-report probes 15 ms apart from that same
   socket to the talktome consumer transport.
3. talktome learns the observed source address and port.
4. talktome sends return RTP to the latched address and port.

The account producer uses one kernel-assigned ephemeral UDP port. Its three
handshake probes and all subsequent RTP leave through that same socket. This
egress socket is reported in TX statistics but is not counted in the bridge
receive pool.

Docker publishes each host port to the same container port so that the
observed port and bound receive port remain aligned. The Docker host firewall
must permit UDP 40000-40199 from the talktome server. If the Docker host is
behind another NAT, create a matching one-to-one UDP forwarding rule and set
`TALKTOME_MEDIA_ANNOUNCE_IP` to an address reachable from talktome.

Do not set the media announce value to `0.0.0.0`, a Docker container address,
or an unroutable private address unless talktome is on that same routed
network. Carrier-grade NAT and symmetric NAT can rewrite the probe source
port and break the return path. Prefer a public/static address, routed private
link, or VPN. When both systems sit behind the same NAT, verify hairpin NAT or
route them directly over an internal network.

On the talktome side, `announcedIp` must likewise be reachable by the Docker
host. A correct baresip receive mapping does not fix an incorrect mediasoup
server announcement.

## Per-account configuration and UI

The global environment gate controls whether any bridge code runs. The UI
then provides an independent per-account opt-in. A mapped account needs:

- enabled/disabled state;
- a stable context key, normally the talktome user ID;
- the talktome user endpoint;
- one allowed conference target;
- PTT mode and its settings;
- optional tally GPO assignments;
- `mixLocalCallers`, normally `true`;
- Opus bitrate, normally 64000 bit/s.

When an account is enabled, its audio devices become
`mediasoup,<key>`. The app preserves the previous `audio_source` and
`audio_player` values so disabling or removing the mapping can restore the
normal device. Do not manually assign a normal account to a mediasoup device.

Inside the patched core, each source/player allocation appends a lowercase
64-character SHA-256 token derived from the complete SIP Call-ID. The raw
Call-ID is never embedded in a device string or passed to the module. The
module requires the exact `<key>|<hex-token>` form and rejects account-key-only,
malformed, or oversized identities, so valid long or hostile Call-IDs cannot
alter device parsing.

The app persists mappings at:

```text
/config/talktome-bridge.json
```

In the supplied compose deployment, `/config` is the existing
`./baresip/config` bind mount. The file and its atomic-write temporary files
are gitignored. It contains mappings and device settings only; API tokens must
remain in runtime secret storage.

The generated file has this shape:

```json
{
  "accounts": {
    "sip:studio@example.invalid": {
      "enabled": true,
      "key": "1042",
      "talktomeUserId": 1042,
      "target": {
        "type": "conference",
        "id": 7
      },
      "ptt": {
        "mode": "audio-level",
        "thresholdDb": -45,
        "holdMs": 300,
        "gpi": 1
      },
      "tally": {
        "activeGpo": 1,
        "liveGpo": 2
      },
      "mixLocalCallers": true,
      "bitrateBps": 64000,
      "previousAudioSource": "alsa,default",
      "previousAudioPlayer": "alsa,default"
    }
  }
}
```

Prefer the UI/API over editing this file while the app is running. Writes are
validated, serialized, atomically replaced, and stored with restrictive file
permissions.

## PTT, tally, and multiple callers

The talktome producer starts paused. PTT controls both the server producer and
the module's local transmit mute:

- `audio-level`: caller speech drives VAD. `thresholdDb` is the activation
  threshold and `holdMs` prevents rapid release between words.
- `external`: `ptt.gpi` selects the inbound GPI index (1 through 6) whose
  existing SIP DTMF/GPI path drives press/release. Companion or API `press`,
  `release`, and `lock-toggle` commands use the same state machine.

`lock-toggle` latches transmission until released. If a producer remains
paused, SIP audio can be healthy while the conference hears nothing.

Tally always uses the existing GPO-to-DTMF path:

- `activeGpo` indicates conference/remote activity.
- `liveGpo` indicates that this account's producer is live.

GPO values are per-account indices from 1 through 6. Confirm that the SIP
device uses the same DTMF GPIO mapping and that telephone-event negotiation
is working.

With `mixLocalCallers=true`, concurrent SIP callers on one mapped account form
a party line. They are mixed into one talktome producer and hear the remote
conference plus other local callers, minus themselves. PTT and tally operate
on the account aggregate, not on individual callers.

With `mixLocalCallers=false`, every local caller still contributes to that
same aggregate talktome producer, but local caller audio is excluded from the
receive party-line mix. Each caller hears the remote conference mix without
hearing the account's other local callers.

After opening a context, the app applies the idempotent command:

```text
ms_ctx_config <key> party-line|isolated <bitrateBps>
```

The bitrate must be an integer from 6000 through 510000. Context defaults
remain `party-line` and 64000 bit/s. Configuration is applied before creating
the talktome session or binding TX. Changing the mix mode, bitrate, or PTT
mapping revalidates/provisions the endpoint trigger and safely restarts an
active bridge session and context while preserving the SIP call set.

## Failure isolation

A talktome failure must not terminate or reject a SIP call:

- An unmapped or disabled account keeps its normal audio devices.
- API authentication, SSE/poll, provisioning, RTP handshake, and consumer
  errors are reported as bridge status/log errors.
- On a mapped account, the agent tears down failed bridge resources without
  ending the SIP call. Bridge audio may be silent; changing the account back
  to a normal audio device requires disabling/removing its mapping and
  restarting baresip.
- Port exhaustion rejects only the new bridge source and emits
  `MS_CTX_ERROR` with `port-range-exhausted`.

Choose valid previous/default audio devices for bridged accounts so a fallback
does not produce unexpected dead air.

## Disabling and hard-off

The global flag is a startup hard gate, not an account migration. A false
startup performs zero bridge configuration or network work and deliberately
does not restore `audio_source` or `audio_player` for mapped accounts.

If previous audio devices must be restored during a planned disable:

1. Hang up calls on mapped accounts.
2. While the global bridge is still enabled, soft-disable or remove every
   mapping in the UI. This operation writes each recorded previous audio
   device, or the configured `TALKTOME_DEFAULT_AUDIO_SOURCE` /
   `TALKTOME_DEFAULT_AUDIO_PLAYER`, back to the account file. If the UI reports
   an HTTP 409 active-call conflict, hang up the remaining calls and retry.
3. Set `TALKTOME_BRIDGE_ENABLED=false`; Compose derives the public UI gate from
   it.
4. Recreate both services:

   ```sh
   docker compose up -d --force-recreate app baresip
   ```

   For the source-build deployment, include
   `-f compose.build-from-source.yaml`.

The non-secret flag on the baresip service exists only to make Compose detect
the change. Baresip does not load the module from that environment value, and
the module remains absent from its static configuration. Recreating baresip
ends the old process and removes any dynamically loaded module; the restarted
process plus the false app startup is therefore hard-off.

For an immediate hard-off, the mapping soft-disable step may be skipped before
setting the flag false and recreating both services. In that case the bridge is
still fully off after the baresip restart, but mapped audio-device values are
not restored. Do not use `rmmod` as a shortcut; the patched core rejects
`rmmod mediasoup_bridge[.so]` as restart-required.

## Verification checklist

Before carrying production traffic:

1. Confirm the image contains `mediasoup_bridge.so`.
2. Confirm `TALKTOME_BRIDGE_ENABLED` resolves to `false` in the ordinary
   deployment.
3. Enable the feature with all required app environment values and confirm
   the app dynamically loads the module.
4. Confirm no `mediasoup_bridge.so` module line exists in the baresip config.
5. Confirm both UDP ranges are allowed on their respective hosts.
6. Confirm a mapped user is a bridge endpoint and the conference is an
   allowed trigger target.
7. Establish a SIP call and verify caller-to-conference audio after PTT.
8. Verify conference-to-caller audio and increasing RX packet counters.
9. Verify PTT release, lock behavior, and both configured tally outputs.
10. Test an unmapped SIP account and an unreachable talktome server to confirm
    SIP failure isolation.
11. Run a multi-caller party-line test if an account permits concurrent calls.

The module command `ms_bridge_stat <key>` reports `mixMode`,
`mixLocalCallers`, `bitrateBps`, transmit counters, receive sources, levels,
jitter-buffer information, and receive-port usage. `ports.inUse` and
`ports.capacity` cover remote receive sockets only; `ports.txConsumesPool` is
`false`. Use the app's existing correlated ctrl_tcp command path or bridge
diagnostics rather than opening ctrl_tcp to an untrusted network.

## Troubleshooting

### The bridge UI is absent or no API calls occur

- Check both `TALKTOME_BRIDGE_ENABLED` and
  `NUXT_PUBLIC_TALKTOME_BRIDGE_ENABLED`; Compose should derive both from the
  same value and the default is deliberately `false`.
- The accepted enable value is `true`; avoid ambiguous values such as `1`.
- After changing the global flag, run
  `docker compose up -d --force-recreate app baresip`.
- Confirm all connection values and secrets exist only on `app`. The non-secret
  global gate also appears on `baresip` only as its Compose recreation marker.

### Dynamic module loading fails

- Confirm the running image contains `mediasoup_bridge.so`; an older published
  image may predate the module.
- Confirm the image was built from one of the patched source Dockerfiles.
  Building only the module against an upstream/package core is unsupported.
- Confirm there is no stale static module line.
- Confirm both module parameters are present and the range is valid.
- Check that another process has not bound the even ports in 40000-40199.
- Inspect the module with `ldd` inside the container and verify that its Opus
  dependency resolves.

### Announce, config, or endpoint provisioning fails

- HTTP 401/403 usually means a missing, expired, or insufficiently scoped
  credential. Rotate it without writing it to logs.
- Confirm `TALKTOME_BASE_URL` is the service base, uses HTTP(S), and contains
  no credentials, query, or fragment.
- Confirm bridge IDs and user IDs match the provisioned talktome resources.
- A bearer token must match the configured bridge. That token can assign or
  update user endpoints on its own bridge, but cannot administer another
  bridge; an API key must have equivalent explicit permission.
- Confirm the selected conference appears in the endpoint's allowed trigger
  targets.

### Conference hears no caller audio

- Confirm PTT is live; user producers begin paused.
- Check TX packet/error counters with `ms_bridge_stat`.
- Verify the talktome server's `RTC_PORT_RANGE`, host firewall, mediasoup
  `announcedIp`, and Docker-host route to that address.
- Confirm the payload type and SSRC come from the server response rather than
  a hardcoded value.

### Caller hears no conference audio

- Confirm UDP 40000-40199 is published and allowed on the Docker host.
- Verify the module range exactly matches the compose container range.
- Check `TALKTOME_MEDIA_ANNOUNCE_IP`, upstream NAT forwarding, hairpin routing,
  and source-port preservation.
- Check RX packet/invalid/decode counters. No packets indicates routing or
  handshake trouble; rising invalid counts suggests wrong source, payload
  type, or SSRC.
- Confirm the consumer is resumed only after the module reserves its port and
  sends the comedia probe.

### Sources fail as conferences grow

- Look for `port-range-exhausted`.
- Compare `ports.inUse` and `ports.capacity` in `ms_bridge_stat`.
- Count remote producers across every active mapped account. Transmit sockets
  are ephemeral and do not consume these slots.
- Enlarge the module range and compose mapping together, restart baresip, and
  adjust the host firewall.

### PTT or tally does not change

- For audio-level PTT, inspect TX dBFS and adjust the threshold/hold time.
- For external PTT and tally, verify SIP telephone-event/DTMF and the selected
  1-6 GPIO indices.
- Check event transport status. SSE may fall back to polling; neither path
  should remain disconnected.
- Confirm the talktome endpoint trigger mode matches the account's PTT mode.

### Emergency disable

Set the global gate to false and force-recreate both `app` and `baresip` as
shown in [Disabling and hard-off](#disabling-and-hard-off). That restart removes
the dynamically loaded module and establishes hard-off. If previous audio
devices must be restored, soft-disable the mappings while the bridge is still
enabled before changing the global gate; false startup does not restore them.
