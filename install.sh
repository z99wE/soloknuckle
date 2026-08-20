#!/usr/bin/env bash
set -euo pipefail

# Soloknuckle Installer for Linux/macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/z99wE/soloknuckle/main/install.sh | bash

REPO="z99wE/soloknuckle"
INSTALL_DIR="${SOLOKNUCKLE_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="soloknuckle"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${GREEN}[info]${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}[warn]${NC}  %s\n" "$1"; }
error() { printf "${RED}[error]${NC} %s\n" "$1"; exit 1; }

check_deps() {
  for cmd in curl tar; do
    command -v "$cmd" >/dev/null 2>&1 || error "'$cmd' is required but not found."
  done
}

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="darwin" ;;
    *)       error "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64)   ARCH="x64" ;;
    arm64|aarch64)  ARCH="arm64" ;;
    armv7l|armhf)   ARCH="armv7" ;;
    *)              error "Unsupported architecture: $arch" ;;
  esac

  info "Detected platform: ${PLATFORM}-${ARCH}"
}

get_latest_version() {
  local version
  version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/')
  if [ -z "$version" ]; then
    version="v1.0.0"
    warn "Could not detect latest version, using ${version}"
  fi
  echo "$version"
}

install_binary() {
  local version="$1"
  local tarball="soloknuckle-${PLATFORM}-${ARCH}.tar.gz"
  local url="https://github.com/${REPO}/releases/download/${version}/${tarball}"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  info "Downloading ${tarball}..."
  curl -fsSL "$url" -o "${tmp_dir}/${tarball}" 2>/dev/null || {
    warn "Pre-built binary not available for ${PLATFORM}-${ARCH}. Falling back to npm."
    install_via_npm
    return
  }

  info "Extracting..."
  tar -xzf "${tmp_dir}/${tarball}" -C "$tmp_dir"

  mkdir -p "$INSTALL_DIR"
  mv "$tmp_dir/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || \
    mv "$tmp_dir/${BINARY_NAME}-${PLATFORM}-${ARCH}" "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || \
    mv "$tmp_dir/dist/cli/index.js" "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || \
    error "Could not find binary in archive"

  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
  info "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
}

install_via_npm() {
  if command -v npm >/dev/null 2>&1; then
    info "Installing via npm..."
    npm install -g "$REPO" 2>/dev/null || npm install -g soloknuckle
    info "Installed via npm globally"
  elif command -v node >/dev/null 2>&1; then
    error "npm not found but node is available. Please install npm first."
  else
    error "Neither npm nor node found. Install Node.js (https://nodejs.org) and re-run."
  fi
}

setup_path() {
  if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
    warn "${INSTALL_DIR} is not in your PATH."
    local shell_name
    shell_name="$(basename "${SHELL:-/bin/bash}")"

    case "$shell_name" in
      zsh)  local rc="~/.zshrc" ;;
      bash) local rc="~/.bashrc" ;;
      fish) local rc="~/.config/fish/config.fish" ;;
      *)    local rc="~/.profile" ;;
    esac

    if [ "$shell_name" = "fish" ]; then
      echo "set -gx PATH ${INSTALL_DIR} \$PATH" >> "${HOME}/.config/fish/config.fish"
    else
      echo "export PATH=\"${INSTALL_DIR}:\$PATH\"" >> "${HOME}/${rc#~/}"
    fi

    info "Added ${INSTALL_DIR} to ${rc}. Run 'source ${rc}' or restart your terminal."
  fi
}

verify_install() {
  if command -v "${BINARY_NAME}" >/dev/null 2>&1; then
    info "Verification: $(${BINARY_NAME} --version 2>/dev/null || echo 'installed')"
  elif [ -x "${INSTALL_DIR}/${BINARY_NAME}" ]; then
    info "Verification: ${INSTALL_DIR}/${BINARY_NAME} is executable"
    warn "Add ${INSTALL_DIR} to your PATH or run ${INSTALL_DIR}/${BINARY_NAME} directly"
  fi
}

main() {
  printf "${BOLD}Soloknuckle Installer${NC}\n"
  printf "Production Hygiene for AI-Assisted Development\n\n"

  check_deps
  detect_platform

  local version
  version="$(get_latest_version)"
  info "Latest version: ${version}"

  install_binary "$version"
  setup_path
  verify_install

  echo ""
  info "Installation complete!"
  echo ""
  echo "  Get started:"
  echo "    cd your-project"
  echo "    soloknuckle init"
  echo "    soloknuckle check"
  echo ""
}

main "$@"
