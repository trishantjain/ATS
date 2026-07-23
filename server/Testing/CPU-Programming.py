import telnetlib
import time
import subprocess
import platform

HOST = "192.168.0.20"
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
        print(result.stdout)
        return False


while True:

    serial = input("\nEnter CPU Serial Number (or q to quit): ").strip()

    HOST_IP = input("Enter Host IP (or q to quit): ")
    HOST = f"192.168.0.{HOST_IP}"

    if serial.lower() == "q":
        break

    if HOST_IP.lower() == "q":
        break

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
        type_command(tn, f"cfg myip 192 168 0 {serial}")

        # Change SYSID
        type_command(tn, f"cfg sysid 00 17 34 51 68 {serial}")

        # Read configuration

        type_command(tn, "cfg save")

        cfg_read = type_command(tn, "cfg read")

        type_command(tn, "erase reboot yes")

        print("\nWaiting for reboot...")
        time.sleep(5)

        new_ip = f"192.168.0.{serial}"
        ping_ip(new_ip)

        tn.close()

    except Exception as e:
        print("\nERROR:", e)
