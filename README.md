# RTK Inspector

[![Build Status](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml/badge.svg)](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/PeterMEFrandsen.rtk-inspector?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=PeterMEFrandsen.rtk-inspector)
[![Coverage Status](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/petermefrandsen/${COVERAGE_GIST_ID}/raw/rtk-inspector-coverage.json)](https://github.com/petermefrandsen/rtk-inspector/actions/workflows/tests.yml)

A VS Code extension to visualize token savings and command stats from the [rtk CLI](https://github.com/rtk-ai/rtk).

## Features

- **Sidebar Dashboard**: View daily token savings trends and overall distribution via interactive charts.
- **Summary Panel**: Get a quick overview of total commands, tokens saved, and efficiency in the VS Code panel.
- **Real-time Refresh**: Update stats manually using the refresh button in the sidebar.

## Requirements

- [rtk CLI](https://github.com/rtk-ai/rtk) must be installed and available in your PATH.

## Usage

1. Open the **RTK Inspector** icon in the Activity Bar.
2. View the charts in the sidebar.
3. Open the **RTK Summary** in the bottom panel (Output/Terminal area) to see detailed stats.
4. Click the Refresh icon to update data.

## License

MIT
