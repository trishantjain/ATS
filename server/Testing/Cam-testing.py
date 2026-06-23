import serial
import time

# =========================================================
# CONFIG
# =========================================================

PORT = "COM26"          # CHANGE THIS
BAUD = 921600

OUTPUT_FILE = "server/Testing/test-images/capture_C9_1.jpg"

# =========================================================
# OPEN SERIAL
# =========================================================

print("Opening serial port...")

ser = serial.Serial(
    PORT,
    BAUD,
    timeout=15
)

time.sleep(2)

print("Connected")

# =========================================================
# CLEAR BUFFERS
# =========================================================

ser.reset_input_buffer()
ser.reset_output_buffer()

# =========================================================
# SEND CLICK COMMAND
# =========================================================

print("Sending Click command...")

ser.write(b"Click\n")

# =========================================================
# WAIT FOR HEADER
# =========================================================

print("Waiting for image header...")

header_bytes = b""

start_marker = b"---START_JPG---["

start_time = time.time()

while True:

    # =====================================================
    # TIMEOUT
    # =====================================================

    if time.time() - start_time > 30:
        print("Timeout waiting for header")
        ser.close()
        exit()

    b = ser.read(1)

    if not b:
        continue

    header_bytes += b

    # Keep buffer manageable
    if len(header_bytes) > 200:
        header_bytes = header_bytes[-200:]

    # =====================================================
    # HEADER FOUND
    # =====================================================

    if start_marker in header_bytes:

        idx = header_bytes.index(start_marker)

        remaining = header_bytes[idx:]

        # Wait until newline appears
        while b"\n" not in remaining:
            c = ser.read(1)

            if c:
                remaining += c

        header_line = remaining.decode(
            errors="ignore"
        ).strip()

        print("HEADER:", header_line)

        break

# =========================================================
# PARSE IMAGE SIZE
# =========================================================

try:

    start = header_line.index("[") + 1
    end = header_line.index("]")

    image_size = int(
        header_line[start:end]
    )

except Exception as e:

    print("Failed to parse image size")
    print(e)

    ser.close()
    exit()

print(f"Image Size: {image_size} bytes")

# =========================================================
# RECEIVE JPEG
# =========================================================

print("Receiving JPEG data...")

image_data = b""

remaining = image_size

last_progress = -1

while remaining > 0:

    chunk = ser.read(
        min(4096, remaining)
    )

    if not chunk:
        print("Timeout during image receive")
        break

    image_data += chunk

    remaining -= len(chunk)

    progress = int(
        (len(image_data) / image_size) * 100
    )

    if progress != last_progress:

        print(
            f"Progress: {progress}%"
        )

        last_progress = progress

# =========================================================
# READ FOOTER
# =========================================================

print("Waiting for footer...")

footer = ser.read_until(
    b"---END_JPG---"
)

print("Footer received")

# =========================================================
# SAVE IMAGE
# =========================================================

if len(image_data) == image_size:

    with open(OUTPUT_FILE, "wb") as f:
        f.write(image_data)

    print()
    print("================================")
    print("IMAGE SAVED SUCCESSFULLY")
    print("================================")
    print(f"Saved As: {OUTPUT_FILE}")
    print(f"Bytes: {len(image_data)}")

else:

    print()
    print("================================")
    print("IMAGE INCOMPLETE")
    print("================================")
    print(f"Expected: {image_size}")
    print(f"Received: {len(image_data)}")

# =========================================================
# CLOSE SERIAL
# =========================================================

ser.close()

print("Done")
