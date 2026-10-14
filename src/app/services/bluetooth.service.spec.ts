/**
 * @vitest-environment jsdom
 */
import '@angular/compiler'; // JIT compiler for raw vitest runs
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BluetoothService, BT_SERVICE_UUID } from './bluetooth.service';
import { PlayerService } from './player.service';
import { TRACKS } from '../data/music-data';
import { ensureTestEnvironment } from '../../testing/setup';

await ensureTestEnvironment();

// ---------------------------------------------------------------------------
// Minimal Web Bluetooth fakes — enough for the service's full connect flow.
// ---------------------------------------------------------------------------

interface FakeChar {
  uuid: string;
  value: DataView | null;
  writes: Uint8Array[];
  listeners: Record<string, Array<(event: unknown) => void>>;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
  addEventListener(type: string, fn: (event: unknown) => void): void;
  removeEventListener(type: string, fn: (event: unknown) => void): void;
  writeValue(bytes: Uint8Array): Promise<void>;
}

function makeChar(uuid: string): FakeChar {
  return {
    uuid,
    value: null,
    writes: [],
    listeners: {},
    async startNotifications() { return this; },
    async stopNotifications() { return this; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    },
    async writeValue(bytes) { this.writes.push(bytes); },
  };
}

function encodeCommand(code: number): DataView {
  return new DataView(new Uint8Array([code]).buffer);
}

function installFakeBluetooth() {
  const commandChar = makeChar('ffe1');
  const stateChar = makeChar('ffe2');
  const trackChar = makeChar('ffe3');
  const deviceListeners: Record<string, Array<() => void>> = {};

  const gatt = {
    connected: false,
    async connect() { gatt.connected = true; return gatt; },
    disconnect() { gatt.connected = false; },
    async getPrimaryService() {
      return {
        async getCharacteristic(uuid: string) {
          if (uuid.includes('ffe1')) return commandChar;
          if (uuid.includes('ffe2')) return stateChar;
          if (uuid.includes('ffe3')) return trackChar;
          throw new Error('unknown characteristic');
        },
      };
    },
  };

  const device = {
    id: 'fake-device',
    name: 'Test Sensor',
    gatt,
    addEventListener(type: string, fn: () => void) {
      (deviceListeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      deviceListeners[type] = (deviceListeners[type] ?? []).filter((f) => f !== fn);
    },
  };

  const bluetooth = {
    async requestDevice(options: unknown) {
      requestOptions = options;
      return device;
    },
  };
  let requestOptions: unknown = null;

  Object.defineProperty(navigator, 'bluetooth', {
    value: bluetooth,
    configurable: true,
    writable: true,
  });

  return {
    commandChar,
    stateChar,
    trackChar,
    deviceListeners,
    getRequestOptions: () => requestOptions,
    fireDisconnect() {
      for (const fn of deviceListeners['gattserverdisconnected'] ?? []) fn();
    },
  };
}

describe('BluetoothService', () => {
  let fake: ReturnType<typeof installFakeBluetooth> | null;

  beforeEach(() => {
    fake = installFakeBluetooth();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PlayerService, BluetoothService],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>)['bluetooth'];
    fake = null;
  });

  it('reports support when navigator.bluetooth exists', () => {
    const bt = TestBed.inject(BluetoothService);
    expect(bt.supported()).toBe(true);
    expect(bt.status()).toBe('idle');
  });

  it('reports no support and refuses to connect without navigator.bluetooth', async () => {
    // Fully remove the property so `'bluetooth' in navigator` is false.
    delete (navigator as unknown as Record<string, unknown>)['bluetooth'];
    const bt = TestBed.runInInjectionContext(() => new BluetoothService());
    expect(bt.supported()).toBe(false);

    await bt.connect();
    expect(bt.status()).toBe('error');
    expect(bt.error()).toContain('not available');
  });

  it('decodes command bytes (static, no device needed)', () => {
    expect(BluetoothService.decodeCommand(encodeCommand(1))).toBe('play');
    expect(BluetoothService.decodeCommand(encodeCommand(2))).toBe('pause');
    expect(BluetoothService.decodeCommand(encodeCommand(3))).toBe('toggle');
    expect(BluetoothService.decodeCommand(encodeCommand(4))).toBe('next');
    expect(BluetoothService.decodeCommand(encodeCommand(5))).toBe('prev');
    expect(BluetoothService.decodeCommand(encodeCommand(9))).toBeNull();
    expect(BluetoothService.decodeCommand(undefined)).toBeNull();
  });

  it('connects, subscribes to notifications and pushes current state', async () => {
    const bt = TestBed.inject(BluetoothService);
    const player = TestBed.inject(PlayerService);

    await bt.connect();

    expect(bt.status()).toBe('connected');
    expect(bt.deviceName()).toBe('Test Sensor');
    expect(fake!.stateChar.writes).toContainEqual(new Uint8Array([0])); // paused on connect
  });

  it('applies incoming sensor commands to the player', async () => {
    const bt = TestBed.inject(BluetoothService);
    const player = TestBed.inject(PlayerService);
    await bt.connect();

    player.playTrack(TRACKS[0], TRACKS);
    TestBed.tick();

    const emit = (code: number) => {
      fake!.commandChar.value = encodeCommand(code);
      for (const fn of fake!.commandChar.listeners['characteristicvaluechanged'] ?? []) {
        fn({ target: fake!.commandChar } as unknown as Event);
      }
    };

    // next (4) -> advances the queue
    emit(4);
    expect(player.currentTrack()?.id).toBe(TRACKS[1].id);

    // toggle (3) -> flips playback
    const playing = player.isPlaying();
    emit(3);
    expect(player.isPlaying()).toBe(!playing);

    // pause (2) while playing -> pauses
    if (player.isPlaying()) {
      emit(2);
      expect(player.isPlaying()).toBe(false);
    }

    // play (1) while paused -> resumes
    if (!player.isPlaying()) {
      emit(1);
      expect(player.isPlaying()).toBe(true);
    }
  });

  it('mirrors play/pause state to the sensor (app -> device)', async () => {
    const bt = TestBed.inject(BluetoothService);
    const player = TestBed.inject(PlayerService);
    await bt.connect();

    player.playTrack(TRACKS[0], TRACKS);
    TestBed.tick();
    expect(fake!.stateChar.writes.at(-1)).toEqual(new Uint8Array([1]));

    player.toggle();
    TestBed.tick();
    expect(fake!.stateChar.writes.at(-1)).toEqual(new Uint8Array([0]));
  });

  it('mirrors the current track info to the sensor (app -> device)', async () => {
    const bt = TestBed.inject(BluetoothService);
    const player = TestBed.inject(PlayerService);
    await bt.connect();

    player.playTrack(TRACKS[0], TRACKS);
    TestBed.tick();

    const last = fake!.trackChar.writes.at(-1)!;
    const text = new TextDecoder().decode(last);
    expect(text).toBe(`${TRACKS[0].title} — ${TRACKS[0].artist}`);
  });

  it('returns to idle when the sensor disconnects', async () => {
    const bt = TestBed.inject(BluetoothService);
    await bt.connect();
    expect(bt.status()).toBe('connected');

    fake!.fireDisconnect();
    expect(bt.status()).toBe('idle');
  });

  it('sets error status when pairing fails', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        async requestDevice() {
          throw new Error('User cancelled');
        },
      },
      configurable: true,
      writable: true,
    });
    const bt = TestBed.inject(BluetoothService);

    await bt.connect();
    expect(bt.status()).toBe('error');
    expect(bt.error()).toBe('User cancelled');
  });

  it('uses a short filtered list by default, full list on "See more"', async () => {
    const bt = TestBed.inject(BluetoothService);

    // First click: short filtered list.
    await bt.connect();
    const shortOpts = fake!.getRequestOptions() as {
      filters?: Array<{ services?: string[]; namePrefix?: string }>;
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    };
    expect(shortOpts.filters).toHaveLength(1);
    expect(shortOpts.filters![0].services).toContain(BT_SERVICE_UUID);
    expect(shortOpts.acceptAllDevices).toBeUndefined();
    expect(shortOpts.optionalServices).toContain(BT_SERVICE_UUID);
    expect(bt.canBroaden()).toBe(false);

    // "See more devices": full list of every nearby BLE device.
    await bt.connect({ acceptAll: true });
    const fullOpts = fake!.getRequestOptions() as {
      filters?: unknown;
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    };
    expect(fullOpts.acceptAllDevices).toBe(true);
    expect(fullOpts.filters).toBeUndefined();
    expect(fullOpts.optionalServices).toContain(BT_SERVICE_UUID);
  });

  it('offers "See more devices" when the short list has no device', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        async requestDevice(): Promise<never> {
          throw new DOMException('no devices', 'NotFoundError');
        },
      },
      configurable: true,
      writable: true,
    });
    const bt = TestBed.inject(BluetoothService);

    // Filtered attempt fails -> fallback offered; broaden flag set.
    await bt.connect();
    expect(bt.status()).toBe('error');
    expect(bt.error()).toContain('See more devices');
    expect(bt.canBroaden()).toBe(true);

    // Accept-all attempt fails -> keep the fallback visible so the user can
    // retry either list; the message just stops suggesting a further step.
    await bt.connect({ acceptAll: true });
    expect(bt.status()).toBe('error');
    expect(bt.error()).toContain('No device was selected');
    expect(bt.canBroaden()).toBe(true);

    bt.dismissError();
    expect(bt.status()).toBe('idle');
    expect(bt.error()).toBeNull();
    expect(bt.canBroaden()).toBe(false);
  });
});