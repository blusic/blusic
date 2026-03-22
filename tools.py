import subprocess
import sys
import os 
import shutil
import time

REPO = "https://api.github.com/repos/blusic/blusic/commits/main"
LOCALBRANCH = "main"

uptime = time.time()

def runcmd(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def gitinst():
    return shutil.which("git") is not None
def getlocalcommit():
    result = runcmd(["git", "rev-parse", "HEAD"])
    return result.stdout.strip() if result.returncode == 0 else None
def getremotecommit():
    try:
        import urllib.request
        import json
        with urllib.request.urlopen(REPO) as response:
            data = json.loads(response.read().decode())
            return data["sha"]
    except:
        return None
def pullupd():
    print("updating project from source...")
    runcmd(["git", "pull"])
def npmstart():
    return subprocess.Popen("npm start", shell=True)
def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if not os.path.exists(".git"):
        print('could not find repository')
        process = npmstart()
        process.wait()
        return
    if not gitinst():
        print("could not find git installation")
        print("make sure to have git installed to receive latest commit updates")
        process = npmstart()
        process.wait()
        return
    process = npmstart()
    while True:
        time.sleep(0.5)
        if process.poll() is not None:
                if os.name == "nt":
                    os.system("cls")
                else:
                    os.system("clear")
                    time.sleep(0.1)
                print("npm process ended, exiting")
                elapsed = int(time.time() - uptime)
                hours, remainder = divmod(elapsed, 3600)
                minutes, seconds = divmod(remainder, 60)
                print(f"uptime: {hours:02}:{minutes:02}:{seconds:02}")
                sys.exit(0)
    try:
        while True:
            time.sleep(10)
            local = getlocalcommit()
            remote = getremotecommit()
            if not local or not remote:
                continue
            if local != remote:
                print("new version detected")
                process.terminate()
                process.wait()
                pullupd()
                print("restarting app")
                process = npmstart()
    except KeyboardInterrupt:
        process.terminate()
        process.wait()
        sys.exit(0)

if __name__ == "__main__":
    main()