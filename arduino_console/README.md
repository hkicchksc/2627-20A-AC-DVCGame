# Arduino Console

Two Arduino boards scan push buttons and stream the pressed set over USB serial. The **master** reads its own pins, asks the **slave** for the rest over I2C, and prints one line per poll. A host (the web app) opens the master’s serial port and maps those tokens to controls.

Buttons are wired to ground. Every input uses `INPUT_PULLUP`, so a press reads `LOW`.

## Boards

| Sketch | Role | Bus |
| --- | --- | --- |
| `arduino_console_master/arduino_console_master.ino` | I2C master and USB serial | `Wire.begin()`, 400 kHz, `Serial` at 115200 |
| `arduino_console_slave/arduino_console_slave.ino` | I2C slave at address `0x08` | `Wire.begin(0x08)`, replies in `requestEvent()` |

Flash each sketch onto its own board. `A4` (SDA) and `A5` (SCL) are the I2C bus on both boards and are not used as buttons. Tie the grounds together.

## Pins

**Master** (`INPUT_PULLUP`, active low):

- Analog-as-digital: `A0`, `A1`, `A2`, `A3`
- Digital: `2` through `13`

**Slave** (`INPUT_PULLUP`, active low):

- Digital: `2` through `8` (seven buttons)

The slave does no work in `loop()`. When the master calls `Wire.requestFrom(0x08, 1)`, the slave’s `requestEvent()` packs those seven pins into one byte and writes it. Bit `i` is `1` when pin `i + 2` is pressed (`bit 0` = pin 2, `bit 6` = pin 8).

## Serial protocol

The master polls about every 8 ms (`delay(8)`, roughly 120 Hz). While any button is down it prints one line of comma-separated tokens, then a newline. Tokens in one line are every button held on that poll, master pins first, then slave pins.

| Token | Source |
| --- | --- |
| `M_A0` … `M_A3` | Master `A0` … `A3` (array index, which matches the pin) |
| `M_D2` … `M_D13` | Master digital pin number |
| `S_D2` … `S_D8` | Slave digital pin number, decoded from the I2C byte |

Example with master pin 4 and slave pin 2 held:

```text
M_D4,S_D2
```

When the last button is released, the master prints a single line:

```text
NONE
```

`NONE` is sent once, on the transition from “something held” to “nothing held”, so the host can clear latched button state. Idle polls with no prior press produce no output. A failed or empty I2C read is treated as slave byte `0` (no slave buttons).

## Loop order (master)

1. Request one byte from slave `0x08`.
2. Scan master `A0`–`A3` with `digitalRead` (digital mode, not the ADC).
3. Scan master pins `2`–`13`.
4. Unpack slave bits `0`–`6` into `S_D2`–`S_D8`.
5. Print the line if anything is pressed, or print `NONE` on release.
