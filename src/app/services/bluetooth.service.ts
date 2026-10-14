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

/**
 * Optional extra chooser filter: when non-empty, devices whose name starts
 * with this prefix are also listed in the short (filtered) chooser alongside
 * devices advertising BT_SERVICE_UUID.
 */
export const BT_DEVICE_NAME_PREFIX = '';

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

interface BluetoothRequestDeviceFilter {
  services?: string[];
  name?: string;
  namePrefix?: string;
}

interface Bluetooth {
  requestDevice(options: {
    /** Mutually exclusive with acceptAllDevices; use filters to trim the chooser. */
    filters?: BluetoothRequestDeviceFilter[];
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
  /**
   * True after a *filtered* pairing attempt found no device — lets the UI show
   * a "See more devices" action that re-opens the chooser with acceptAllDevices.
   */
  readonly canBroaden = signal(false);

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

  /**
   * Ask the user to pair with a sensor and start receiving commands.
   *
   * By default the chooser is filtered to devices advertising BT_SERVICE_UUID
   * (a short, clean list). If the sensor is not in that list, the UI can call
   * `connect({ acceptAll: true })` to re-open the chooser listing *every*
   * nearby BLE device ("See more devices"). The two `requestDevice` options
   * are mutually exclusive per the Web Bluetooth spec.
   */
  async connect(options?: { acceptAll?: boolean }): Promise<void> {
    const acceptAll = options?.acceptAll === true;
    const bt = this.bluetooth();
    if (!bt) {
      this.error.set('Web Bluetooth is not available in this browser.');
      this.status.set('error');
      return;
    }
    this.status.set('connecting');
    this.error.set(null);
    // Only a filtered attempt can be broadened — once we already show all
    // devices there is nothing more to "see".
    if (!acceptAll) this.canBroaden.set(false);
    try {
      // Build the request options: a short filtered list by default, or the
      // full accept-all list when the user asked to "see more".
      const requestOptions: Parameters<Bluetooth['requestDevice']>[0] = acceptAll
        ? { acceptAllDevices: true, optionalServices: [BT_SERVICE_UUID] }
        : (() => {
            const filters: BluetoothRequestDeviceFilter[] = [
              { services: [BT_SERVICE_UUID] },
            ];
            if (BT_DEVICE_NAME_PREFIX) filters.push({ namePrefix: BT_DEVICE_NAME_PREFIX });
            return { filters, optionalServices: [BT_SERVICE_UUID] };
          })();

      const device = await bt.requestDevice(requestOptions);
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
      this.canBroaden.set(false);

      // Push the current state so the sensor catches up immediately.
      void this.writeState(this.player.isPlaying());
      void this.writeTrackInfo(this.player.currentTrack());
    } catch (err) {
      this.status.set('error');
      // NotFoundError is the common "no device selected in the chooser" case.
      // After a *filtered* attempt it usually means the sensor wasn't in the
      // short list — offer "See more devices" (full accept-all chooser).
      const notFound = err instanceof DOMException && err.name === 'NotFoundError';
      if (notFound && !acceptAll) this.canBroaden.set(true);
      this.error.set(
        notFound
          ? !acceptAll
            ? `No matching sensor found in the short list. Make sure it is powered on, ` +
              'then try "See more devices" to scan every nearby Bluetooth device.'
            : `No device was selected. Make sure the sensor is powered on, ` +
              'Bluetooth is enabled, then pick it from the list.'
          : err instanceof Error
            ? err.message
            : 'Failed to connect to Bluetooth sensor.'
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
    this.canBroaden.set(false);
    this.onDisconnected();
  }

  /** Dismiss the current error (hides the error / See-more popover). */
  dismissError(): void {
    this.error.set(null);
    this.canBroaden.set(false);
    if (this.status() === 'error') this.status.set('idle');
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