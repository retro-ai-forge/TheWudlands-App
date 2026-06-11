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
   * **Linux / macOS**:
     ```bash
     source .venv/bin/activate
     ```
   * **Windows (Git-Bash)**:
     ```bash
     source .venv/Scripts/activate
     ```
4. Upgrade pip and install requirements:
   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

## 2. Run the App

Run all commands from the **project root** (`TheWudlands/`).

### Terminal 1 — Backend (FastAPI)

```bash
cd /path/to/TheWudlands
source .venv/bin/activate
uvicorn backend.main:app --reload
```

### Terminal 2 — Frontend (Next.js)

```bash
cd /path/to/TheWudlands
npm install   # first time only
npm run dev
```

| URL | Description |
|-----|-------------|
| [http://localhost:3000](http://localhost:3000) | Game frontend (Next.js) |
| [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI (interactive API docs) |
| [http://localhost:8000/redoc](http://localhost:8000/redoc) | ReDoc (alternative API docs) |



