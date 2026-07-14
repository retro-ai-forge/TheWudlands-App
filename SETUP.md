## 1. Create virtual env

### Prerequisites (Linux only)
If you are on Linux and need to compile/install Python versions via `pyenv`, you must first install the required build dependencies:
```bash
sudo apt update && sudo apt install -y build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev
```

### Pyenv Environment Override (If using system-wide pyenv)
If your system-wide `PYENV_ROOT` is locked to a read-only directory (like `/usr/share/pyenv`), override it in your user profile to use a local `~/.pyenv` directory:

1. Add the following lines to your `~/.bashrc` (Linux) or `~/.bash_profile` (Git-Bash):
   ```bash
   export PYENV_ROOT="$HOME/.pyenv"
   [[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
   eval "$(pyenv init -)"
   ```
2. Reload your shell config:
   ```bash
   source ~/.bashrc
   ```

### Installation
Install Python 3.11.4 (if not already installed locally):

Check installed versions:
```bash
pyenv versions
```

```bash
pyenv install 3.11.4
```

### Setup Virtual Environment
1. Set the local Python version for this project:
   ```bash
   pyenv local 3.11.4
   ```
2. Create the virtual environment:
   ```bash
   pyenv exec python -m venv .venv
   ```
3. Activate the environment:
   **Linux / macOS**:
     ```bash
     source .venv/bin/activate
     ```
   **Windows (Git-Bash)**:
     ```bash
     source .venv/Scripts/activate
     ```
4. Upgrade pip and install requirements:
   ```bash
   python -m pip install --upgrade pip
   npm install
   pip install -r requirements.txt
   rav run build
   ```

## Create .env file for email credentials
see .env-example

## 2. Run the App on linux two terminals

Run all commands from the **project root** (`TheWudlands/`).

### Terminal 1 — Backend (FastAPI)

```bash
cd /path/to/TheWudlands
source .venv/bin/activate
uvicorn backend.main:app --reload
# http://localhost:8000
```

Once it's running, open the Swagger UI at
[http://localhost:8000/docs](http://localhost:8000/docs).

### Terminal 2 — Frontend (Next.js)

```bash
cd /path/to/TheWudlands
npm install   # first time only
# not always needed, TODO check when
# npm run build 
npm run dev
```

| URL | Description |
|-----|-------------|
| [http://localhost:3000](http://localhost:3000) | Game frontend (Next.js) |
| [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI (interactive API docs) |
| [http://localhost:8000/redoc](http://localhost:8000/redoc) | ReDoc (alternative API docs) |


## 3. Cloud setup
https://www.codingforentrepreneurs.com/blog/google-cloud-cli-and-sdk-setup

```bash
gcloud --version
gcloud auth login

# if you cannot set quota
gcloud auth application-default login
gcloud auth application-default set-quota-project thewudlands

gcloud config set project thewudlands
gcloud config get-value project
gcloud auth application-default set-quota-project thewudlands
gcloud auth configure-docker europe-west1-docker.pkg.dev
gcloud artifacts repositories list --location=europe-west1

# Auth error, fix for access token!
gcloud auth login
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://europe-west1-docker.pkg.dev
 
gcloud config list
```

## 4. Docker & group

```bash
pip install rav

Docker isn't installed. Here's what you need:

On Linux:

sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
sudo usermod -aG docker $USER  # Run Docker without sudo


### a Clean Node.js/npm
rm -rf node_modules package-lock.json
npm cache clean --force

### b Reinstall all dependencies
npm install

### c Clean Next.js build cache
rm -rf .next

### d Verify everything
npm run type-check
npm run build
If you want a FULL reset (including global packages):

### Clear npm cache globally
npm cache clean --force

### Update npm itself
npm install -g npm@latest

### Then do the above steps
If still having issues, check your Node.js version:
node --version
npm --version
Your other laptop probably has the same or compatible versions. Make sure you have:

Node.js 18+ (ideally 20.x)
npm 9+
If you want to match your other laptop exactly:
```

```bash
# On working laptop:
node --version
npm --version

# rav docker... may produce error, setup up docker group for linux
sudo docker ps
# when it works without sudo
docker ps

# In case no rights, create group
# Creates the docker group (safe to run even if it exists)
sudo groupadd docker	
# Adds current user to docker group (-a = add, -G = supplementary groups)
sudo usermod -aG docker $USER	
# Activates the group immediately without logging out
newgrp docker	
# Tests that you can run Docker without sudo
docker run hello-world	
# maybe complete reboot of system is needed
# should return all groups and also docker
id
# check if docker group exists at all
grep docker /etc/group
# Method 2: Use getent (preferred)
getent group docker
# Method 3: Check group ID
id -g docker
# Method 4: List all groups, should show docker as your group
groups

# if error in: rvv run docker_build
# Quick fix: Run npm install locally first to populate node_modules, then rebuild:
npm install
npm run build

# If that works locally, the Docker issue might be cache-related. Try:
docker-compose down
docker system prune -a  # Remove unused images/containers
rav run docker_build    # Rebuild from scratch

# on polkadot dependency error
npm list @substrate/connect
```
```bash
# webpack error
# The Docker build is failing because the package-lock.json is out of sync with package.json. Docker is running npm ci (clean install from lockfile), but the lockfile is missing dependencies like @next/swc.
# Since you just modified package.json (removed @substrate/connect), the lockfile needs to be regenerated.
(rm -rf node_modules package-lock.json)
# Fix it locally first:
npm install
# This will:
# Update package-lock.json to match your current package.json
# Ensure all dependencies (including @next/swc) are properly listed
# Then verify the build works locally:
npm run build
# If that succeeds, commit the updated lockfile:
git add package-lock.json
git commit -m "update package-lock.json"

# docker_build should run through
rav run docker_build

View logs from a running container

# View all logs (stdout/stderr)
docker logs <container_id_or_name>

# Follow logs in real-time (like tail -f)
docker logs -f <container_id_or_name>

# Show last 100 lines
docker logs --tail 100 <container_id_or_name>
Shell into the container to explore

# Open a bash shell in the running container
docker exec -it <container_id_or_name> /bin/bash

# Once inside, you can explore the filesystem
ls -la
cd /app
# Then check for log files, check the working directory, etc.
Copy files out of the container

docker cp <container_id>:/path/to/logfile ./local_path
Find your container

# List running containers
docker ps

# List all containers (including stopped ones)
docker ps -a
```

## 5. Run with Docker

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

### Build and Run

1. Make sure you have a `.env` file in the project root with your environment variables:
   ```bash
   cp .env-example .env
   # Edit .env with your actual configuration
   ```

2. Build and start the application:
   ```bash
   docker-compose up -d
   ```

3. View logs:
   ```bash
   docker-compose logs -f
   ```

4. Stop the application:
   ```bash
   docker-compose down
   ```

Both services (frontend and backend) will be running:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:8000/docs](http://localhost:8000/docs)

### Rebuild after code changes
```bash
docker-compose up -d --build
```

### Access container shell (if needed)
```bash
docker-compose exec wudlands sh
```

## Create new app version:

Remove local tags
```bash
Enter new tag in app/main/VersionBadge.tsx
Enter new tag in rav.yaml gcp_tag second line
Commit and push
Create tag
git tag -a <tagname> -m "message"
git push --tags

#
# gcloud auth login
# after changing login email:
gcloud auth list
gcloud config list
gcloud config set account <email>
gcloud auth application-default login
gcloud auth application-default set-quota-project thewudlands
gcloud config set project thewudlands
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://europe-west1-docker.pkg.dev

# full build and deploy
# to prevent error: close local uvicorn and npm run dev
rav run gcp_full

# or step by step
# build stuff
npm run build
# docker
rav run gcp_push
rav run gcp_deploy
Check browser

--- tags ---
Delete remote tag
git push origin :<tagname>

Delete all local tags and pull remote
git tag -l | xargs git tag -d
git fetch --tags
```

