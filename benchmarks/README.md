# MolmoWeb Benchmarks

The `benchmarks/` directory contains the unified evaluation framework for MolmoWeb and other web agents. It supports running structured evaluations, judging results with LLM-based judges, and collecting synthetic trajectory data for training.

## Table of Contents

- [Overview](#overview)
- [Benchmarks](#benchmarks)
- [Agents](#agents)
- [Environments](#environments)
- [Running Evaluations](#running-evaluations)
- [Judging Results](#judging-results)
- [Custom Tasks](#custom-tasks)
- [Synthetic Data Generation](#synthetic-data-generation)
- [Adding a Custom Agent](#adding-a-custom-agent)
- [CLI Reference](#cli-reference)

---

## Overview

Evaluation is split into two stages:

1. **Run** — the agent steps through each task in a live browser, and the full trajectory (screenshots, actions, metadata) is saved to disk.
2. **Judge** — an LLM judge reads each trajectory and produces a `SUCCESS` / `FAILURE` verdict.

Both stages are driven by `benchmarks/benchmarks.py`, a [Fire](https://github.com/google/python-fire) CLI.

---

## Benchmarks

| Name | `--benchmark` | Tasks | Default Judge |
|------|--------------|-------|---------------|
| WebVoyager | `webvoyager` | 643 | `webvoyager` (GPT-4o) |
| Online Mind2Web | `online_mind2web` | 137 | `webjudge_online_mind2web` (o4-mini) |
| DeepShop | `deepshop` | 300 | `deepshop_judge` (GPT-4o) |
| WebTailBench | `webtailbench` | 150 | `webvoyager` (GPT-4o) |
| Custom | `custom` | *(your data)* | `webvoyager` (GPT-4o) |

Each benchmark ships with a data file under `benchmarks/jsons/`. The `custom` benchmark requires you to supply `--data_path` pointing to a JSON array of task objects (see [Custom Tasks](#custom-tasks)).

### Benchmark Details

**WebVoyager** — open-ended web tasks spanning 15 websites. Judged by GPT-4o using screenshots and the agent's final answer.

**Online Mind2Web** — real-world web tasks with three difficulty levels (easy, medium, hard). Judged by `webjudge_online_mind2web`, which uses o4-mini to score trajectories against key points extracted from the task.

**DeepShop** — e-commerce shopping tasks requiring the agent to apply filters, sort, and identify product attributes. Judged by a specialized GPT-4o prompt that checks attribute, filter, and sort dimensions independently.

**WebTailBench** — long-tail web tasks covering uncommon but realistic scenarios. Judged by GPT-4o using the WebVoyager judge format.

---

## Agents

| `--agent_type` | Model | Input | Required Keys |
|----------------|-------|-------|---------------|
| `molmoweb` | MolmoWeb (local server) | Screenshot | *(none — uses `--endpoint_or_checkpoint`)* |
| `gemini_cua` | Gemini computer-use | Screenshot | `GOOGLE_API_KEY` |
| `gemini_axtree` | Gemini | Screenshot + accessibility tree | `GOOGLE_API_KEY` |
| `gpt_axtree` | GPT-4o | Screenshot + accessibility tree | `OPENAI_API_KEY` |

### `molmoweb`

Sends screenshots to a running MolmoWeb model server (see [Quick Start](../README.md#quick-start)). Requires `--inference_mode` and `--endpoint_or_checkpoint`:

```bash
--agent_type molmoweb \
--inference_mode fastapi \
--endpoint_or_checkpoint http://127.0.0.1:8001
```

**Inference modes:**

| `--inference_mode` | Description |
|--------------------|-------------|
| `fastapi` | HTTP endpoint (model server started with `scripts/start_server.sh`) |
| `native` | In-process OLMo-native checkpoint |
| `local` | In-process HuggingFace checkpoint (single-process only, `--num_workers 0`) |
| `modal` | Modal serverless endpoint |

For `native` and `local`, pass the path or HF model ID via `--endpoint_or_checkpoint`:

```bash
--inference_mode native \
--endpoint_or_checkpoint ./checkpoints/MolmoWeb-4B-Native
```

### `gemini_cua` / `gemini_axtree`

Uses the Gemini API. Set `GOOGLE_API_KEY` before running.

### `gpt_axtree`

Uses the OpenAI API. Set `OPENAI_API_KEY` before running.

---

## Environments

The `--env_type` flag controls which browser environment is used.

### `simple` (default)

Runs a local Chromium instance via Playwright. No external accounts required. Good for development and single-machine evaluation.

```bash
--env_type simple
```

Requires Playwright browsers to be installed:

```bash
uv run playwright install
uv run playwright install --with-deps chromium
```

### `browserbase`

Runs browsers in the cloud via [Browserbase](https://browserbase.com). Required for benchmarks that need persistent sessions, residential IPs, or CAPTCHA handling (e.g., Online Mind2Web). Supports high parallelism.

```bash
--env_type browserbase
```

Requires:

```bash
export BROWSERBASE_API_KEY="your-browserbase-api-key"
export BROWSERBASE_PROJECT_ID="your-browserbase-project-id"
```

Use `--num_workers 5` or higher with Browserbase — each worker gets its own isolated cloud session.

---

## Running Evaluations

### MolmoWeb on WebVoyager (simple env)

```bash
uv run python -m benchmarks.benchmarks run \
    --benchmark webvoyager \
    --results_dir ./results/webvoyager_molmoweb \
    --agent_type molmoweb \
    --inference_mode fastapi \
    --endpoint_or_checkpoint http://127.0.0.1:8001 \
    --max_steps 30 \
    --num_workers 5 \
    --env_type simple
```

### Gemini on Online Mind2Web (Browserbase)

```bash
uv run python -m benchmarks.benchmarks run \
    --benchmark online_mind2web \
    --results_dir ./results/om2w_gemini_axtree \
    --agent_type gemini_axtree \
    --max_steps 30 \
    --num_workers 5 \
    --env_type browserbase
```

### Custom Tasks

```bash
uv run python -m benchmarks.benchmarks run \
    --benchmark custom \
    --data_path ./my_tasks.json \
    --results_dir ./results/custom_run \
    --agent_type molmoweb \
    --inference_mode fastapi \
    --endpoint_or_checkpoint http://127.0.0.1:8001 \
    --max_steps 15 \
    --num_workers 3 \
    --env_type simple
```

### Parallelism notes

- `--num_workers` controls how many tasks run in parallel. Each worker runs in its own subprocess.
- With `--env_type simple`, keep workers low (1–3) to avoid competing for local CPU/memory.
- With `--env_type browserbase`, you can run 5–20 workers depending on your Browserbase plan.
- `--inference_mode local` is incompatible with `num_workers > 0` (the model can't be shared across processes). Use `--num_workers 0` for local inference, or switch to `fastapi`/`modal` for parallel runs.

### Resuming interrupted runs

The runner skips tasks that already have a `trajectory.json` on disk. If a run is interrupted, just re-run the same command — it will pick up where it left off.

---

## Judging Results

Run the judge after trajectories are collected.

### WebVoyager judge (GPT-4o)

```bash
uv run python -m benchmarks.benchmarks judge \
    --benchmark webvoyager \
    --results_dir ./results/webvoyager_molmoweb \
    --judge_type webvoyager \
    --num_workers 10
```

Requires `OPENAI_API_KEY`.

### Online Mind2Web judge (o4-mini)

```bash
uv run python -m benchmarks.benchmarks judge \
    --benchmark online_mind2web \
    --results_dir ./results/om2w_gemini_axtree \
    --judge_type webjudge_online_mind2web \
    --num_workers 10
```

Requires `OPENAI_API_KEY`.

### DeepShop judge

```bash
uv run python -m benchmarks.benchmarks judge \
    --benchmark deepshop \
    --results_dir ./results/deepshop_molmoweb \
    --judge_type deepshop_judge \
    --num_workers 10
```

Requires `OPENAI_API_KEY`.

### Output

The judge writes a `{judge_type}_verdict.json` file into each trajectory directory and generates a summary HTML report at `results_dir/!__{judge_type}_verdicts.html`. The report includes per-website breakdowns, overall accuracy, and links to individual trajectory HTML files.

---

## Custom Tasks

The `custom` benchmark accepts a JSON file with an array of task objects:

```json
[
    {
        "id": "task_001",
        "prompt": "Go to en.wikipedia.org and find the population of Seattle.",
        "start_url": "https://en.wikipedia.org",
        "task_type": "custom"
    },
    {
        "id": "task_002",
        "prompt": "Search for the cheapest flight from NYC to LAX next Friday.",
        "start_url": "about:blank",
        "task_type": "custom"
    }
]
```

Required fields: `id`, `prompt`, `task_type`. Optional: `start_url` (defaults to `about:blank`).

---

## Synthetic Data Generation

The evaluation framework doubles as a data collection pipeline. Run any supported agent on any set of tasks and use the resulting trajectory logs for training.

```bash
# Collect trajectories with Gemini
uv run python -m benchmarks.benchmarks run \
    --benchmark webvoyager \
    --results_dir ./data/webvoyager_gemini_trajs \
    --agent_type gemini_cua \
    --num_workers 5 \
    --env_type browserbase

# Judge to filter for successful trajectories
uv run python -m benchmarks.benchmarks judge \
    --benchmark webvoyager \
    --results_dir ./data/webvoyager_gemini_trajs \
    --judge_type webvoyager \
    --num_workers 10
```

Trajectories passing the judge can be used as supervised training data.

---

## Adding a Custom Agent

1. Implement your agent class in `agent/` following the interface used by existing agents (e.g., `agent/multimodal_agent.py`).
2. Register the new `agent_type` string in `benchmarks/evaluate.py` inside `get_trajectory()`.
3. Add the agent to the `Literal` type annotation in `benchmarks/benchmarks.py:run`.

---

## CLI Reference

### `run` command

```
uv run python -m benchmarks.benchmarks run [OPTIONS]
```

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `results_dir` | `str` | *(required)* | Output directory for trajectory logs. |
| `agent_type` | `str` | *(required)* | Agent: `molmoweb`, `gemini_cua`, `gemini_axtree`, `gpt_axtree`. |
| `benchmark` | `str` | `"custom"` | Benchmark: `custom`, `deepshop`, `webvoyager`, `online_mind2web`, `webtailbench`. |
| `data_path` | `str` | `None` | Override the default data file for the benchmark. Required for `custom`. |
| `inference_mode` | `str` | `None` | `fastapi`, `local`, `modal`, or `native`. Required for `molmoweb`. |
| `endpoint_or_checkpoint` | `str` | `None` | HTTP URL (fastapi/modal) or local path / HF model ID (local/native). |
| `device` | `str` | `None` | CUDA device for local inference, e.g. `cuda:0`. |
| `api_key` | `str` | `None` | API key override (Gemini, GPT). Defaults to env var. |
| `num_workers` | `int` | `5` | Parallel workers. Set `0` for sequential in-process execution. |
| `max_steps` | `int` | `30` | Max agent steps per task. |
| `env_type` | `str` | `"simple"` | `simple` (local Chromium) or `browserbase` (cloud). |
| `traj_timeout_in_s` | `float` | `1800` | Per-task wall-clock timeout in seconds. |
| `step_timeout_in_s` | `float` | `120` | Per-step timeout in seconds. |
| `max_past_steps` | `int` | `10` | Steps of history fed to the agent as context. |
| `max_past_images` | `int` | `0` | Screenshots of past steps to include in context (0 = text-only history). |
| `sampling_temperature` | `float` | `0.7` | Sampling temperature for `molmoweb`. |
| `sampling_top_p` | `float` | `0.8` | Top-p for `molmoweb`. |
| `seed` | `int` | `123` | Random seed for task shuffling. |
| `subset` | `str` | `"full"` | Run a slice: `range_<start>_<end>` (e.g. `range_0_50`). |

### `judge` command

```
uv run python -m benchmarks.benchmarks judge [OPTIONS]
```

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `results_dir` | `str` | *(required)* | Directory with trajectory logs to judge. |
| `benchmark` | `str` | `"custom"` | Benchmark name (must match `run`). |
| `data_path` | `str` | `None` | Override data file path. |
| `judge_type` | `str` | *(benchmark default)* | `webvoyager`, `deepshop_judge`, or `webjudge_online_mind2web`. |
| `num_workers` | `int` | `30` | Parallel judging workers. |
| `seed` | `int` | `123` | Random seed. |
| `grouping_mode` | `str` | *(benchmark default)* | How to group results in the report (`website`, `online_mind2web`, `deepshop_paper`). |
