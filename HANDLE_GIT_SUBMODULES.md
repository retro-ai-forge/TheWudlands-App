# Git Submodules

This repo uses a git submodule: `twinejs-integrated` (from `retro-ai-forge/twinejs-integrated`).

The parent repo stores a pointer to a specific commit in the submodule repo, not its files directly.

## Commands

```bash
# Clone a repo that has submodules (first time)
git clone --recurse-submodules <url>

# Init + fetch submodules in an already-cloned repo
git submodule update --init

# Pull latest changes inside the submodule
cd twinejs-integrated && git pull origin develop && cd ..

# Record the submodule's new commit in the parent repo
git add twinejs-integrated
git commit -m "update twinejs-integrated submodule"

# Check what commit each submodule is pinned to
git submodule status
```
