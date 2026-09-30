#!/usr/bin/env python3
"""
smartcam_uart_tester.py

Stand-in for STM: talks to the ESP32-S3 camera over its UART1 link
(GPIO43 TX / GPIO44 RX) through a USB-TTL adapter, so you can test
every command in the protocol without real STM hardware.

Setup:
    pip install pyserial
    Wire a 3.3V USB-TTL adapter: adapter TX -> ESP32 GPIO44 (RX1)
                                  adapter RX -> ESP32 GPIO43 (TX1)
                                  GND -> GND
    Find the adapter's port name (e.g. /dev/ttyUSB0, COM5) and set
    PORT below, or pass it as the first CLI argument.

Usage:
    python3 smartcam_uart_tester.py /dev/ttyUSB0
    Then use the interactive menu, or call the functions directly
    from a Python shell / your own script.
"""

import sys
import time
import re
import serial


PORT = "COM19"   # override via argv[1]
BAUD = 921600

START_RE = re.compile(rb"---START_JPG---\[(\d{8})\]\n")
END_MARKER = b"\n---END_JPG---\n"


class SmartcamLink:
    def __init__(self, port=PORT, baud=BAUD, timeout=2.0):
        self.ser = serial.Serial(port, baud, timeout=timeout)
        # Give the ESP32's UART driver a moment if it was just reset
        
        time.sleep(0.2)
        self.ser.reset_input_buffer()

    def close(self):
        self.ser.close()

    # ---------------------------------------------------------
    # Low-level senders -- these send EXACTLY the bytes the
    # firmware's parser expects. No extra \r\n.
    # ---------------------------------------------------------

    def send_plain(self, text):
        """Click / Day00 / Night / Night00 -- no terminator."""
        self.ser.write(text.encode("ascii"))
        self.ser.flush()

    def send_param(self, param, value_str):
        """
        Builds and sends %P<param><value>$
        param: int, 2 digits (e.g. 40)
        value_str: the literal value portion already formatted
                   (3 digits for most commands, 6-digit serial OR a
                   literal "Lxxxxxx.xx" filename for %P41-45, hex
                   string for %P50)
        """
        cmd = f"%P{param:02d}{value_str}$"
        self.ser.write(cmd.encode("ascii"))
        self.ser.flush()
        return cmd

    # ---------------------------------------------------------
    # Response readers
    # ---------------------------------------------------------

    def read_ack(self, expect_prefix="ACK:", timeout=3.0):
        """
        Reads until it sees a line starting with ACK: or times out.
        Returns the ack text (without ACK: / newlines), or None.
        """
        deadline = time.time() + timeout
        buf = b""
        while time.time() < deadline:
            chunk = self.ser.read(256)
            if chunk:
                buf += chunk
                if expect_prefix.encode() in buf:
                    # pull out the line
                    idx = buf.find(expect_prefix.encode())
                    end = buf.find(b"\n", idx)
                    if end == -1:
                        end = len(buf)
                    line = buf[idx + len(expect_prefix)
                                         :end].decode(errors="replace")
                    return line.strip()
        return None

    def read_jpeg(self, save_path=None, timeout=10.0):
        """
        Reads a full ---START_JPG---[NNNNNNNN]...---END_JPG--- stream.
        Returns the raw JPEG bytes, or None on timeout/parse failure.
        Optionally saves to save_path.
        """
        deadline = time.time() + timeout
        buf = b""

        # Read until we have the START header
        while time.time() < deadline:
            chunk = self.ser.read(256)
            if chunk:
                buf += chunk
                m = START_RE.search(buf)
                if m:
                    length = int(m.group(1))
                    header_end = m.end()
                    payload_have = buf[header_end:]
                    break
        else:
            print("Timed out waiting for START_JPG header")
            return None

        # Read remaining bytes: length of JPEG + END marker
        needed = length + len(END_MARKER)
        while len(payload_have) < needed and time.time() < deadline:
            chunk = self.ser.read(needed - len(payload_have))
            if chunk:
                payload_have += chunk

        jpeg_bytes = payload_have[:length]
        trailer = payload_have[length:length + len(END_MARKER)]

        if trailer != END_MARKER:
            print(f"WARNING: END marker mismatch (got {trailer!r})")

        if save_path:
            with open(save_path, "wb") as f:
                f.write(jpeg_bytes)
            print(f"Saved {len(jpeg_bytes)} bytes -> {save_path}")

        return jpeg_bytes


# ---------------------------------------------------------
# Convenience wrappers for every command in the table
# ---------------------------------------------------------

def test_click(link):
    link.send_plain("Click")
    link.read_jpeg(save_path="click.jpg")


def test_day00(link):
    link.send_plain("Day00")
    link.read_jpeg(save_path="day00.jpg")


def test_night(link):
    link.send_plain("Night")
    link.read_jpeg(save_path="night.jpg")


def test_ir(link, mode):
    # mode: 0=off, 10=on, 20=auto
    cmd = link.send_param(19, f"{mode:03d}")
    print(f"sent {cmd}")


def test_day_frame_size(link, framesize_enum):
    cmd = link.send_param(30, f"{framesize_enum:03d}")
    print(f"sent {cmd}")
    
def denoise(link, denoise_level):
    # denoise_level: [0-8]
    cmd = link.send_param(37, f"{denoise_level:03d}")
    print(f"sent {cmd}")

def test_ems_live(link, live: bool):
    cmd = link.send_param(40, "001" if live else "000")
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def test_serial_capture(link, mode, serial_num):
    # mode: 'D' -> param 41, 'N' -> param 42
    param = 41 if mode == 'D' else 42
    cmd = link.send_param(param, f"{serial_num:06d}")
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")
    if ack == "OK" and False:
        # capture ACK is text-only; if emsLive is true the JPEG was
        # ALSO streamed separately -- read it if you expect one:
        link.read_jpeg(save_path=f"{mode}{serial_num:06d}.jpg")


# ---------------------------------------------------------
# NEW: retrieve/exists/delete now accept EITHER a decimal serial
# (int -- old dead-EMS D/N/LD/LN scheme) OR a literal live-capture
# filename (str like "L334A90.E7" -- the STM-clock-derived scheme,
# see the firmware's build_live_timestamp_name()). The firmware
# tells the two apart on the wire by whether the value starts with
# 'L', so these wrappers just format accordingly.
# ---------------------------------------------------------

def _is_live_filename(target) -> bool:
    return isinstance(target, str)


def _format_value_and_label(target):
    """
    target: int (decimal serial) or str (literal "Lxxxxxx.xx" filename)
    Returns (value_str_for_wire, label_for_saved_filenames)
    """
    if _is_live_filename(target):
        value_str = target.strip().upper()
        return value_str, value_str
    else:
        value_str = f"{target:06d}"
        return value_str, value_str


def test_retrieve(link, target):
    value_str, label = _format_value_and_label(target)
    cmd = link.send_param(43, value_str)
    print(f"sent {cmd}")
    # Response is either a JPEG stream or ACK:NOTFOUND -- try JPEG
    # first with a short timeout, fall back to reading an ack.
    jpeg = link.read_jpeg(save_path=f"retrieved_{label}.jpg", timeout=4.0)
    if jpeg is None:
        ack = link.read_ack(timeout=1.0)
        print(f"ACK:{ack}")


def test_exists(link, target):
    value_str, label = _format_value_and_label(target)
    cmd = link.send_param(44, value_str)
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def test_delete(link, target):
    value_str, label = _format_value_and_label(target)
    cmd = link.send_param(45, value_str)
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def test_count(link):
    cmd = link.send_param(46, "000")
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def encode_datetime_hex(year2, month, day, hour, minute, second):
    """Mirrors the ESP32 decode -- builds the %P50 hex payload."""
    C_SEC, C_MIN, C_HOUR = 1, 60, 3600
    C_DAY, C_MONTH, C_YEAR = 86400, 2678400, 32140800
    total = (year2 * C_YEAR + month * C_MONTH + day * C_DAY
             + hour * C_HOUR + minute * C_MIN + second * C_SEC)
    return format(total, "X")


def test_set_datetime(link, year2, month, day, hour, minute, second):
    hexval = encode_datetime_hex(year2, month, day, hour, minute, second)
    cmd = link.send_param(50, hexval)
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def test_bluetooth(link, on: bool):
    cmd = link.send_param(51, "001" if on else "000")
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def test_rollback(link):
    """
    Rollback command: %P52001$
    Fixed-value trigger (no on/off variants like %P40/%P51) -- sends
    the literal "001" payload to invoke firmware rollback.
    """
    cmd = link.send_param(52, "001")
    ack = link.read_ack()
    print(f"sent {cmd} -> ACK:{ack}")


def _prompt_target(label="serial"):
    """
    Shared prompt for retrieve/exists/delete: accepts either a plain
    decimal serial (e.g. "123") or a literal live-capture filename
    (e.g. "L334A90.E7", "L332408.37") -- anything starting with 'L'
    (case-insensitive) is treated as a filename, everything else is
    parsed as an int serial.
    """
    raw = input(f"{label} (digits) or live filename (Lxxxxxx.xx): ").strip()
    if raw[:1].upper() == "L":
        return raw
    return int(raw)


MENU = """
SMARTCAM UART tester
 1) Click
 2) Day00
 3) Night
 4) IR force off / on / auto
 5) EMS live / dead
 6) Serial capture (day/night, explicit serial)
 7) Retrieve by serial or live filename
 8) Exists by serial or live filename
 9) Delete by serial or live filename
10) Count images
11) Set date/time (uses current PC time)
12) Bluetooth on/off
13) Rollback
14) Denoise level (0-8)
 0) Quit
"""


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else PORT
    link = SmartcamLink(port)
    print(f"Connected to {port} @ {BAUD}")

    try:
        while True:
            print(MENU)
            choice = input("> ").strip()

            if choice == "1":
                test_click(link)
            elif choice == "2":
                test_day00(link)
            elif choice == "3":
                test_night(link)
            elif choice == "4":
                m = input("mode (0=off,10=on,20=auto): ").strip()
                test_ir(link, int(m))
            elif choice == "5":
                v = input("live? (y/n): ").strip().lower()
                test_ems_live(link, v == "y")
            elif choice == "6":
                mode = input("D or N: ").strip().upper()
                s = int(input("serial (int): ").strip())
                test_serial_capture(link, mode, s)
            elif choice == "7":
                target = _prompt_target()
                test_retrieve(link, target)
            elif choice == "8":
                target = _prompt_target()
                test_exists(link, target)
            elif choice == "9":
                target = _prompt_target()
                test_delete(link, target)
            elif choice == "10":
                test_count(link)
            elif choice == "11":
                t = time.localtime()
                test_set_datetime(link, t.tm_year % 100, t.tm_mon, t.tm_mday,
                                  t.tm_hour, t.tm_min, t.tm_sec)
            elif choice == "12":
                v = input("on? (y/n): ").strip().lower()
                test_bluetooth(link, v == "y")
            elif choice == "13":
                confirm = input("Confirm rollback (y/n): ").strip().lower()
                if confirm == "y":
                    test_rollback(link)
                else:
                    print("Rollback cancelled.")
            elif choice == "14":
                m = input("Level [0-8]: ").strip()
                denoise(link, int(m))
            elif choice == "0":
                break
            else:
                print("unknown choice")
    finally:
        link.close()


if __name__ == "__main__":
    main()
