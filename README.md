# opencli-adapters

Personal [OpenCLI](https://github.com/jackwener/OpenCLI) adapters.

## Install

Clone into the local OpenCLI adapter directory:

```bash
git clone https://github.com/bareck/opencli-adapters.git ~/opencli-adapters
cp -r ~/opencli-adapters/clis/* ~/.opencli/clis/
opencli list | grep 8891
```

Or symlink per-site:

```bash
mkdir -p ~/.opencli/clis
ln -s ~/opencli-adapters/clis/8891 ~/.opencli/clis/8891
```

## Adapters

### `8891` — 8891 中古車

Source: https://auto.8891.com.tw/

| Command | Description |
|---------|-------------|
| `8891 electric` | Electric-car listings (fuel filter = 純電車) |
| `8891 list` | Generic listing with filters: `--power`, `--min-price`, `--max-price`, `--in-store-only` |

**Examples**

```bash
# Electric cars under 150萬, in-store only
opencli 8891 list --power 4 --max-price 150 --in-store-only --limit 10

# 50~100萬 electric
opencli 8891 list --power 4 --min-price 50 --max-price 100

# Electric + hybrid combined
opencli 8891 list --power 4,3
```

**Known URL params** (discovered via browser exploration)

| Param | Format | Notes |
|-------|--------|-------|
| `power[]=N` | int | Fuel type; `4` = 純電車 |
| `price=min_max` | TWD | e.g. `0_1500000` = up to 150萬 |
| `exsits=1` | flag | Exclude not-in-store (note: official spelling is `exsits`, not `exists`) |
| `page=N` | int | 40 items per page |
