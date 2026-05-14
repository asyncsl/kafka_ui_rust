# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Rust project using the standard Cargo build system. It is currently in early development with minimal structure.

## Build & Development Commands

- **Build**: `cargo build`
- **Run**: `cargo run`
- **Run tests**: `cargo test`
- **Run a single test**: `cargo test <test_name>`
- **Check (fast feedback)**: `cargo check`
- **Lint**: `cargo clippy`
- **Format**: `cargo fmt`

## Project Structure

Standard Cargo layout:

- `Cargo.toml` — Package manifest (currently no dependencies)
- `src/main.rs` — Application entry point
- `src/` — Application source code

## Notes

- Edition: 2024
- This project was recently initialized and has minimal code. Architecture guidance will become relevant as the codebase grows.
