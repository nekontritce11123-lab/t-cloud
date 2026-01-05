import paramiko
import os

# Server credentials (reg.ru hosting)
HOST = "37.140.192.181"
PORT = 22
USERNAME = "u3372484"
PASSWORD = "j758aqXHELv2l2AM"

# Paths
LOCAL_DIST = r"f:\Code\Хранилище - ПУПУПУ\dist"
REMOTE_DIR = "/var/www/u3372484/data/www/factchain-traker.online"

def upload_directory(sftp, local_dir, remote_dir):
    """Recursively upload a directory"""
    # Create remote directory if it doesn't exist
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        print(f"Creating directory: {remote_dir}")
        sftp.mkdir(remote_dir)

    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = f"{remote_dir}/{item}"

        if os.path.isfile(local_path):
            print(f"Uploading: {item} -> {remote_path}")
            sftp.put(local_path, remote_path)
        elif os.path.isdir(local_path):
            upload_directory(sftp, local_path, remote_path)

def main():
    print(f"Connecting to {HOST}...")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, PORT, USERNAME, PASSWORD, timeout=30)
        print("Connected!")

        sftp = ssh.open_sftp()

        # Clean old files (except hidden)
        print(f"\nCleaning {REMOTE_DIR}...")
        try:
            for item in sftp.listdir(REMOTE_DIR):
                if not item.startswith('.'):
                    remote_path = f"{REMOTE_DIR}/{item}"
                    try:
                        sftp.remove(remote_path)
                        print(f"  Removed file: {item}")
                    except:
                        # It's a directory, remove recursively
                        def rmdir_recursive(path):
                            for f in sftp.listdir(path):
                                fp = f"{path}/{f}"
                                try:
                                    sftp.remove(fp)
                                except:
                                    rmdir_recursive(fp)
                            sftp.rmdir(path)
                        rmdir_recursive(remote_path)
                        print(f"  Removed dir: {item}")
        except Exception as e:
            print(f"  Warning: {e}")

        # Upload dist folder contents
        print(f"\nUploading {LOCAL_DIST} -> {REMOTE_DIR}")
        upload_directory(sftp, LOCAL_DIST, REMOTE_DIR)

        # List uploaded files
        print("\nUploaded files:")
        for item in sftp.listdir(REMOTE_DIR):
            print(f"  {item}")

        sftp.close()
        ssh.close()
        print("\nDone! Frontend deployed to https://factchain-traker.online")

    except Exception as e:
        print(f"Error: {e}")
        raise

if __name__ == "__main__":
    main()
