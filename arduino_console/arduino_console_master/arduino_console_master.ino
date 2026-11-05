#include <Wire.h>

#define SLAVE_ADDR 0x08

// Master Pin Assignments (Excluding A4 & A5 for I2C)
const int masterAnalogPins[] = {A0, A1, A2, A3};
const int masterDigitalPins[] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13};

const int totalMAnalog = sizeof(masterAnalogPins) / sizeof(masterAnalogPins[0]);
const int totalMDigital = sizeof(masterDigitalPins) / sizeof(masterDigitalPins[0]);

bool wasButtonPressedLastCycle = false;

void setup() {
  Serial.begin(115200);
  
  Wire.begin();
  Wire.setClock(400000); // 400kHz fast I2C mode for near-zero latency

  // Initialize Master Analog inputs
  for (int i = 0; i < totalMAnalog; i++) {
    pinMode(masterAnalogPins[i], INPUT_PULLUP);
  }

  // Initialize Master Digital inputs
  for (int i = 0; i < totalMDigital; i++) {
    pinMode(masterDigitalPins[i], INPUT_PULLUP);
  }
}

void loop() {
  bool anyButtonPressed = false;
  bool isFirstOutput = true;

  // 1. Fetch Slave buttons via I2C (1 byte)
  byte slaveData = 0;
  Wire.requestFrom(SLAVE_ADDR, 1);
  if (Wire.available()) {
    slaveData = Wire.read();
  }

  // 2. Scan Master Analog Pins (A0-A3)
  for (int i = 0; i < totalMAnalog; i++) {
    if (digitalRead(masterAnalogPins[i]) == LOW) {
      anyButtonPressed = true;
      if (!isFirstOutput) Serial.print(",");
      Serial.print("M_A");
      Serial.print(i);
      isFirstOutput = false;
    }
  }

  // 3. Scan Master Digital Pins (2-13)
  for (int i = 0; i < totalMDigital; i++) {
    if (digitalRead(masterDigitalPins[i]) == LOW) {
      anyButtonPressed = true;
      if (!isFirstOutput) Serial.print(",");
      Serial.print("M_D");
      Serial.print(masterDigitalPins[i]);
      isFirstOutput = false;
    }
  }

  // 4. Scan Slave Digital Pins (2-8 from I2C byte)
  for (int i = 0; i < 7; i++) {
    if (slaveData & (1 << i)) {
      anyButtonPressed = true;
      if (!isFirstOutput) Serial.print(",");
      Serial.print("S_D");
      Serial.print(i + 2);
      isFirstOutput = false;
    }
  }

  // 5. Continuous Stream & Release Logic
  if (anyButtonPressed) {
    Serial.println(); // Conclude current active frame
    wasButtonPressedLastCycle = true;
  } else if (wasButtonPressedLastCycle) {
    Serial.println("NONE"); // Send a single release signal to clear web app states
    wasButtonPressedLastCycle = false;
  }

  delay(8); // ~120Hz polling rate: low latency, no CPU choking
}
