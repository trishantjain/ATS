import serial
import time
import re
from pathlib import Path
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

PORT = "COM19"
BAUD = 921600

SAVE_DIR = Path("captures")
SAVE_DIR.mkdir(exist_ok=True)

# =========================================================
# OPEN SERIAL
# =========================================================

print(f"Opening {PORT}...")

ser = serial.Serial(
    PORT,
    BAUD,
    timeout=10
)

time.sleep(2)

ser.reset_input_buffer()
ser.reset_output_buffer()

print("Connected")

# =========================================================
# SEND CLICK COMMAND
# =========================================================

print("Sending Click command...")
ser.write(b"Click")

# =========================================================
# WAIT FOR HEADER
# =========================================================

print("Waiting for image header...")

header_buffer = b""
header_line = None

start_time = time.time()

while True:

    if time.time() - start_time > 30:
        raise TimeoutError("Timeout waiting for image header")

    byte = ser.read(1024)

    if not byte:
        continue

    header_buffer += byte

    if len(header_buffer) > 500:
        header_buffer = header_buffer[-500:]

    if b"\n" in header_buffer:

        lines = header_buffer.split(b"\n")

        for line in lines:

            if b"---START_JPG---[" in line:

                header_line = line.decode(
                    errors="ignore"
                ).strip()

                break

        if header_line:
            break

print("HEADER:", header_line)

# =========================================================
# PARSE IMAGE SIZE
# =========================================================

match = re.search(
    r"---START_JPG---\[(\d+)\]",
    header_line
)

if not match:
    raise ValueError(
        "Unable to parse image size"
    )

image_size = int(match.group(1))

print(f"Image size = {image_size} bytes")

# =========================================================
# RECEIVE JPEG DATA
# =========================================================

print("Receiving image...")

image_data = bytearray()

remaining = image_size

while remaining > 0:

    chunk = ser.read(
        min(8192, remaining)
    )

    if not chunk:
        raise TimeoutError(
            "Timeout while receiving image"
        )

    image_data.extend(chunk)

    remaining -= len(chunk)

    progress = (
        len(image_data) * 100
    ) // image_size

    print(
        f"\rProgress: {progress:3d}%",
        end=""
    )

print("\nImage transfer complete")

# =========================================================
# WAIT FOR FOOTER
# =========================================================

footer = ser.read_until(
    b"---END_JPG---"
)

if b"---END_JPG---" not in footer:
    print("Warning: Footer not found")
else:
    print("Footer received")

# =========================================================
# JPEG VALIDATION
# =========================================================

if len(image_data) < 4:
    raise ValueError("Invalid JPEG")

if image_data[:2] != b"\xff\xd8":
    print("Warning: JPEG SOI marker missing")

if image_data[-2:] != b"\xff\xd9":
    print("Warning: JPEG EOI marker missing")

# =========================================================
# SAVE IMAGE
# =========================================================

timestamp = datetime.now().strftime(
    "%Y%m%d_%H%M%S"
)

filename = (
    SAVE_DIR /
    f"capture_{timestamp}.jpg"
)

with open(filename, "wb") as f:
    f.write(image_data)

print()
print("================================")
print("IMAGE SAVED SUCCESSFULLY")
print("================================")
print("File :", filename)
print("Bytes:", len(image_data))

# =========================================================
# CLOSE
# =========================================================

ser.close()
print("Done")
