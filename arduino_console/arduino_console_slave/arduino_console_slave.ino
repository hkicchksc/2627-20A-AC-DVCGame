#include <Wire.h>

#define SLAVE_ADDR 0x08

const int slavePins[] = {2, 3, 4, 5, 6, 7, 8};
const int totalSlavePins = sizeof(slavePins) / sizeof(slavePins[0]);

void setup() {
  // Configure pins 2-8 as pull-up inputs
  for (int i = 0; i < totalSlavePins; i++) {
    pinMode(slavePins[i], INPUT_PULLUP);
  }

  // Join I2C bus as slave at address 0x08
  Wire.begin(SLAVE_ADDR);
  Wire.onRequest(requestEvent);
}

void loop() {
  // All processing is handled by I2C hardware interrupt
}

// Executed whenever the Master requests data
void requestEvent() {
  byte pressedBitmask = 0;
  
  // Pack 7 pin states into a single byte (Bit = 1 means pressed)
  for (int i = 0; i < totalSlavePins; i++) {
    if (digitalRead(slavePins[i]) == LOW) {
      pressedBitmask |= (1 << i);
    }
  }
  
  Wire.write(pressedBitmask);
}
