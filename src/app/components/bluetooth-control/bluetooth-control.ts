import { Component, computed, inject } from '@angular/core';
import { BluetoothService } from '../../services/bluetooth.service';

/** Button that connects/disconnects the paired Bluetooth sensor. */
@Component({
  selector: 'app-bluetooth-control',
  templateUrl: './bluetooth-control.html',
})
export class BluetoothControl {
  bt = inject(BluetoothService);

  status = this.bt.status;
  supported = this.bt.supported;
  deviceName = this.bt.deviceName;
  error = this.bt.error;
  canBroaden = this.bt.canBroaden;

  label = computed(() => {
    const name = this.deviceName();
    switch (this.status()) {
      case 'connected':
        return `Sensor: ${name}`;
      case 'connecting':
        return 'Pairing sensor…';
      case 'error':
        return 'Sensor error — retry';
      default:
        return 'Connect sensor';
    }
  });

  icon = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'bt-on';
      case 'connecting':
        return 'bt-wait';
      case 'error':
        return 'bt-error';
      default:
        return 'bt-off';
    }
  });

  icoClass = computed(() => {
    switch (this.status()) {
      case 'connected':
        return 'text-[#1ed760] animate-pulse';
      case 'connecting':
        return 'text-yellow-400 animate-pulse';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-[#b3b3b3] hover:text-white';
    }
  });

  toggleConnection(): void {
    if (this.status() === 'connected' || this.status() === 'connecting') {
      this.bt.disconnect();
    } else {
      void this.bt.connect();
    }
  }

  /** Re-open the chooser listing every nearby device ("See more"). */
  seeMoreDevices(): void {
    void this.bt.connect({ acceptAll: true });
  }

  dismissError(): void {
    this.bt.dismissError();
  }
}