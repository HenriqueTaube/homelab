# PC Remote Power

Remotely turns on the desktop PC via an Arduino connected to the PC's power button header and a 5V relay.

## Why

The desktop PC runs Windows 11 with Solidworks and AutoCAD — heavy software that stays off when not in use. This setup allows starting the machine from anywhere without physically touching it.

## Hardware

- Arduino (relay on pin 8)
- 5V single channel relay module — wired to the **NO (Normally Open)** contact
- Wired to the PC motherboard power button header pins

The relay uses the NO contact so the circuit stays open at rest and only closes briefly when triggered. The Arduino connects via USB to `worker-prox` (Proxmox VM 108) and appears as `/dev/ttyUSB0` (CH340 chipset, USB ID `1a86:7523`). It is passed through from Proxmox to the VM.

## How it works

1. A Kubernetes Job in the `arduino` namespace runs on `worker-prox`
2. The pod mounts `/dev/ttyUSB0` as a `hostPath` volume
3. It opens the serial port at 9600 baud and sends `POWER\n`
4. The Arduino receives the command, triggers the relay for 500ms, and responds `OK`
5. The relay briefly shorts the power button pins — same as pressing the button physically

## Build

Custom case housing the Arduino and the 5V relay module.

![Case build 1](./assets/26-07-21%2020-08-12%209283.jpg)
![Case build 2](./assets/26-07-21%2020-09-36%209284.jpg)

## Arduino code

See [`config/arduino.ino`](./config/arduino.ino).

The relay pin is `8`. If your relay is active-LOW, change `HIGH`/`LOW` in `triggerPower()`.

## Trigger from the terminal

zshrc function:

```bash
pc-on() {
    kubectl delete job pc-on -n arduino --ignore-not-found >/dev/null 2>&1
    kubectl apply -k /home/henrique/gitops/apps/pc-on/overlays/homelab
}
```

Running `pc-on` deletes any previous job and creates a new one — the pod runs, sends `POWER`, and exits in ~3 seconds.

## Kubernetes manifests

Manifests live in the gitops repo at [`apps/pc-on/`](https://github.com/HenriqueTaube/gitops/tree/master/apps/pc-on). The job runs on `worker-prox` via `nodeSelector` since that's where the Arduino is physically connected.
