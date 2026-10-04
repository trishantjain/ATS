import telnetlib
import time
import subprocess
import platform
import sys
import math

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
    print("Usage: python camera_test.py <new_IP> <current_IP>")
    sys.exit(1)


updated_IP = sys.argv[1]  # CPU NUMBER WILL BE ENTERED
current_IP = sys.argv[2]

# Updated new_IP in the range of 0-250 so that IP address is valid
new_IP = new_ip = updated_IP - 250 * (math.floor(updated_IP/250))

if new_IP.lower() == "q" or current_IP.lower() == "q":
    print("Exiting...")
    sys.exit(0)

HOST = f"192.168.0.{current_IP}"

print(f"new_IP: {new_IP}")
print(f"Host IP: {current_IP}")
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
        f"cfg myip 192 168 0 {new_IP}"
    )

    # Change SYSID
    type_command(
        tn,
        f"cfg sysid 00 17 34 51 68 {new_IP}"
    )

    type_command(tn, "cfg save")

    # Read configuration
    cfg_read = type_command(tn, "cfg read")

    type_command(tn, "erase reboot yes")

    print("\nWaiting for reboot...")
    time.sleep(5)

    # Check new IP
    new_IP = f"192.168.0.{new_IP}"

    ping_ip(new_IP)

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
