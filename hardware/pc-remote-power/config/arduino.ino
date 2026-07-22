const int RELAY_PIN = 8;
const unsigned long PULSE_MS = 500;

String input = "";

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // ajuste se seu rele for ativo em LOW
  Serial.begin(9600);
}

void triggerPower() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(PULSE_MS);
  digitalWrite(RELAY_PIN, LOW);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      input.trim();

      if (input == "POWER") {
        triggerPower();
        Serial.println("OK");
      }

      input = "";
    } else {
      input += c;
    }
  }
}
