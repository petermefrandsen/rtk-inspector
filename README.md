# RTK Inspector

[![Build Status](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml/badge.svg)](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/PeterMEFrandsen.rtk-inspector?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=PeterMEFrandsen.rtk-inspector)
[![Coverage Status](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/petermefrandsen/95a8f25fdf1aef73d97065e954eec4eb/raw/rtk-inspector-coverage.json)](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml)

A VS Code extension to visualize token savings and command stats from the [rtk CLI](https://github.com/rtk-ai/rtk) — with full context of your total AI token consumption across all supported CLI tools.

![RTK Inspector Dashboard](docs/rtk-inspector-example.png)

## Features

- **Sidebar Dashboard**: Interactive charts showing daily token savings trends and a full token breakdown donut.
- **Summary Panel**: At-a-glance stats including RTK commands, CLI tool calls, tokens saved, RTK efficiency, time saved, true savings percentage, and per-CLI totals.
- **True Savings %**: Compares RTK savings against your combined CLI token usage for an honest picture of the impact: `saved / (CLI total + RTK input)`.
- **Real-time Refresh**: Update stats manually using the refresh button in the sidebar.

## Supported AI CLIs

Token usage is automatically read from local session data for the following tools:

| CLI | Data source |
|-----|-------------|
| **GitHub Copilot** | `~/.copilot/session-state/*/events.jsonl` |
| **Gemini CLI** | `~/.gemini/tmp/*/chats/session-*.json` |
| **Claude Code** | `~/.claude/projects/**/*.jsonl` |

Only days where RTK has data are counted, ensuring an apples-to-apples comparison.

## Requirements

- [rtk CLI](https://github.com/rtk-ai/rtk) must be installed and available in your PATH.
- At least one of the supported AI CLIs above must have local session data for CLI token metrics to appear.

## Usage

1. Open the **RTK Inspector** icon in the Activity Bar.
2. View the charts and summary cards in the sidebar.
3. Click the Refresh icon to update data.

## License

MIT
