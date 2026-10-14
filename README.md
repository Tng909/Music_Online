# MusicOnline

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Bluetooth sensor sync

The player stays in live sync with a Bluetooth sensor over **Web Bluetooth**, in
both directions:

- **Sensor → app** — play, pause, toggle, next and prev commands from the sensor
  drive `PlayerService`.
- **App → sensor** — play/pause state and the current track (`"title — artist"`)
  are mirrored to the sensor whenever they change (button, playlist, autoplay).

The control lives in the player bar (right side, next to the mute button). It
only appears when `navigator.bluetooth` is available (Chromium-based browsers,
HTTPS or localhost); elsewhere it degrades to a no-op.

### GATT protocol

All UUIDs and command codes are constants at the top of
`src/app/services/bluetooth.service.ts` — adjust them to match your firmware:

| Constant | Direction | Default UUID | Payload |
| --- | --- | --- | --- |
| `BT_SERVICE_UUID` | — | `…ffe0-…` | GATT service |
| `BT_COMMAND_CHARACTERISTIC_UUID` | sensor → app (notify) | `…ffe1-…` | 1 byte: `1` play, `2` pause, `3` toggle, `4` next, `5` prev |
| `BT_STATE_CHARACTERISTIC_UUID` | app → sensor (write) | `…ffe2-…` | 1 byte: `1` playing, `0` paused |
| `BT_TRACK_CHARACTERISTIC_UUID` | app → sensor (write) | `…ffe3-…` | UTF-8 `"title — artist"` |

Each characteristic is optional — the app connects even if the sensor only
implements part of the protocol.

> **Note:** Web Bluetooth is **BLE/GATT only** (see
> [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)).
> It works with custom BLE devices (Arduino / ESP32 / nRF52 sensors), **not**
> with ordinary Bluetooth audio earbuds — those use Bluetooth Classic (A2DP /
> AVRCP), which the browser cannot reach via GATT.

### Bluetooth earbuds / hardware media keys (AVRCP)

Standard earbuds such as the **Redmi Buds 6 Play** (A2DP + AVRCP) are supported
through the **Media Session API** instead of Web Bluetooth — no pairing or GATT
needed. `PlayerService` registers `navigator.mediaSession` action handlers so
the earbuds' **play / pause / next / prev** buttons (and OS lock-screen /
notification controls) drive playback, and the current track + play/pause state
are published to the OS media controls.

- **Earbuds → app**: OS button presses arrive as `play` / `pause` /
  `nexttrack` / `previoustrack` / `seek*` actions on `navigator.mediaSession`.
- **App → earbuds/OS**: `metadata` (title, artist, album, artwork) and
  `playbackState` are updated on every `playTrack()` / `toggle()`.

Works on Chromium browsers, Android Chrome and ChromeOS. Nothing to configure.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
