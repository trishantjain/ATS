import telnetlib
import time

HOST = "192.168.0.110"
PORT = 23

def type_command(tn, cmd):
    print(f"\n>>> {cmd}")

    # Type each character slowly
    for ch in cmd:
        tn.write(ch.encode())
        time.sleep(0.03)

    # Press Enter
    tn.write(b"\r")

    # Wait for device response
    time.sleep(2)

    try:
        output = tn.read_very_eager().decode(errors="ignore")
        print(output if output else "(No Output)")
    except Exception as e:
        print(e)


while True:

    serial = input("\nEnter CPU Serial Number (or q to quit): ").strip()

    if serial.lower() == "q":
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
        type_command(tn, "cfg save")
        type_command(tn, "erase reboot yes")

        print("\nWaiting for reboot...")
        time.sleep(5)

        tn.close()

    except Exception as e:
        print("\nERROR:", e)