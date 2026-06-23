import serial
import re

PORT = "COM19" 
BAUD = 921600

ser = serial.Serial(PORT, BAUD, timeout=10)

print("Sending Click command...")
ser.write(b"Click")

buffer = b""

print("Waiting for image header...")

while True:
    data = ser.read(1024)

    if not data:
        continue

    buffer += data

    m = re.search(
        rb"---START_JPG---\[(\d+)\]\n",
        buffer
    )

    if m:
        size = int(m.group(1))

        header_end = m.end()

        print(f"JPEG Size = {size} bytes")

        jpeg_data = buffer[header_end:]

        while len(jpeg_data) < size:
            jpeg_data += ser.read(
                min(4096, size - len(jpeg_data))
            )

        with open("Sinosin-day.jpg", "wb") as f:
            f.write(jpeg_data[:size])
    
        print("Saved: Sinosin-day.jpg")
        break

ser.close()