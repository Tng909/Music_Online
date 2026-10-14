import { Injectable, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Track } from '../data/music-data';
import { PlayerService } from './player.service';

export type BluetoothStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type BluetoothCommand = 'play' | 'pause' | 'toggle' | 'next' | 'prev';

/**
 * GATT contract between the app and the sensor. Override these UUIDs (and the
 * command byte codes in COMMAND_CODES) to match the real device firmware.
 */
export const BT_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const BT_COMMAND_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
export const BT_STATE_CHARACTERISTIC_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';
export const BT_TRACK_CHARACTERISTIC_UUID = '0000ffe3-0000-1000-8000-00805f9b34fb';

/** Incoming command byte codes (first byte of the notification value). */
const COMMAND_CODES: Record<number, BluetoothCommand> = {
  1: 'play',
  2: 'pause',
  3: 'toggle',
  4: 'next',
  5: 'prev',
};

/** Minimal Web Bluetooth typings (avoids depending on newer lib.dom types). */
interface BluetoothRemoteGATTCharacteristic {
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  writeValue(value: BufferSource): Promise<void>;
  value?: DataView;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer | null;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}

interface Bluetooth {
  requestDevice(options: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<BluetoothDevice>;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: Bluetooth;
}

/**
 * Keeps the player and a Bluetooth sensor in live sync, both ways:
 *
 *  - device -> app: sensor buttons (play / pause / toggle / next / prev)
 *  - app -> device: play/pause state and current track info are mirrored
 *
 * The service is feature-detected: without `navigator.bluetooth` (jsdom, SSR,
 * unsupported browsers) every method degrades to a safe no-op.
 */
@Injectable({ providedIn: 'root' })
export class BluetoothService {
  private player = inject(PlayerService);

  /** False when Web Bluetooth is unavailable (jsdom / SSR / unsupported). */
  readonly supported = signal(BluetoothService.hasBluetooth());
  readonly status = signal<BluetoothStatus>('idle');
  readonly deviceName = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  /** Commands received from the sensor. */
  readonly commands$ = new Subject<BluetoothCommand>();

  private device: BluetoothDevice | null = null;
  private commandChar: BluetoothRemoteGATTCharacteristic | null = null;
  private stateChar: BluetoothRemoteGATTCharacteristic | null = null;
  private trackChar: BluetoothRemoteGATTCharacteristic | null = null;

  private commandListener = (event: Event): void => this.onCommandValue(event);
  private disconnectedListener = (): void => this.onDisconnected();

  constructor() {
    // app -> device: mirror the live play/pause state.
    effect(() => {
      const playing = this.player.isPlaying();
      if (this.status() !== 'connected') return;
      void this.writeState(playing);
    });

    // app -> device: mirror the current track info.
    effect(() => {
      const track = this.player.currentTrack();
      if (this.status() !== 'connected') return;
      void this.writeTrackInfo(track);
    });

    // device -> app: apply incoming commands to the player.
    this.commands$.subscribe((command) => this.applyCommand(command));
  }

  /** Ask the user to pair with a sensor and start receiving commands. */
  async connect(): Promise<void> {
    const bt = this.bluetooth();
    if (!bt) {
      this.error.set('Web Bluetooth is not available in this browser.');
      this.status.set('error');
      return;
    }
    this.status.set('connecting');
    this.error.set(null);
    try {
      const device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BT_SERVICE_UUID],
      });
      this.device = device;
      this.deviceName.set(device.name ?? 'Bluetooth sensor');

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(BT_SERVICE_UUID);

      // Each characteristic is optional so the app still connects to sensors
      // that only implement part of the protocol.
      this.commandChar = await service
        .getCharacteristic(BT_COMMAND_CHARACTERISTIC_UUID)
        .catch(() => null);
      this.stateChar = await service
        .getCharacteristic(BT_STATE_CHARACTERISTIC_UUID)
        .catch(() => null);
      this.trackChar = await service
        .getCharacteristic(BT_TRACK_CHARACTERISTIC_UUID)
        .catch(() => null);

      if (this.commandChar) {
        this.commandChar.addEventListener('characteristicvaluechanged', this.commandListener);
        await this.commandChar.startNotifications();
      }

      device.addEventListener('gattserverdisconnected', this.disconnectedListener);
      this.status.set('connected');

      // Push the current state so the sensor catches up immediately.
      void this.writeState(this.player.isPlaying());
      void this.writeTrackInfo(this.player.currentTrack());
    } catch (err) {
      this.status.set('error');
      this.error.set(
        err instanceof Error ? err.message : 'Failed to connect to Bluetooth sensor.'
      );
    }
  }

  /** Close the GATT connection (or cancel an in-flight connect). */
  disconnect(): void {
    if (this.commandChar) {
      this.commandChar
        .stopNotifications()
        .catch(() => undefined)
        .finally(() => {
          this.commandChar?.removeEventListener(
            'characteristicvaluechanged',
            this.commandListener
          );
        });
    }
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.onDisconnected();
  }

  /** Pure command decoder — unit-testable without a real device. */
  static decodeCommand(value?: DataView): BluetoothCommand | null {
    if (!value || value.byteLength === 0) return null;
    return COMMAND_CODES[value.getUint8(0)] ?? null;
  }

  static hasBluetooth(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  private onCommandValue(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const command = BluetoothService.decodeCommand(target?.value);
    if (command) this.commands$.next(command);
  }

  private applyCommand(command: BluetoothCommand): void {
    switch (command) {
      case 'play':
        if (!this.player.isPlaying()) this.player.toggle();
        break;
      case 'pause':
        if (this.player.isPlaying()) this.player.toggle();
        break;
      case 'toggle':
        this.player.toggle();
        break;
      case 'next':
        this.player.next();
        break;
      case 'prev':
        this.player.prev();
        break;
    }
  }

  private async writeState(playing: boolean): Promise<void> {
    if (!this.stateChar) return;
    try {
      await this.stateChar.writeValue(new Uint8Array([playing ? 1 : 0]));
    } catch {
      /* device temporarily unreachable — keep the app running */
    }
  }

  private async writeTrackInfo(track: Track | null): Promise<void> {
    if (!this.trackChar) return;
    const text = track ? `${track.title} — ${track.artist}` : '';
    try {
      await this.trackChar.writeValue(new TextEncoder().encode(text));
    } catch {
      /* ignore */
    }
  }

  private onDisconnected(): void {
    this.device?.removeEventListener('gattserverdisconnected', this.disconnectedListener);
    this.device = null;
    this.commandChar = null;
    this.stateChar = null;
    this.trackChar = null;
    this.status.set('idle');
  }

  private bluetooth(): Bluetooth | null {
    const nav =
      typeof navigator !== 'undefined' ? (navigator as NavigatorWithBluetooth) : undefined;
    return nav?.bluetooth ?? null;
  }
}