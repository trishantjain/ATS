import telnetlib
import time
import subprocess
import platform
import sys

PORT = 23


def type_command(tn, cmd):
    print(f"\n>>> {cmd}")

    # Type each character slowly
    for ch in cmd:
        tn.write(ch.encode())
        time.sleep(0.03)

    # Press Enter
    tn.write(b"\r")
    time.sleep(2)

    # Wait for device response
    time.sleep(2)

    try:
        output = tn.read_very_eager().decode(errors="ignore")
        print(output if output else "(No Output)")
        return output
    except Exception as e:
        print(e)
        return ""


def ping_ip(ip):
    # Windows uses -n, Linux/macOS use -c
    param = "-n" if platform.system().lower() == "windows" else "-c"

    result = subprocess.run(
        ["ping", param, "4", ip],
        capture_output=True,
        text=True
    )

    print(result.stdout)

    if result.stderr:
        print(result.stderr)

    if result.returncode == 0:
        print(f"✅ {ip} is reachable.")
        return True
    else:
        print(f"❌ {ip} is NOT reachable.")
        return False


# --------------------------------------------------
# MAIN EXECUTION - RUN ONLY ONCE
# --------------------------------------------------

if len(sys.argv) < 3:
    print("Usage: python camera_test.py <serial> <host_ip>")
    sys.exit(1)

serial = sys.argv[1]
HOST_IP = sys.argv[2]

if serial.lower() == "q" or HOST_IP.lower() == "q":
    print("Exiting...")
    sys.exit(0)

HOST = f"192.168.0.{HOST_IP}"

print(f"Serial: {serial}")
print(f"Host IP: {HOST_IP}")
print(f"Target: {HOST}:{PORT}")

tn = None

try:
    print(f"\nConnecting to {HOST}:{PORT}...")

    tn = telnetlib.Telnet(HOST, PORT, timeout=10)

    # Wait for welcome message
    time.sleep(2)

    print("\n========== Initial Output ==========")
    print(tn.read_very_eager().decode(errors="ignore"))

    # Press Enter
    print("\n>>> Sending ENTER")
    tn.write(b"\r")

    time.sleep(2)

    print("\n========== After ENTER ==========")
    print(tn.read_very_eager().decode(errors="ignore"))

    # Send commands
    type_command(tn, "srmsiti")

    type_command(
        tn,
        f"cfg myip 192 168 0 {serial}"
    )

    # Change SYSID
    type_command(
        tn,
        f"cfg sysid 00 17 34 51 68 {serial}"
    )

    type_command(tn, "cfg save")

    # Read configuration
    cfg_read = type_command(tn, "cfg read")

    type_command(tn, "erase reboot yes")

    print("\nWaiting for reboot...")
    time.sleep(5)

    # Check new IP
    new_ip = f"192.168.0.{serial}"

    ping_ip(new_ip)

    print("\n===================================")
    print("Camera test execution completed.")
    print("===================================")

except Exception as e:
    print("\nERROR:", e)

finally:
    if tn is not None:
        tn.close()
        print("\nTelnet connection closed.")

    print("Script finished. Exiting...")
    sys.exit(0)